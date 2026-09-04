// Saneren-import via AI (OpenRouter, server-proxy). Leest een ROMMELIG of PDF-bestand uit naar nette
// adres-kolommen wanneer de gewone kolom-herkenning het laat afweten (PDF, brief, vrije tekst, of een
// Excel met een indeling die we niet herkennen).
// ─────────────────────────────────────────────────────────────────────────────
// Waarom apart van bodemImport: de gewone import leest een RASTER (Excel/CSV) en herkent kolommen op
// naam. Een PDF of een lijst in lopende tekst heeft geen kolommen; daar haalt AI de adressen uit. De
// uitkomst is exact hetzelfde ImportRij[]-formaat, zodat het door hetzelfde controle-/voorbeeldscherm
// gaat (postcode-check, dubbelen, telefoon-splitsing). De AI verzint niets — leeg blijft leeg.

import { postClaude, aiBeschikbaar } from "./aiTransport";
import { netPostcode, postcodeGeldig, adresSleutel, type ImportRij } from "./bodemImport";
import { fileNaarDataUrl } from "./image";

// Rauwe base64 data-URL van een bestand (voor PDF — NIET door de image-canvas halen, die verandert
// een PDF in een kapotte JPEG). Voor afbeeldingen gebruiken we fileNaarDataUrl (verkleint + comprimeert).
function bestandNaarDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Kon bestand niet lezen"));
    reader.onload = () => resolve(reader.result as string);
    reader.readAsDataURL(file);
  });
}

export type AiImportResultaat =
  | { ok: true; rijen: ImportRij[]; bron: "pdf" | "tekst" | "afbeelding" }
  | { ok: false; fout: string };

const SYSTEM_PROMPT =
  "Je bent een nauwkeurige data-extractie-assistent voor een Nederlands netbeheerbedrijf (Stedin). " +
  "Je krijgt een bestand (PDF, afbeelding of tekst) met een lijst NEDERLANDSE ADRESSEN, vaak rommelig " +
  "opgemaakt. Haal ELK uniek adres eruit en roep exact één keer de tool \"lever_adressen\" aan.\n\n" +
  "Regels:\n" +
  "- Verzin NIETS. Laat een veld leeg (\"\") als het niet in de bron staat.\n" +
  "- Splits het huisnummer en de toevoeging: \"12A\" → huisnummer \"12\", toevoeging \"A\". \"12-14\" → huisnummer \"12\", toevoeging \"-14\".\n" +
  "- postcode als \"1234 AB\" (vier cijfers, spatie, twee hoofdletters) als herkenbaar, anders leeg.\n" +
  "- telefoon: alleen als er echt een nummer bij het adres staat.\n" +
  "- Neem elk adres MAAR ÉÉN KEER op, ook als het meerdere keren in de bron voorkomt.\n" +
  "- Kop-/titelregels, totalen, en niet-adresregels sla je over.";

const TOOL = {
  name: "lever_adressen",
  description: "Lever de uit het bestand gelezen adressen als lijst.",
  input_schema: {
    type: "object",
    properties: {
      adressen: {
        type: "array",
        items: {
          type: "object",
          properties: {
            straat: { type: "string" },
            huisnummer: { type: "string" },
            toevoeging: { type: "string" },
            postcode: { type: "string" },
            plaats: { type: "string" },
            bewoner: { type: "string" },
            telefoon: { type: "string" },
            opmerking: { type: "string" },
          },
          required: ["straat", "huisnummer", "toevoeging", "postcode", "plaats", "bewoner", "telefoon", "opmerking"],
          additionalProperties: false,
        },
      },
    },
    required: ["adressen"],
    additionalProperties: false,
  },
};

type AiAdres = {
  straat?: string; huisnummer?: string; toevoeging?: string; postcode?: string;
  plaats?: string; bewoner?: string; telefoon?: string; opmerking?: string;
};

const base64Van = (dataUrl: string) => {
  const m = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  return m ? { media: m[1], data: m[2] } : { media: "application/octet-stream", data: dataUrl.replace(/^data:[^,]*,/, "") };
};

function foutTekst(status: number, detail: string): string {
  if (status === 503) return "De AI staat nog niet aan op de server. Vraag de beheerder de OpenRouter-sleutel in te stellen.";
  if (status === 401 || status === 403) return "Geen toegang tot de AI. Log opnieuw in.";
  if (status === 413) return "Het bestand is te groot voor de AI. Probeer een kleiner of gesplitst bestand.";
  if (status === 429) return "Te veel AI-aanvragen tegelijk. Wacht even en probeer opnieuw.";
  if (status >= 500) return "De AI-dienst is tijdelijk niet beschikbaar. Probeer het later opnieuw.";
  return detail || `AI gaf een fout (status ${status}).`;
}

// Zet AI-adressen om naar ImportRij[], met dezelfde controles/markering als de gewone import:
// postcode-validatie en dubbel-detectie (binnen dit bestand én tegen de al bestaande adressen).
function naarImportRijen(adressen: AiAdres[], bestaandeSleutels: Set<string>): ImportRij[] {
  const gezienInBestand = new Set<string>();
  const uit: ImportRij[] = [];
  adressen.forEach((a, i) => {
    const straat = (a.straat ?? "").trim();
    const huisnummer = (a.huisnummer ?? "").trim();
    const toevoeging = (a.toevoeging ?? "").trim();
    const postcode = netPostcode((a.postcode ?? "").trim());
    const plaats = (a.plaats ?? "").trim();
    const bewoner = (a.bewoner ?? "").trim();
    const telefoon = (a.telefoon ?? "").trim();
    const opmerking = (a.opmerking ?? "").trim();

    const fouten: string[] = [];
    if (!straat) fouten.push("Straat ontbreekt");
    if (!huisnummer) fouten.push("Huisnummer ontbreekt");
    if (!postcodeGeldig(postcode)) fouten.push(postcode ? "Postcode klopt niet" : "Postcode ontbreekt");

    const sleutel = adresSleutel({ straat, huisnummer, toevoeging, postcode });
    const dubbelInBestand = fouten.length === 0 && gezienInBestand.has(sleutel);
    const bestaatAl = fouten.length === 0 && !dubbelInBestand && bestaandeSleutels.has(sleutel);
    if (fouten.length === 0 && !dubbelInBestand) gezienInBestand.add(sleutel);

    uit.push({
      bron: i + 1, straat, huisnummer, toevoeging, postcode, plaats, wijk: "", perceel: "",
      bewoner, telefoon, opmerking,
      fouten, waarschuwingen: ["door AI ingelezen"], dubbelInBestand, bestaatAl,
    });
  });
  return uit;
}

// Leest een bestand met de AI uit. `bestaandeAdressen` = de adressen die al in het dossier staan, zodat
// een adres dat er al is meteen als dubbel wordt gemarkeerd (en dus maar 1x voorkomt).
export async function leesAdressenViaAi(
  file: File,
  bestaandeAdressen: { straat: string; huisnummer: string; toevoeging?: string; postcode: string }[],
  signal?: AbortSignal,
): Promise<AiImportResultaat> {
  if (!aiBeschikbaar()) return { ok: false, fout: "AI is niet beschikbaar. Log in en zorg dat de centrale database aanstaat." };

  const naam = file.name.toLowerCase();
  const isPdf = naam.endsWith(".pdf") || file.type === "application/pdf";
  const isAfbeelding = file.type.startsWith("image/");

  let userContent: unknown[];
  let bron: "pdf" | "tekst" | "afbeelding";
  try {
    if (isPdf) {
      const { media, data } = base64Van(await bestandNaarDataUrl(file));
      userContent = [
        { type: "document", source: { type: "base64", media_type: media, data } },
        { type: "text", text: "Haal alle adressen uit deze PDF en lever ze via de tool." },
      ];
      bron = "pdf";
    } else if (isAfbeelding) {
      const { media, data } = base64Van(await fileNaarDataUrl(file));
      userContent = [
        { type: "image", source: { type: "base64", media_type: media, data } },
        { type: "text", text: "Haal alle adressen uit deze afbeelding en lever ze via de tool." },
      ];
      bron = "afbeelding";
    } else {
      // Tekst/CSV/onbekend: stuur de ruwe tekst mee (afgekapt zodat het verzoek niet te groot wordt).
      const tekst = (await file.text()).slice(0, 60000);
      if (!tekst.trim()) return { ok: false, fout: "Dit bestand bevat geen leesbare tekst." };
      userContent = [{ type: "text", text: `Haal alle adressen uit de volgende lijst en lever ze via de tool:\n\n${tekst}` }];
      bron = "tekst";
    }
  } catch {
    return { ok: false, fout: "Kon het bestand niet lezen." };
  }

  const antwoord = await postClaude(
    "",
    {
      model: "google/gemini-2.5-flash",
      max_tokens: 8000,
      system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
      tools: [TOOL],
      tool_choice: { type: "tool", name: "lever_adressen" },
      messages: [{ role: "user", content: userContent }],
    },
    signal,
  );

  if (!antwoord.ok) return { ok: false, fout: foutTekst(antwoord.status, antwoord.fout) };

  const content = (antwoord.data as { content?: unknown[] })?.content;
  const block = Array.isArray(content)
    ? (content.find((b) => (b as { type?: string; name?: string }).type === "tool_use" && (b as { name?: string }).name === "lever_adressen") as { input?: { adressen?: AiAdres[] } } | undefined)
    : undefined;
  const adressen = block?.input?.adressen;
  if (!Array.isArray(adressen) || adressen.length === 0) {
    return { ok: false, fout: "De AI vond geen adressen in dit bestand. Controleer of er echt adressen in staan." };
  }

  const bestaandeSleutels = new Set(bestaandeAdressen.map((a) => adresSleutel(a)));
  return { ok: true, rijen: naarImportRijen(adressen, bestaandeSleutels), bron };
}

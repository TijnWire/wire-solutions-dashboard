// Leest een MET DE HAND ingevuld voorschouw-formulier (foto's) met Claude vision en levert de velden
// terug, zodat het formulier zich vooraf invult en als nette PDF eruit komt.
// Draait direct vanuit de browser met de in Instellingen opgeslagen claudeKey.
import { fileNaarDataUrl } from "./image";
import type { Voorschouw } from "./types";

type VoorschouwVelden = Pick<
  Voorschouw,
  "straatnaam" | "postcode" | "plaats" | "meerdereStraten" | "aantalWoningen" | "aantalEntrees" | "namenHuisbaasVVE" | "adressenHuisbaasVVE" | "gasloos" | "blokverwarming" | "bijzondereLocatieZorg" | "bijzondereLocatieKeuken" | "aantalStijgleidingen"
>;

export type VoorschouwScanResultaat =
  | { ok: true; velden: Partial<VoorschouwVelden>; fotos: string[] }
  | { ok: false; fout: string };

const SYSTEM_PROMPT =
  "Je bent een nauwkeurige data-extractie-assistent voor een Nederlands netbeheer-/veldservicebedrijf (Stedin). " +
  "Je krijgt één of meer foto's van een MET DE HAND ingevuld 'voorschouw'-formulier. Lees de ingevulde velden zorgvuldig " +
  "en roep exact één keer de tool \"lever_voorschouw\" aan.\n\n" +
  "Regels:\n" +
  "- Verzin NIETS. Laat een veld leeg (\"\") als het niet (leesbaar) is ingevuld.\n" +
  "- JA/NEE-velden (meerdereStraten, gasloos, blokverwarming): geef \"JA\" of \"NEE\" op basis van het aangekruiste/omcirkelde antwoord; bij twijfel leeg.\n" +
  "- Aantallen (aantalWoningen, aantalEntrees, aantalStijgleidingen) als tekst met cijfers.\n" +
  "- postcode als \"1234 AB\" indien herkenbaar, anders leeg.\n" +
  "- bijzondereLocatieZorg/Keuken: de ingevulde toelichting; is er niets ingevuld of staat 'nee', laat leeg.\n" +
  "- Horen meerdere foto's bij hetzelfde formulier, combineer ze dan tot één resultaat.";

const TOOL = {
  name: "lever_voorschouw",
  description: "Lever de van het ingevulde voorschouw-formulier afgelezen velden.",
  input_schema: {
    type: "object",
    properties: {
      straatnaam: { type: "string" },
      postcode: { type: "string" },
      plaats: { type: "string" },
      meerdereStraten: { type: "string", enum: ["JA", "NEE", ""] },
      aantalWoningen: { type: "string" },
      aantalEntrees: { type: "string" },
      namenHuisbaasVVE: { type: "string" },
      adressenHuisbaasVVE: { type: "string" },
      gasloos: { type: "string", enum: ["JA", "NEE", ""] },
      blokverwarming: { type: "string", enum: ["JA", "NEE", ""] },
      bijzondereLocatieZorg: { type: "string" },
      bijzondereLocatieKeuken: { type: "string" },
      aantalStijgleidingen: { type: "string" },
    },
    required: ["straatnaam", "postcode", "plaats", "meerdereStraten", "aantalWoningen", "aantalEntrees", "namenHuisbaasVVE", "adressenHuisbaasVVE", "gasloos", "blokverwarming", "bijzondereLocatieZorg", "bijzondereLocatieKeuken", "aantalStijgleidingen"],
    additionalProperties: false,
  },
};

function base64Van(dataUrl: string): { media: string; data: string } {
  const m = dataUrl.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  return m ? { media: m[1], data: m[2] } : { media: "image/jpeg", data: dataUrl.replace(/^data:[^,]*,/, "") };
}

function foutTekst(status: number, detail: string): string {
  if (status === 401 || status === 403) return "Claude API-sleutel ongeldig of geen toegang. Controleer de sleutel bij Instellingen.";
  if (status === 413) return "De foto's zijn te groot voor de Claude-API. Maak een scherpere maar kleinere foto.";
  if (status === 429) return "Te veel aanvragen bij de Claude-API. Wacht even en probeer opnieuw.";
  if (status >= 500) return "De Claude-API is tijdelijk niet beschikbaar. Probeer het later opnieuw.";
  return detail || `Claude-API gaf een fout (status ${status}).`;
}

export async function leesVoorschouwViaFotos(files: File[], apiKey: string, signal?: AbortSignal): Promise<VoorschouwScanResultaat> {
  if (!apiKey.trim()) return { ok: false, fout: "Voor het scannen van een ingevuld formulier is een Claude API-sleutel nodig (Instellingen → Integraties)." };
  if (!files.length) return { ok: false, fout: "Geen foto gekozen." };

  let fotos: string[];
  try {
    fotos = await Promise.all(files.map((f) => fileNaarDataUrl(f)));
  } catch {
    return { ok: false, fout: "Kon de foto's niet lezen." };
  }
  const beelden = fotos.map((d) => { const { media, data } = base64Van(d); return { type: "image", source: { type: "base64", media_type: media, data } }; });

  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 4000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: [TOOL],
        tool_choice: { type: "tool", name: "lever_voorschouw" },
        messages: [{ role: "user", content: [...beelden, { type: "text", text: "Lees dit ingevulde voorschouw-formulier en lever de velden via de tool." }] }],
      }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, fout: "Scan geannuleerd." };
    return { ok: false, fout: "Kon de Claude-API niet bereiken. Controleer je internetverbinding." };
  }

  if (!res.ok) {
    let detail = "";
    try { detail = (await res.json())?.error?.message || ""; } catch { /* negeren */ }
    return { ok: false, fout: foutTekst(res.status, detail) };
  }

  let data: unknown;
  try { data = await res.json(); } catch { return { ok: false, fout: "Onverwacht antwoord van de Claude-API." }; }
  const content = (data as { content?: unknown[] })?.content;
  const block = Array.isArray(content)
    ? (content.find((b) => (b as { type?: string; name?: string }).type === "tool_use" && (b as { name?: string }).name === "lever_voorschouw") as { input?: Partial<VoorschouwVelden> } | undefined)
    : undefined;
  if (!block?.input) return { ok: false, fout: "Geen gegevens herkend op de foto('s). Maak een scherpere foto van het hele formulier." };
  return { ok: true, velden: block.input, fotos };
}

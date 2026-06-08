// PDF-extractie via de Anthropic Messages API (native PDF-input + geforceerde tool-use).
// Draait direct vanuit de browser met de in Instellingen opgeslagen claudeKey.

type ClaudeRij = {
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  plaats: string;
  naam: string;
  telefoon: string;
  type: string;
  notitie: string;
  confidence: number;
};

export type PdfResultaat = { ok: true; rijen: ClaudeRij[] } | { ok: false; fout: string };

// Statisch (cachebaar) — geen datum/variabele inhoud, zodat prompt caching kan werken.
const SYSTEM_PROMPT =
  "Je bent een nauwkeurige data-extractie-assistent voor een Nederlands netbeheer-/veldservicebedrijf. " +
  "Je krijgt een document (PDF) met een lijst adressen en soms klant- of contactgegevens. " +
  "Haal ELKE adresregel eruit en roep exact één keer de tool \"lever_adressen\" aan met alle rijen.\n\n" +
  "Regels:\n" +
  "- Eén object per adres/regel.\n" +
  "- Splits een gecombineerd adres (\"Dorpsstraat 12A\") in straat=\"Dorpsstraat\", huisnummer=\"12\", toevoeging=\"A\".\n" +
  "- Postcode altijd als \"1234 AB\" (vier cijfers, spatie, twee hoofdletters) als die herkenbaar is; anders leeg laten.\n" +
  "- Verzin NIETS. Laat een veld leeg (\"\") als het niet in het document staat.\n" +
  "- type=\"bedrijf\" bij duidelijke bedrijfs-/kantoorpanden (BV, NV, kantoor, VvE); anders \"woning\".\n" +
  "- confidence is een getal 0-1: hoe zeker je bent van die rij (lager bij slecht leesbare/gescande tekst).";

const ADRES_TOOL = {
  name: "lever_adressen",
  description: "Lever alle uit het document geëxtraheerde adresregels.",
  input_schema: {
    type: "object",
    properties: {
      rijen: {
        type: "array",
        description: "Alle adresregels uit het document, één object per adres.",
        items: {
          type: "object",
          properties: {
            straat: { type: "string" },
            huisnummer: { type: "string" },
            toevoeging: { type: "string" },
            postcode: { type: "string" },
            plaats: { type: "string" },
            naam: { type: "string" },
            telefoon: { type: "string" },
            type: { type: "string", enum: ["woning", "bedrijf"] },
            notitie: { type: "string" },
            confidence: { type: "number" },
          },
          required: ["straat", "huisnummer", "toevoeging", "postcode", "plaats", "naam", "telefoon", "type", "notitie", "confidence"],
          additionalProperties: false,
        },
      },
    },
    required: ["rijen"],
    additionalProperties: false,
  },
};

function fileNaarBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("lezen mislukt"));
    r.onload = () => {
      const s = String(r.result || "");
      const i = s.indexOf("base64,");
      resolve(i >= 0 ? s.slice(i + 7) : s);
    };
    r.readAsDataURL(file);
  });
}

async function foutTekst(res: Response): Promise<string> {
  let detail = "";
  try {
    const j = await res.json();
    detail = j?.error?.message || "";
  } catch {
    // negeren
  }
  if (res.status === 401 || res.status === 403) return "Claude API-sleutel ongeldig of geen toegang. Controleer de sleutel bij Instellingen.";
  if (res.status === 413) return "Het PDF-bestand is te groot voor de Claude-API.";
  if (res.status === 429) return "Te veel aanvragen bij de Claude-API. Wacht even en probeer opnieuw.";
  if (res.status >= 500) return "De Claude-API is tijdelijk niet beschikbaar. Probeer het later opnieuw.";
  return detail || `Claude-API gaf een fout (status ${res.status}).`;
}

export async function leesPdfViaClaude(file: File, apiKey: string, signal?: AbortSignal): Promise<PdfResultaat> {
  let base64: string;
  try {
    base64 = await fileNaarBase64(file);
  } catch {
    return { ok: false, fout: "Kon het PDF-bestand niet lezen." };
  }

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
        max_tokens: 16000,
        system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
        tools: [ADRES_TOOL],
        tool_choice: { type: "tool", name: "lever_adressen" },
        messages: [
          {
            role: "user",
            content: [
              { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } },
              { type: "text", text: "Extraheer alle adresregels uit dit document en lever ze via de tool." },
            ],
          },
        ],
      }),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, fout: "Scan geannuleerd." };
    return { ok: false, fout: "Kon de Claude-API niet bereiken. Controleer je internetverbinding." };
  }

  if (!res.ok) return { ok: false, fout: await foutTekst(res) };

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    return { ok: false, fout: "Onverwacht antwoord van de Claude-API." };
  }

  const content = (data as { content?: unknown[] })?.content;
  const block = Array.isArray(content)
    ? (content.find((b) => (b as { type?: string; name?: string }).type === "tool_use" && (b as { name?: string }).name === "lever_adressen") as { input?: { rijen?: ClaudeRij[] } } | undefined)
    : undefined;
  const rijen = block?.input?.rijen;
  if (!Array.isArray(rijen) || rijen.length === 0) return { ok: false, fout: "Geen adressen herkend in deze PDF." };
  return { ok: true, rijen };
}

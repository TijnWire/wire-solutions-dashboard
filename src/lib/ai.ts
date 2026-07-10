// AI-assistent voor het dashboard — kostenbewust.
// • Model: het goedkope Claude Haiku (niet Opus).
// • Harde dag-cap per gebruiker (lokaal bijgehouden) zodat het tokengebruik/kosten beperkt blijven.
// • Draait client-side met de Claude-sleutel uit Instellingen (zelfde patroon als de PDF-scan).

// Kostenefficiënt model (Haiku), bewust niet Opus.
const AI_MODEL = "claude-haiku-4-5-20251001";

// ── Harde dag-limiet per gebruiker (lokaal per apparaat) ──
export const AI_CAP_PER_DAG = 20;

function dagKey(userId: string): string {
  const d = new Date();
  return `wire.ai.${userId}.${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function aiGebruikVandaag(userId: string): number {
  try { return Number(localStorage.getItem(dagKey(userId)) || 0); } catch { return 0; }
}
export function aiResterend(userId: string): number {
  return Math.max(0, AI_CAP_PER_DAG - aiGebruikVandaag(userId));
}
function verhoogTeller(userId: string): void {
  try { localStorage.setItem(dagKey(userId), String(aiGebruikVandaag(userId) + 1)); } catch { /* opslag niet beschikbaar */ }
}

async function claudeHaiku(apiKey: string, body: Record<string, unknown>): Promise<{ ok: true; data: any } | { ok: false; fout: string }> {
  let res: Response;
  try {
    res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey.trim(),
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: JSON.stringify({ model: AI_MODEL, ...body }),
    });
  } catch {
    return { ok: false, fout: "Kon de AI niet bereiken. Controleer je internetverbinding." };
  }
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) return { ok: false, fout: "Claude-sleutel ongeldig. Controleer de sleutel bij Instellingen." };
    if (res.status === 429) return { ok: false, fout: "Even te druk bij de AI. Probeer het zo weer." };
    return { ok: false, fout: `AI gaf een fout (status ${res.status}).` };
  }
  try { return { ok: true, data: await res.json() }; } catch { return { ok: false, fout: "Onverwacht antwoord van de AI." }; }
}

export type Pagina = { key: string; label: string; groep: string };
export type AssistentResultaat =
  | { soort: "navigatie"; navKey: string; uitleg: string }
  | { soort: "vraag"; vraag: string }
  | { soort: "fout"; fout: string };

export type ChatBericht = { rol: "user" | "assistant"; tekst: string };

// Stelt de assistent een vraag. Kiest óf een pagina om naartoe te navigeren, óf een verduidelijkende vraag.
export async function vraagAssistent(apiKey: string, paginas: Pagina[], geschiedenis: ChatBericht[], userId: string): Promise<AssistentResultaat> {
  if (!apiKey.trim()) return { soort: "fout", fout: "Er is nog geen Claude-sleutel ingesteld (Instellingen → Integraties)." };
  if (aiResterend(userId) <= 0) return { soort: "fout", fout: `Je dag-limiet van ${AI_CAP_PER_DAG} AI-berichten is bereikt. Morgen kan het weer.` };

  const paginaLijst = paginas.map((p) => `- ${p.key} — ${p.label} (${p.groep})`).join("\n");
  const system =
    "Je bent de behulpzame assistent van het interne Wire Solutions-dashboard. Je helpt de gebruiker snel op de juiste plek te komen. " +
    "Je hebt exact twee mogelijke acties en je MOET er altijd één kiezen via een tool:\n" +
    "1) ga_naar_pagina: kies de best passende paginaKey uit de lijst hieronder als duidelijk is waar de gebruiker heen wil.\n" +
    "2) stel_verduidelijkende_vraag: als de vraag te vaag is of bij meerdere pagina's past, stel dan één korte vraag in het Nederlands.\n\n" +
    "Beschikbare pagina's (paginaKey — omschrijving):\n" + paginaLijst +
    "\n\nAntwoord kort en in het Nederlands. Verzin geen paginaKey die niet in de lijst staat.";

  const tools = [
    { name: "ga_naar_pagina", description: "Navigeer de gebruiker naar de best passende pagina.", input_schema: { type: "object", properties: { paginaKey: { type: "string", enum: paginas.map((p) => p.key) }, uitleg: { type: "string", description: "Korte zin in het Nederlands: wat de gebruiker daar vindt." } }, required: ["paginaKey", "uitleg"], additionalProperties: false } },
    { name: "stel_verduidelijkende_vraag", description: "Stel één korte verduidelijkende vraag als het doel onduidelijk is.", input_schema: { type: "object", properties: { vraag: { type: "string" } }, required: ["vraag"], additionalProperties: false } },
  ];

  const r = await claudeHaiku(apiKey, {
    max_tokens: 400,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    tools,
    tool_choice: { type: "any" },
    messages: geschiedenis.slice(-8).map((m) => ({ role: m.rol, content: m.tekst })),
  });
  if (!r.ok) return { soort: "fout", fout: r.fout };
  verhoogTeller(userId);

  const content = (r.data as { content?: unknown[] })?.content;
  const block = Array.isArray(content) ? (content.find((b) => (b as { type?: string }).type === "tool_use") as { name?: string; input?: Record<string, unknown> } | undefined) : undefined;
  if (block?.name === "ga_naar_pagina" && typeof block.input?.paginaKey === "string") {
    return { soort: "navigatie", navKey: block.input.paginaKey as string, uitleg: (block.input.uitleg as string) || "Ik breng je erheen." };
  }
  if (block?.name === "stel_verduidelijkende_vraag" && typeof block.input?.vraag === "string") {
    return { soort: "vraag", vraag: block.input.vraag as string };
  }
  return { soort: "fout", fout: "De assistent gaf geen bruikbaar antwoord. Probeer je vraag anders te stellen." };
}

// Korte, optionele analyse "wat kan beter" op basis van een samenvatting van het dashboard.
export async function analyseerDashboard(apiKey: string, samenvatting: string, userId: string): Promise<{ ok: true; tekst: string } | { ok: false; fout: string }> {
  if (!apiKey.trim()) return { ok: false, fout: "Er is nog geen Claude-sleutel ingesteld (Instellingen → Integraties)." };
  if (aiResterend(userId) <= 0) return { ok: false, fout: `Je dag-limiet van ${AI_CAP_PER_DAG} AI-berichten is bereikt. Morgen kan het weer.` };

  const r = await claudeHaiku(apiKey, {
    max_tokens: 500,
    system: [{ type: "text", text: "Je bent een nuchtere bedrijfsadviseur voor een Nederlands netbeheer-/veldservicebedrijf. Geef op basis van de cijfers een KORTE analyse (max 5 bulletpoints) van wat er beter/aandacht nodig heeft. Concreet en in het Nederlands, geen algemeenheden.", cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Hier is de huidige stand van het dashboard:\n\n${samenvatting}\n\nWat kan er beter of heeft aandacht nodig?` }],
  });
  if (!r.ok) return { ok: false, fout: r.fout };
  verhoogTeller(userId);

  const content = (r.data as { content?: { type?: string; text?: string }[] })?.content;
  const tekst = Array.isArray(content) ? content.filter((b) => b.type === "text").map((b) => b.text).join("\n").trim() : "";
  return tekst ? { ok: true, tekst } : { ok: false, fout: "Geen analyse ontvangen." };
}

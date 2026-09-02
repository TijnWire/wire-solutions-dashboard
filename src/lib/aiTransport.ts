// ── Centraal AI-transport ──────────────────────────────────────────────────────────────────────
// Alle Claude-calls lopen bij voorkeur via de Cloudflare Worker-proxy (/ai/claude), zodat de API-sleutel
// SERVER-SIDE blijft (wrangler secret CLAUDE_KEY) en nooit op de toestellen van medewerkers belandt.
//
// Waarom een proxy? Vroeger stond de bedrijfs-Claude-sleutel in de gesynchroniseerde Instellingen, en die
// werd naar élk ingelogd toestel gepusht. Eén gestolen telefoon of een ontevreden medewerker = de hele
// Anthropic-rekening leegtrekken. Met de proxy stuurt de app alleen de gewone Messages-body; de Worker
// plakt de sleutel erop achter de rol-beveiligde token.
//
// Terugval: staat er (nog) geen CLAUDE_KEY op de server, of draait de app puur lokaal zonder centrale
// database, dan valt hij terug op de oude directe browser-call met de meegegeven client-sleutel. Zo werkt
// alles onveranderd tot de secret is gezet — daarna zet je de client-sleutels leeg en is het lek dicht.

import { CLOUD_API_URL, supabaseAan, leesToken } from "./supabase";

export type ClaudeAntwoord = { ok: true; status: number; data: unknown } | { ok: false; status: number; fout: string };

// Probeert eerst de server-proxy (aanbevolen). Geeft 503 terug als de server geen CLAUDE_KEY heeft, zodat
// de aanroeper netjes op de directe call kan terugvallen.
async function viaProxy(body: Record<string, unknown>, signal?: AbortSignal): Promise<ClaudeAntwoord | null> {
  if (!supabaseAan) return null;
  const token = leesToken();
  if (!token) return null;
  let res: Response;
  try {
    res = await fetch(CLOUD_API_URL + "/ai/claude", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch {
    return null; // netwerkfout op de proxy → laat de aanroeper de directe call proberen
  }
  if (res.status === 503) return null; // server heeft (nog) geen sleutel → terugval
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, fout: (data as { error?: string })?.error || `AI-fout (status ${res.status}).` };
  return { ok: true, status: res.status, data };
}

// Directe browser-call naar Anthropic met een client-sleutel (oude gedrag; terugval).
async function directNaarAnthropic(apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ClaudeAntwoord> {
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
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, status: 0, fout: "Geannuleerd." };
    return { ok: false, status: 0, fout: "Kon de AI-dienst niet bereiken. Controleer je internetverbinding." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, fout: (data as { error?: { message?: string } })?.error?.message || `AI-fout (status ${res.status}).` };
  return { ok: true, status: res.status, data };
}

// Eén ingang voor alle Claude-calls: server-proxy waar mogelijk, anders direct met de client-sleutel.
export async function postClaude(apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ClaudeAntwoord> {
  const viaServer = await viaProxy(body, signal);
  if (viaServer) return viaServer;
  if (!apiKey.trim()) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar: de server heeft geen sleutel en er is lokaal geen sleutel ingesteld." };
  }
  return directNaarAnthropic(apiKey, body, signal);
}

// ── Centraal AI-transport ──────────────────────────────────────────────────────────────────────
// Alle AI-calls lopen via de Cloudflare Worker-proxy (/ai/claude), die ze doorzet naar OpenRouter met
// een goedkoop, multimodaal model. De API-sleutel blijft SERVER-SIDE (wrangler secret OPENROUTER_KEY)
// en belandt nooit op de toestellen van medewerkers.
//
// Waarom een proxy? Vroeger stond een AI-sleutel in de gesynchroniseerde Instellingen, en die werd naar
// élk ingelogd toestel gepusht. Eén gestolen telefoon of een ontevreden medewerker = de rekening
// leegtrekken. Met de proxy stuurt de app alleen het verzoek; de Worker plakt de sleutel erop, achter
// de rol-beveiligde token.
//
// Formaat: de app blijft haar verzoeken in het Anthropic-formaat opbouwen (system-array, tools met
// input_schema, tool_use-antwoordblokken). De Worker vertaalt heen naar OpenRouter en het antwoord
// terug, zodat de rest van de app niets van de motorwissel merkt.
//
// Terugval: staat er (nog) geen OPENROUTER_KEY op de server, of draait de app puur lokaal zonder
// centrale database, dan geeft dit een nette foutmelding. (De oude directe-browser-call met een
// client-sleutel is bewust verwijderd — dat was juist het lek dat we dichtten.)

import { CLOUD_API_URL, supabaseAan, leesToken } from "./supabase";

export type ClaudeAntwoord = { ok: true; status: number; data: unknown } | { ok: false; status: number; fout: string };

// Is AI überhaupt te gebruiken op dit toestel? Ja zodra de centrale database aanstaat (dan loopt AI via
// de server-proxy met de OpenRouter-sleutel) — er is dan GEEN client-sleutel meer nodig. De UI gebruikt
// dit om scan-/assistent-knoppen wel of niet aan te bieden.
export function aiBeschikbaar(): boolean {
  return supabaseAan && !!leesToken();
}

// _apiKey blijft in de signatuur staan zodat de aanroepers ongewijzigd blijven, maar wordt niet meer
// gebruikt: de sleutel zit server-side. De parameter is met opzet genegeerd.
export async function postClaude(_apiKey: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<ClaudeAntwoord> {
  if (!supabaseAan) {
    return { ok: false, status: 503, fout: "AI is niet beschikbaar: er is geen centrale database ingesteld." };
  }
  const token = leesToken();
  if (!token) {
    return { ok: false, status: 401, fout: "Log in om de AI te gebruiken." };
  }
  let res: Response;
  try {
    res = await fetch(CLOUD_API_URL + "/ai/claude", {
      method: "POST",
      signal,
      headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, status: 0, fout: "Geannuleerd." };
    return { ok: false, status: 0, fout: "Kon de AI-dienst niet bereiken. Controleer je internetverbinding." };
  }
  if (res.status === 503) {
    return { ok: false, status: 503, fout: "De AI staat nog niet aan op de server. Vraag de beheerder de OpenRouter-sleutel in te stellen." };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, fout: (data as { error?: string | { message?: string } })?.error && typeof (data as { error?: unknown }).error === "object" ? ((data as { error: { message?: string } }).error.message || `AI-fout (status ${res.status}).`) : ((data as { error?: string }).error || `AI-fout (status ${res.status}).`) };
  return { ok: true, status: res.status, data };
}

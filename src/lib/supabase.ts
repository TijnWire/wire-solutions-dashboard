// Wire Solutions — centrale database via de Cloudflare Worker (voorheen Supabase).
// ─────────────────────────────────────────────────────────────────────────────
// Dit bestand houdt bewust dezelfde exportnamen (sb...) als de oude Supabase-versie, zodat de rest van de
// app niet hoeft te veranderen. De sync blijft local-first: een storing of trage database mag de login en
// het werken NOOIT blokkeren (timeouts + terugvalwaarden). Realtime is vervangen door de 2s-poll in AppContext.
//
// Na het deployen van de Worker: vul hieronder CLOUD_API_URL in (bv. https://wire-solutions-api.<jouw>.workers.dev).
// Zolang die niet is ingevuld, draait de app gewoon lokaal (supabaseAan = false).

export const CLOUD_API_URL = "https://wire-solutions-api.denhaantijn1.workers.dev";

// Of de centrale database geconfigureerd is. Zonder dit draait de app gewoon local-first.
export const supabaseAan = !CLOUD_API_URL.includes("PLAK-HIER");

// ── Token (JWT) — alleen lokaal op dit apparaat bewaard ──
const TOK_KEY = "wire.tok";
function leesToken(): string { try { return localStorage.getItem(TOK_KEY) || ""; } catch { return ""; } }
function bewaarToken(t: string): void { try { localStorage.setItem(TOK_KEY, t); } catch { /* opslag niet beschikbaar */ } }
function wisToken(): void { try { localStorage.removeItem(TOK_KEY); } catch { /* niets */ } }

function b64urlDecode(s: string): string {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return decodeURIComponent(escape(atob(s)));
}
function tokenPayload(): { email?: string; exp?: number } | null {
  const t = leesToken();
  if (!t) return null;
  const p = t.split(".");
  if (p.length !== 3) return null;
  try { return JSON.parse(b64urlDecode(p[1])); } catch { return null; }
}
function tokenGeldig(): boolean {
  const p = tokenPayload();
  return !!(p?.email && p.exp && p.exp > Math.floor(Date.now() / 1000));
}

// ── Basis fetch naar de Worker (met bearer-token + timeout) ──
type ApiOpts = { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number };
async function api<T = unknown>(path: string, opts: ApiOpts = {}): Promise<T> {
  const { method = "GET", body, auth = true, timeoutMs = 12000 } = opts;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (auth) { const t = leesToken(); if (t) headers["Authorization"] = `Bearer ${t}`; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(CLOUD_API_URL + path, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
    if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
    return data as T;
  } finally {
    clearTimeout(timer);
  }
}

// WebSocket-URL voor realtime (token in de query, want een browser-WebSocket kan geen header meesturen).
// Geeft "" als er geen sessie is — dan valt de app terug op de poll.
export function cloudWsUrl(): string {
  const t = leesToken();
  if (!t || !supabaseAan) return "";
  return CLOUD_API_URL.replace(/^http/, "ws") + "/ws?token=" + encodeURIComponent(t);
}

// Publieke helpers voor de andere modules (verlof, admin) — zelfde gedrag als de oude .from()/.invoke().
export function cloudGet<T = unknown>(path: string): Promise<T> { return api<T>(path, { method: "GET" }); }
export function cloudPost<T = unknown>(path: string, body: unknown): Promise<T> { return api<T>(path, { method: "POST", body }); }
export function cloudDelete<T = unknown>(path: string, body: unknown): Promise<T> { return api<T>(path, { method: "DELETE", body }); }

// ── Gedeelde data: één rij per onderdeel (key) met de inhoud als JSON ──
export async function sbLeesAlles(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>("/state", { method: "GET" });
}

export async function sbSchrijf(key: string, data: unknown): Promise<string> {
  const r = await api<{ updated_at: string }>("/state", { method: "POST", body: { key, data } });
  return r.updated_at; // zodat de aanroeper weet welke versie hij zojuist schreef
}

// Lichtgewicht check: alleen key + updated_at (geen data) — om elke paar seconden te zien wat er gewijzigd is.
export async function sbVersies(): Promise<Record<string, string>> {
  return api<Record<string, string>>("/state/versions", { method: "GET" });
}

// Haal alleen de data van specifieke onderdelen op (de onderdelen die daadwerkelijk gewijzigd zijn).
export async function sbLeesKeys(keys: string[]): Promise<Record<string, unknown>> {
  if (!keys.length) return {};
  return api<Record<string, unknown>>("/state/keys", { method: "POST", body: { keys } });
}

// Race een belofte tegen een timeout — zodat een storing de login/sync NOOIT laat hangen.
function metTimeout<T>(p: Promise<T>, ms: number, bijTimeout: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let klaar = false;
    const af = (v: T) => { if (!klaar) { klaar = true; clearTimeout(t); resolve(v); } };
    const t = setTimeout(() => af(bijTimeout), ms);
    p.then(af, () => af(bijTimeout));
  });
}

// ── Auth ──
export async function sbLogin(email: string, wachtwoord: string): Promise<boolean> {
  return metTimeout(
    (async () => {
      try {
        const r = await api<{ token?: string }>("/auth/login", { method: "POST", auth: false, body: { email: email.trim().toLowerCase(), wachtwoord } });
        if (r.token) { bewaarToken(r.token); return true; }
        return false;
      } catch { return false; }
    })(),
    8000,
    false,
  );
}

// Zorgt dat dit account bestaat (signup is idempotent) — en levert meteen een sessie op.
export async function sbRegistreer(email: string, wachtwoord: string): Promise<boolean> {
  return metTimeout(
    (async () => {
      try {
        const r = await api<{ token?: string }>("/auth/signup", { method: "POST", auth: false, body: { email: email.trim().toLowerCase(), wachtwoord } });
        if (r.token) { bewaarToken(r.token); return true; }
        return false;
      } catch { return false; }
    })(),
    8000,
    false,
  );
}

export async function sbLogout(): Promise<void> {
  wisToken(); // stateless JWT — lokaal wissen is genoeg
}

// Eigen wachtwoord wijzigen (na een beheerder-reset).
export async function sbWijzigWachtwoord(nieuwWachtwoord: string): Promise<boolean> {
  try { await api("/auth/wachtwoord", { method: "POST", body: { nieuwWachtwoord } }); return true; }
  catch { return false; }
}

// ── Automatisch verbonden blijven ──
// De inloggegevens worden ALLEEN lokaal op dit apparaat bewaard, zodat de app na heropenen vanzelf
// opnieuw kan aankoppelen (self-healing) als de token verlopen is.
const SC_KEY = "wire.sc";
const codeer = (s: string) => { try { return btoa(unescape(encodeURIComponent(s))); } catch { return ""; } };
const decodeer = (s: string) => { try { return decodeURIComponent(escape(atob(s))); } catch { return ""; } };

export function bewaarSyncCred(email: string, wachtwoord: string): void {
  try { localStorage.setItem(SC_KEY, codeer(JSON.stringify({ e: email.trim().toLowerCase(), w: wachtwoord }))); } catch { /* opslag niet beschikbaar */ }
}
export function wisSyncCred(): void {
  try { localStorage.removeItem(SC_KEY); } catch { /* niets */ }
}
function leesSyncCred(): { e: string; w: string } | null {
  try { const v = localStorage.getItem(SC_KEY); if (!v) return null; const o = JSON.parse(decodeer(v)); return o?.e && o?.w ? o : null; } catch { return null; }
}

// Zorgt dat er een geldige sessie is: is de token nog geldig, dan klaar; anders meldt de app zich stil
// opnieuw aan met de lokaal bewaarde gegevens (self-healing). Geeft true bij een sessie.
export async function sbHerstelSessie(): Promise<boolean> {
  return metTimeout(
    (async () => {
      try {
        if (tokenGeldig()) return true;
        const cred = leesSyncCred();
        if (!cred) return false;
        if (await sbLogin(cred.e, cred.w)) return true;
        await sbRegistreer(cred.e, cred.w); // account bestaat nog niet → aanmaken en opnieuw
        return await sbLogin(cred.e, cred.w);
      } catch { return false; }
    })(),
    10000,
    false,
  );
}

// Diagnose: test stap voor stap of dit apparaat met de centrale database kan praten.
export type SyncTest = { sessie: boolean; email: string | null; lezen: boolean; schrijven: boolean; melding: string };
export async function sbSyncTest(): Promise<SyncTest> {
  const r: SyncTest = { sessie: false, email: null, lezen: false, schrijven: false, melding: "" };
  try {
    r.sessie = tokenGeldig();
    r.email = tokenPayload()?.email ?? null;
    if (!r.sessie) {
      r.melding = "Niet verbonden met de centrale database (geen sessie). Log uit en opnieuw in.";
      return r;
    }
    try { await sbVersies(); r.lezen = true; }
    catch (e) { r.melding = `Wel ingelogd (${r.email}), maar lezen wordt geblokkeerd: ${e instanceof Error ? e.message : String(e)}.`; return r; }
    try { await sbSchrijf("synctest", { door: r.email, op: new Date().toISOString() }); r.schrijven = true; }
    catch (e) { r.melding = `Lezen lukt, maar schrijven wordt geblokkeerd: ${e instanceof Error ? e.message : String(e)}.`; return r; }
    r.melding = `Alles werkt — dit apparaat (${r.email}) leest én schrijft naar de centrale database. Wijzigingen worden gedeeld.`;
  } catch (e) {
    r.melding = `Onverwachte fout: ${e instanceof Error ? e.message : String(e)}`;
  }
  return r;
}

// Aantallen per onderdeel in de centrale database — om naast de lokale aantallen te tonen.
export async function sbAantallen(): Promise<{ ok: boolean; aantallen: Record<string, number>; fout?: string }> {
  try {
    const remote = await sbLeesAlles();
    const aantallen: Record<string, number> = {};
    for (const [k, v] of Object.entries(remote)) aantallen[k] = Array.isArray(v) ? v.length : v ? 1 : 0;
    return { ok: true, aantallen };
  } catch (e) {
    return { ok: false, aantallen: {}, fout: e instanceof Error ? e.message : String(e) };
  }
}

export async function sbSessieEmail(): Promise<string | null> {
  return tokenPayload()?.email ?? null;
}

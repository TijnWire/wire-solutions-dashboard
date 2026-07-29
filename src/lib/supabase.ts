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
export function leesToken(): string { try { return localStorage.getItem(TOK_KEY) || ""; } catch { return ""; } }
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

// Fout waarbij de server onze sessie weigert (401). Apart herkenbaar, zodat de app het verschil weet
// tussen "geen verbinding" (later opnieuw proberen) en "je mag hier niet meer bij" (opnieuw inloggen).
export class SessieFout extends Error {
  constructor(melding = "Geen geldige sessie.") { super(melding); this.name = "SessieFout"; }
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
    if (res.status === 401 || res.status === 403) throw new SessieFout(data?.error || `HTTP ${res.status}`);
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
// Data-zware calls (voorschouwen met foto's kunnen enkele MB's zijn) krijgen een ruime timeout,
// anders breekt de upload/download op een trage (mobiele) verbinding af binnen 12s en synct dat
// onderdeel niet — terwijl kleine onderdelen (mappen) wél doorkomen.
const DATA_TIMEOUT = 60000;

export async function sbLeesAlles(): Promise<Record<string, unknown>> {
  return api<Record<string, unknown>>("/state", { method: "GET", timeoutMs: DATA_TIMEOUT });
}

export async function sbSchrijf(key: string, data: unknown): Promise<string> {
  const r = await api<{ updated_at: string }>("/state", { method: "POST", body: { key, data }, timeoutMs: DATA_TIMEOUT });
  return r.updated_at; // zodat de aanroeper weet welke versie hij zojuist schreef
}

// Lichtgewicht check: alleen key + updated_at (geen data) — om elke paar seconden te zien wat er gewijzigd is.
export async function sbVersies(): Promise<Record<string, string>> {
  return api<Record<string, string>>("/state/versions", { method: "GET" });
}

// Haal alleen de data van specifieke onderdelen op (de onderdelen die daadwerkelijk gewijzigd zijn).
export async function sbLeesKeys(keys: string[]): Promise<Record<string, unknown>> {
  if (!keys.length) return {};
  return api<Record<string, unknown>>("/state/keys", { method: "POST", body: { keys }, timeoutMs: DATA_TIMEOUT });
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
// Drie uitkomsten, want "wachtwoord fout" en "database onbereikbaar" vragen om totaal ander gedrag:
// bij het eerste moet de gebruiker iets doen, bij het tweede moeten wij het later gewoon nog eens proberen.
// Vroeger was dit één boolean, waardoor een trage verbinding als "wachtwoord klopt niet" op het scherm kwam.
export type LoginUitkomst = "ok" | "fout" | "onbereikbaar";

export async function sbLoginUitkomst(email: string, wachtwoord: string): Promise<LoginUitkomst> {
  return metTimeout<LoginUitkomst>(
    (async (): Promise<LoginUitkomst> => {
      try {
        const r = await api<{ token?: string }>("/auth/login", { method: "POST", auth: false, body: { email: email.trim().toLowerCase(), wachtwoord } });
        if (r.token) { bewaarToken(r.token); return "ok"; }
        return "fout";
      } catch (e) {
        return e instanceof SessieFout ? "fout" : "onbereikbaar";
      }
    })(),
    8000,
    "onbereikbaar",
  );
}

export async function sbLogin(email: string, wachtwoord: string): Promise<boolean> {
  return (await sbLoginUitkomst(email, wachtwoord)) === "ok";
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
// Is onze bewaarde inlog door de server geweigerd? Dan moet de gebruiker het opnieuw doen; de app leest
// dit uit om een duidelijke melding te tonen in plaats van eindeloos stil te blijven proberen.
let sessieGeweigerd = false;
export function sessieIsGeweigerd(): boolean { return sessieGeweigerd; }
export function wisSessieGeweigerd(): void { sessieGeweigerd = false; }

export async function sbHerstelSessie(): Promise<boolean> {
  return metTimeout(
    (async () => {
      try {
        if (tokenGeldig()) return true;
        const cred = leesSyncCred();
        if (!cred) return false;
        const uitkomst = await sbLoginUitkomst(cred.e, cred.w);
        if (uitkomst === "ok") { sessieGeweigerd = false; return true; }
        // BELANGRIJK: hier stond vroeger `sbRegistreer(...)` als noodgreep. Dat maakte een verwijderd
        // account gewoon opnieuw aan en gaf een apparaat met een INGETROKKEN wachtwoord weer toegang.
        // Weigert de server onze gegevens, dan gooien we ze weg en laten we de gebruiker opnieuw inloggen.
        if (uitkomst === "fout") { wisSyncCred(); wisToken(); sessieGeweigerd = true; }
        return false; // "onbereikbaar" → gegevens bewaren, straks vanzelf opnieuw proberen
      } catch { return false; }
    })(),
    10000,
    false,
  );
}

// Diagnose: test stap voor stap of dit apparaat met de centrale database kan praten.
export type SyncTest = { sessie: boolean; email: string | null; lezen: boolean; schrijven: boolean; melding: string };
// Een netwerkfout zegt een gebruiker niets. Deze vertaling zegt wél wat er speelt en wat je eraan
// kunt doen. De drie gevallen die we in de praktijk zijn tegengekomen staan er met naam in.
function duidingVanFout(e: unknown, email: string | null): string {
  const m = e instanceof Error ? e.message : String(e);
  if (/1027|Too Many Requests|429/i.test(m)) {
    return "De centrale database heeft vandaag te veel verzoeken gehad en weigert tijdelijk alles "
      + "(Cloudflare-foutcode 1027, de daglimiet van het gratis plan). Je werk blijft veilig op dit "
      + "apparaat staan en gaat vanzelf mee zodra de limiet 's nachts wordt vrijgegeven.";
  }
  if (/Failed to fetch|NetworkError|load failed/i.test(m)) {
    return `Wel ingelogd (${email}), maar dit apparaat krijgt de centrale database helemaal niet te `
      + "pakken. Dat is bijna altijd het netwerk: probeer het op een ander netwerk of via je telefoon "
      + "als hotspot, en zet een eventuele adblocker of VPN even uit. Blijft het zo op elk netwerk, "
      + "dan is de daglimiet van de server bereikt.";
  }
  if (/aborted|timeout/i.test(m)) {
    return `Wel ingelogd (${email}), maar het antwoord kwam niet binnen de tijd. Meestal een trage `
      + "verbinding; het probeert vanzelf opnieuw.";
  }
  return `Wel ingelogd (${email}), maar lezen wordt geblokkeerd: ${m}.`;
}

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
    catch (e) {
      r.melding = duidingVanFout(e, r.email);
      return r;
    }
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

// ── Bodemonderzoek: afspraken met tijdslot ──
// Deze lopen NIET via de gewone JSON-sync maar via eigen routes, omdat de server de capaciteit per
// tijdblok moet bewaken. Twee medewerkers die tegelijk het laatste blok pakken, kunnen elkaar zo niet
// overschrijven: de tweede krijgt "blok is vol" terug in plaats van stilzwijgend te winnen.
export type BodemSlot = { slot: string; actief?: boolean; max?: number };
export type BodemConfig = {
  periodeStart?: string;
  periodeEind?: string;
  werkdagen?: number[]; // 0 = zondag … 6 = zaterdag
  sloten?: BodemSlot[];
};
export type BodemAfspraak = {
  adres_id: string; datum: string; tijdslot: string;
  naam: string; telefoon: string; email: string; notitie: string;
  ingevuld_door: string; ingevuld_op: string;
};
export type BodemProject = {
  config: BodemConfig | null;
  afspraken: BodemAfspraak[];
  bezetting: { datum: string; tijdslot: string; n: number }[];
};

export async function sbBodemProject(projectId: string): Promise<BodemProject | null> {
  try { return await cloudGet<BodemProject>(`/bodem/project?id=${encodeURIComponent(projectId)}`); }
  catch { return null; }
}

export async function sbBodemPlanning(projectId: string, config: BodemConfig): Promise<{ ok: boolean; error?: string }> {
  try { await cloudPost("/bodem/project", { projectId, config }); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Geeft ok:false met een leesbare reden als het blok vol is of de dag niet mag — de app toont die
// melding rechtstreeks aan de medewerker die voor de deur staat.
export async function sbBodemAfspraak(v: {
  projectId: string; adresId: string; datum: string; tijdslot: string;
  naam?: string; telefoon?: string; email?: string; notitie?: string;
}): Promise<{ ok: boolean; error?: string }> {
  try { await cloudPost("/bodem/afspraak", v); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function sbBodemAfspraakWeg(adresId: string): Promise<{ ok: boolean; error?: string }> {
  try { await cloudDelete("/bodem/afspraak", { adresId }); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export type BodemUitkomst = "niet_thuis" | "weigert" | "later" | "ongeldig";
export async function sbBodemBezoek(v: { projectId: string; adresId: string; uitkomst: BodemUitkomst; notitie?: string }): Promise<{ ok: boolean; poging?: number; error?: string }> {
  try { return { ok: true, ...(await cloudPost<{ poging: number }>("/bodem/bezoek", v)) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Het wijzigingslog van een bodemonderzoek-project (alleen voor de leiding).
export type BodemLogRegel = {
  id: number; adres_id: string; gebeurtenis: string;
  oud: string; nieuw: string; door: string; tijdstip: string;
};
export async function sbBodemLog(projectId: string): Promise<BodemLogRegel[]> {
  try {
    const r = await cloudGet<{ regels: BodemLogRegel[] }>(`/bodem/log?projectId=${encodeURIComponent(projectId)}`);
    return r.regels ?? [];
  } catch { return []; }
}

// ── Bewaartermijn voor persoonsgegevens ──
export type BodemBewaartermijn = { afgerondOp: string; gewistOp: string; wistOp: string; maanden: number };

export async function sbBodemBewaartermijn(projectId: string): Promise<BodemBewaartermijn | null> {
  try { return await cloudGet<BodemBewaartermijn>(`/bodem/bewaartermijn?projectId=${encodeURIComponent(projectId)}`); }
  catch { return null; }
}

export async function sbBodemAfronden(projectId: string, ongedaan = false): Promise<{ ok: boolean; error?: string }> {
  try { await cloudPost("/bodem/afronden", { projectId, ongedaan }); return { ok: true }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function sbBodemWisGegevens(projectId: string): Promise<{ ok: boolean; adressen?: number; afspraken?: number; error?: string }> {
  try { return { ok: true, ...(await cloudPost<{ adressen: number; afspraken: number }>("/bodem/wis-persoonsgegevens", { projectId })) }; }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Welke onderdelen mag dit account niet inzien? De server bepaalt dat; de app gebruikt het antwoord om
// die onderdelen niet te uploaden en haar eigen (mogelijk oude) kopie lokaal op te ruimen.
export type MijnRechten = { rol: string; boekhouding: boolean; afgeschermd: string[] };
export async function sbMijnRechten(): Promise<MijnRechten | null> {
  try { return await api<MijnRechten>("/rechten", { timeoutMs: 10000 }); }
  catch { return null; } // onbekend → app doet niets bijzonders; de server blijft het hoe dan ook afdwingen
}

// Status van BEIDE databases naast elkaar: Cloudflare (de baas) en de Supabase-spiegel (tweede kopie).
export type DbStatus = {
  cloudflare: { gezond: boolean; onderdelen: number; accounts: number; fout: string };
  supabase: { aan: boolean; gezond: boolean; melding: string; onderdelen?: number; accounts?: number; laatstGespiegeld?: string | null };
  gelijk: boolean;
  tijd: string;
};

export async function sbDbStatus(): Promise<DbStatus | { fout: string }> {
  try { return await api<DbStatus>("/status", { timeoutMs: 20000 }); }
  catch (e) { return { fout: e instanceof Error ? e.message : String(e) }; }
}

// Maakt voor elk teamlid zonder inlogaccount alsnog een account aan, op basis van de wachtwoord-hash die
// al in de teamlijst staat. Daarna kan iedereen op élk apparaat inloggen met zijn eigen wachtwoord.
export async function sbKoppelAccounts(): Promise<{ ok: boolean; gekoppeld?: number; aanwezig?: number; overgeslagen?: string[]; error?: string }> {
  try { return await api("/admin/koppel-accounts", { method: "POST", body: {}, timeoutMs: 60000 }); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

// Duwt de hele Cloudflare-inhoud opnieuw naar Supabase — na een storing of pauze loopt de spiegel
// daarmee weer gelijk. Alleen de eigenaar en HR mogen dit.
export async function sbHerstelSpiegel(): Promise<{ ok: boolean; onderdelen?: number; accounts?: number; rollen?: number; error?: string }> {
  try { return await api("/spiegel/herstel", { method: "POST", body: {}, timeoutMs: 120000 }); }
  catch (e) { return { ok: false, error: e instanceof Error ? e.message : String(e) }; }
}

export async function sbSessieEmail(): Promise<string | null> {
  return tokenPayload()?.email ?? null;
}

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// De anon-key hoort in de frontend te staan; de beveiliging zit in de RLS-regels
// (alleen ingelogde teamleden) + uitgeschakelde zelfregistratie in Supabase.
export const SUPABASE_URL = "https://buauptxdaiuvqazhlrhk.supabase.co";
export const SUPABASE_ANON =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXVwdHhkYWl1dnFhemhscmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTQ0ODAsImV4cCI6MjA5NjQ5MDQ4MH0.OeQlHefazX6XLdAoOQtJEWs9lUqctjP3rC4_L7byn_4";

// Of de centrale database geconfigureerd is. Zonder dit draait de app gewoon local-first.
export const supabaseAan = !!(SUPABASE_URL && SUPABASE_ANON);

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
  }
  return client;
}

// ── Gedeelde data: één rij per onderdeel (key) met de inhoud als JSON ──
export async function sbLeesAlles(): Promise<Record<string, unknown>> {
  const { data, error } = await sb().from("wire_state").select("key,data");
  if (error) throw error;
  const out: Record<string, unknown> = {};
  for (const r of (data ?? []) as { key: string; data: unknown }[]) out[r.key] = r.data;
  return out;
}

export async function sbSchrijf(key: string, data: unknown): Promise<string> {
  const updated_at = new Date().toISOString();
  const { error } = await sb().from("wire_state").upsert({ key, data, updated_at }, { onConflict: "key" });
  if (error) throw error;
  return updated_at; // zodat de aanroeper weet welke versie hij zojuist schreef (tegen onnodig terughalen)
}

// Lichtgewicht check: alleen key + updated_at (geen data) — om elke paar seconden te zien wat er gewijzigd is.
export async function sbVersies(): Promise<Record<string, string>> {
  const { data, error } = await sb().from("wire_state").select("key,updated_at");
  if (error) throw error;
  const out: Record<string, string> = {};
  for (const r of (data ?? []) as { key: string; updated_at: string }[]) out[r.key] = r.updated_at;
  return out;
}

// Haal alleen de data van specifieke onderdelen op (de onderdelen die daadwerkelijk gewijzigd zijn).
export async function sbLeesKeys(keys: string[]): Promise<Record<string, unknown>> {
  if (!keys.length) return {};
  const { data, error } = await sb().from("wire_state").select("key,data").in("key", keys);
  if (error) throw error;
  const out: Record<string, unknown> = {};
  for (const r of (data ?? []) as { key: string; data: unknown }[]) out[r.key] = r.data;
  return out;
}

// Race een belofte tegen een timeout — zodat een Supabase-storing de login/sync NOOIT laat hangen.
// Bij een timeout of fout geven we de opgegeven terugvalwaarde terug (meestal false → lokaal doorgaan).
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
    (async () => { const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password: wachtwoord }); return !error; })(),
    8000,
    false,
  );
}

// Zorgt dat dit account in Supabase Auth bestaat (zodat de cloud-sync werkt). Bestaat het al, dan is dat prima.
// Vereist dat "Allow new users to sign up" aan staat in Supabase; staat het uit, dan faalt dit stil.
export async function sbRegistreer(email: string, wachtwoord: string): Promise<boolean> {
  return metTimeout(
    (async () => {
      try {
        const { error } = await sb().auth.signUp({ email: email.trim().toLowerCase(), password: wachtwoord });
        return !error || /already|registered|bestaat/i.test(error.message);
      } catch {
        return false;
      }
    })(),
    8000,
    false,
  );
}

export async function sbLogout(): Promise<void> {
  try { await sb().auth.signOut(); } catch { /* netwerk weg — lokaal toch uitloggen */ }
}

// ── Automatisch verbonden blijven ──
// De inloggegevens worden ALLEEN lokaal op dit apparaat bewaard (niet in de cloud, niet in de code),
// zodat de app de Supabase-sessie na heropenen vanzelf kan herstellen en het apparaat gekoppeld blijft.
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

// Zorgt dat er een Supabase-sessie is: bestaat er al een (Supabase bewaart die zelf), dan klaar; anders
// meldt de app stil opnieuw aan met de lokaal bewaarde gegevens (self-healing). Geeft true bij een sessie.
export async function sbHerstelSessie(): Promise<boolean> {
  return metTimeout(
    (async () => {
      try {
        const { data } = await sb().auth.getSession();
        if (data.session) return true;
        const cred = leesSyncCred();
        if (!cred) return false;
        if (await sbLogin(cred.e, cred.w)) return true;
        await sbRegistreer(cred.e, cred.w); // account nog niet in Auth → aanmaken en opnieuw proberen
        return await sbLogin(cred.e, cred.w);
      } catch {
        return false;
      }
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
    const { data } = await sb().auth.getSession();
    r.sessie = !!data.session;
    r.email = data.session?.user?.email ?? null;
    if (!r.sessie) {
      r.melding = "Niet verbonden met de centrale database (geen sessie). Log uit en opnieuw in. Blijft dit? Verwijder in Supabase de team-accounts (Authentication → Users) en log opnieuw in.";
      return r;
    }
    const lees = await sb().from("wire_state").select("key").limit(1);
    if (lees.error) {
      r.melding = `Wel ingelogd (${r.email}), maar de database blokkeert toegang: ${lees.error.message}. Draai de SQL uit supabase/schema.sql opnieuw in de SQL Editor.`;
      return r;
    }
    r.lezen = true;
    const schrijf = await sb().from("wire_state").upsert({ key: "synctest", data: { door: r.email, op: new Date().toISOString() }, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (schrijf.error) {
      r.melding = `Lezen lukt, maar schrijven wordt geblokkeerd: ${schrijf.error.message}. Controleer de RLS-policies (schema.sql).`;
      return r;
    }
    r.schrijven = true;
    r.melding = `Alles werkt — dit apparaat (${r.email}) leest én schrijft naar de centrale database. Wijzigingen worden gedeeld.`;
  } catch (e) {
    r.melding = `Onverwachte fout: ${e instanceof Error ? e.message : String(e)}`;
  }
  return r;
}

// Aantallen per onderdeel in de centrale database — om naast de lokale aantallen te tonen.
// Zo zie je direct of data wél/niet in de cloud staat (bv. lokaal 7, centraal 0 = schrijven faalt).
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
  try {
    const { data } = await sb().auth.getSession();
    return data.session?.user?.email ?? null;
  } catch {
    return null;
  }
}

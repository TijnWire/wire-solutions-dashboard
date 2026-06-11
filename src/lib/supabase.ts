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

export async function sbSchrijf(key: string, data: unknown): Promise<void> {
  const { error } = await sb().from("wire_state").upsert(
    { key, data, updated_at: new Date().toISOString() },
    { onConflict: "key" }
  );
  if (error) throw error;
}

// ── Auth ──
export async function sbLogin(email: string, wachtwoord: string): Promise<boolean> {
  const { error } = await sb().auth.signInWithPassword({ email: email.trim().toLowerCase(), password: wachtwoord });
  return !error;
}

// Zorgt dat dit account in Supabase Auth bestaat (zodat de cloud-sync werkt). Bestaat het al, dan is dat prima.
// Vereist dat "Allow new users to sign up" aan staat in Supabase; staat het uit, dan faalt dit stil.
export async function sbRegistreer(email: string, wachtwoord: string): Promise<boolean> {
  try {
    const { error } = await sb().auth.signUp({ email: email.trim().toLowerCase(), password: wachtwoord });
    return !error || /already|registered|bestaat/i.test(error.message);
  } catch {
    return false;
  }
}

export async function sbLogout(): Promise<void> {
  try { await sb().auth.signOut(); } catch { /* netwerk weg — lokaal toch uitloggen */ }
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

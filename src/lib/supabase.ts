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

export async function sbLogout(): Promise<void> {
  try { await sb().auth.signOut(); } catch { /* netwerk weg — lokaal toch uitloggen */ }
}

export async function sbSessieEmail(): Promise<string | null> {
  try {
    const { data } = await sb().auth.getSession();
    return data.session?.user?.email ?? null;
  } catch {
    return null;
  }
}

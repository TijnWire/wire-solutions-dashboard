// Beheerders-acties op accounts. De écht gevoelige delen (wachtwoord resetten / e-mail wijzigen in
// Supabase Auth) lopen via een Edge Function met de service-role — die staat NOOIT in de frontend.
// Zie supabase/functions/admin-account/index.ts en supabase/fase2.sql.
import { sb, supabaseAan } from "./supabase";

export type AdminActie =
  | "account_aangemaakt"
  | "account_bewerkt"
  | "account_verwijderd"
  | "rol_gewijzigd"
  | "email_gewijzigd"
  | "wachtwoord_reset";

// Audit-log: legt vast wie welke beheerdersactie deed, voor wie en wanneer. Best-effort vanuit de UI;
// de Edge Function logt de kritieke acties (reset/e-mail) sowieso zelf met de geverifieerde beheerder.
export async function logAudit(
  actie: AdminActie,
  door: { email: string; naam: string },
  doel: { userId?: string; email?: string; naam?: string },
  details?: Record<string, unknown>
): Promise<void> {
  if (!supabaseAan) return;
  try {
    await sb().from("admin_audit").insert({
      actie,
      door_email: door.email,
      door_naam: door.naam,
      doel_user_id: doel.userId ?? null,
      doel_email: doel.email ?? null,
      doel_naam: doel.naam ?? null,
      details: details ?? {},
    });
  } catch { /* audit mag de UI nooit blokkeren */ }
}

// Rol-spiegel: houdt de server-side tabel app_roles gelijk met de app-rollen, zodat Postgres-RLS
// (is_boekhouding) weet wie verlof mag goedkeuren. Best-effort.
export async function syncAppRole(email: string, rol: string, boekhouding: boolean): Promise<void> {
  if (!supabaseAan) return;
  try {
    await sb().from("app_roles").upsert(
      { email: email.trim().toLowerCase(), rol, boekhouding, bijgewerkt_op: new Date().toISOString() },
      { onConflict: "email" }
    );
  } catch { /* best-effort */ }
}

export async function verwijderAppRole(email: string): Promise<void> {
  if (!supabaseAan) return;
  try { await sb().from("app_roles").delete().eq("email", email.trim().toLowerCase()); } catch { /* best-effort */ }
}

export type FnResultaat = { ok: boolean; error?: string };

async function roepAdminFn(actie: string, payload: Record<string, unknown>): Promise<FnResultaat> {
  if (!supabaseAan) return { ok: false, error: "Geen databaseverbinding." };
  try {
    const { data, error } = await sb().functions.invoke("admin-account", { body: { actie, ...payload } });
    if (error) return { ok: false, error: error.message };
    const d = data as { error?: string } | null;
    if (d?.error) return { ok: false, error: d.error };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Zet in Supabase Auth een nieuw wachtwoord voor het doel-account (maakt het account aan als het nog niet bestaat).
export function resetAuthWachtwoord(doelEmail: string, nieuwWachtwoord: string): Promise<FnResultaat> {
  return roepAdminFn("reset-wachtwoord", { doelEmail: doelEmail.trim().toLowerCase(), nieuwWachtwoord });
}

// Wijzigt in Supabase Auth het e-mailadres (inlog) van een medewerker.
export function wijzigAuthEmail(oudEmail: string, nieuwEmail: string): Promise<FnResultaat> {
  return roepAdminFn("wijzig-email", { oudEmail: oudEmail.trim().toLowerCase(), nieuwEmail: nieuwEmail.trim().toLowerCase() });
}

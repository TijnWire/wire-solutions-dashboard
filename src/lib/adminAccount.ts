// Beheerders-acties op accounts. De écht gevoelige delen (wachtwoord resetten / e-mail wijzigen van een
// ander account) lopen via aparte, rol-beveiligde routes op de Cloudflare Worker — die checkt dat de
// aanroeper (via zijn token) de rol 'eigenaar' of 'beheer' heeft. Zie cloudflare/worker.ts.
import { cloudPost, cloudDelete, supabaseAan } from "./supabase";

export type AdminActie =
  | "account_aangemaakt"
  | "account_bewerkt"
  | "account_verwijderd"
  | "rol_gewijzigd"
  | "email_gewijzigd"
  | "wachtwoord_reset";

// Audit-log: legt vast wie welke beheerdersactie deed, voor wie en wanneer. Best-effort vanuit de UI;
// de Worker logt de kritieke acties (reset/e-mail) sowieso zelf met de geverifieerde beheerder.
export async function logAudit(
  actie: AdminActie,
  door: { email: string; naam: string },
  doel: { userId?: string; email?: string; naam?: string },
  details?: Record<string, unknown>
): Promise<void> {
  if (!supabaseAan) return;
  try {
    await cloudPost("/audit", {
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

// Rol-spiegel: houdt de server-side tabel app_roles gelijk met de app-rollen, zodat de Worker weet wie
// verlof mag goedkeuren. Best-effort (de Worker leidt de rollen sowieso ook af uit de users-blob).
export async function syncAppRole(email: string, rol: string, boekhouding: boolean): Promise<void> {
  if (!supabaseAan) return;
  try {
    await cloudPost("/roles", { email: email.trim().toLowerCase(), rol, boekhouding });
  } catch { /* best-effort */ }
}

export async function verwijderAppRole(email: string): Promise<void> {
  if (!supabaseAan) return;
  try { await cloudDelete("/roles", { email: email.trim().toLowerCase() }); } catch { /* best-effort */ }
}

export type FnResultaat = { ok: boolean; error?: string };

async function roepAdminFn(actie: string, payload: Record<string, unknown>): Promise<FnResultaat> {
  if (!supabaseAan) return { ok: false, error: "Geen databaseverbinding." };
  try {
    await cloudPost(`/admin/${actie}`, payload);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

// Zet een nieuw wachtwoord voor het doel-account (maakt het account aan als het nog niet bestaat).
export function resetAuthWachtwoord(doelEmail: string, nieuwWachtwoord: string): Promise<FnResultaat> {
  return roepAdminFn("reset-wachtwoord", { doelEmail: doelEmail.trim().toLowerCase(), nieuwWachtwoord });
}

// Wijzigt het e-mailadres (inlog) van een medewerker.
export function wijzigAuthEmail(oudEmail: string, nieuwEmail: string): Promise<FnResultaat> {
  return roepAdminFn("wijzig-email", { oudEmail: oudEmail.trim().toLowerCase(), nieuwEmail: nieuwEmail.trim().toLowerCase() });
}

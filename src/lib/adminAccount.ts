// Beheerders-acties op accounts. De écht gevoelige delen (wachtwoord resetten / e-mail wijzigen van een
// ander account) lopen via aparte, rol-beveiligde routes op de Cloudflare Worker — die checkt dat de
// aanroeper (via zijn token) de rol 'eigenaar' of 'beheer' heeft. Zie cloudflare/worker.ts.
import { cloudPost, supabaseAan, sbHerstelSessie } from "./supabase";

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

export type FnResultaat = { ok: boolean; error?: string };

async function roepAdminFn(actie: string, payload: Record<string, unknown>): Promise<FnResultaat> {
  if (!supabaseAan) return { ok: false, error: "Geen databaseverbinding." };
  const melding = (e: unknown) => (e instanceof Error ? e.message : String(e));
  try {
    await cloudPost(`/admin/${actie}`, payload);
    return { ok: true };
  } catch (e) {
    // Verlopen sessie? Eenmalig herstellen en opnieuw proberen. Zonder dit kan een beheerder die de app
    // lang open had staan geen wachtwoord meer wijzigen of een account verwijderen — die acties mogen
    // niet doorgaan zonder de Worker, dus ze moeten wél lukken zodra de verbinding er is.
    if (!melding(e).includes("Geen geldige sessie")) return { ok: false, error: melding(e) };
    try {
      if (!(await sbHerstelSessie())) return { ok: false, error: "Geen verbinding met de centrale database — log opnieuw in en probeer het nog eens." };
      await cloudPost(`/admin/${actie}`, payload);
      return { ok: true };
    } catch (e2) {
      return { ok: false, error: melding(e2) };
    }
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

// Haalt het inlog-account weg bij Cloudflare (users_auth + app_roles). Nodig bij het verwijderen van een
// medewerker: anders kan het account blijven inloggen en syncen, ook al staat het niet meer in de app.
export function verwijderAuthAccount(doelEmail: string): Promise<FnResultaat> {
  return roepAdminFn("verwijder-account", { doelEmail: doelEmail.trim().toLowerCase() });
}

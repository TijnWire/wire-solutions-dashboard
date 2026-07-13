// Beheerders-acties op accounts.
// (Firebase-migratie) De server-side onderdelen (audit-log, rol-spiegel, en wachtwoord/e-mail wijzigen
// in Auth) draaiden op Supabase via een Edge Function + tabellen. Op Firebase worden die later herbouwd
// als Cloud Functions (met de Admin SDK). Tot die tijd zijn ze no-op / niet-beschikbaar en valt de UI
// netjes terug op de lokale afhandeling (het lokale wachtwoord/e-mail wordt wél bijgewerkt).

export type AdminActie =
  | "account_aangemaakt"
  | "account_bewerkt"
  | "account_verwijderd"
  | "rol_gewijzigd"
  | "email_gewijzigd"
  | "wachtwoord_reset";

export async function logAudit(
  _actie: AdminActie,
  _door: { email: string; naam: string },
  _doel: { userId?: string; email?: string; naam?: string },
  _details?: Record<string, unknown>,
): Promise<void> {
  // Nog te herbouwen op Firebase (Cloud Function) — nu een no-op.
}

export async function syncAppRole(_email: string, _rol: string, _boekhouding: boolean): Promise<void> { /* Firebase: nog te herbouwen */ }
export async function verwijderAppRole(_email: string): Promise<void> { /* Firebase: nog te herbouwen */ }

export type FnResultaat = { ok: boolean; error?: string };

export function resetAuthWachtwoord(_doelEmail: string, _nieuwWachtwoord: string): Promise<FnResultaat> {
  return Promise.resolve({ ok: false, error: "De server-wachtwoordreset draait nog niet op Firebase. Het lokale wachtwoord is wél bijgewerkt; de medewerker kan er lokaal mee inloggen." });
}

export function wijzigAuthEmail(_oudEmail: string, _nieuwEmail: string): Promise<FnResultaat> {
  return Promise.resolve({ ok: false, error: "E-mailwijziging in Auth draait nog niet op Firebase. Lokaal is het e-mailadres wél aangepast." });
}

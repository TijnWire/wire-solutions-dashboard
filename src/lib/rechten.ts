import type { Role } from "./types";

// HR is personeelszaken en heeft in het dashboard dezelfde rechten als de eigenaar: rollen en rechten
// toewijzen, toegang beheren, wachtwoorden wijzigen. Eén plek, zodat de twee rollen niet uit elkaar lopen.
// (De Worker kent dezelfde regel — zie magAlles in cloudflare/worker.ts.)
export function magAlles(user: { rol: Role } | null | undefined): boolean {
  return user?.rol === "eigenaar" || user?.rol === "hr";
}

// Onderdelen die onder "Boekhouding" vallen. Wie hier toegang toe heeft (eigenaar, of een beheerder
// met minstens één van deze rechten) mag o.a. verlofaanvragen goedkeuren.
export const BOEKHOUDING_KEYS = ["facturen", "loonstroken", "boetes", "medewerkers"];

// Mag deze gebruiker bij de Boekhouding — en dus verlof goedkeuren?
// Eigenaar altijd; een beheerder alleen als de eigenaar hem een boekhoud-onderdeel heeft toegewezen
// (geen beperking ingesteld = alles). Werknemers nooit.
export function magBoekhouding(user: { rol: Role; beheerRechten?: string[] } | null | undefined): boolean {
  if (!user) return false;
  if (user.rol === "eigenaar" || user.rol === "hr") return true; // HR = boekhouding/personeelszaken → volledige toegang
  if (user.rol === "beheer") {
    if (!user.beheerRechten) return true; // geen beperking = alles
    return user.beheerRechten.some((k) => BOEKHOUDING_KEYS.includes(k));
  }
  return false;
}

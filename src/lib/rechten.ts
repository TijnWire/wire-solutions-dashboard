import type { Role } from "./types";

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

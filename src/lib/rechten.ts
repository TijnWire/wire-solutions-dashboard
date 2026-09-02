import type { Role } from "./types";

// Wie mag "alles" (rollen/rechten toewijzen, toegang beheren, wachtwoorden wijzigen, PII wissen)?
// Eigenaar en HR (personeelszaken) altijd. Op verzoek van de leiding telt BEHEER hier óók mee: de
// beheerders (Tijn, Willem, Remon) hebben in de praktijk dezelfde volledige bevoegdheid als de eigenaar.
// LET OP — beveiligingsgevolg: hierdoor krijgt ELKE 'beheer'-gebruiker volledige rechten, ook een
// toekomstige. Wil je ooit weer een beperkte beheerder, geef die dan een aparte rol of draai dit terug.
// (De Worker kent exact dezelfde regel — zie magAlles in cloudflare/worker.ts; die twee MOETEN gelijk zijn.)
export function magAlles(user: { rol: Role } | null | undefined): boolean {
  return user?.rol === "eigenaar" || user?.rol === "hr" || user?.rol === "beheer";
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

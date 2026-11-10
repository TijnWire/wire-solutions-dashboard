// Voor wie is een mededeling? Nieuwe mededelingen kunnen aan meerdere personen gericht zijn
// (gerichtAanIds); oudere hadden één persoon (gerichtAan). Leeg = het hele team.
import type { Mededeling } from "./types";

export function ontvangersVan(m: Pick<Mededeling, "gerichtAan" | "gerichtAanIds">): string[] {
  if (m.gerichtAanIds && m.gerichtAanIds.length > 0) return m.gerichtAanIds;
  return m.gerichtAan ? [m.gerichtAan] : [];
}

// Leiding ziet alles, de plaatser ook; een werknemer ziet team-brede mededelingen en die aan hem gericht zijn.
export function isMededelingVoor(m: Mededeling, userId: string, isLeiding: boolean): boolean {
  if (isLeiding || m.auteurId === userId) return true;
  const ontv = ontvangersVan(m);
  return ontv.length === 0 || ontv.includes(userId);
}

// "Voor Anna", "Voor Anna en Bram", "Voor Anna, Bram en 2 anderen".
export function ontvangersLabel(ids: string[], naamVan: (id: string) => string): string {
  const namen = ids.map(naamVan);
  if (namen.length === 0) return "Hele team";
  if (namen.length === 1) return namen[0];
  if (namen.length === 2) return `${namen[0]} en ${namen[1]}`;
  return `${namen[0]}, ${namen[1]} en ${namen.length - 2} ${namen.length - 2 === 1 ? "andere" : "anderen"}`;
}

// Alleen eigenaren en beheerders plaatsen, pinnen of verwijderen mededelingen; iedereen kan ze lezen.
export const magMededelingPlaatsen = (rol?: string) => rol === "eigenaar" || rol === "beheer";

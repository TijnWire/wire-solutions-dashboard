// Werk aan één óf meerdere medewerkers toewijzen.
// ─────────────────────────────────────────────────────────────────────────────
// Elk werkitem had altijd één `toegewezenAan` (user id). Om meerdere mensen tegelijk aan iets te kunnen
// zetten zonder bestaande gegevens of oudere app-versies te breken, blijft dat veld de eerste/hoofd-
// verantwoordelijke en komen de overige medewerkers in `extraToegewezen`. Iedereen in die lijst ziet het
// werk als "van mij" (Mijn werk, meldingen, filters).

export type Toewijsbaar = { toegewezenAan?: string; extraToegewezen?: string[] };

/** Alle medewerkers aan wie dit item is toegewezen (uniek, hoofdverantwoordelijke eerst). */
export function toegewezenIds(x: Toewijsbaar | undefined | null): string[] {
  if (!x) return [];
  const ids = [x.toegewezenAan ?? "", ...(x.extraToegewezen ?? [])].filter(Boolean);
  return [...new Set(ids)];
}

/** Hoort dit item (ook) bij deze medewerker? */
export function isToegewezen(x: Toewijsbaar | undefined | null, userId: string | undefined | null): boolean {
  if (!x || !userId) return false;
  return x.toegewezenAan === userId || !!x.extraToegewezen?.includes(userId);
}

/** Patch voor een update: eerste id wordt `toegewezenAan`, de rest `extraToegewezen`. */
export function toewijzingPatch(ids: string[]): { toegewezenAan: string | undefined; extraToegewezen: string[] | undefined } {
  const uniek = [...new Set(ids.filter(Boolean))];
  return { toegewezenAan: uniek[0], extraToegewezen: uniek.length > 1 ? uniek.slice(1) : undefined };
}

/** "Adi", "Adi & Guus" of "Adi + 2". */
export function toegewezenLabel(ids: string[], naamVan: (id: string) => string, leeg = "Niet toegewezen"): string {
  if (!ids.length) return leeg;
  const namen = ids.map(naamVan).filter(Boolean);
  if (namen.length <= 1) return namen[0] ?? leeg;
  if (namen.length === 2) return `${namen[0]} & ${namen[1]}`;
  return `${namen[0]} + ${namen.length - 1}`;
}

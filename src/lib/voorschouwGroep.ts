import type { Voorschouw } from "./types";
import { afleidRegio } from "./regio";

// ── Herkenning: hoort een adres op basis van z'n plaats in een bepaalde map? ──────────
// Normaliseert voor vergelijking: kleine letters, alles wat geen letter/cijfer is → spatie.
// Beide kanten (mapnaam én plaats) gaan hier doorheen, dus accenten vallen aan beide kanten
// hetzelfde uit en de vergelijking blijft kloppen.
export const normPlaats = (s: string) =>
  (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

// Past een map met deze naam bij een adres in deze plaats? Exact ("Zwijndrecht"), of de mapnaam
// begint met de plaats ("Gouda - Geen foto" hoort bij Gouda). Zo blijft het voorspelbaar.
export function mapPastBijPlaats(mapNaam: string, plaats: string): boolean {
  const m = normPlaats(mapNaam), p = normPlaats(plaats);
  if (!m || !p) return false;
  return m === p || m.startsWith(p + " ");
}

// De map die bij deze plaats hoort. Alleen bij één duidelijke kandidaat — bij twijfel niets,
// want fout indelen is vervelender dan handmatig kiezen.
export function mapVoorPlaats<T extends { id: string; naam: string }>(mappen: T[], plaats: string): T | undefined {
  if (!normPlaats(plaats)) return undefined;
  const exact = mappen.filter((m) => normPlaats(m.naam) === normPlaats(plaats));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return undefined; // meerdere mappen met dezelfde naam → te onzeker
  const kandidaten = mappen.filter((m) => mapPastBijPlaats(m.naam, plaats));
  return kandidaten.length === 1 ? kandidaten[0] : undefined;
}

// Een "map" = alle voorschouwen met dezelfde postcode-prefix (4 cijfers). "Vol" = alles ingediend.
export type PostcodeMap = {
  prefix: string;
  regio: string;
  plaats: string;
  items: Voorschouw[];
  totaal: number;
  ingediend: number;
  vol: boolean;
};

export function postcodeMappen(lijst: Voorschouw[]): PostcodeMap[] {
  const groepen = new Map<string, Voorschouw[]>();
  for (const v of lijst) {
    const prefix = (v.postcode || "").replace(/\s/g, "").slice(0, 4) || "Onbekend";
    const arr = groepen.get(prefix);
    if (arr) arr.push(v);
    else groepen.set(prefix, [v]);
  }

  const mappen: PostcodeMap[] = [];
  for (const [prefix, items] of groepen) {
    const ingediend = items.filter((i) => i.status === "Ingediend").length;
    const eerste = items[0];
    mappen.push({
      prefix,
      regio: afleidRegio(eerste.postcode, eerste.plaats),
      plaats: eerste.plaats || "",
      items,
      totaal: items.length,
      ingediend,
      vol: items.length > 0 && ingediend === items.length,
    });
  }
  // Volle mappen eerst, daarna op postcode.
  return mappen.sort((a, b) => (b.vol ? 1 : 0) - (a.vol ? 1 : 0) || a.prefix.localeCompare(b.prefix, "nl", { numeric: true }));
}

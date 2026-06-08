import type { Voorschouw } from "./types";
import { afleidRegio } from "./regio";

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

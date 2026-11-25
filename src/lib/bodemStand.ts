// Bodemonderzoeken: de adreslijst van een plaats met per huis de stand. "Afgesproken" volgt uit de
// planning: er staat een (niet geannuleerde) afspraak op dat adres.
import type { GasAdres, Schouwafspraak } from "./types";

// Adres vergelijken tussen de adreslijst en de afspraken: straat + huisnummer (met toevoeging), zonder spaties/hoofdletters.
export const adresSleutel = (straat: string, nr: string) => `${straat.toLowerCase().replace(/\s+/g, " ").trim()}|${nr.toLowerCase().replace(/[\s-]+/g, "")}`;

export function bodemAdressen(sleutel: string, gasAdressen: GasAdres[], afspraken: Schouwafspraak[]): GasAdres[] {
  if (!sleutel) return [];
  const opAdres = new Map<string, Schouwafspraak>();
  for (const a of afspraken) if (a.status !== "Geannuleerd") opAdres.set(adresSleutel(a.straat, a.huisnummer), a);
  return gasAdressen.filter((x) => x.projectId === `bodem:${sleutel}`).map((x): GasAdres => {
    const af = opAdres.get(adresSleutel(x.straat, `${x.huisnummer}${x.toevoeging}`));
    return af ? { ...x, status: "afgesproken", datum: af.datum && /^\d{4}-\d{2}-\d{2}$/.test(af.datum) ? af.datum : undefined, telefoon: af.telefoon || x.telefoon } : x;
  });
}

export type BodemCijfers = { adressen: number; brieven: number; afgesproken: number; weigert: number; alleenBrief: number };
export function bodemCijfers(lijst: GasAdres[]): BodemCijfers {
  return {
    adressen: lijst.length,
    brieven: lijst.filter((x) => x.briefOp).length,
    afgesproken: lijst.filter((x) => x.status === "afgesproken").length,
    weigert: lijst.filter((x) => x.status === "weigert").length,
    alleenBrief: lijst.filter((x) => x.briefOp && x.status !== "afgesproken" && x.status !== "weigert").length,
  };
}

// Schouwafspraken: mappen per stad / plaats, weekindeling en de rijen voor de Stedin-planning (Excel).
// Alles hier is gewone rekenlogica zonder scherm of opslag, zodat de pagina en de export exact hetzelfde zien.
import type { Schouwafspraak, SchouwMap } from "./types";
import { isISODatum, toISO } from "./week";

export const WEEKDAG_NAMEN = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

// Standaard tijdvakken, overgenomen uit de Stedin-planning van week 44: maandag begint later,
// dinsdag t/m vrijdag hebben de volle dag. Per week en per dag aan te passen op de pagina.
export const STANDAARD_TIJDEN_MAANDAG = ["10:00", "10:30", "11:30", "13:00", "13:45", "14:15", "15:15"];
export const STANDAARD_TIJDEN = ["08:00", "08:45", "09:15", "10:00", "10:30", "11:30", "13:00", "13:45", "14:15", "15:15"];

// Zelfde plaats, ook als de een "Utrecht" typt en de ander " utrecht ".
export const normPlaats = (s: string): string => (s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

// De zeven dagen (ma t/m zo, ISO) van de week die op `maandag` begint.
export function dagenVanWeek(maandag: string): string[] {
  const basis = new Date(maandag + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(basis);
    d.setDate(d.getDate() + i);
    return toISO(d);
  });
}

// Het jaar van de week volgens ISO (het jaar waarin de donderdag valt), zoals op de Stedin-planning.
export function weekJaar(maandag: string): number {
  const d = new Date(maandag + "T00:00:00");
  d.setDate(d.getDate() + 3);
  return d.getFullYear();
}

// Rotterdam: maandag 10.30, 11.30, 13.30 en 15.00; dinsdag t/m donderdag komt daar 9.00 bij. Op vrijdag
// worden geen afspraken ingepland. Elke dag heeft twee planningen met dezelfde tijdvakken; op de Stedin-
// planning staat tussen de twee een oranje balk.
const ROTTERDAM_MAANDAG = ["10:30", "11:30", "13:30", "15:00"];
const ROTTERDAM_WERKDAG = ["09:00", ...ROTTERDAM_MAANDAG];
// Den Haag: 8.00, 8.45 en 9.15 alleen dinsdag t/m vrijdag; daarna 10.00, 10.30, 11.30, 13.00, 13.45,
// 14.15 en 15.15 (ook op maandag).
const DEN_HAAG_MAANDAG = ["10:00", "10:30", "11:30", "13:00", "13:45", "14:15", "15:15"];
const DEN_HAAG_WERKDAG = ["08:00", "08:45", "09:15", ...DEN_HAAG_MAANDAG];
export type PlaatsIndeling = {
  maandag: string[];
  werkdag: string[];
  geenVrijdag?: boolean;  // vrijdag staat niet in het raster (tenzij er toch iets op staat)
  tweeBlokken?: boolean;  // twee planningen per dag, gescheiden door een oranje balk
  versie: number;         // ophogen zodra deze plaats nieuwe vaste tijden krijgt (zie Schouwafspraken)
};
const DEN_HAAG: PlaatsIndeling = { maandag: DEN_HAAG_MAANDAG, werkdag: DEN_HAAG_WERKDAG, versie: 1 };
const ROTTERDAM: PlaatsIndeling = { maandag: ROTTERDAM_MAANDAG, werkdag: ROTTERDAM_WERKDAG, geenVrijdag: true, tweeBlokken: true, versie: 2 };
const PLAATS_TIJDEN: Record<string, PlaatsIndeling> = {
  rotterdam: ROTTERDAM,
  "den haag": DEN_HAAG,
  "'s-gravenhage": DEN_HAAG,
  "s-gravenhage": DEN_HAAG,
  "’s-gravenhage": DEN_HAAG,
};

// Standaardtijden van een dag; sommige plaatsen hebben hun eigen indeling, de rest de algemene.
// Dagen (ISO) die in de week van `maandag` zijn verwijderd, bijvoorbeeld door een feestdag of een vrije dag.
export const verwijderdeDagen = (map: SchouwMap | undefined, maandag: string): string[] => map?.verwijderdeDagen?.[maandag] ?? [];

// De vaste indeling van een plaats. Herkent ook varianten als "Den Haag Centrum" of "Rotterdam-Zuid".
export const plaatsIndeling = (plaats?: string): PlaatsIndeling | undefined => {
  const n = plaats ? normPlaats(plaats) : "";
  if (!n) return undefined;
  if (PLAATS_TIJDEN[n]) return PLAATS_TIJDEN[n];
  const sleutel = Object.keys(PLAATS_TIJDEN).find((k) => n.includes(k));
  return sleutel ? PLAATS_TIJDEN[sleutel] : undefined;
};
export const heeftTweeBlokken = (plaats?: string): boolean => !!plaatsIndeling(plaats)?.tweeBlokken;
export const geenVrijdag = (plaats?: string): boolean => !!plaatsIndeling(plaats)?.geenVrijdag;
// Versie van de vaste tijdvakken van een plaats (0 = geen eigen indeling).
export const tijdenVersie = (plaats?: string): number => plaatsIndeling(plaats)?.versie ?? 0;

export const standaardTijden = (dagIndex: number, plaats?: string): string[] => {
  const eigen = plaatsIndeling(plaats);
  if (eigen) {
    if (dagIndex === 4 && eigen.geenVrijdag) return [];
    return [...(dagIndex === 0 ? eigen.maandag : eigen.werkdag)];
  }
  return [...(dagIndex === 0 ? STANDAARD_TIJDEN_MAANDAG : STANDAARD_TIJDEN)];
};

export const sorteerOpTijd = (a: string, b: string): number => (a === b ? 0 : a === "" ? 1 : b === "" ? -1 : a.localeCompare(b));

// De tijdvakken van één dag: de aangepaste lijst van deze week, anders de standaardtijden.
export function tijdenVan(map: SchouwMap | undefined, maandag: string, iso: string, dagIndex: number, plaats: string | undefined = map?.naam): string[] {
  const aangepast = map?.weken?.[maandag]?.[iso];
  return (aangepast ? [...aangepast] : standaardTijden(dagIndex, plaats)).sort(sorteerOpTijd);
}

// "08:45" → "8.45" (zoals op de Stedin-planning); iets anders blijft staan zoals het is.
export const tijdLabel = (t: string): string => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || "");
  return m ? `${Number(m[1])}.${m[2]}` : t || "";
};

export type SchouwRegel = { tijd: string; afspraken: Schouwafspraak[]; eigenVak: boolean; blok: 1 | 2 };
export type SchouwDag = { datum: string; dagIndex: number; naam: string; regels: SchouwRegel[] };

// Bouwt de week: per dag de tijdvakken, met de afspraken die erin vallen. Een afspraak met een tijd die
// niet in de vakken zit (of zonder tijd) krijgt een eigen regel, zodat er nooit iets verdwijnt.
// Zaterdag en zondag verschijnen alleen als er iets op staat (net als vrijdag bij plaatsen zonder vrijdag).
// Plaatsen met twee planningen per dag krijgen de tijdvakken twee keer: eerst planning 1, dan planning 2.
export function bouwWeek(map: SchouwMap | undefined, maandag: string, afspraken: Schouwafspraak[], plaats: string | undefined = map?.naam): SchouwDag[] {
  const perDag = new Map<string, Schouwafspraak[]>();
  for (const a of afspraken) {
    if (!a.datum || !isISODatum(a.datum)) continue;
    const lijst = perDag.get(a.datum) ?? [];
    lijst.push(a);
    perDag.set(a.datum, lijst);
  }
  const uit: SchouwDag[] = [];
  const weg = new Set(verwijderdeDagen(map, maandag));
  const twee = heeftTweeBlokken(plaats);
  const zonderVrijdag = geenVrijdag(plaats);
  dagenVanWeek(maandag).forEach((iso, i) => {
    const opDag = perDag.get(iso) ?? [];
    const eigenVrijdag = i === 4 && zonderVrijdag && !map?.weken?.[maandag]?.[iso];
    if ((i >= 5 || eigenVrijdag) && opDag.length === 0) return;
    // Een verwijderde dag verdwijnt uit het raster en dus ook uit de Excel. Staat er toch een afspraak
    // op (later alsnog ingevuld), dan blijft de dag staan, zodat er nooit iets uit de planning valt.
    if (weg.has(iso) && opDag.length === 0) return;
    const vakken = i >= 5 ? [] : tijdenVan(map, maandag, iso, i, plaats);
    const blokRegels = (blok: 1 | 2, lijst: Schouwafspraak[]): SchouwRegel[] => {
      const tijden = new Set<string>(vakken);
      for (const a of lijst) tijden.add(a.tijd || "");
      return [...tijden].sort(sorteerOpTijd).map((t) => ({
        tijd: t,
        afspraken: lijst.filter((a) => (a.tijd || "") === t),
        eigenVak: vakken.includes(t),
        blok,
      }));
    };
    const regels = twee
      ? [...blokRegels(1, opDag.filter((a) => a.blok !== 2)), ...blokRegels(2, opDag.filter((a) => a.blok === 2))]
      : blokRegels(1, opDag);
    uit.push({ datum: iso, dagIndex: i, naam: WEEKDAG_NAMEN[i], regels });
  });
  return uit;
}

// ── Excel ──
export type SchouwExportRegel = { tijd: string; straat: string; huisnummer: string; telefoon: string; opmerking: string; blok?: 1 | 2 };
export type SchouwExportDag = { datum: string; naam: string; regels: SchouwExportRegel[] };

// Zet de week om in precies de rijen die op de Stedin-planning komen. Geannuleerde afspraken staan er niet
// op; een leeg tijdvak blijft als lege regel staan (zo is de planning altijd het volledige raster).
export function exportDagen(week: SchouwDag[]): SchouwExportDag[] {
  return week
    .map((d) => ({
      datum: d.datum,
      naam: d.naam,
      regels: d.regels.flatMap<SchouwExportRegel>((r) => {
        const actief = r.afspraken.filter((a) => a.status !== "Geannuleerd");
        if (actief.length === 0) return r.eigenVak ? [{ tijd: r.tijd, straat: "", huisnummer: "", telefoon: "", opmerking: "", blok: r.blok }] : [];
        return actief.map((a) => ({ tijd: r.tijd, straat: a.straat.trim(), huisnummer: a.huisnummer.trim(), telefoon: a.telefoon.trim(), opmerking: a.notitie.trim(), blok: r.blok }));
      }),
    }))
    // Een weekdag blijft altijd staan (ook zonder regels); het weekend alleen als er echt iets op staat.
    .filter((d) => d.regels.length > 0 || new Date(d.datum + "T00:00:00").getDay() % 6 !== 0);
}

// ── Mappen ──
export type MapOverzicht = { sleutel: string; naam: string; record?: SchouwMap; afspraken: Schouwafspraak[] };

// Alle mappen: de aangemaakte én die waar al afspraken in staan (ook als er nog geen map voor is aangemaakt,
// bv. afspraken van vóór de mappen). Afspraken zonder plaats komen samen in "Zonder plaats".
export function mapOverzicht(mappen: SchouwMap[], afspraken: Schouwafspraak[]): MapOverzicht[] {
  const perSleutel = new Map<string, MapOverzicht>();
  for (const m of [...mappen].sort((a, b) => a.aangemaakt.localeCompare(b.aangemaakt))) {
    const sleutel = normPlaats(m.naam);
    if (!perSleutel.has(sleutel)) perSleutel.set(sleutel, { sleutel, naam: m.naam, record: m, afspraken: [] });
  }
  for (const a of afspraken) {
    const sleutel = normPlaats(a.plaats);
    let o = perSleutel.get(sleutel);
    if (!o) {
      o = { sleutel, naam: sleutel ? a.plaats.trim() : "Zonder plaats", afspraken: [] };
      perSleutel.set(sleutel, o);
    }
    o.afspraken.push(a);
  }
  return [...perSleutel.values()].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
}

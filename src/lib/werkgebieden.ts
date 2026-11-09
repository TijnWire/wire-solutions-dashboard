// Werkgebieden: Regio Rotterdam, Regio Den Haag en Regio Utrecht.
// ─────────────────────────────────────────────────────────────────────────────
// Wie is waar actief? Dat volgt uit het werk dat al in het dashboard staat: elk lopend onderdeel
// (brievenronde, sanering, bodemonderzoek, buurtaanpak, schouwafspraak) heeft een plaats of regio én
// een medewerker aan wie het is toegewezen. De plaatsnaam koppelen we hier aan één van de drie
// werkgebieden. Er is dus niets extra bij te houden: wijs werk toe en de kaart volgt vanzelf.
import type { Brievenronde, Buurtaanpak, Sanering, Schouwafspraak, TauwOpdracht } from "./types";

export type RegioKey = "rotterdam" | "denhaag" | "utrecht";

export const REGIO_LABEL: Record<RegioKey, string> = {
  rotterdam: "Regio Rotterdam",
  denhaag: "Regio Den Haag",
  utrecht: "Regio Utrecht",
};
export const REGIO_VOLGORDE: RegioKey[] = ["rotterdam", "denhaag", "utrecht"];

// Plaatsen en gemeenten per werkgebied (kleine letters, zonder accenten). Een plaatsnaam hoort bij het
// eerste gebied waarin één van deze woorden voorkomt.
const PLAATSEN: Record<RegioKey, string[]> = {
  denhaag: [
    "den haag", "s-gravenhage", "'s-gravenhage", "scheveningen", "delft", "rijswijk", "zoetermeer",
    "leidschendam", "voorburg", "wassenaar", "westland", "naaldwijk", "monster", "wateringen", "honselersdijk",
    "s-gravenzande", "de lier", "pijnacker", "nootdorp", "midden-delfland", "schipluiden", "maasland",
    "leiden", "leiderdorp", "oegstgeest", "katwijk", "noordwijk", "voorschoten", "teylingen", "sassenheim",
    "lisse", "hillegom", "kaag", "alphen", "nieuwkoop", "ypenburg", "loosduinen", "haaglanden",
  ],
  utrecht: [
    "utrecht", "nieuwegein", "ijsselstein", "houten", "zeist", "bunnik", "de bilt", "bilthoven", "maarssen",
    "stichtse vecht", "breukelen", "vleuten", "de meern", "leidsche rijn", "woerden", "montfoort", "oudewater",
    "lopik", "vianen", "vijfheerenlanden", "leerdam", "amersfoort", "soest", "baarn", "veenendaal", "rhenen",
    "wijk bij duurstede", "heuvelrug", "doorn", "driebergen", "leusden", "woudenberg", "renswoude",
    "ronde venen", "mijdrecht", "vinkeveen", "eemnes", "bunschoten", "spakenburg",
  ],
  rotterdam: [
    "rotterdam", "schiedam", "vlaardingen", "maassluis", "capelle", "krimpen", "barendrecht", "ridderkerk",
    "albrandswaard", "rhoon", "poortugaal", "spijkenisse", "nissewaard", "hellevoetsluis", "voorne", "brielle",
    "lansingerland", "berkel", "bergschenhoek", "bleiswijk", "rozenburg", "hoogvliet", "pernis", "ijsselmonde",
    "dordrecht", "zwijndrecht", "papendrecht", "sliedrecht", "alblasserdam", "hendrik-ido-ambacht",
    "gorinchem", "gouda", "zuidplas", "nieuwerkerk", "waddinxveen", "hoeksche waard", "oud-beijerland",
    "goeree", "overflakkee", "molenlanden", "rijnmond",
  ],
};

const normaal = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/** Het werkgebied van een plaats- of regionaam, of null als hij nergens bij past. */
export function regioVan(...namen: (string | undefined)[]): RegioKey | null {
  for (const naam of namen) {
    const n = naam ? normaal(naam) : "";
    if (!n) continue;
    for (const key of ["denhaag", "utrecht", "rotterdam"] as RegioKey[]) {
      if (PLAATSEN[key].some((p) => n.includes(p))) return key;
    }
  }
  return null;
}

export type RegioStand = {
  key: RegioKey;
  label: string;
  medewerkers: string[]; // user ids, uniek
  lopend: number;        // aantal lopende onderdelen in dit gebied
};

export type WerkgebiedBron = {
  rondes: Brievenronde[];
  saneringen: Sanering[];
  tauwOpdrachten: TauwOpdracht[];
  buurtaanpak: Buurtaanpak[];
  schouwafspraken: Schouwafspraak[];
};

/** Per werkgebied: welke medewerkers er nu actief zijn en hoeveel werk er loopt. */
export function werkgebiedStand(bron: WerkgebiedBron, vandaagISO: string): Record<RegioKey, RegioStand> {
  const uit: Record<RegioKey, { ids: Set<string>; lopend: number }> = {
    rotterdam: { ids: new Set(), lopend: 0 },
    denhaag: { ids: new Set(), lopend: 0 },
    utrecht: { ids: new Set(), lopend: 0 },
  };
  const tel = (regio: RegioKey | null, wie?: string) => {
    if (!regio) return;
    uit[regio].lopend += 1;
    if (wie) uit[regio].ids.add(wie);
  };

  for (const r of bron.rondes) {
    if (r.status === "verstuurd" || r.gearchiveerd) continue;
    tel(regioVan(r.plaats, r.regio, r.mapNaam), r.toegewezenAan);
  }
  for (const s of bron.saneringen) {
    if (s.status === "verstuurd" || s.gearchiveerd) continue;
    tel(regioVan(s.regio, s.naam, s.adressen?.[0]?.plaats), s.toegewezenAan);
  }
  for (const o of bron.tauwOpdrachten) {
    if (o.status === "verstuurd" || o.gearchiveerd) continue;
    tel(regioVan(o.regio, o.adressen?.[0]?.plaats), o.toegewezenAan);
  }
  for (const b of bron.buurtaanpak) {
    if (b.afgerondOp || b.gearchiveerd) continue;
    tel(regioVan(b.regio, b.naam), b.toegewezenAan);
  }
  for (const a of bron.schouwafspraken) {
    // Alleen wat nog komt (of nog geen datum heeft) telt als lopend werk.
    if (a.datum && a.datum < vandaagISO) continue;
    tel(regioVan(a.plaats), a.toegewezenAan);
  }

  const res = {} as Record<RegioKey, RegioStand>;
  for (const key of REGIO_VOLGORDE) {
    res[key] = { key, label: REGIO_LABEL[key], medewerkers: [...uit[key].ids], lopend: uit[key].lopend };
  }
  return res;
}

// ── Kaartgeometrie ──
// Vereenvoudigde omtrek van Zuid-Holland en Utrecht (lengte-, breedtegraad). Bewust gestileerd: het is
// een herkenbaar silhouet, geen kadastrale kaart. De gemeenschappelijke grens staat één keer hieronder,
// zodat beide provincies precies op elkaar aansluiten.
type LonLat = [number, number];

const GRENS_ZH_U: LonLat[] = [
  [4.82, 52.23], [4.79, 52.17], [4.83, 52.12], [4.82, 52.07], [4.85, 52.02], [4.87, 51.97],
  [4.95, 51.94], [4.98, 51.9], [5.0, 51.86], [5.04, 51.84],
];

const ZUID_HOLLAND: LonLat[] = [
  ...GRENS_ZH_U,
  [5.0, 51.82], [4.92, 51.82], [4.85, 51.79], [4.75, 51.76], [4.68, 51.72], [4.58, 51.7], [4.45, 51.68],
  [4.3, 51.69], [4.15, 51.71], [4.0, 51.76], [3.84, 51.82], [3.92, 51.86], [3.98, 51.9], [3.98, 51.97],
  [4.12, 51.99], [4.2, 52.05], [4.27, 52.11], [4.36, 52.18], [4.42, 52.23], [4.48, 52.29], [4.55, 52.27],
  [4.62, 52.25], [4.7, 52.23], [4.76, 52.24],
];

const UTRECHT: LonLat[] = [
  ...[...GRENS_ZH_U].reverse(),
  [4.88, 52.26], [4.95, 52.29], [5.02, 52.28], [5.05, 52.23], [5.12, 52.2], [5.22, 52.2], [5.24, 52.25],
  [5.3, 52.26], [5.37, 52.26], [5.42, 52.23], [5.48, 52.18], [5.53, 52.12], [5.57, 52.08], [5.6, 52.03],
  [5.62, 51.96], [5.55, 51.95], [5.45, 51.95], [5.35, 51.97], [5.25, 51.97], [5.18, 51.92], [5.12, 51.86],
];

export const STAD: Record<RegioKey, LonLat> = {
  rotterdam: [4.48, 51.92],
  denhaag: [4.3, 52.08],
  utrecht: [5.12, 52.09],
};

// Equirectangulaire projectie, gecorrigeerd voor de breedtegraad (cos 52°), in een vak van 1000 breed.
const LON0 = 3.8, LAT0 = 52.32, KX = Math.cos((52 * Math.PI) / 180);
const SCHAAL = 1000 / ((5.66 - LON0) * KX);
export const proj = ([lon, lat]: LonLat): [number, number] => [
  Math.round((lon - LON0) * KX * SCHAAL * 10) / 10,
  Math.round((LAT0 - lat) * SCHAAL * 10) / 10,
];
export const KAART_HOOGTE = Math.round((LAT0 - 51.64) * SCHAAL);

const pad = (pts: LonLat[]) => pts.map((p, i) => `${i ? "L" : "M"}${proj(p).join(" ")}`).join("") + "Z";
export const PAD_ZUID_HOLLAND = pad(ZUID_HOLLAND);
export const PAD_UTRECHT = pad(UTRECHT);
export const PAD_GRENS = GRENS_ZH_U.map((p, i) => `${i ? "L" : "M"}${proj(p).join(" ")}`).join("");

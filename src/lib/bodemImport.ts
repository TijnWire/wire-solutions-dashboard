// Bodemonderzoek — adressen importeren uit Excel of CSV.
// ─────────────────────────────────────────────────────────────────────────────
// De oude import was een vaste-vorm herkenner: hij zocht in de eerste veertien regels naar bekende
// koppen en gaf het op als hij ze niet vond. Een aanleverbestand met een lang titelblok, of met het
// adres in één kolom ("Kerkstraat 2a"), kwam er niet doorheen — en je kon er niets aan doen.
//
// Deze import draait het om: we lezen het bestand altijd in, laten zien wat erin staat, doen een
// voorstel voor de kolommen, en jij past dat aan tot het klopt. Pas daarna wordt er geïmporteerd, en
// dan in één keer: of alles gaat erin, of niets. Zo blijft er nooit een halve lijst achter.

import * as XLSX from "xlsx";
import { kaal } from "./extract/normaliseer";
import type { TauwAdres } from "./types";

// De velden waar een kolom aan gekoppeld kan worden.
export type Veld =
  | "straat" | "huisnummer" | "toevoeging" | "postcode" | "plaats"
  | "wijk" | "perceel" | "bewoner" | "telefoon" | "opmerking"
  | "adresVolledig"; // straat + huisnummer in één cel

export const VELDEN: { veld: Veld; label: string; verplicht?: boolean }[] = [
  { veld: "adresVolledig", label: "Adres (straat + nummer samen)" },
  { veld: "straat", label: "Straat", verplicht: true },
  { veld: "huisnummer", label: "Huisnummer", verplicht: true },
  { veld: "toevoeging", label: "Toevoeging" },
  { veld: "postcode", label: "Postcode" },
  { veld: "plaats", label: "Plaats" },
  { veld: "wijk", label: "Wijk / buurt" },
  { veld: "perceel", label: "Perceelnummer" },
  { veld: "bewoner", label: "Naam bewoner" },
  { veld: "telefoon", label: "Telefoonnummer" },
  { veld: "opmerking", label: "Opmerking" },
];

// Kolomnamen die we herkennen. Ruim opgezet: aanleverbestanden verschillen per opdrachtgever.
const HERKEN: Record<Veld, string[]> = {
  adresVolledig: ["adres", "adresregel", "straatadres", "volledigadres", "locatie"],
  straat: ["straat", "straatnaam", "street"],
  huisnummer: ["huisnummer", "huisnr", "hnr", "nummer", "nr", "huis", "number"],
  toevoeging: ["toevoeging", "toev", "huisletter", "letter", "achtervoegsel", "suffix"],
  postcode: ["postcode", "pc", "postcd", "zipcode", "zip"],
  plaats: ["plaats", "woonplaats", "gemeente", "stad", "city"],
  wijk: ["wijk", "buurt", "district", "gebied"],
  perceel: ["perceel", "perceelnummer", "kadaster", "kadastraal"],
  bewoner: ["naam", "bewoner", "naambewoner", "contactpersoon", "contact", "klant", "klantnaam"],
  telefoon: ["telefoon", "telefoonnummer", "telnr", "tel", "mobiel", "gsm", "phone"],
  opmerking: ["opmerking", "notitie", "bijzonderheden", "bijzonderheid", "toelichting", "memo"],
};

export type Raster = { rijen: string[][]; bladNamen: string[]; blad: string };
export type Mapping = Partial<Record<Veld, number>>; // veld → kolomindex

// ── Bestand inlezen ── we halen het hele blad op als tekstraster; niets wordt weggegooid.
export async function leesRaster(file: File, bladNaam?: string): Promise<{ ok: true; raster: Raster } | { ok: false; fout: string }> {
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
    if (!wb.SheetNames.length) return { ok: false, fout: "Het bestand bevat geen werkblad." };
    const blad = bladNaam && wb.SheetNames.includes(bladNaam) ? bladNaam : wb.SheetNames[0];
    const ws = wb.Sheets[blad];
    const ruw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
    const rijen = ruw.map((r) => (r || []).map((c) => String(c ?? "").trim()));
    // Regels die helemaal leeg zijn hebben geen betekenis en maken het voorbeeld alleen onleesbaar.
    const gevuld = rijen.filter((r) => r.some((c) => c !== ""));
    if (!gevuld.length) return { ok: false, fout: "Het werkblad is leeg." };
    return { ok: true, raster: { rijen: gevuld, bladNamen: wb.SheetNames, blad } };
  } catch {
    return { ok: false, fout: "Kon het bestand niet lezen. Is het een geldig Excel- of CSV-bestand?" };
  }
}

// ── Koprij raden ── de regel met de meeste herkende kolomnamen wint. We kijken door het hele bestand
// heen en niet alleen naar de eerste regels, zodat een lang titelblok niets meer in de weg zit.
export function raadKop(raster: Raster): { kopIndex: number; mapping: Mapping } {
  let besteIndex = 0;
  let besteScore = -1;
  let besteMapping: Mapping = {};

  const grens = Math.min(raster.rijen.length, 60);
  for (let i = 0; i < grens; i++) {
    const rij = raster.rijen[i];
    const mapping: Mapping = {};
    let score = 0;
    rij.forEach((cel, c) => {
      const k = kaal(cel);
      if (!k) return;
      for (const [veld, namen] of Object.entries(HERKEN) as [Veld, string[]][]) {
        if (mapping[veld] !== undefined) continue;
        // Exacte treffer telt zwaarder dan "bevat", zodat "Adres" niet per ongeluk "Adresregel" kaapt.
        if (namen.includes(k)) { mapping[veld] = c; score += 2; return; }
        if (k.length > 3 && namen.some((n) => n.length > 3 && k.includes(n))) { mapping[veld] = c; score += 1; return; }
      }
    });
    // Straat + huisnummer apart is de beste uitkomst; een samengevoegde adreskolom telt ook mee.
    if (mapping.straat !== undefined && mapping.huisnummer !== undefined) score += 3;
    else if (mapping.adresVolledig !== undefined) score += 2;
    if (score > besteScore) { besteScore = score; besteIndex = i; besteMapping = mapping; }
  }
  // Niets herkend? Dan de eerste regel als kop voorstellen — de gebruiker wijst de kolommen zelf aan.
  return { kopIndex: besteScore > 0 ? besteIndex : 0, mapping: besteScore > 0 ? besteMapping : {} };
}

// ── Adres uit één cel halen ── "Kerkstraat 2a" → straat "Kerkstraat", nummer "2", toevoeging "a".
export function splitsAdres(tekst: string): { straat: string; huisnummer: string; toevoeging: string } {
  const t = String(tekst ?? "").trim().replace(/\s+/g, " ");
  const m = t.match(/^(.*?)\s+(\d+)\s*([a-zA-Z]{0,3}(?:[-\s]?\d{1,3})?)?$/);
  if (!m) return { straat: t, huisnummer: "", toevoeging: "" };
  return { straat: m[1].trim(), huisnummer: m[2], toevoeging: (m[3] ?? "").trim() };
}

// Nederlandse postcode: vier cijfers, twee letters. We accepteren "1234ab" en maken er "1234 AB" van.
export function netPostcode(s: string): string {
  const t = String(s ?? "").toUpperCase().replace(/\s+/g, "");
  const m = t.match(/^(\d{4})([A-Z]{2})$/);
  return m ? `${m[1]} ${m[2]}` : String(s ?? "").trim();
}
export const postcodeGeldig = (s: string) => /^\d{4} [A-Z]{2}$/.test(netPostcode(s));

// Excel eet de leidende nul van 06-nummers op; die zetten we terug.
function netTelefoon(s: string): string {
  const t = String(s ?? "").trim();
  return /^6\d{8}$/.test(t) ? "0" + t : t;
}

export type ImportRij = {
  bron: number;                 // regelnummer in het bestand (1-gebaseerd), voor de foutmelding
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  plaats: string;
  wijk: string;
  perceel: string;
  bewoner: string;
  telefoon: string;
  opmerking: string;
  fouten: string[];             // blokkeert import van deze regel
  waarschuwingen: string[];     // mag wel mee
  dubbelInBestand: boolean;
  bestaatAl: boolean;
};

// Sleutel om dubbele adressen te herkennen: straat + nummer + toevoeging + postcode, hoofdletter- en
// spatie-ongevoelig.
export const adresSleutel = (a: { straat: string; huisnummer: string; toevoeging?: string; postcode: string }) =>
  [a.straat, a.huisnummer, a.toevoeging ?? "", a.postcode]
    .map((x) => String(x ?? "").toLowerCase().replace(/\s+/g, ""))
    .join("|");

// ── Rijen bouwen + controleren ──
export function bouwRijen(raster: Raster, kopIndex: number, mapping: Mapping, bestaand: TauwAdres[]): ImportRij[] {
  const cel = (rij: string[], c?: number) => (c === undefined ? "" : String(rij[c] ?? "").trim());
  const bestaandeSleutels = new Set(bestaand.map((a) => adresSleutel(a)));
  const gezien = new Map<string, number>();
  const uit: ImportRij[] = [];

  for (let i = kopIndex + 1; i < raster.rijen.length; i++) {
    const rij = raster.rijen[i];
    if (!rij.some((c) => c !== "")) continue;

    let straat = cel(rij, mapping.straat);
    let huisnummer = cel(rij, mapping.huisnummer);
    let toevoeging = cel(rij, mapping.toevoeging);
    // Staat het adres in één kolom, dan splitsen we het hier — maar losse kolommen hebben voorrang.
    if (mapping.adresVolledig !== undefined && (!straat || !huisnummer)) {
      const g = splitsAdres(cel(rij, mapping.adresVolledig));
      straat = straat || g.straat;
      huisnummer = huisnummer || g.huisnummer;
      toevoeging = toevoeging || g.toevoeging;
    }
    const postcode = netPostcode(cel(rij, mapping.postcode));
    const r: ImportRij = {
      bron: i + 1,
      straat, huisnummer, toevoeging, postcode,
      plaats: cel(rij, mapping.plaats),
      wijk: cel(rij, mapping.wijk),
      perceel: cel(rij, mapping.perceel),
      bewoner: cel(rij, mapping.bewoner),
      telefoon: netTelefoon(cel(rij, mapping.telefoon)),
      opmerking: cel(rij, mapping.opmerking),
      fouten: [], waarschuwingen: [], dubbelInBestand: false, bestaatAl: false,
    };

    if (!r.straat) r.fouten.push("straat ontbreekt");
    if (!r.huisnummer) r.fouten.push("huisnummer ontbreekt");
    else if (!/^\d/.test(r.huisnummer)) r.fouten.push("huisnummer is geen getal");
    if (!r.postcode) r.waarschuwingen.push("geen postcode");
    else if (!postcodeGeldig(r.postcode)) r.fouten.push(`postcode "${r.postcode}" heeft niet de vorm 1234 AB`);
    if (!r.plaats) r.waarschuwingen.push("geen plaats");

    const sleutel = adresSleutel(r);
    if (gezien.has(sleutel)) {
      r.dubbelInBestand = true;
      r.waarschuwingen.push(`staat ook op regel ${gezien.get(sleutel)}`);
    } else gezien.set(sleutel, r.bron);
    if (bestaandeSleutels.has(sleutel)) {
      r.bestaatAl = true;
      r.waarschuwingen.push("staat al in deze map");
    }
    uit.push(r);
  }
  return uit;
}

export type ImportSamenvatting = { totaal: number; goed: number; metFout: number; dubbel: number; bestaatAl: number };
export function samenvatting(rijen: ImportRij[]): ImportSamenvatting {
  return {
    totaal: rijen.length,
    goed: rijen.filter((r) => !r.fouten.length).length,
    metFout: rijen.filter((r) => r.fouten.length > 0).length,
    dubbel: rijen.filter((r) => r.dubbelInBestand).length,
    bestaatAl: rijen.filter((r) => r.bestaatAl).length,
  };
}

// ── Naar adressen ── alleen de regels die erdoorheen komen; dubbele worden desgewenst overgeslagen.
export function naarAdressen(rijen: ImportRij[], opties: { slaDubbeleOver: boolean }, nieuwId: () => string): TauwAdres[] {
  return rijen
    .filter((r) => !r.fouten.length)
    .filter((r) => !(opties.slaDubbeleOver && (r.dubbelInBestand || r.bestaatAl)))
    .map((r) => ({
      id: nieuwId(),
      straat: r.straat,
      huisnummer: [r.huisnummer, r.toevoeging].filter(Boolean).join(""),
      postcode: r.postcode,
      plaats: r.plaats,
      bewoner: r.bewoner,
      telefoon: r.telefoon,
      datum: "",
      tijd: "",
      bevestigd: false,
      notitie: [r.opmerking, r.wijk && `wijk: ${r.wijk}`, r.perceel && `perceel: ${r.perceel}`].filter(Boolean).join(" · "),
      wijk: r.wijk || undefined,
      perceel: r.perceel || undefined,
    }));
}

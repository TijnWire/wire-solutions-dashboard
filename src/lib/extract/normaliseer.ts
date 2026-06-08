import type { Brievenronde, Klant } from "../types";
import type { ImportDoel, RuweRij, ScanRij, WoningType } from "./types";

// Strip diakritiek/leestekens → vergelijkbare sleutel.
export const kaal = (s: string | number | undefined) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

let _teller = 0;
function maakId(prefix: string): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${prefix}-${++_teller}-${performance.now().toFixed(0)}`;
  }
}
export const maakAdresId = () => maakId("ad");

// "Dorpsstraat 12A" / "Lange Dijk 3 bis" / "Essenlaan 12-1" / "Plein 1940-45 2" → straat + huisnummer + toevoeging.
// Greedy straat (mag cijfers/streepjes bevatten) zodat het huisnummer aan het EIND wordt gepakt, niet het eerste getal.
export function splitsAdres(combi: string): { straat: string; huisnummer: string; toevoeging: string } {
  const t = (combi || "").trim();
  const m = t.match(/^(.+)[\s,]+(\d+)\s*[-\s/]?\s*([a-zA-Z0-9]*)$/);
  if (!m) return { straat: t, huisnummer: "", toevoeging: "" };
  return { straat: m[1].replace(/[,\s]+$/, "").trim(), huisnummer: m[2], toevoeging: (m[3] || "").trim() };
}

// "1234ab" → "1234 AB"; laat onherkenbare waarden ongemoeid (worden later als waarschuwing gemarkeerd).
export function normPostcode(pc: string): string {
  const k = (pc || "").replace(/\s+/g, "").toUpperCase();
  if (/^\d{4}[A-Z]{2}$/.test(k)) return `${k.slice(0, 4)} ${k.slice(4)}`;
  return (pc || "").trim();
}

export function normTelefoon(tel: string): string {
  return (tel || "").replace(/\s+/g, " ").trim();
}

export function detecteerType(ruw: string, naam: string): WoningType {
  const low = `${ruw} ${naam}`.toLowerCase();
  // Sterke, ondubbelzinnige signalen mogen als substring (bv. "kantoorpand", "bedrijfspand").
  if (/bedrijf|kantoor|zakelijk/.test(low)) return "bedrijf";
  // Korte/ambigue termen alleen als heel woord (voorkomt false positives als "De Pandhoeve", "Bedrichem").
  const tokens = ` ${low.replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (/ (bv|nv|vve|pand|bedr) /.test(tokens)) return "bedrijf";
  return "woning";
}

// Maakt van een ruwe rij een schone, bewerkbare ScanRij (splitst combi-adres, normaliseert postcode/type).
export function normaliseerRij(ruw: RuweRij, bron: number, confidence = 1): ScanRij {
  let straat = (ruw.straat || "").trim();
  let huisnummer = (ruw.huisnummer || "").trim();
  let toevoeging = (ruw.toevoeging || "").trim();

  // Gecombineerd "Straat 12A" in het straat-veld → splitsen als er nog geen huisnummer is.
  if (straat && !huisnummer && /\d/.test(straat)) {
    const s = splitsAdres(straat);
    if (s.huisnummer) {
      straat = s.straat;
      huisnummer = s.huisnummer;
      toevoeging = toevoeging || s.toevoeging;
    }
  }
  // Letters uit het huisnummer ("12A", "12-A") naar toevoeging.
  const m = huisnummer.match(/^(\d+)\s*[-\s]?\s*([a-zA-Z0-9].*)?$/);
  if (m) {
    huisnummer = m[1];
    if (m[2]) toevoeging = `${m[2].trim()} ${toevoeging}`.trim().replace(/\s+/g, " ");
  }

  return {
    id: maakId("rij"),
    straat,
    huisnummer,
    toevoeging,
    postcode: normPostcode(ruw.postcode || ""),
    plaats: (ruw.plaats || "").trim(),
    naam: (ruw.naam || "").trim(),
    telefoon: normTelefoon(ruw.telefoon || ""),
    type: detecteerType(ruw.type || "", ruw.naam || ""),
    notitie: (ruw.notitie || "").trim(),
    bron,
    confidence: Math.max(0, Math.min(1, confidence)),
    opnemen: true,
  };
}

// Validatie per doel. Fouten blokkeren import; waarschuwingen niet.
export function valideer(rij: ScanRij, doel: ImportDoel): { fouten: string[]; warnings: string[] } {
  const fouten: string[] = [];
  const warnings: string[] = [];
  if (!rij.straat.trim()) fouten.push("Straat ontbreekt");

  const hn = rij.huisnummer.trim();
  if (!hn) {
    if (doel === "brievenronde") warnings.push("Geen huisnummer — wordt als ‘ontbreekt’ gemarkeerd");
    else fouten.push("Huisnummer ontbreekt");
  } else if (!/^\d+$/.test(hn) && doel === "brievenronde") {
    warnings.push("Huisnummer bevat letters — zet die in ‘Toevoeging’");
  }

  if (rij.postcode.trim() && !/^\d{4}\s?[A-Za-z]{2}$/.test(rij.postcode.trim())) {
    warnings.push("Postcode-formaat lijkt onjuist");
  }
  return { fouten, warnings };
}

// ── Dedup ──
// Sleutel met straat ÉN postcode (niet of/of) + scheidingsteken tussen huisnummer en toevoeging,
// zodat "12" niet botst met "1"+"2" en verschillende straten met dezelfde postcode niet samenvallen.
function adresSleutel(straat: string, huisnummer: string, toevoeging: string, postcode: string): string {
  const pc = (postcode || "").replace(/\s+/g, "").toLowerCase();
  const st = (straat || "").replace(/\s+/g, "").toLowerCase();
  const hn = `${(huisnummer || "").replace(/\s+/g, "")}#${(toevoeging || "").replace(/\s+/g, "")}`.toLowerCase();
  return `${st}|${pc}|${hn}`;
}

// Markeert rijen die al in het systeem staan of dubbel in de batch zitten (niet-destructief: dupVan + opnemen=false).
export function markeerDuplicaten(rijen: ScanRij[], rondes: Brievenronde[], klanten: Klant[]): ScanRij[] {
  const bestaand = new Set<string>();
  for (const r of rondes) for (const a of r.adressen) bestaand.add(adresSleutel(r.straat, String(a.huisnummer), a.toevoeging, r.postcode));
  for (const k of klanten) bestaand.add(adresSleutel(k.straat, k.huisnummer, "", k.postcode));

  const inBatch = new Set<string>();
  return rijen.map((rij) => {
    // Rijen zonder huisnummer zijn juist 'ontbreekt'-adressen (apart te melden) — nooit als duplicaat samenvoegen.
    if (!rij.huisnummer.trim()) return rij;
    const sl = adresSleutel(rij.straat, rij.huisnummer, rij.toevoeging, rij.postcode);
    const isDup = bestaand.has(sl) || inBatch.has(sl);
    inBatch.add(sl);
    if (isDup) return { ...rij, dupVan: "bestaat al", opnemen: false };
    return rij;
  });
}

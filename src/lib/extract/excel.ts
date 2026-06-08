import * as XLSX from "xlsx-js-style";
import { kaal } from "./normaliseer";
import type { RuweRij } from "./types";

type Veld = "adres_combi" | "straat" | "huisnummer" | "toevoeging" | "postcode" | "plaats" | "naam" | "telefoon" | "type" | "notitie";

// Nederlandse synoniemen per kolomkop. "adres_combi" vangt gecombineerde adresvelden ("Dorpsstraat 12A").
const SYNONIEMEN: Record<Veld, string[]> = {
  adres_combi: ["adres", "adresregel", "straatadres", "address", "volledigadres"],
  straat: ["straat", "straatnaam", "street"],
  huisnummer: ["huisnummer", "huisnr", "nr", "nummer", "no", "huis", "hnr"],
  toevoeging: ["toevoeging", "toev", "huisletter", "letter", "bis", "suffix"],
  postcode: ["postcode", "pc", "postcd", "zip", "postalcode"],
  plaats: ["plaats", "woonplaats", "gemeente", "stad", "city", "dorp"],
  naam: ["naam", "klant", "klantnaam", "bewoner", "achternaam", "contactpersoon", "contact", "name"],
  telefoon: ["telefoon", "tel", "telnr", "telefoonnummer", "mobiel", "gsm", "phone"],
  type: ["type", "soort", "woningtype", "pandtype"],
  notitie: ["notitie", "opmerking", "opmerkingen", "note", "notes", "bijzonderheden"],
};

const VELDEN = Object.keys(SYNONIEMEN) as Veld[];
const CORE: Veld[] = ["adres_combi", "straat", "huisnummer", "postcode"];

// Exacte synoniem-match. Gebruikt voor koprij-DETECTIE: een dataregel ("Dorpsstraat") mag nooit als koprij gelden.
function veldExact(kop: unknown): Veld | undefined {
  const k = kaal(kop as string);
  if (!k) return undefined;
  for (const veld of VELDEN) if (SYNONIEMEN[veld].some((s) => kaal(s) === k)) return veld;
  return undefined;
}

// Soepelere match (exact, anders: kop bevat een langer synoniem). Alleen om een al-gevonden koprij te MAPPEN,
// bv. "Adresregel 1" → adres_combi. Eénrichting (k.includes(ks)) om afkortingen niet op verkeerde velden te plakken.
function veldVoorKop(kop: unknown): Veld | undefined {
  const exact = veldExact(kop);
  if (exact) return exact;
  const k = kaal(kop as string);
  if (!k) return undefined;
  for (const veld of VELDEN) {
    if (SYNONIEMEN[veld].some((s) => {
      const ks = kaal(s);
      return ks.length >= 4 && k.includes(ks);
    })) return veld;
  }
  return undefined;
}

export type ExcelResultaat =
  | { ok: true; rijen: RuweRij[]; herkend: string[]; onherkend: string[] }
  | { ok: false; fout: string };

// Leest een .xlsx/.xls/.csv en mapt kolommen op velden. xlsx detecteert CSV automatisch.
export async function leesExcel(file: File): Promise<ExcelResultaat> {
  let grid: unknown[][];
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { ok: false, fout: "Het bestand bevat geen werkblad." };
    grid = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
  } catch {
    return { ok: false, fout: "Kon het Excel/CSV-bestand niet lezen." };
  }

  // Koprij-detectie met EXACTE matching: de eerste rij (binnen de eerste 15) met ≥2 herkende koppen waarvan
  // minstens één een adresveld is. Zo wordt een dataregel zonder koppen niet per ongeluk als koprij gezien.
  let kopIndex = -1;
  for (let i = 0; i < Math.min(grid.length, 15); i++) {
    const row = grid[i] || [];
    const gevonden = new Set<Veld>();
    row.forEach((cel) => {
      const v = veldExact(cel);
      if (v) gevonden.add(v);
    });
    if (gevonden.size >= 2 && [...gevonden].some((v) => CORE.includes(v))) {
      kopIndex = i;
      break;
    }
  }
  if (kopIndex < 0) {
    return { ok: false, fout: "Geen herkenbare kolomkoppen gevonden. Zorg voor een koprij met o.a. straat, huisnummer, postcode of plaats." };
  }

  // Map de gevonden koprij met de soepelere matcher (eerste kolom wint per veld).
  const kopRow = grid[kopIndex] || [];
  const kolMap = new Map<number, Veld>();
  kopRow.forEach((cel, idx) => {
    const v = veldVoorKop(cel);
    if (v && ![...kolMap.values()].includes(v)) kolMap.set(idx, v);
  });

  const onherkend = kopRow.map((c) => String(c ?? "")).filter((c) => c.trim() && !veldVoorKop(c));
  const herkend = [...new Set([...kolMap.values()])];
  const heeftStraatKolom = herkend.includes("straat");

  const rijen: RuweRij[] = [];
  for (let i = kopIndex + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    if (row.every((c) => String(c ?? "").trim() === "")) continue;
    const r: RuweRij = { straat: "", huisnummer: "", toevoeging: "", postcode: "", plaats: "", naam: "", telefoon: "", type: "", notitie: "" };
    for (const [idx, veld] of kolMap) {
      const waarde = String(row[idx] ?? "").trim();
      if (!waarde) continue;
      if (veld === "adres_combi") {
        // Alleen gebruiken als er geen aparte straat-kolom is (anders dubbel/vermenging).
        if (!heeftStraatKolom && !r.straat) r.straat = waarde;
      } else {
        r[veld] = r[veld] ? `${r[veld]} ${waarde}` : waarde;
      }
    }
    if (Object.values(r).some((v) => v)) rijen.push(r);
  }

  if (rijen.length === 0) return { ok: false, fout: "Geen gegevensrijen gevonden onder de koppen." };
  return { ok: true, rijen, herkend, onherkend };
}

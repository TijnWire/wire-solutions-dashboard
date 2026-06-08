import * as XLSX from "xlsx-js-style";
import { kaal } from "./extract/normaliseer";
import type { TauwType } from "./types";

// Eén ingelezen regel uit de Stedin-planning.
export type StedinRij = {
  datum: string; // ISO (jjjj-mm-dd) indien herkend, anders het ruwe label
  tijd: string; // "HH:MM" indien herkend
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  naam: string; // bewoner / contactpersoon (indien een naam-kolom aanwezig is)
  telefoon: string;
  notitie: string;
};

export type StedinResultaat = { ok: true; week: string; rijen: StedinRij[] } | { ok: false; fout: string };

const NL_MAAND: Record<string, string> = {
  jan: "01", feb: "02", mrt: "03", maa: "03", apr: "04", mei: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", okt: "10", nov: "11", dec: "12",
};

// Kop-woorden die per ongeluk in een datarij kunnen lekken (tweede koprij / contactblok).
const KOP_HUISNR = new Set(["nummer", "huisnummer", "huisnr", "nr", "huis", "hnr"]);
const KOP_STRAAT = new Set(["adres", "straat", "adresregel", "straatnaam", "straatadres"]);

// "Maandag 2 juni 2026" / "ma 2-jun" / "2-jun" / "2/jun/26" / "02-06-2026" → ISO; anders het ruwe label.
// Tolerant: weekdag-prefix wordt gestript en het dag+maand-fragment wordt ergens in de cel gezocht.
function parseDatum(label: string, jaar: string): string {
  const t = label
    .trim()
    .toLowerCase()
    .replace(/^(maandag|dinsdag|woensdag|donderdag|vrijdag|zaterdag|zondag|ma|di|wo|do|vr|za|zo)\.?\s+/, "");
  // dag + maandwoord: "2 juni 2026", "2-jun", "2/jun/26"
  let m = t.match(/(\d{1,2})[-/\s]([a-z]{3,})\.?(?:[-/\s](\d{2,4}))?/);
  if (m) {
    const maand = NL_MAAND[m[2].slice(0, 3)];
    if (maand) {
      const j = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : jaar;
      return `${j}-${maand}-${m[1].padStart(2, "0")}`;
    }
  }
  // dag-maand(-jaar) in cijfers: "2-6", "02-06-2026", "2/6/26"
  m = t.match(/(\d{1,2})[-/](\d{1,2})(?:[-/](\d{2,4}))?/);
  if (m) {
    const j = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : jaar;
    return `${j}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return label.trim();
}

// "8.00" / "8:00" / "08:00:00" / "8u30" / "8" / Excel-fractie (0..1) → "HH:MM"; anders ruw.
function normTijd(s: string): string {
  const t = s.trim();
  if (!t) return "";
  const f = Number(t.replace(",", "."));
  if (!isNaN(f) && f > 0 && f < 1) {
    const min = Math.round(f * 1440);
    return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
  }
  const m = t.match(/^(\d{1,2})[.:hu]?\s*(\d{2})?(?::\d{2})?$/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2] ?? "00"}`;
  return t;
}

// Nederlandse mobiele nummers verliezen in Excel vaak hun leidende 0; herstel die.
function herstelTel(s: string): string {
  const t = s.trim();
  if (/^6\d{8}$/.test(t)) return "0" + t;
  return t;
}

// Leest de Stedin-planning en haalt de adresregels eruit. Het type bepaalt de scan:
//  • bodemonderzoek → planning-grid met gele dagkoppen + tijdsloten (datum/tijd worden meegelezen);
//  • bezoekronde   → lijst met te bezoeken adressen (datum/tijd niet relevant — die plant de werknemer zelf).
export async function leesStedinPlanning(file: File, type: TauwType = "bodemonderzoek"): Promise<StedinResultaat> {
  const metPlanning = type === "bodemonderzoek";
  let grid: unknown[][];
  let jaar = String(new Date().getFullYear());
  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { ok: false, fout: "Het bestand bevat geen werkblad." };
    grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: "" }) as unknown[][];
  } catch {
    return { ok: false, fout: "Kon het Excel-bestand niet lezen." };
  }

  // Jaartal uit het titelblok (eerste 20xx in de eerste rijen wint).
  jaarLus: for (let i = 0; i < Math.min(grid.length, 6); i++) {
    for (const c of grid[i] || []) {
      const m = String(c ?? "").match(/\b(20\d{2})\b/);
      if (m) { jaar = m[1]; break jaarLus; }
    }
  }

  // Koprij zoeken: bevat Adres + (Huisnummer of Tel).
  let kopIndex = -1;
  const kol: { week?: number; datum?: number; tijd?: number; notitie?: number; adres?: number; huisnummer?: number; postcode?: number; plaats?: number; naam?: number; tel?: number } = {};
  for (let i = 0; i < Math.min(grid.length, 14); i++) {
    const row = grid[i] || [];
    const idx: typeof kol = {};
    row.forEach((cel, c) => {
      const k = kaal(cel as string);
      if (!k) return;
      if (k === "week" && idx.week === undefined) idx.week = c;
      else if (k === "datum" && idx.datum === undefined) idx.datum = c; // per-rij datum (i.p.v. gele dagkop)
      else if (k === "tijd" && idx.tijd === undefined) idx.tijd = c;
      else if ((k.includes("bijzonder") || k === "notitie" || k.includes("opmerking")) && idx.notitie === undefined) idx.notitie = c;
      // Adres/straat: dezelfde labels als de lek-filter (adres, straat, straatnaam, adresregel, straatadres).
      else if (KOP_STRAAT.has(k) && idx.adres === undefined) idx.adres = c;
      // Huisnummer: huisnummer/huisnr/huis/hnr én korte varianten nr/nummer (consistent met de lek-filter).
      else if ((KOP_HUISNR.has(k) || k.includes("huis")) && idx.huisnummer === undefined) idx.huisnummer = c;
      else if ((k.includes("postcode") || k === "pc") && idx.postcode === undefined) idx.postcode = c;
      else if ((k === "plaats" || k.includes("woonplaats") || k === "gemeente" || k === "stad") && idx.plaats === undefined) idx.plaats = c;
      else if ((k === "naam" || k === "bewoner" || k === "naambewoner" || k === "contactpersoon" || k === "contact" || k === "klant" || k === "klantnaam") && idx.naam === undefined) idx.naam = c;
      else if ((k.includes("telnr") || k.includes("telefoon") || k === "tel") && idx.tel === undefined) idx.tel = c;
    });
    // Bodemonderzoek heeft meestal een tel-kolom; een bezoekronde-lijst hoeft die niet te hebben.
    const compleet = metPlanning
      ? idx.adres !== undefined && (idx.huisnummer !== undefined || idx.tel !== undefined)
      : idx.adres !== undefined && (idx.huisnummer !== undefined || idx.postcode !== undefined);
    if (compleet) {
      kopIndex = i;
      Object.assign(kol, idx);
      break;
    }
  }
  if (kopIndex < 0) {
    return {
      ok: false,
      fout: metPlanning
        ? "Geen herkenbare planning gevonden. Verwacht koppen als Week, tijd, Adres, Huisnummer en Tel nr."
        : "Geen herkenbare adressenlijst gevonden. Verwacht koppen als Adres, Huisnummer, Postcode en Plaats.",
    };
  }

  const cel = (row: unknown[], c?: number) => (c === undefined ? "" : String(row[c] ?? "").trim());
  const rijen: StedinRij[] = [];
  let huidigeDatum = "";
  for (let i = kopIndex + 1; i < grid.length; i++) {
    const row = grid[i] || [];
    const weekCel = cel(row, kol.week);
    if (weekCel) huidigeDatum = parseDatum(weekCel, jaar); // gele dagkop
    const straat = cel(row, kol.adres);
    const huisnummer = cel(row, kol.huisnummer);
    const tel = cel(row, kol.tel);
    if (!straat && !huisnummer && !tel) continue; // dagkop of leeg tijdslot
    // Sla gelekte kop-/contactregels over (bv. tweede koprij "...nummer...").
    if (KOP_HUISNR.has(kaal(huisnummer)) || KOP_STRAAT.has(kaal(straat))) continue;
    // Een eigen 'Datum'-kolom heeft voorrang op de sticky dagkop; reeds-ISO laten we ongemoeid.
    let datum = "";
    if (metPlanning) {
      const rijDatum = kol.datum !== undefined ? cel(row, kol.datum) : "";
      datum = rijDatum ? (/^\d{4}-\d{2}-\d{2}$/.test(rijDatum) ? rijDatum : parseDatum(rijDatum, jaar)) : huidigeDatum;
    }
    rijen.push({
      // Bij een bezoekronde plant de werknemer de afspraak zelf, dus datum/tijd starten leeg.
      datum,
      tijd: metPlanning ? normTijd(cel(row, kol.tijd)) : "",
      straat,
      huisnummer,
      postcode: cel(row, kol.postcode),
      plaats: cel(row, kol.plaats),
      naam: cel(row, kol.naam),
      telefoon: herstelTel(tel),
      notitie: cel(row, kol.notitie),
    });
  }
  if (rijen.length === 0) {
    return { ok: false, fout: metPlanning ? "Geen adresregels gevonden in de planning." : "Geen adressen gevonden in de lijst." };
  }

  let week: string;
  if (metPlanning) {
    const datums = rijen.map((r) => r.datum).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
    const eerste = datums[0];
    const laatste = datums[datums.length - 1];
    week = eerste ? `Stedin-planning ${eerste}${laatste && laatste !== eerste ? " – " + laatste : ""}` : "Stedin-planning";
  } else {
    const plaats = rijen.map((r) => r.plaats.trim()).find(Boolean);
    week = `Bezoekronde${plaats ? " " + plaats : ""} (${rijen.length} adressen)`;
  }

  return { ok: true, week, rijen };
}

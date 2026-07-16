import * as XLSX from "xlsx-js-style";

// ── Professionele urenstaat-export (.xlsx) met échte formules ──────────────────────
// Eén regel per gewerkte periode (datum + begin/eind + pauze). Het dagtotaal is een echte
// Excel-formule ((eind − begin) × 24 − pauze/60); week- en groepstotalen zijn SUM-formules.
// LET OP: xlsx-js-style laat een formulecel zónder gecachte waarde vallen bij het opslaan,
// dus elke formulecel krijgt óók de berekende waarde mee (Excel herberekent bij bewerken).

export type UrenExportRegel = {
  datum: string;      // ISO
  dag: string;        // ma/di/…
  uursoort: string;
  project: string;
  begin: string;      // "09:00" (kan leeg zijn bij oude, omgezette regels)
  eind: string;       // "17:30"
  pauze: number;      // minuten
  uren: number;       // totaal uren
  notitie: string;
  feestdag: string;
  verlof: string;
};

export type UrenExportPersoon = {
  naam: string;
  functie: string;
  persnr: string;
  regels: UrenExportRegel[];
};

export type UrenExportData = {
  bedrijfsnaam: string;
  weekNr: number;
  jaar: number;
  periodeLabel: string;
  opdrachtgever?: string;
  opsteller?: string;
  personen: UrenExportPersoon[];
};

const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
// Kolommen: 0 Datum · 1 Dag · 2 Uursoort · 3 Project · 4 Begin · 5 Eind · 6 Pauze · 7 Totaal · 8 Bijzonder · 9 Omschrijving
const NKOL = 10;
const K_BEGIN = 4, K_EIND = 5, K_PAUZE = 6, K_TOTAAL = 7;
const LINKS = [0, 2, 3, 9]; // kolommen die links uitgelijnd staan; de rest gecentreerd

const INK = "111827";
const GRIJS = "F3F4F6";
const rand = { style: "thin" as const, color: { rgb: "D1D5DB" } };
const alleRanden = { top: rand, bottom: rand, left: rand, right: rand };

// "06:30" → 0,27083… (Excel bewaart een tijd als deel van een etmaal).
const tijdWaarde = (t?: string): number | null => {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (![h, m].every((n) => Number.isFinite(n))) return null;
  return (h * 60 + m) / 1440;
};
const dagDatum = (iso: string) => { const p = iso.slice(0, 10).split("-"); return `${Number(p[2])}-${Number(p[1])}-${p[0]}`; };

export function exporteerUrenstaat(data: UrenExportData): void {
  const aoa: (string | number | null)[][] = [];
  const stijlen: { addr: string; s: Record<string, unknown> }[] = [];
  const formules: { addr: string; f: string; v: number; z?: string }[] = [];
  const tijden: { addr: string; v: number }[] = [];
  const merges: XLSX.Range[] = [];
  const setStijl = (r: number, c: number, s: Record<string, unknown>) => stijlen.push({ addr: enc(r, c), s });

  // ── Koptekst ──
  aoa.push([data.bedrijfsnaam]);
  setStijl(0, 0, { font: { bold: true, sz: 16, color: { rgb: INK } } });
  aoa.push(["Urenstaat"]);
  setStijl(1, 0, { font: { bold: true, sz: 12, color: { rgb: "374151" } } });
  aoa.push([`Week ${data.weekNr} · ${data.jaar}`, data.periodeLabel]);
  setStijl(2, 0, { font: { bold: true, sz: 11 } });
  aoa.push([`Opdrachtgever / project: ${data.opdrachtgever ?? ""}`, "", "", "", `Opsteller: ${data.opsteller ?? ""}`]);
  aoa.push([]);
  let R = aoa.length;

  const weekTotaalCellen: string[] = [];
  let groepTotaal = 0;

  for (const p of data.personen) {
    aoa.push([`Medewerker: ${p.naam}`, "", `Functie: ${p.functie || "—"}`, "", `Pers.nr: ${p.persnr}`]);
    setStijl(R, 0, { font: { bold: true, sz: 11, color: { rgb: INK } } });
    R++;

    const kop = ["Datum", "Dag", "Uursoort", "Project", "Begin", "Eind", "Pauze (min)", "Totaal (u)", "Bijzonder", "Omschrijving werkzaamheden"];
    aoa.push(kop);
    const kopRij = R;
    for (let c = 0; c < NKOL; c++) {
      setStijl(kopRij, c, {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: INK } },
        alignment: { horizontal: LINKS.includes(c) ? "left" : "center", vertical: "center", wrapText: true },
        border: alleRanden,
      });
    }
    R++;

    const regelRijen: number[] = [];
    let weekTot = 0;
    for (const g of p.regels) {
      const bijzonder = [g.feestdag, g.verlof].filter(Boolean).join(" · ");
      const uren = Number(g.uren) || 0;
      weekTot += uren;
      aoa.push([dagDatum(g.datum), g.dag, g.uursoort, g.project, g.begin, g.eind, g.pauze || 0, uren, bijzonder, g.notitie]);
      const rr = R;
      regelRijen.push(rr);
      // Begin/eind als échte tijdwaarden + het totaal als formule (alleen als beide tijden er zijn).
      const b = tijdWaarde(g.begin), e = tijdWaarde(g.eind);
      if (b !== null) tijden.push({ addr: enc(rr, K_BEGIN), v: b });
      if (e !== null) tijden.push({ addr: enc(rr, K_EIND), v: e });
      if (b !== null && e !== null) {
        const nacht = e < b ? "+1" : ""; // over middernacht doorgewerkt
        formules.push({ addr: enc(rr, K_TOTAAL), f: `(${enc(rr, K_EIND)}-${enc(rr, K_BEGIN)}${nacht})*24-${enc(rr, K_PAUZE)}/60`, v: uren });
      }
      for (let c = 0; c < NKOL; c++) {
        setStijl(rr, c, {
          font: { sz: 10, bold: c === K_TOTAAL },
          alignment: { horizontal: LINKS.includes(c) ? "left" : "center" },
          fill: bijzonder ? { fgColor: { rgb: GRIJS } } : undefined,
          border: alleRanden,
        });
      }
      R++;
    }

    // Weektotaal van deze medewerker
    const totRij = R;
    aoa.push(["Totaal", "", "", "", "", "", "", weekTot, "", ""]);
    if (regelRijen.length) {
      const a = regelRijen[0], z = regelRijen[regelRijen.length - 1];
      formules.push({ addr: enc(totRij, K_TOTAAL), f: `SUM(${enc(a, K_TOTAAL)}:${enc(z, K_TOTAAL)})`, v: weekTot });
    }
    for (let c = 0; c < NKOL; c++) {
      setStijl(totRij, c, {
        font: { bold: true, sz: 10, color: { rgb: INK } },
        fill: { fgColor: { rgb: "E5E7EB" } },
        alignment: { horizontal: c === 0 ? "left" : "center" },
        border: alleRanden,
      });
    }
    weekTotaalCellen.push(enc(totRij, K_TOTAAL));
    groepTotaal += weekTot;
    R++;

    aoa.push([]); R++;
  }

  // ── Groepstotaal ──
  const grpRij = R;
  aoa.push(["TOTAAL alle medewerkers (uren)", weekTotaalCellen.length ? 0 : ""]);
  if (weekTotaalCellen.length) formules.push({ addr: enc(grpRij, 1), f: weekTotaalCellen.join("+"), v: groepTotaal });
  setStijl(grpRij, 0, { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: INK } }, border: alleRanden });
  setStijl(grpRij, 1, { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: INK } }, alignment: { horizontal: "center" }, border: alleRanden });
  R += 2; aoa.push([]);

  // ── Goedkeuringsblok ──
  // De labels staan in kolom A en E. Die kolommen zijn smal (Datum / Begin), en de lege cel
  // ernaast blokkeert het doorlopen van tekst in Excel — "Handtekening:" zou dus afgekapt worden.
  // Daarom elk label over twee kolommen samenvoegen; de handtekeninglijn schuift een kolom op.
  aoa.push(["Akkoord medewerker", "", "", "", "Akkoord opdrachtgever / leidinggevende"]);
  setStijl(R, 0, { font: { bold: true, sz: 10 } });
  setStijl(R, 4, { font: { bold: true, sz: 10 } });
  merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 1 } }, { s: { r: R, c: 4 }, e: { r: R, c: 7 } });
  R++;
  for (const v of ["Naam:", "Datum:", "Handtekening:"]) {
    aoa.push([v, "", "", "", v]);
    setStijl(R, 0, { font: { sz: 10 } });
    setStijl(R, 4, { font: { sz: 10 } });
    merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 1 } }, { s: { r: R, c: 4 }, e: { r: R, c: 5 } });
    for (const c of [2, 3, 6, 7]) setStijl(R, c, { border: { bottom: { style: "thin", color: { rgb: "9CA3AF" } } } });
    R++;
  }
  aoa.push([]); R++;
  aoa.push(["Detachering: facturatie pas na akkoord opdrachtgever. Gegenereerd via het Wire Solutions dashboard."]);
  setStijl(R, 0, { font: { italic: true, sz: 9, color: { rgb: "9CA3AF" } } });

  // ── Worksheet ──
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 11 }, { wch: 5 }, { wch: 24 }, { wch: 18 }, { wch: 8 }, { wch: 8 }, { wch: 11 }, { wch: 10 }, { wch: 14 }, { wch: 34 }];
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NKOL - 1 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: NKOL - 1 } });
  ws["!merges"] = merges;

  for (const { addr, v } of tijden) ws[addr] = { t: "n", v, z: "hh:mm" };
  for (const { addr, f, v } of formules) ws[addr] = { t: "n", f, v };
  for (const { addr, s } of stijlen) {
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    (ws[addr] as { s?: unknown }).s = s;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Week ${data.weekNr}`);
  XLSX.writeFile(wb, `Urenstaat_week${data.weekNr}_${data.jaar}.xlsx`);
}

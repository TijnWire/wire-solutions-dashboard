import * as XLSX from "xlsx-js-style";

// ── Professionele urenstaat-export (.xlsx) met échte formules voor alle totalen ──
// De app registreert uren per dag per project (geen start/eindtijd/pauze/overwerk/km),
// dus de sheet is opgebouwd rond dag-/projecturen + verlof/ziek/feestdag, met SUM-formules
// voor rij-, dag-, week- en groepstotalen en een goedkeuringsblok onderaan.
// LET OP: xlsx-js-style laat een formulecel zónder gecachte waarde vallen bij het opslaan,
// dus elke formulecel krijgt hier óók de berekende waarde mee (Excel herberekent bij bewerken).

export type UrenExportPersoon = {
  naam: string;
  functie: string;
  persnr: string;
  projectRegels: { label: string; uren: number[]; notitie?: string }[];
  verlofDagen: number; // vakantie + verlof (dagen in deze week)
  ziekDagen: number;
  feestdagDagen: number;
};

export type UrenExportData = {
  bedrijfsnaam: string;
  weekNr: number;
  jaar: number;
  periodeLabel: string; // bijv. "13 jul – 19 jul 2026"
  opdrachtgever?: string;
  opsteller?: string;
  dagen: string[]; // 7: Ma..Zo
  datums: string[]; // 7 ISO-datums
  personen: UrenExportPersoon[];
};

const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });
const NKOL = 9; // A (project) + Ma..Zo (7) + Totaal

// Stijl-bouwstenen
const INK = "111827";
const GRIJS = "F3F4F6";
const RAND_KLEUR = "D1D5DB";
const rand = { style: "thin" as const, color: { rgb: RAND_KLEUR } };
const alleRanden = { top: rand, bottom: rand, left: rand, right: rand };

export function exporteerUrenstaat(data: UrenExportData): void {
  const aoa: (string | number | null)[][] = [];
  const stijlen: { addr: string; s: Record<string, unknown> }[] = [];
  const formules: { addr: string; f: string; v: number }[] = [];
  const merges: XLSX.Range[] = [];
  const setStijl = (r: number, c: number, s: Record<string, unknown>) => stijlen.push({ addr: enc(r, c), s });
  const setFormule = (r: number, c: number, f: string, v: number) => formules.push({ addr: enc(r, c), f, v });

  const dagDatum = (iso: string) => { const p = iso.slice(0, 10).split("-"); return `${Number(p[2])}/${Number(p[1])}`; };

  // ── Koptekst ──
  aoa.push([data.bedrijfsnaam]);
  setStijl(0, 0, { font: { bold: true, sz: 16, color: { rgb: INK } } });
  aoa.push(["Urenstaat"]);
  setStijl(1, 0, { font: { bold: true, sz: 12, color: { rgb: "374151" } } });
  aoa.push([`Week ${data.weekNr} · ${data.jaar}`, data.periodeLabel]);
  setStijl(2, 0, { font: { bold: true, sz: 11 } });
  aoa.push([`Opdrachtgever / project: ${data.opdrachtgever ?? ""}`, "", "", "", `Opsteller: ${data.opsteller ?? ""}`]);
  aoa.push([]);
  let R = aoa.length; // huidige rij-index (0-based)

  const weektotaalCellen: string[] = [];
  let groepTotaal = 0;

  for (const p of data.personen) {
    // Medewerkerkop
    aoa.push([`Medewerker: ${p.naam}`, "", `Functie: ${p.functie || "—"}`, "", `Pers.nr: ${p.persnr}`]);
    setStijl(R, 0, { font: { bold: true, sz: 11, color: { rgb: INK } } });
    setStijl(R, 2, { font: { sz: 10, color: { rgb: "374151" } } });
    setStijl(R, 4, { font: { sz: 10, color: { rgb: "374151" } } });
    R++;

    // Kolomkoppen (Project + Ma..Zo met datum + Totaal)
    const kop: string[] = ["Project / locatie", ...data.dagen.map((d, i) => `${d} ${dagDatum(data.datums[i])}`), "Totaal"];
    aoa.push(kop);
    const kopRij = R;
    for (let c = 0; c < NKOL; c++) {
      const weekend = c >= 6 && c <= 7; // Za, Zo
      setStijl(kopRij, c, {
        font: { bold: true, sz: 10, color: { rgb: "FFFFFF" } },
        fill: { fgColor: { rgb: weekend ? "374151" : INK } },
        alignment: { horizontal: c === 0 ? "left" : "center", vertical: "center", wrapText: true },
        border: alleRanden,
      });
    }
    R++;

    // Projectregels + lopende dag-/weeksommen
    const projectRijen: number[] = [];
    const dagSom = [0, 0, 0, 0, 0, 0, 0];
    let weekTot = 0;
    const regels = p.projectRegels.length ? p.projectRegels : [{ label: "—", uren: [0, 0, 0, 0, 0, 0, 0], notitie: "" }];
    for (const reg of regels) {
      const vals = reg.uren.map((u) => Number(u) || 0);
      const rowTot = vals.reduce((a, b) => a + b, 0);
      vals.forEach((v, i) => (dagSom[i] += v));
      weekTot += rowTot;
      aoa.push([reg.label, ...vals, rowTot]);
      const rr = R;
      projectRijen.push(rr);
      setFormule(rr, 8, `SUM(${enc(rr, 1)}:${enc(rr, 7)})`, rowTot);
      for (let c = 0; c < NKOL; c++) {
        const weekend = c >= 6 && c <= 7;
        setStijl(rr, c, {
          font: { sz: 10, bold: c === 8 },
          alignment: { horizontal: c === 0 ? "left" : "center" },
          fill: weekend ? { fgColor: { rgb: GRIJS } } : undefined,
          border: alleRanden,
        });
      }
      R++;
    }

    // Dagtotaal-rij (SUM per kolom over de projectregels)
    const dagRij = R;
    const eersteP = projectRijen[0], laatsteP = projectRijen[projectRijen.length - 1];
    aoa.push(["Dagtotaal", ...dagSom, weekTot]);
    for (let c = 1; c <= 7; c++) setFormule(dagRij, c, `SUM(${enc(eersteP, c)}:${enc(laatsteP, c)})`, dagSom[c - 1]);
    setFormule(dagRij, 8, `SUM(${enc(eersteP, 8)}:${enc(laatsteP, 8)})`, weekTot);
    for (let c = 0; c < NKOL; c++) {
      setStijl(dagRij, c, {
        font: { bold: true, sz: 10, color: { rgb: INK } },
        fill: { fgColor: { rgb: "E5E7EB" } },
        alignment: { horizontal: c === 0 ? "left" : "center" },
        border: alleRanden,
      });
    }
    weektotaalCellen.push(enc(dagRij, 8)); // I-cel = weektotaal van deze persoon
    groepTotaal += weekTot;
    R++;

    // Categorie-subtotalen (voor loon/facturatie)
    const cat = (label: string, waarde: string | number) => {
      aoa.push([label, waarde]);
      setStijl(R, 0, { font: { sz: 10, color: { rgb: "374151" } }, border: alleRanden });
      setStijl(R, 1, { font: { bold: true, sz: 10 }, alignment: { horizontal: "center" }, border: alleRanden });
      return R++;
    };
    const reguRij = cat("Gewerkte uren (regulier)", weekTot);
    setFormule(reguRij, 1, enc(dagRij, 8), weekTot); // = weektotaal
    cat("Verlof / vakantie (dagen)", p.verlofDagen);
    cat("Ziek (dagen)", p.ziekDagen);
    cat("Feestdag (dagen)", p.feestdagDagen);
    cat("Reiskosten / km (handmatig)", "");

    // Toelichting (notities per project, indien aanwezig)
    const notities = p.projectRegels.filter((x) => x.notitie && x.notitie.trim()).map((x) => `${x.label}: ${x.notitie!.trim()}`);
    if (notities.length) {
      aoa.push([`Toelichting: ${notities.join("  |  ")}`]);
      setStijl(R, 0, { font: { italic: true, sz: 9, color: { rgb: "6B7280" } } });
      merges.push({ s: { r: R, c: 0 }, e: { r: R, c: 8 } });
      R++;
    }

    aoa.push([]); R++; // witregel tussen medewerkers
  }

  // ── Groepstotaal ──
  const grpRij = R;
  aoa.push(["TOTAAL alle medewerkers (uren)", weektotaalCellen.length ? 0 : ""]);
  if (weektotaalCellen.length) setFormule(grpRij, 1, weektotaalCellen.join("+"), groepTotaal);
  setStijl(grpRij, 0, { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: INK } }, border: alleRanden });
  setStijl(grpRij, 1, { font: { bold: true, sz: 11, color: { rgb: "FFFFFF" } }, fill: { fgColor: { rgb: INK } }, alignment: { horizontal: "center" }, border: alleRanden });
  R += 2; aoa.push([]);

  // ── Goedkeuringsblok ──
  aoa.push(["Akkoord medewerker", "", "", "", "Akkoord opdrachtgever / leidinggevende"]);
  setStijl(R, 0, { font: { bold: true, sz: 10 } });
  setStijl(R, 4, { font: { bold: true, sz: 10 } });
  R++;
  for (const veld of ["Naam:", "Datum:", "Handtekening:"]) {
    aoa.push([veld, "", "", "", veld]);
    setStijl(R, 0, { font: { sz: 10 } });
    setStijl(R, 4, { font: { sz: 10 } });
    setStijl(R, 1, { border: { bottom: { style: "thin", color: { rgb: "9CA3AF" } } } });
    setStijl(R, 2, { border: { bottom: { style: "thin", color: { rgb: "9CA3AF" } } } });
    setStijl(R, 5, { border: { bottom: { style: "thin", color: { rgb: "9CA3AF" } } } });
    setStijl(R, 6, { border: { bottom: { style: "thin", color: { rgb: "9CA3AF" } } } });
    R++;
  }
  aoa.push([]); R++;
  aoa.push([`Detachering: facturatie pas na akkoord opdrachtgever. Gegenereerd via het Wire Solutions dashboard.`]);
  setStijl(R, 0, { font: { italic: true, sz: 9, color: { rgb: "9CA3AF" } } });

  // ── Worksheet opbouwen ──
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = [{ wch: 30 }, ...Array(7).fill({ wch: 9 }), { wch: 11 }];
  merges.push(
    { s: { r: 0, c: 0 }, e: { r: 0, c: 8 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 8 } },
  );
  ws["!merges"] = merges;

  // Formules toepassen — mét gecachte waarde, anders laat xlsx-js-style de cel vallen.
  for (const { addr, f, v } of formules) ws[addr] = { t: "n", f, v };
  // Stijlen toepassen
  for (const { addr, s } of stijlen) {
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    (ws[addr] as { s?: unknown }).s = s;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, `Week ${data.weekNr}`);
  XLSX.writeFile(wb, `Urenstaat_week${data.weekNr}_${data.jaar}.xlsx`);
}

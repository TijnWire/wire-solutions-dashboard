// Bodemonderzoek — exporteren naar Excel en PDF.
// ─────────────────────────────────────────────────────────────────────────────
// Dit is wat er naar TAUW of Van der Helm gaat: per adres wie er woont, hoe je die persoon bereikt,
// of hij erbij wil zijn, en wanneer. De PDF is een werklijst die de aannemer mee de wijk in neemt,
// gegroepeerd per dag en tijdblok; de Excel is de volledige lijst om mee door te rekenen.

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { dagLabel, telefoonNet, voortgangVan } from "./bodemonderzoek";
import { UITKOMST_LABEL, type TauwAdres, type TauwOpdracht } from "./types";

const MERK = { r: 234, g: 88, b: 12 };     // brand-600, dezelfde oranje als in de app
const GRIJS = { r: 100, g: 116, b: 139 };

const adresTekst = (a: TauwAdres) => `${a.straat} ${a.huisnummer}`.replace(/\s+/g, " ").trim();
const uitkomstVan = (a: TauwAdres) =>
  a.uitkomst ? UITKOMST_LABEL[a.uitkomst] : a.afgerond ? "Afgerond" : a.geenGehoor ? "Niet thuis" : "Nog langs";

function bestandsnaam(o: TauwOpdracht, ext: string): string {
  const basis = (o.referentie || o.regio || "bodemonderzoek").replace(/[\\/:*?"<>|]/g, "-").trim();
  const datum = new Date().toISOString().slice(0, 10);
  return `${o.opdrachtgever ?? "TAUW"} ${basis} ${datum}.${ext}`;
}

function download(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Excel ── de volledige lijst, met een tweede blad met alleen de geplande afspraken.
export async function exporteerBodemExcel(o: TauwOpdracht, naamVan: (id?: string) => string): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wire Solutions";
  wb.created = new Date();

  const kop = (ws: ExcelJS.Worksheet, koppen: string[], breedtes: number[]) => {
    ws.addRow(koppen);
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEA580C" } };
    r.height = 20;
    r.alignment = { vertical: "middle" };
    breedtes.forEach((b, i) => { ws.getColumn(i + 1).width = b; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Blad 1: alle adressen
  const ws = wb.addWorksheet("Adressen");
  kop(ws,
    ["Straat", "Huisnr", "Postcode", "Plaats", "Wijk", "Bewoner", "Telefoon", "E-mail", "Wil erbij zijn", "Datum", "Tijdslot", "Toestemming tuin", "Status", "Medewerker", "Notitie"],
    [22, 8, 11, 18, 14, 22, 15, 24, 13, 12, 14, 16, 16, 16, 30]);
  for (const a of o.adressen) {
    ws.addRow([
      a.straat, a.huisnummer, a.postcode, a.plaats, a.wijk ?? "",
      a.bewoner, telefoonNet(a.telefoon), a.email ?? "",
      a.aanwezig === "ja" ? "Ja" : a.aanwezig === "nee" ? "Nee" : "",
      a.aanwezig === "ja" ? a.datum : "", a.aanwezig === "ja" ? (a.tijdslot ?? "") : "",
      a.aanwezig === "nee" ? (a.toestemmingTuin ? "Ja" : "Nee") : "",
      uitkomstVan(a), naamVan(a.toegewezenAan), a.notitie,
    ]);
  }

  // Blad 2: alleen de afspraken, op dag en tijd — dat is wat de aannemer inplant.
  const gepland = o.adressen
    .filter((a) => a.aanwezig === "ja" && a.datum && a.tijdslot)
    .sort((a, b) => (a.datum + a.tijdslot!).localeCompare(b.datum + b.tijdslot!));
  const ws2 = wb.addWorksheet("Afspraken");
  kop(ws2, ["Datum", "Tijdslot", "Adres", "Postcode", "Plaats", "Bewoner", "Telefoon", "Notitie"], [12, 14, 28, 11, 18, 22, 15, 30]);
  for (const a of gepland) {
    ws2.addRow([a.datum, a.tijdslot, adresTekst(a), a.postcode, a.plaats, a.bewoner, telefoonNet(a.telefoon), a.notitie]);
  }

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), bestandsnaam(o, "xlsx"));
}

// ── PDF ── een werklijst per dag: waar moet de aannemer wanneer zijn, en wie moet hij bellen.
export function exporteerBodemPdf(o: TauwOpdracht): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;

  const koptekst = (vervolg = false) => {
    doc.setFillColor(MERK.r, MERK.g, MERK.b);
    doc.rect(0, 0, PW, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.text(`Bodemonderzoek — ${o.opdrachtgever ?? "TAUW"}`, M, 28);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text([o.referentie || o.regio, vervolg ? "(vervolg)" : ""].filter(Boolean).join("  "), M, 46);
    doc.setTextColor(255, 255, 255);
    doc.text(new Date().toLocaleDateString("nl-NL"), PW - M, 46, { align: "right" });
    y = 88;
  };
  const nieuwePagina = () => { doc.addPage(); koptekst(true); };
  const ruimte = (n: number) => { if (y + n > PH - 50) nieuwePagina(); };

  koptekst();

  // Samenvatting
  const v = voortgangVan(o.adressen);
  doc.setTextColor(30, 41, 59);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Samenvatting", M, y);
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  const regels = [
    `${v.totaal} adressen  ·  ${v.afgerond} afgerond  ·  ${v.open} nog langs`,
    `${v.ja} bewoners willen erbij zijn  ·  ${v.nee} geven toestemming zonder aanwezigheid`,
    `${v.geenGehoor} niet thuis  ·  ${v.later} later terugkomen  ·  ${v.weigert} weigert  ·  ${v.ongeldig} ongeldig adres`,
  ];
  for (const r of regels) { doc.text(r, M, y); y += 14; }
  y += 8;

  // Afspraken per dag
  const gepland = o.adressen
    .filter((a) => a.aanwezig === "ja" && a.datum && a.tijdslot)
    .sort((a, b) => (a.datum + a.tijdslot!).localeCompare(b.datum + b.tijdslot!));

  if (gepland.length) {
    const perDag = new Map<string, TauwAdres[]>();
    for (const a of gepland) perDag.set(a.datum, [...(perDag.get(a.datum) ?? []), a]);

    for (const [datum, lijst] of [...perDag.entries()].sort()) {
      ruimte(60);
      doc.setFillColor(241, 245, 249);
      doc.rect(M - 6, y - 12, PW - 2 * (M - 6), 20, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10.5);
      doc.setTextColor(30, 41, 59);
      doc.text(`${dagLabel(datum)}  (${lijst.length} ${lijst.length === 1 ? "afspraak" : "afspraken"})`, M, y + 2);
      y += 26;

      doc.setFontSize(9);
      for (const a of lijst) {
        ruimte(30);
        doc.setFont("helvetica", "bold");
        doc.setTextColor(30, 41, 59);
        doc.text(a.tijdslot!.replace("-", " – "), M, y);
        doc.text(adresTekst(a), M + 82, y);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(GRIJS.r, GRIJS.g, GRIJS.b);
        doc.text(`${a.postcode} ${a.plaats}`.trim(), M + 300, y);
        y += 13;
        doc.text(`${a.bewoner || "—"}   ${telefoonNet(a.telefoon)}`, M + 82, y);
        if (a.notitie) {
          const notitie = doc.splitTextToSize(a.notitie, PW - M - (M + 300));
          doc.text(notitie[0] ?? "", M + 300, y);
        }
        y += 16;
      }
      y += 6;
    }
  }

  // Adressen zonder afspraak — de aannemer mag daar zelfstandig de tuin in
  const zonder = o.adressen.filter((a) => a.aanwezig === "nee");
  if (zonder.length) {
    ruimte(60);
    doc.setFillColor(241, 245, 249);
    doc.rect(M - 6, y - 12, PW - 2 * (M - 6), 20, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`Zonder afspraak — toestemming voor de tuin (${zonder.length})`, M, y + 2);
    y += 26;
    doc.setFontSize(9);
    for (const a of zonder) {
      ruimte(18);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(30, 41, 59);
      doc.text(adresTekst(a), M, y);
      doc.setTextColor(GRIJS.r, GRIJS.g, GRIJS.b);
      doc.text(`${a.postcode} ${a.plaats}`.trim(), M + 180, y);
      doc.text(`${a.bewoner || "—"}  ${telefoonNet(a.telefoon)}`, M + 320, y);
      if (!a.toestemmingTuin) {
        doc.setTextColor(190, 30, 30);
        doc.text("geen toestemming", PW - M, y, { align: "right" });
      }
      y += 14;
    }
  }

  // Paginanummers
  const paginas = doc.getNumberOfPages();
  for (let i = 1; i <= paginas; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(GRIJS.r, GRIJS.g, GRIJS.b);
    doc.text(`Wire Solutions  ·  pagina ${i} van ${paginas}`, PW / 2, PH - 24, { align: "center" });
  }

  download(doc.output("blob"), bestandsnaam(o, "pdf"));
}

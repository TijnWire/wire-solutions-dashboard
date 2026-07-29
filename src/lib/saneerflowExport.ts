// Saneren — exporteren naar Excel en PDF.
// ─────────────────────────────────────────────────────────────────────────────
// Wat hier uit komt is het bewijs dat het akkoord er ligt. De Excel is de volledige administratie:
// wie er woont, wat hij zei, in welke ronde, en wanneer de poster is opgehangen. De PDF is de
// uitvoeringslijst voor de ploeg: per dag welke groep aan de beurt is en welke adressen dat zijn.
//
// Beide worden in de browser gemaakt en niet op de server: er staan namen en telefoonnummers in, en
// die hoeven nergens langs.

import ExcelJS from "exceljs";
import { jsPDF } from "jspdf";
import { ANTWOORD_INFO, BELSTATUS_INFO, type ExportData, type FlowAdres } from "./saneerflowWerk";

const MERK = { r: 2, g: 132, b: 199 };   // sky-600 — de kleur van deze module
const GRIJS = { r: 100, g: 116, b: 139 };

const adresTekst = (a: FlowAdres) => `${a.straat} ${a.huisnummer}${a.toevoeging}`.replace(/\s+/g, " ").trim();

const datumNL = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const kortNL = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().map(Number).join("-") : "");

function download(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

const bestandsnaam = (d: ExportData, ext: string) =>
  `${d.dossier.pd_nummer} saneren ${new Date().toISOString().slice(0, 10)}.${ext}`;

// ── Excel ── vier bladen: adressen, groepen, alle antwoorden per ronde, en het wijzigingslog.
export async function exporteerSaneerExcel(d: ExportData): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Wire Solutions";
  wb.created = new Date();

  const kop = (ws: ExcelJS.Worksheet, koppen: string[], breedtes: number[]) => {
    ws.addRow(koppen);
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0284C7" } };
    r.height = 20;
    r.alignment = { vertical: "middle" };
    breedtes.forEach((b, i) => { ws.getColumn(i + 1).width = b; });
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  const clusterVan = new Map(d.clusters.map((k) => [k.id, k]));
  // Het laatste antwoord per adres: dat is de stand van nu. De historie staat op blad 3.
  const laatste = new Map<string, (typeof d.responsen)[number]>();
  const rondeNr = new Map(d.ronden.map((r) => [r.id, r.nummer]));
  for (const r of d.responsen) {
    const huidig = laatste.get(r.adres_id);
    if (!huidig || (rondeNr.get(r.ronde_id) ?? 0) >= (rondeNr.get(huidig.ronde_id) ?? 0)) laatste.set(r.adres_id, r);
  }

  const ws = wb.addWorksheet("Adressen");
  kop(ws,
    ["Groep", "Straat", "Huisnr", "Toev.", "Postcode", "Plaats", "Bewoner", "Telefoon", "E-mail", "Antwoord", "Via", "Belstatus", "Uitvoeringsdatum", "Opmerking"],
    [24, 22, 8, 7, 11, 18, 22, 15, 24, 16, 10, 16, 16, 30]);
  for (const a of d.adressen) {
    const k = clusterVan.get(a.cluster_id);
    const r = laatste.get(a.id);
    ws.addRow([
      k?.naam || k?.postcode || "", a.straat, a.huisnummer, a.toevoeging, a.postcode, a.plaats,
      a.bewoner, a.telefoon, a.email,
      r ? ANTWOORD_INFO[r.antwoord]?.label ?? r.antwoord : "nog niet gesproken",
      r?.via ?? "", BELSTATUS_INFO[a.belstatus]?.label ?? a.belstatus,
      kortNL(k?.definitieve_datum ?? ""), a.opmerking,
    ]);
  }

  const ws2 = wb.addWorksheet("Groepen");
  kop(ws2, ["Groep", "Postcode", "Adressen", "Akkoord", "Uitvoeringsdatum", "Rondes", "Poster opgehangen"], [26, 11, 10, 10, 18, 9, 20]);
  for (const k of d.clusters) {
    const inGroep = d.adressen.filter((a) => a.cluster_id === k.id);
    const akkoord = inGroep.filter((a) => laatste.get(a.id)?.antwoord === "akkoord").length;
    const rondes = d.ronden.filter((r) => r.cluster_id === k.id).length;
    const taak = d.taken.find((t) => t.cluster_id === k.id);
    ws2.addRow([
      k.naam || k.postcode, k.postcode, inGroep.length, `${akkoord} van ${inGroep.length}`,
      kortNL(k.definitieve_datum), rondes, taak?.afgevinkt_op ? kortNL(taak.afgevinkt_op) : "nee",
    ]);
  }

  // Blad 3: elk antwoord uit elke ronde. Dit is waarom een nieuwe ronde niets kapotmaakt — alles
  // wat ooit gezegd is, staat er nog.
  const ws3 = wb.addWorksheet("Antwoorden per ronde");
  kop(ws3, ["Groep", "Ronde", "Voorgestelde datum", "Adres", "Bewoner", "Antwoord", "Via", "Door", "Tijdstip", "Opmerking"], [24, 8, 18, 26, 22, 16, 10, 24, 20, 30]);
  const adresVan = new Map(d.adressen.map((a) => [a.id, a]));
  const rondeVan = new Map(d.ronden.map((r) => [r.id, r]));
  for (const r of d.responsen) {
    const a = adresVan.get(r.adres_id);
    const ro = rondeVan.get(r.ronde_id);
    const k = a ? clusterVan.get(a.cluster_id) : undefined;
    ws3.addRow([
      k?.naam || k?.postcode || "", ro?.nummer ?? "", kortNL(ro?.voorgestelde_datum ?? ""),
      a ? adresTekst(a) : r.adres_id, a?.bewoner ?? "",
      ANTWOORD_INFO[r.antwoord]?.label ?? r.antwoord, r.via, r.door, r.tijdstip.replace("T", " ").slice(0, 16), r.opmerking,
    ]);
  }

  const ws4 = wb.addWorksheet("Wijzigingslog");
  kop(ws4, ["Tijdstip", "Gebeurtenis", "Van", "Naar", "Door"], [20, 22, 26, 26, 26]);
  for (const l of d.log) ws4.addRow([l.tijdstip.replace("T", " ").slice(0, 16), l.gebeurtenis, l.oud, l.nieuw, l.door]);

  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), bestandsnaam(d, "xlsx"));
}

// ── PDF ── de uitvoeringslijst: per dag welke groep, en welke adressen daarbij horen.
export function exporteerSaneerPdf(d: ExportData): void {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const PW = doc.internal.pageSize.getWidth();
  const PH = doc.internal.pageSize.getHeight();
  const M = 40;
  let y = 0;

  const koptekst = (vervolg = false) => {
    doc.setFillColor(MERK.r, MERK.g, MERK.b);
    doc.rect(0, 0, PW, 64, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold").setFontSize(15);
    doc.text(`Saneren ${d.dossier.pd_nummer}${vervolg ? " (vervolg)" : ""}`, M, 28);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.text([d.dossier.opdrachtgever, d.dossier.gebouw, d.dossier.regio].filter(Boolean).join("  ·  "), M, 44);
    doc.setTextColor(30, 41, 59);
    y = 90;
  };

  const nieuweBladzijde = () => { doc.addPage(); koptekst(true); };
  const ruimte = (n: number) => { if (y + n > PH - 50) nieuweBladzijde(); };

  koptekst();

  const laatste = new Map<string, (typeof d.responsen)[number]>();
  const rondeNr = new Map(d.ronden.map((r) => [r.id, r.nummer]));
  for (const r of d.responsen) {
    const h = laatste.get(r.adres_id);
    if (!h || (rondeNr.get(r.ronde_id) ?? 0) >= (rondeNr.get(h.ronde_id) ?? 0)) laatste.set(r.adres_id, r);
  }

  // Groepen op uitvoeringsdatum: dat is de volgorde waarin de ploeg werkt. Groepen zonder datum
  // staan achteraan — die zijn nog niet rond en horen op de lijst als "let op".
  const gesorteerd = [...d.clusters].sort((a, b) =>
    (a.definitieve_datum || "9999").localeCompare(b.definitieve_datum || "9999") || a.postcode.localeCompare(b.postcode));

  for (const k of gesorteerd) {
    const inGroep = d.adressen.filter((a) => a.cluster_id === k.id)
      .sort((a, b) => a.volgorde - b.volgorde);
    if (inGroep.length === 0) continue;

    ruimte(70);
    doc.setFillColor(k.definitieve_datum ? 240 : 254, k.definitieve_datum ? 249 : 243, k.definitieve_datum ? 255 : 199);
    doc.roundedRect(M, y, PW - M * 2, 34, 5, 5, "F");
    doc.setFont("helvetica", "bold").setFontSize(11);
    doc.text(k.naam || k.postcode, M + 12, y + 15);
    doc.setFont("helvetica", "normal").setFontSize(9);
    doc.setTextColor(GRIJS.r, GRIJS.g, GRIJS.b);
    doc.text(
      k.definitieve_datum
        ? `${datumNL(k.definitieve_datum)} · ${k.starttijd || d.dossier.starttijd || "08:00"}–16:00 · ${inGroep.length} adressen`
        : `NOG GEEN DATUM · ${inGroep.length} adressen`,
      M + 12, y + 27);
    doc.setTextColor(30, 41, 59);
    y += 44;

    doc.setFontSize(9);
    for (const a of inGroep) {
      ruimte(16);
      const r = laatste.get(a.id);
      const status = r ? ANTWOORD_INFO[r.antwoord]?.kort ?? r.antwoord : "niet gesproken";
      doc.setFont("helvetica", "bold");
      doc.text(adresTekst(a), M + 12, y);
      doc.setFont("helvetica", "normal");
      doc.text([a.bewoner, a.telefoon].filter(Boolean).join(" · ").slice(0, 44), M + 190, y);
      doc.setTextColor(r?.antwoord === "akkoord" ? 22 : 148, r?.antwoord === "akkoord" ? 163 : 96, r?.antwoord === "akkoord" ? 74 : 43);
      doc.text(status, PW - M - 12, y, { align: "right" });
      doc.setTextColor(30, 41, 59);
      y += 14;
    }
    y += 10;
  }

  const totaal = doc.getNumberOfPages();
  for (let p = 1; p <= totaal; p++) {
    doc.setPage(p);
    doc.setFontSize(8).setTextColor(GRIJS.r, GRIJS.g, GRIJS.b);
    doc.text(`Wire Solutions · ${new Date().toLocaleDateString("nl-NL")} · pagina ${p} van ${totaal}`, PW / 2, PH - 24, { align: "center" });
  }

  doc.save(bestandsnaam(d, "pdf"));
}

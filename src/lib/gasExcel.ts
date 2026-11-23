// Excel-exports voor Gasleidingen: de planning voor Stedin en de adreslijst met "brief afgeleverd".
import type { GasAdres, GasProject } from "./types";
import { GAS_BLOKKEN, sorteerAdressen } from "./gas";

const bestandsdeel = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "gasleidingen";
const datumNL = (s?: string) => (s ? new Date(s + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" }) : "");
const ORANJE = "FFEA580C";

async function bewaar(wb: import("exceljs").Workbook, naam: string) {
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function kop(ws: import("exceljs").Worksheet, titel: string, sub: string, kolommen: { header: string; width: number }[]) {
  ws.columns = kolommen.map((k) => ({ width: k.width }));
  ws.mergeCells(1, 1, 1, kolommen.length);
  ws.getCell(1, 1).value = titel;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.mergeCells(2, 1, 2, kolommen.length);
  ws.getCell(2, 1).value = sub;
  ws.getCell(2, 1).font = { color: { argb: "FF64748B" } };
  const r = ws.getRow(4);
  kolommen.forEach((k, i) => { r.getCell(i + 1).value = k.header; });
  r.font = { bold: true, color: { argb: "FFFFFFFF" } };
  r.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ORANJE } }; });
  ws.views = [{ state: "frozen", ySplit: 4 }];
}

export async function exporteerGasPlanning(p: GasProject, adressen: GasAdres[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Planning");
  kop(ws, `Planning vervangen gasleidingen – ${p.naam}`, `${p.pdNummer ? `${p.pdNummer} · ` : ""}${p.ploegen} ${p.ploegen === 1 ? "ploeg" : "ploegen"} · per tijdsblok ${p.ploegen} ${p.ploegen === 1 ? "afspraak" : "afspraken"}`,
    [{ header: "Datum", width: 18 }, { header: "Tijdsblok", width: 14 }, { header: "Straat", width: 28 }, { header: "Huisnr.", width: 9 }, { header: "Toev.", width: 7 }, { header: "Postcode", width: 10 }, { header: "Plaats", width: 18 }, { header: "Telefoon", width: 15 }, { header: "Opmerking", width: 36 }]);
  const volg = (b?: string) => GAS_BLOKKEN.findIndex((x) => x.key === b);
  const lijst = adressen.filter((a) => a.status === "afgesproken" && a.datum).sort((a, b) => (a.datum ?? "").localeCompare(b.datum ?? "") || volg(a.blok) - volg(b.blok) || sorteerAdressen(a, b));
  let vorige = "";
  for (const a of lijst) {
    const r = ws.addRow([a.datum === vorige ? "" : datumNL(a.datum), GAS_BLOKKEN.find((x) => x.key === a.blok)?.label ?? "", a.straat, a.huisnummer, a.toevoeging, a.postcode, a.plaats, a.telefoon ?? "", a.opmerking ?? ""]);
    if (a.datum !== vorige) r.getCell(1).font = { bold: true };
    vorige = a.datum ?? "";
  }
  await bewaar(wb, `Planning_Gasleidingen_${bestandsdeel(p.naam)}.xlsx`);
}

export async function exporteerGasAdreslijst(p: GasProject, adressen: GasAdres[]) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Adreslijst");
  kop(ws, `Adreslijst – Vervangen gas, ${p.naam}`, `${adressen.length} adressen · stand ${new Date().toLocaleDateString("nl-NL")}`,
    [{ header: "Straat", width: 28 }, { header: "Huisnr.", width: 9 }, { header: "Toev.", width: 7 }, { header: "Postcode", width: 10 }, { header: "Plaats", width: 18 }, { header: "Brief afgeleverd", width: 16 }, { header: "Status", width: 16 }, { header: "Afspraak", width: 26 }]);
  const STATUS: Record<string, string> = { open: "Nog afspreken", niet_thuis: "Niet thuis", afgesproken: "Afgesproken", weigert: "Weigert" };
  for (const a of [...adressen].sort((x, y) => x.volgorde - y.volgorde)) {
    const r = ws.addRow([a.straat, a.huisnummer, a.toevoeging, a.postcode, a.plaats, a.briefOp ? "ja" : "nee", STATUS[a.status] ?? "", a.status === "afgesproken" && a.datum ? `${datumNL(a.datum)} ${GAS_BLOKKEN.find((x) => x.key === a.blok)?.kort ?? ""}` : ""]);
    r.getCell(6).font = { bold: true, color: { argb: a.briefOp ? "FF16A34A" : "FFDC2626" } };
  }
  await bewaar(wb, `Adreslijst_Gasleidingen_${bestandsdeel(p.naam)}.xlsx`);
}

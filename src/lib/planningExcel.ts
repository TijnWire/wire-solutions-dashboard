import * as XLSX from "xlsx-js-style";
import type { Project, User, Weekplanning } from "./types";
import { datumKort, dagnaam } from "./planning";

// Kolom-indeling (0-gebaseerd). Kolom A is een smalle marge; data staat in B..K.
const KOPPEN = ["Week", "tijd", "Bijzonderheden", "Adres", "Huisnummer", "Tel nr", "Monteur", "Werkzaamheden DNA", "Straatwerk tegels/klinkers", "aantal m2"];
const KOL_TIJD = 2;
const RIJEN_PER_DAG = 9; // 1 gele dagrij + 8 sloten
const HEADER_RIJ = 3;
const EERSTE_DAG_RIJ = 4;

const ZWART = "000000";
const WIT = "FFFFFF";
const GEEL = "FFFF00";
const KOPGRIJS = "D9D9D9";
const thin = { style: "thin", color: { rgb: ZWART } };
const RAND = { top: thin, bottom: thin, left: thin, right: thin };

const STIJL_STEDIN = { fill: { fgColor: { rgb: ZWART } }, font: { bold: true, sz: 18, color: { rgb: WIT } }, alignment: { horizontal: "center", vertical: "center" } };
const STIJL_TITEL = { font: { italic: true, sz: 14, color: { rgb: ZWART } }, alignment: { horizontal: "center", vertical: "center" } };
const STIJL_JAAR = { font: { bold: true, sz: 14, color: { rgb: ZWART } }, alignment: { horizontal: "right", vertical: "center" } };
const STIJL_KOP = { fill: { fgColor: { rgb: KOPGRIJS } }, font: { bold: true, sz: 11, color: { rgb: ZWART } }, alignment: { horizontal: "center", vertical: "center", wrapText: true }, border: RAND };
const STIJL_DAG = { fill: { fgColor: { rgb: GEEL } }, font: { bold: true, sz: 11, color: { rgb: ZWART } }, alignment: { horizontal: "left", vertical: "center" }, border: RAND };
const STIJL_CEL = { font: { sz: 10, color: { rgb: ZWART } }, alignment: { horizontal: "left", vertical: "center", wrapText: true }, border: RAND };
const STIJL_TIJD = { font: { sz: 10, bold: true, color: { rgb: ZWART } }, alignment: { horizontal: "center", vertical: "center" }, border: RAND };

function styleCel(ws: XLSX.WorkSheet, r: number, c: number, stijl: object, waarde: string) {
  const adres = XLSX.utils.encode_cell({ r, c });
  const w = ws as Record<string, { t: string; v: string; s?: object }>;
  if (!w[adres]) w[adres] = { t: "s", v: waarde };
  w[adres].s = stijl;
}

const monteurNaam = (slot: { monteurId: string; monteurVrij: string }, users: User[]) =>
  slot.monteurVrij.trim() || users.find((u) => u.id === slot.monteurId)?.naam || "";

// Genereert een .xlsx die de Stedin-planningtemplate nabootst (gele dagrijen, vetgedrukte koppen, STEDIN-blok).
export function exporteerPlanningExcel(planning: Weekplanning, project: Project, users: User[]): void {
  const totaalRijen = EERSTE_DAG_RIJ + planning.dagen.length * RIJEN_PER_DAG;
  const data: string[][] = Array.from({ length: Math.max(totaalRijen, HEADER_RIJ + 1) }, () => Array(11).fill(""));

  // Titelblok
  data[0][0] = "STEDIN";
  data[0][6] = "Planning";
  data[0][10] = String(planning.jaar);
  // Koprij (B..K)
  KOPPEN.forEach((k, i) => (data[HEADER_RIJ][i + 1] = k));

  // Dagen + sloten
  planning.dagen.forEach((dag, di) => {
    const dagRij = EERSTE_DAG_RIJ + di * RIJEN_PER_DAG;
    data[dagRij][1] = datumKort(dag.datum);
    data[dagRij][2] = dagnaam(dag.datum);
    data[dagRij][8] = dag.dna;
    dag.slots.forEach((slot, si) => {
      const r = dagRij + 1 + si;
      data[r][2] = slot.tijd;
      data[r][3] = slot.bijzonderheden;
      data[r][4] = slot.adres;
      data[r][5] = slot.huisnummer;
      data[r][6] = slot.telefoon;
      data[r][7] = monteurNaam(slot, users);
      data[r][9] = slot.straatwerk;
      data[r][10] = slot.m2;
    });
  });

  const ws = XLSX.utils.aoa_to_sheet(data);

  // Stijlen
  styleCel(ws, 0, 0, STIJL_STEDIN, data[0][0]);
  styleCel(ws, 0, 6, STIJL_TITEL, data[0][6]);
  styleCel(ws, 0, 10, STIJL_JAAR, data[0][10]);
  for (let c = 1; c <= 10; c++) styleCel(ws, HEADER_RIJ, c, STIJL_KOP, data[HEADER_RIJ][c]);

  planning.dagen.forEach((_, di) => {
    const dagRij = EERSTE_DAG_RIJ + di * RIJEN_PER_DAG;
    for (let c = 1; c <= 10; c++) styleCel(ws, dagRij, c, STIJL_DAG, data[dagRij][c]);
    for (let s = 1; s <= 8; s++) {
      const r = dagRij + s;
      for (let c = 1; c <= 10; c++) styleCel(ws, r, c, c === KOL_TIJD ? STIJL_TIJD : STIJL_CEL, data[r][c]);
    }
  });

  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, // STEDIN-blok
    { s: { r: 0, c: 6 }, e: { r: 0, c: 7 } }, // "Planning"
  ];
  ws["!cols"] = [{ wch: 3 }, { wch: 9 }, { wch: 9 }, { wch: 22 }, { wch: 18 }, { wch: 11 }, { wch: 13 }, { wch: 14 }, { wch: 16 }, { wch: 20 }, { wch: 10 }];
  ws["!rows"] = Array.from({ length: totaalRijen }, (_, r) => (r === 0 ? { hpt: 32 } : r === HEADER_RIJ ? { hpt: 30 } : { hpt: 18 }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planning");
  const naam = `Stedin-planning-${(project.naam || "project").replace(/[^\w-]+/g, "_")}-${planning.jaar}.xlsx`;
  XLSX.writeFile(wb, naam, { bookType: "xlsx" });
}

import * as XLSX from "xlsx-js-style";

// ── Wire Solutions huisstijl-kleuren (gelijk aan urenstaatExcel.ts) ──
const BRAND = "ea580c";        // brand-600 oranje
const BRAND_LICHT = "fff7ed";  // brand-50, zachte accentvulling (zebra)
const INK = "1e293b";          // ink-800 tekst
const WIT = "FFFFFF";
const rand = { style: "thin" as const, color: { rgb: "e2e5ea" } }; // ink-200
const alleRanden = { top: rand, bottom: rand, left: rand, right: rand };

const enc = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

// Getallen rechts uitlijnen, tekst links — netjes en leesbaar.
const isGetal = (v: unknown) => typeof v === "number" || (typeof v === "string" && v.trim() !== "" && !isNaN(Number(v.replace(",", "."))) && /^-?[\d.,]+$/.test(v.trim()));

export type DocExportMeta = {
  bedrijfsnaam: string;
  titel: string;        // bv. "Afspraken"
  bestandsnaam: string; // zonder .xlsx
  opsteller?: string;
};

// Nette, uitgelijnde Excel-export in Wire Solutions huisstijl.
// - Oranje titelbalk met bedrijfsnaam + merkband
// - Oranje kolomkoppen, wit vet, gecentreerd
// - Zebra-rijen (om-en-om zacht oranje), dunne randen overal
// - Getallen rechts, tekst links; kolombreedtes op basis van de inhoud
// - Bevroren koprij zodat je bij het scrollen de kolomnamen blijft zien
export function exporteerDocumentenExcel(rijen: Record<string, unknown>[], meta: DocExportMeta): void {
  const kolommen = rijen.length ? Object.keys(rijen[0]) : [];
  const NKOL = Math.max(kolommen.length, 1);

  const aoa: (string | number | null)[][] = [];
  const stijlen: { addr: string; s: Record<string, unknown> }[] = [];
  const merges: XLSX.Range[] = [];
  const setStijl = (r: number, c: number, s: Record<string, unknown>) => stijlen.push({ addr: enc(r, c), s });

  // ── Koptekst ──
  aoa.push([meta.bedrijfsnaam]);
  setStijl(0, 0, { font: { bold: true, sz: 18, color: { rgb: BRAND } } });
  merges.push({ s: { r: 0, c: 0 }, e: { r: 0, c: NKOL - 1 } });

  aoa.push([meta.titel]);
  setStijl(1, 0, { font: { bold: true, sz: 12, color: { rgb: INK } } });
  merges.push({ s: { r: 1, c: 0 }, e: { r: 1, c: NKOL - 1 } });

  // Oranje merkband over de volle breedte
  aoa.push([""]);
  for (let c = 0; c < NKOL; c++) setStijl(2, c, { fill: { fgColor: { rgb: BRAND } } });
  merges.push({ s: { r: 2, c: 0 }, e: { r: 2, c: NKOL - 1 } });

  // Datum + aantal + opsteller
  const nu = new Date().toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
  const infoRij = aoa.length;
  const rechts = meta.opsteller ? `Opsteller: ${meta.opsteller}` : "";
  aoa.push([`Geëxporteerd: ${nu} · ${rijen.length} regel${rijen.length === 1 ? "" : "s"}`, ...Array(Math.max(0, NKOL - 2)).fill(""), rechts]);
  setStijl(infoRij, 0, { font: { sz: 10, color: { rgb: "767b86" } } });
  if (NKOL >= 2) setStijl(infoRij, NKOL - 1, { font: { sz: 10, color: { rgb: "767b86" } }, alignment: { horizontal: "right" } });
  if (NKOL >= 2) merges.push({ s: { r: infoRij, c: 0 }, e: { r: infoRij, c: NKOL - 2 } });

  aoa.push([]); // lege scheidingsrij
  const kopRij = aoa.length;

  // ── Kolomkoppen (oranje) ──
  aoa.push(kolommen.length ? kolommen : ["(geen gegevens)"]);
  for (let c = 0; c < NKOL; c++) {
    setStijl(kopRij, c, {
      font: { bold: true, sz: 10, color: { rgb: WIT } },
      fill: { fgColor: { rgb: BRAND } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: alleRanden,
    });
  }

  // ── Datarijen met zebra + uitlijning ──
  rijen.forEach((rij, idx) => {
    const r = kopRij + 1 + idx;
    const waarden = kolommen.map((k) => {
      const v = rij[k];
      return v == null ? "" : (typeof v === "number" ? v : String(v));
    });
    aoa.push(waarden as (string | number)[]);
    const zebra = idx % 2 === 1;
    for (let c = 0; c < NKOL; c++) {
      const v = kolommen.length ? rij[kolommen[c]] : "";
      setStijl(r, c, {
        font: { sz: 10, color: { rgb: INK } },
        fill: zebra ? { fgColor: { rgb: BRAND_LICHT } } : undefined,
        alignment: { horizontal: isGetal(v) ? "right" : "left", vertical: "center" },
        border: alleRanden,
      });
    }
  });

  // ── Worksheet opbouwen ──
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Kolombreedtes op basis van kop + inhoud (netjes, met minimum/maximum)
  ws["!cols"] = (kolommen.length ? kolommen : ["(geen gegevens)"]).map((k) => {
    const max = Math.max(k.length, ...rijen.map((r) => String(r[k] ?? "").length));
    return { wch: Math.min(Math.max(max + 2, 10), 48) };
  });

  ws["!merges"] = merges;
  // Nette rijhoogtes
  const rows: { hpt: number }[] = [];
  rows[0] = { hpt: 24 };
  rows[kopRij] = { hpt: 22 };
  ws["!rows"] = rows;

  for (const { addr, s } of stijlen) {
    if (!ws[addr]) ws[addr] = { t: "s", v: "" };
    (ws[addr] as { s?: unknown }).s = s;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, meta.titel.slice(0, 31));
  const veiligeNaam = meta.bestandsnaam.replace(/[\\/:*?"<>|]/g, " ").trim();
  XLSX.writeFile(wb, `${veiligeNaam}.xlsx`);
}

// Oude, kale export blijft bestaan voor terugval / andere aanroepen.
export function exporteerExcel(
  rijen: Record<string, unknown>[],
  bestandsnaam: string,
  sheetnaam = "Blad1"
) {
  const ws = XLSX.utils.json_to_sheet(rijen);
  const kolommen = rijen.length ? Object.keys(rijen[0]) : [];
  ws["!cols"] = kolommen.map((k) => {
    const max = Math.max(k.length, ...rijen.map((r) => String(r[k] ?? "").length));
    return { wch: Math.min(Math.max(max + 2, 10), 50) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetnaam);
  const naam = bestandsnaam.endsWith(".xlsx") ? bestandsnaam : `${bestandsnaam}.xlsx`;
  XLSX.writeFile(wb, naam);
}

// Een PDF in het sleepvak: zonder AI omzetten naar hetzelfde tekstraster als een Excel-bestand, zodat de
// gewone import (kolommen herkennen, postcodes opzoeken, dubbele eruit) er gewoon overheen kan.
// Drie soorten PDF herkennen we, in deze volgorde:
//  1. Een "Checklist Consument Saneren" → het adres + de bewonerstabel (en de hele checklist zelf, die we
//     apart bewaren zodat hij bij het dossier terug te vinden is).
//  2. Stedin-afschakelbrieven ("Aan de bewoners van …") → één adres per brief.
//  3. Elke andere PDF met een tabel → regels en kolommen op basis van waar de tekst op de pagina staat.
// Een gescande PDF (alleen een plaatje) heeft geen tekst; daarvoor is de foto-knop met AI.
import { laadPdfjs } from "./pdfjsLaden";
import type { Mapping, Raster } from "./bodemImport";
import { leesChecklistTekstPdf, type ChecklistGegevens } from "./checklistScan";
import { leesPdfTekst } from "./extract/pdfTekst";

export type PdfRasterUitkomst =
  | { ok: true; raster: Raster; mapping?: Mapping; soort: "checklist" | "brieven" | "tabel"; checklist?: ChecklistGegevens }
  | { ok: false; fout: string };

const KOP = ["Straat", "Huisnummer", "Toevoeging", "Postcode", "Plaats", "Bewoner", "Telefoon", "Opmerking"];
const VASTE_MAPPING: Mapping = { straat: 0, huisnummer: 1, toevoeging: 2, postcode: 3, plaats: 4, bewoner: 5, telefoon: 6, opmerking: 7 };
const netPc = (p: string) => p.replace(/\s+/g, "").toUpperCase().replace(/^(\d{4})([A-Z]{2})$/, "$1 $2");

// "Monnetlaan 94 - 116, Utrecht" → straat + plaats.
function splitsAdres(adres: string): { straat: string; plaats: string } {
  const [voor, ...na] = adres.split(",");
  const m = voor.trim().match(/^(.+?)\s+\d/);
  return { straat: (m ? m[1] : voor).trim(), plaats: na.join(",").trim() };
}
// "12A" → ["12", "A"]
function splitsNummer(nr: string): [string, string] {
  const m = nr.trim().match(/^(\d+)\s*[-]?\s*(.*)$/);
  return m ? [m[1], m[2].trim()] : [nr.trim(), ""];
}


// Route 3: tekst op positie → regels en kolommen.
async function tabelUitPdf(file: File): Promise<string[][]> {
  const pdfjs = await laadPdfjs();
  const taak = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await taak.promise;
  type Stuk = { x: number; x1: number; y: number; t: string };
  const regels: Stuk[][] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pagina = await doc.getPage(p);
    const inhoud = await pagina.getTextContent();
    const stukken: Stuk[] = [];
    for (const it of inhoud.items as { str?: string; transform?: number[]; width?: number }[]) {
      const t = (it.str ?? "").trim();
      if (!t || !it.transform) continue;
      stukken.push({ x: it.transform[4], x1: it.transform[4] + (it.width ?? 0), y: -it.transform[5], t });
    }
    stukken.sort((a, b) => a.y - b.y || a.x - b.x);
    let huidig: Stuk[] = [];
    let yRegel = -Infinity;
    for (const s of stukken) {
      if (Math.abs(s.y - yRegel) > 3) { if (huidig.length) regels.push(huidig); huidig = []; yRegel = s.y; }
      huidig.push(s);
    }
    if (huidig.length) regels.push(huidig);
  }
  await taak.destroy();

  // Stukken die vlak naast elkaar staan zijn één cel ("Dorpsstraat" + "12").
  const cellen = regels.map((r) => {
    const uit: Stuk[] = [];
    for (const s of r.sort((a, b) => a.x - b.x)) {
      const vorige = uit[uit.length - 1];
      if (vorige && s.x - vorige.x1 < 5) { vorige.t += " " + s.t; vorige.x1 = s.x1; } else uit.push({ ...s });
    }
    return uit;
  });
  // Kolommen: de begin-x van alle cellen samenvoegen tot vaste kolomposities.
  const xs = cellen.flat().map((c) => c.x).sort((a, b) => a - b);
  const kolommen: number[] = [];
  for (const x of xs) if (!kolommen.length || x - kolommen[kolommen.length - 1] > 14) kolommen.push(x);
  const kolomVan = (x: number) => kolommen.reduce((best, k, i) => (Math.abs(k - x) < Math.abs(kolommen[best] - x) ? i : best), 0);
  return cellen.map((r) => {
    const rij = Array<string>(kolommen.length).fill("");
    for (const c of r) { const i = kolomVan(c.x); rij[i] = rij[i] ? `${rij[i]} ${c.t}` : c.t; }
    return rij;
  }).filter((r) => r.some(Boolean));
}

export async function leesPdfAlsRaster(file: File): Promise<PdfRasterUitkomst> {
  // 1. Checklist consument saneren
  const cl = await leesChecklistTekstPdf(file);
  if (cl.ok) {
    const { straat, plaats } = splitsAdres(cl.velden.adres ?? "");
    const postcode = netPc(cl.velden.postcode ?? "");
    const rijen = cl.bewoners
      .filter((b) => b.huisnr.trim())
      .map((b) => { const [nr, toev] = splitsNummer(b.huisnr); return [straat, nr, toev, postcode, plaats, b.naam, b.telefoon, b.opmerking]; });
    if (!rijen.length) return { ok: false, fout: "In deze checklist staan geen huisnummers." };
    return { ok: true, soort: "checklist", raster: { rijen: [KOP, ...rijen], bladNamen: ["Checklist"], blad: "Checklist" }, mapping: VASTE_MAPPING, checklist: { velden: cl.velden, bewoners: cl.bewoners, opmerkingen: cl.opmerkingen } };
  }
  // 2. Stedin-afschakelbrieven
  const br = await leesPdfTekst(file);
  if (br.ok && br.rijen.length) {
    const rijen = br.rijen.map((r) => [r.straat, r.huisnummer, r.toevoeging, r.postcode, r.plaats, r.naam, r.telefoon, r.notitie]);
    return { ok: true, soort: "brieven", raster: { rijen: [KOP, ...rijen], bladNamen: ["Brieven"], blad: "Brieven" }, mapping: VASTE_MAPPING };
  }
  // 3. Een tabel
  try {
    const rijen = await tabelUitPdf(file);
    if (rijen.length < 2) return { ok: false, fout: "In deze PDF staat geen leesbare tekst. Is het een scan of foto? Gebruik dan de foto-knop (AI)." };
    return { ok: true, soort: "tabel", raster: { rijen, bladNamen: ["PDF"], blad: "PDF" } };
  } catch (e) {
    return { ok: false, fout: `Kon de PDF niet lezen${e instanceof Error && e.message ? ` (${e.message})` : ""}.` };
  }
}

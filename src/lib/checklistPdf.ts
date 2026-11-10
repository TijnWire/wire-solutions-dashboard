// Een ingevulde "Checklist Consument Saneren" maken op het lege formulier (public/…blanco.pdf).
// Tekst komt in de invulvakken; bij keuzevelden zetten we een cirkel om de gekozen optie, zoals je dat
// met de pen zou doen. Meer dan 12 bewoners? Dan volgt een extra blad met dezelfde kop.
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { CHECKLIST_OPMERKINGEN, CHECKLIST_PAGINA, CHECKLIST_TABEL, CHECKLIST_VELDEN } from "./checklistVelden";
import type { SaneerChecklist } from "./types";

const SJABLOON = "/Checklist Consument Saneren blanco.pdf";
const INKT = rgb(0.07, 0.2, 0.55); // donkerblauw, als balpen
const H = CHECKLIST_PAGINA.hoogte;

// Tekst links in een vak, verkleind tot hij past (min. 6 pt), verticaal gecentreerd.
function zetTekst(page: PDFPage, font: PDFFont, tekst: string, [x0, top, x1, bottom]: readonly number[], opts: { midden?: boolean; max?: number } = {}) {
  const t = tekst.replace(/\s+/g, " ").trim();
  if (!t) return;
  const ruimte = x1 - x0 - 6;
  let grootte = Math.min(opts.max ?? 9.5, (bottom - top) * 0.62);
  while (grootte > 6 && font.widthOfTextAtSize(t, grootte) > ruimte) grootte -= 0.25;
  let s = t;
  while (s.length > 1 && font.widthOfTextAtSize(s, grootte) > ruimte) s = s.slice(0, -2) + "…";
  const breedte = font.widthOfTextAtSize(s, grootte);
  const x = opts.midden ? x0 + (x1 - x0 - breedte) / 2 : x0 + 3;
  const yMidden = (top + bottom) / 2;
  page.drawText(s, { x, y: H - yMidden - grootte * 0.35, size: grootte, font, color: INKT });
}

// Meerdere regels in het grote opmerkingenvak.
function zetAlinea(page: PDFPage, font: PDFFont, tekst: string, [x0, top, x1, bottom]: readonly number[]) {
  const grootte = 9.5, regel = 12.5, breed = x1 - x0 - 12;
  let y = top + 16;
  for (const alinea of tekst.split(/\n/)) {
    let huidig = "";
    for (const woord of alinea.split(/\s+/).filter(Boolean)) {
      const proef = huidig ? `${huidig} ${woord}` : woord;
      if (font.widthOfTextAtSize(proef, grootte) > breed && huidig) {
        if (y > bottom - 6) return;
        page.drawText(huidig, { x: x0 + 6, y: H - y, size: grootte, font, color: INKT });
        y += regel; huidig = woord;
      } else huidig = proef;
    }
    if (y > bottom - 6) return;
    if (huidig) page.drawText(huidig, { x: x0 + 6, y: H - y, size: grootte, font, color: INKT });
    y += regel;
  }
}

function omcirkel(page: PDFPage, o: { x0: number; x1: number; y0: number; y1: number }) {
  const cx = (o.x0 + o.x1) / 2, cy = (o.y0 + o.y1) / 2;
  page.drawEllipse({ x: cx, y: H - cy, xScale: (o.x1 - o.x0) / 2 + 2.6, yScale: (o.y1 - o.y0) / 2 + 2, borderColor: INKT, borderWidth: 1.1 });
}

function vulKop(page: PDFPage, font: PDFFont, vet: PDFFont, c: SaneerChecklist) {
  for (const v of CHECKLIST_VELDEN) {
    const w = (c.velden[v.key] ?? "").trim();
    if (!w) continue;
    if (v.soort === "keuze") {
      const o = v.opties?.find((x) => x.label === w);
      if (o) omcirkel(page, o);
    } else {
      zetTekst(page, v.key === "datumUitvoering" ? vet : font, w, v.cel, { midden: v.key === "datumUitvoering" || v.key === "adres" || v.key === "postcode", max: v.key === "datumUitvoering" ? 12 : 9.5 });
    }
  }
}

export async function maakChecklistPdf(c: SaneerChecklist): Promise<Blob> {
  const r = await fetch(encodeURI(SJABLOON));
  if (!r.ok) throw new Error(`Het lege formulier kon niet worden geladen (${r.status}).`);
  const sjabloon = await PDFDocument.load(await r.arrayBuffer());
  const uit = await PDFDocument.create();
  const font = await uit.embedFont(StandardFonts.Helvetica);
  const vet = await uit.embedFont(StandardFonts.HelveticaBold);

  const { top, regelhoogte, regels, kolommen } = CHECKLIST_TABEL;
  const bewoners = c.bewoners.filter((b) => b.huisnr || b.naam || b.telefoon || b.opmerking);
  const bladen = Math.max(1, Math.ceil(bewoners.length / regels));
  for (let blad = 0; blad < bladen; blad++) {
    const [page] = await uit.copyPages(sjabloon, [0]);
    uit.addPage(page);
    vulKop(page, font, vet, c);
    bewoners.slice(blad * regels, (blad + 1) * regels).forEach((b, i) => {
      const t0 = top + i * regelhoogte, t1 = t0 + regelhoogte;
      zetTekst(page, font, b.huisnr, [kolommen.huisnr[0], t0, kolommen.huisnr[1], t1], { midden: true });
      zetTekst(page, font, b.naam, [kolommen.naam[0], t0, kolommen.naam[1], t1], { midden: true });
      zetTekst(page, font, b.telefoon, [kolommen.telefoon[0], t0, kolommen.telefoon[1], t1]);
      zetTekst(page, font, b.opmerking, [kolommen.opmerking[0], t0, kolommen.opmerking[1], t1]);
    });
    if (blad === 0 && c.opmerkingen.trim()) zetAlinea(page, font, c.opmerkingen, CHECKLIST_OPMERKINGEN);
    if (bladen > 1) page.drawText(`Blad ${blad + 1} van ${bladen}`, { x: 500, y: 16, size: 8, font, color: rgb(0.4, 0.4, 0.4) });
  }
  const bytes = await uit.save();
  return new Blob([bytes as BlobPart], { type: "application/pdf" });
}

export function checklistBestandsnaam(c: SaneerChecklist): string {
  const basis = (c.velden.adres || c.velden.postcode || "checklist").replace(/[\\/:*?"<>|]+/g, " ").replace(/\s+/g, "_").slice(0, 60);
  return `Checklist_${basis}.pdf`;
}

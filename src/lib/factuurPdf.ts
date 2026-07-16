import type { Factuur, Bedrijf } from "./types";

export const euro = (n: number) =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

// jsPDF kon de smalle niet-afbreekspatie (U+202F) van Intl niet aan; pdf-lib (WinAnsi) ook niet → normaliseren.
const schoonEuro = (n: number) => euro(n).replace(/[  ]/g, " ");

export function factuurTotalen(f: Factuur) {
  const subtotaal = f.regels.reduce((s, r) => s + r.aantal * r.prijs, 0);
  const btw = subtotaal * (f.btwPercentage / 100);
  return { subtotaal, btw, totaal: subtotaal + btw };
}

const PH = 842; // A4-hoogte in punten (zoals het sjabloon)

// De factuur-template (briefpapier mét logo, lijnpatroon en footer) zit als base64 in de app
// (src/lib/factuurSjabloon.ts). We plaatsen de factuurgegevens er als vector overheen — exact zoals
// het ingevulde voorbeeld in de public-map. Geen netwerk-fetch → werkt altijd, op laptop én mobiel.
async function laadSjabloon(): Promise<Uint8Array | null> {
  try {
    const { FACTUUR_SJABLOON_B64 } = await import("./factuurSjabloon");
    const bin = atob(FACTUUR_SJABLOON_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.length && bytes[0] === 0x25 ? bytes : null; // 0x25 = '%' (start van %PDF)
  } catch {
    return null;
  }
}

async function maakFactuurPdfBytes(f: Factuur): Promise<Uint8Array> {
  const sjabloon = await laadSjabloon();
  if (!sjabloon) throw new Error("Factuursjabloon kon niet worden geladen");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const DONKER = rgb(0.149, 0.165, 0.212);

  const pdf = await PDFDocument.load(sjabloon);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const page = pdf.getPage(0);

  const SZ = 10;
  const tekst = (s: string, x: number, yTop: number, opts?: { bold?: boolean; size?: number }) =>
    page.drawText(s, { x, y: PH - yTop, size: opts?.size ?? SZ, font: opts?.bold ? bold : font, color: DONKER });
  const rechts = (s: string, xR: number, yTop: number, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? SZ;
    const fnt = opts?.bold ? bold : font;
    page.drawText(s, { x: xR - fnt.widthOfTextAtSize(s, size), y: PH - yTop, size, font: fnt, color: DONKER });
  };
  const midden = (s: string, xc: number, yTop: number, opts?: { bold?: boolean; size?: number }) => {
    const size = opts?.size ?? SZ;
    const fnt = opts?.bold ? bold : font;
    page.drawText(s, { x: xc - fnt.widthOfTextAtSize(s, size) / 2, y: PH - yTop, size, font: fnt, color: DONKER });
  };
  const lijn = (x0: number, x1: number, yTop: number, dik = 0.5) =>
    page.drawLine({ start: { x: x0, y: PH - yTop }, end: { x: x1, y: PH - yTop }, thickness: dik, color: DONKER });

  // Kolommen (rechterrand voor uitgelijnde bedragen) — opgemeten in het voorbeeld
  const xL = 39.5;
  const aantalMid = 360.4 + bold.widthOfTextAtSize("Aantal", SZ) / 2; // midden van de "Aantal"-kop
  const xTariefR = 468, xBedragR = 530;

  // ── Geadresseerde (klant) — links, baselines uit het voorbeeld ──
  const klant = [f.klantNaam, f.afdeling ? `Afdeling ${f.afdeling}` : "", f.tav ? `T.a.v. ${f.tav}` : "", f.klantAdres, f.klantPostcodePlaats].filter(Boolean);
  klant.forEach((r, i) => tekst(r, 36, 189.5 + i * 12.1));

  // ── Metadata — rechts (label + waarde) ──
  const meta: [string, string][] = [];
  if (f.relatienummer) meta.push(["Relatienummer:", f.relatienummer]);
  meta.push(["Factuurnummer:", f.nummer]);
  const [jr, mnd, dg] = f.datum.slice(0, 10).split("-");
  meta.push(["Datum:", dg && mnd && jr ? `${dg}-${mnd}-${jr}` : f.datum]);
  meta.forEach(([label, waarde], i) => {
    const y = 250.2 + i * 12.3;
    tekst(label, 355.1, y);
    tekst(waarde, 461.5, y);
  });

  // ── Tabelkop ──
  lijn(36, 559, 302);
  tekst("Omschrijving", 195.5, 316.2, { bold: true });
  tekst("Aantal", 360.4, 316.2, { bold: true });
  tekst("Tarief", 439.2, 316.2, { bold: true });
  lijn(36, 559, 323);

  // ── PD-nummer als kopregel ──
  let yTop = 357.9;
  if (f.pdNummer) {
    tekst(f.pdNummer, xL, yTop, { bold: true });
    yTop = 384.5;
  }

  // ── Regels: omschrijving · aantal · tarief · bedrag ──
  const wrap = (s: string, maxW: number): string[] => {
    const woorden = (s || "").split(/\s+/).filter(Boolean);
    if (!woorden.length) return [""];
    const regels: string[] = [];
    let r = "";
    for (const w of woorden) {
      const test = r ? `${r} ${w}` : w;
      if (font.widthOfTextAtSize(test, SZ) > maxW && r) { regels.push(r); r = w; }
      else r = test;
    }
    if (r) regels.push(r);
    return regels;
  };
  for (const r of f.regels) {
    const oms = wrap(r.omschrijving, 300);
    oms.forEach((regel, i) => tekst(regel, xL, yTop + i * 12.1));
    midden(String(r.aantal), aantalMid, yTop);
    rechts(schoonEuro(r.prijs), xTariefR, yTop);
    rechts(schoonEuro(r.aantal * r.prijs), xBedragR, yTop);
    yTop += Math.max(20, oms.length * 12.1 + 8);
  }

  // ── BTW + Totaal — bedrag rechts met onderstreping (posities uit het voorbeeld waar mogelijk) ──
  const { btw, totaal } = factuurTotalen(f);
  let yBtw = Math.max(yTop + 8, 428.1);
  tekst(`BTW ${f.btwPercentage}%`, xL, yBtw);
  rechts(schoonEuro(btw), xBedragR, yBtw);
  lijn(xBedragR - 55, xBedragR, yBtw + 2.5, 0.4);
  const yTot = yBtw + 39;
  tekst("Totaal", xL, yTot);
  rechts(schoonEuro(totaal), xBedragR, yTot);
  lijn(xBedragR - 60, xBedragR, yTot + 2.5, 1.1);

  // ── Betaaltermijn + eventuele notitie ──
  let yBet = yTot + 70;
  tekst(`Betaaltermijn ${f.betaaltermijn ?? 14} dagen`, xL, yBet, { size: 11 });
  if (f.notitie) {
    yBet += 16;
    for (const regel of wrap(f.notitie, 500)) { tekst(regel, xL, yBet, { size: 9 }); yBet += 12; }
  }

  return pdf.save();
}

const veilig = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");

function triggerDownload(blob: Blob, naam: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function downloadFactuurPdf(f: Factuur, _bedrijf: Bedrijf) {
  void _bedrijf; // bedrijfsgegevens (logo/footer) zitten al in de template
  try {
    const bytes = await maakFactuurPdfBytes(f);
    triggerDownload(new Blob([bytes as BlobPart], { type: "application/pdf" }), `Factuur_${veilig(f.nummer) || "concept"}.pdf`);
  } catch {
    if (typeof alert !== "undefined") alert("De factuur-PDF kon niet worden gemaakt. Ververs de app en probeer het opnieuw.");
  }
}

// Mailt de factuur naar het e-mailadres van de klant. Omdat een mailto-link geen bestand kan meesturen,
// downloaden we eerst de PDF (zodat de gebruiker die als bijlage kan toevoegen) en openen dan de mail met
// vooringevuld onderwerp + tekst. Retourneert false als er geen e-mailadres is ingevuld.
export async function mailFactuur(f: Factuur): Promise<boolean> {
  if (!f.email || !f.email.trim()) return false;
  try {
    const bytes = await maakFactuurPdfBytes(f);
    triggerDownload(new Blob([bytes as BlobPart], { type: "application/pdf" }), `Factuur_${veilig(f.nummer) || "concept"}.pdf`);
  } catch {
    if (typeof alert !== "undefined") alert("De factuur-PDF kon niet worden gemaakt. Ververs de app en probeer het opnieuw.");
    return false;
  }
  const t = factuurTotalen(f);
  const onderwerp = `Factuur ${f.nummer} — Wire Solutions`;
  const tekst =
    `Beste ${f.tav || f.klantNaam || "relatie"},\n\n` +
    `Hierbij ontvangt u factuur ${f.nummer} van ${new Date(f.datum + "T00:00:00").toLocaleDateString("nl-NL")} ` +
    `voor een bedrag van ${schoonEuro(t.totaal)} (incl. btw).\n` +
    `De factuur zit als PDF in het zojuist gedownloade bestand "Factuur_${veilig(f.nummer)}.pdf" — voeg dat toe als bijlage bij deze mail.\n\n` +
    `Met vriendelijke groet,\nWire Solutions`;
  window.location.href = `mailto:${f.email.trim()}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(tekst)}`;
  return true;
}

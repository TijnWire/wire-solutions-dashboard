import { jsPDF } from "jspdf";
import type { Factuur, Bedrijf } from "./types";

const ORANJE: [number, number, number] = [234, 88, 12];
const DONKER: [number, number, number] = [38, 42, 54];
const GRIJS: [number, number, number] = [120, 126, 138];

const LM = 18;
const BREEDTE = 210;

export const euro = (n: number) =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });

export function factuurTotalen(f: Factuur) {
  const subtotaal = f.regels.reduce((s, r) => s + r.aantal * r.prijs, 0);
  const btw = subtotaal * (f.btwPercentage / 100);
  return { subtotaal, btw, totaal: subtotaal + btw };
}

async function laadLogo(): Promise<string | null> {
  try {
    const res = await fetch("/wire-logo.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function maakPdf(f: Factuur, bedrijf: Bedrijf, logo: string | null): jsPDF {
  const doc = new jsPDF();
  const RM = BREEDTE - LM; // rechtermarge (192)

  // Logo links boven — groot, zoals op de template
  if (logo) {
    const p = doc.getImageProperties(logo);
    let hoogte = 42;
    let breedte = (p.width / p.height) * hoogte;
    if (breedte > 52) { breedte = 52; hoogte = (p.height / p.width) * breedte; }
    doc.addImage(logo, "PNG", LM, 12, breedte, hoogte);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor(...ORANJE);
    doc.text(bedrijf.naam, LM, 30);
  }

  // Geadresseerde (klant) links
  let y = 64;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...DONKER);
  doc.text([f.klantNaam, f.tav ? `T.a.v. ${f.tav}` : "", f.klantAdres, f.klantPostcodePlaats].filter(Boolean), LM, y);

  // Metadata rechts
  let my = 74;
  const meta: [string, string][] = [];
  if (f.relatienummer) meta.push(["Relatienummer:", f.relatienummer]);
  meta.push(["Factuurnummer:", f.nummer]);
  meta.push(["Datum:", new Date(f.datum + "T00:00:00").toLocaleDateString("nl-NL")]);
  for (const [label, waarde] of meta) {
    doc.text(label, 125, my);
    doc.text(waarde, 160, my);
    my += 5.5;
  }

  // Tabel
  y = 96;
  doc.setDrawColor(...DONKER);
  doc.setLineWidth(0.4);
  doc.line(LM, y, RM, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.text("Omschrijving", 88, y, { align: "center" });
  doc.text("Aantal", 150, y, { align: "right" });
  doc.text("Tarief", 178, y, { align: "right" });
  y += 3;
  doc.line(LM, y, RM, y);
  y += 10;

  // PD-nummer als kopregel
  if (f.pdNummer) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text(f.pdNummer, LM, y);
    y += 8;
  }

  // Regels: omschrijving · aantal · tarief · bedrag
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  f.regels.forEach((r) => {
    const oms = doc.splitTextToSize(r.omschrijving || "", 95) as string[];
    doc.text(oms, LM, y);
    doc.text(String(r.aantal), 150, y, { align: "right" });
    doc.text(euro(r.prijs), 178, y, { align: "right" });
    doc.text(euro(r.aantal * r.prijs), RM, y, { align: "right" });
    y += Math.max(8, oms.length * 5 + 3);
  });

  // BTW + Totaal — label links, bedrag rechts met onderstreping
  const { btw, totaal } = factuurTotalen(f);
  y += 8;
  doc.setDrawColor(...DONKER);
  doc.setLineWidth(0.3);
  doc.text(`BTW ${f.btwPercentage}%`, LM, y);
  doc.text(euro(btw), RM, y, { align: "right" });
  doc.line(RM - 28, y + 1.6, RM, y + 1.6);
  y += 10;
  doc.setFont("helvetica", "bold");
  doc.text("Totaal", LM, y);
  doc.text(euro(totaal), RM, y, { align: "right" });
  doc.line(RM - 28, y + 1.6, RM, y + 1.6);

  // Betaaltermijn + eventuele notitie
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Betaaltermijn ${f.betaaltermijn ?? 14} dagen`, LM, y);
  if (f.notitie) {
    y += 6;
    doc.setFontSize(9);
    doc.setTextColor(...GRIJS);
    doc.text(doc.splitTextToSize(f.notitie, RM - LM) as string[], LM, y);
  }

  // Voettekst onderaan — bedrijfsgegevens (oranje labels, net als de template)
  const vy = 278;
  doc.setFontSize(7.5);
  doc.setTextColor(...GRIJS);
  doc.text([bedrijf.adres, bedrijf.postcodePlaats, bedrijf.telefoon ? `T ${bedrijf.telefoon}` : "", bedrijf.email ? `E ${bedrijf.email}` : ""].filter(Boolean), LM, vy);
  const fin: [string, string][] = [];
  if (bedrijf.iban) fin.push(["IBAN", bedrijf.iban]);
  if (bedrijf.bic) fin.push(["BIC", bedrijf.bic]);
  if (bedrijf.kvk) fin.push(["KvK", bedrijf.kvk]);
  if (bedrijf.btw) fin.push(["BTW", bedrijf.btw]);
  let fy = vy;
  for (const [label, waarde] of fin) {
    doc.setTextColor(...ORANJE);
    doc.text(label, 78, fy);
    doc.setTextColor(...GRIJS);
    doc.text(waarde, 90, fy);
    fy += 3.4;
  }
  doc.setTextColor(...ORANJE);
  doc.text("www.wire-solutions.nl", RM, vy, { align: "right" });

  return doc;
}

export async function downloadFactuurPdf(f: Factuur, bedrijf: Bedrijf) {
  const logo = await laadLogo();
  const doc = maakPdf(f, bedrijf, logo);
  doc.save(`Factuur_${f.nummer}.pdf`);
}

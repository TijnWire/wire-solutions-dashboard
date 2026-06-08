import { jsPDF } from "jspdf";
import type { Factuur, Bedrijf } from "./types";

const ORANJE: [number, number, number] = [234, 88, 12];
const DONKER: [number, number, number] = [38, 42, 54];
const GRIJS: [number, number, number] = [120, 126, 138];
const LICHT: [number, number, number] = [241, 245, 249];

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

  // Kop — echt Wire Solutions-logo (op de juiste verhouding)
  if (logo) {
    const p = doc.getImageProperties(logo);
    const hoogte = 20;
    const breedte = (p.width / p.height) * hoogte;
    doc.addImage(logo, "PNG", LM, 14, breedte, hoogte);
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(...DONKER);
    doc.text(bedrijf.naam, LM, 24);
  }

  // "FACTUUR" rechts
  doc.setFont("helvetica", "bold");
  doc.setFontSize(26);
  doc.setTextColor(...ORANJE);
  doc.text("FACTUUR", BREEDTE - LM, 24, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...GRIJS);
  doc.text(`Nr. ${f.nummer}`, BREEDTE - LM, 31, { align: "right" });
  doc.text(
    new Date(f.datum + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" }),
    BREEDTE - LM,
    36,
    { align: "right" }
  );

  // Afzender + klant
  let y = 50;
  doc.setFontSize(9);
  doc.setTextColor(...GRIJS);
  doc.text(
    [bedrijf.adres, bedrijf.postcodePlaats, bedrijf.telefoon, bedrijf.email].filter(Boolean),
    LM,
    y
  );

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...DONKER);
  doc.text("FACTUUR AAN", BREEDTE - LM, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRIJS);
  doc.text(
    [f.klantNaam, f.klantAdres, f.klantPostcodePlaats].filter(Boolean),
    BREEDTE - LM,
    y + 5,
    { align: "right" }
  );

  // Tabelkop
  y = 78;
  doc.setFillColor(...DONKER);
  doc.rect(LM, y, BREEDTE - LM * 2, 9, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.text("Omschrijving", LM + 3, y + 6);
  doc.text("Aantal", 128, y + 6, { align: "right" });
  doc.text("Prijs", 158, y + 6, { align: "right" });
  doc.text("Totaal", BREEDTE - LM - 3, y + 6, { align: "right" });
  y += 9;

  // Regels
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...DONKER);
  f.regels.forEach((r, i) => {
    const h = 8;
    if (i % 2 === 1) {
      doc.setFillColor(...LICHT);
      doc.rect(LM, y, BREEDTE - LM * 2, h, "F");
    }
    const oms = doc.splitTextToSize(r.omschrijving, 95) as string[];
    doc.text(oms, LM + 3, y + 5.5);
    doc.text(String(r.aantal), 128, y + 5.5, { align: "right" });
    doc.text(euro(r.prijs), 158, y + 5.5, { align: "right" });
    doc.text(euro(r.aantal * r.prijs), BREEDTE - LM - 3, y + 5.5, { align: "right" });
    y += Math.max(h, oms.length * 5 + 3);
  });

  // Totalen
  const { subtotaal, btw, totaal } = factuurTotalen(f);
  y += 4;
  const labelX = 150;
  const waardeX = BREEDTE - LM - 3;
  doc.setFontSize(10);
  doc.setTextColor(...GRIJS);
  doc.text("Subtotaal", labelX, y, { align: "right" });
  doc.setTextColor(...DONKER);
  doc.text(euro(subtotaal), waardeX, y, { align: "right" });
  y += 6;
  doc.setTextColor(...GRIJS);
  doc.text(`BTW ${f.btwPercentage}%`, labelX, y, { align: "right" });
  doc.setTextColor(...DONKER);
  doc.text(euro(btw), waardeX, y, { align: "right" });
  y += 4;
  doc.setDrawColor(...ORANJE);
  doc.setLineWidth(0.5);
  doc.line(labelX - 30, y, waardeX, y);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...ORANJE);
  doc.text("Totaal", labelX, y, { align: "right" });
  doc.text(euro(totaal), waardeX, y, { align: "right" });

  // Betaalinfo + voettekst
  y += 16;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...DONKER);
  if (f.notitie) {
    doc.text(doc.splitTextToSize(f.notitie, BREEDTE - LM * 2) as string[], LM, y);
    y += 6;
  }
  doc.setTextColor(...GRIJS);
  doc.setFontSize(8);
  const voetDelen: string[] = [];
  if (bedrijf.kvk) voetDelen.push(`KvK ${bedrijf.kvk}`);
  if (bedrijf.btw) voetDelen.push(`BTW ${bedrijf.btw}`);
  if (bedrijf.iban) voetDelen.push(`IBAN ${bedrijf.iban}`);
  if (voetDelen.length) {
    doc.text(voetDelen.join("   ·   "), BREEDTE / 2, 287, { align: "center" });
  }

  return doc;
}

export async function downloadFactuurPdf(f: Factuur, bedrijf: Bedrijf) {
  const logo = await laadLogo();
  const doc = maakPdf(f, bedrijf, logo);
  doc.save(`Factuur_${f.nummer}.pdf`);
}

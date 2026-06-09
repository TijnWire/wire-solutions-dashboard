import JSZip from "jszip";
import type { Voorschouw, JaNee } from "./types";

// ⚙️ Vul hier het Stedin-mailadres in waar de voorschouwen naartoe moeten.
export const STEDIN_EMAIL = "";

const SZ = 10.5; // tekstgrootte van de waarden
const PW = 595.3, PH = 841.9; // A4 in punten (zoals opgemeten in het sjabloon)

// Het officiële Stedin-formulier zit als base64 gebundeld in de app (src/lib/voorschouwSjabloon.ts).
// Géén netwerk-fetch → de download werkt altijd, op laptop én mobiel (geen cache-/service-worker-/deploy-issues).
async function laadSjabloon(): Promise<Uint8Array | null> {
  try {
    const { VOORSCHOUW_SJABLOON_B64 } = await import("./voorschouwSjabloon");
    const bin = atob(VOORSCHOUW_SJABLOON_B64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.length && bytes[0] === 0x25 ? bytes : null; // 0x25 = '%' (start van %PDF)
  } catch {
    return null;
  }
}

function dataUrlNaarBytes(durl: string): { bytes: Uint8Array; png: boolean } {
  const komma = durl.indexOf(",");
  const meta = durl.slice(0, komma);
  const bin = atob(durl.slice(komma + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, png: /png/i.test(meta) };
}

// Bouwt de ingevulde PDF op basis van het officiële sjabloon (gegevens worden eroverheen geplaatst).
async function maakVoorschouwPdfBytes(v: Voorschouw): Promise<Uint8Array> {
  const sjabloon = await laadSjabloon();
  if (!sjabloon) throw new Error("Voorschouwsjabloon kon niet worden geladen");
  const { PDFDocument, StandardFonts, rgb } = await import("pdf-lib");
  const DONKER = rgb(0.149, 0.165, 0.212);
  const ROOD = rgb(0.85, 0.12, 0.12);

  const pdf = await PDFDocument.load(sjabloon);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  let page = pdf.getPage(0);

  // "Label: <waarde>" — waarde net na het label (nieuwe regels worden samengevoegd).
  const inline = (labelMetColon: string, labelX: number, y: number, waarde: string) => {
    const w = (waarde || "").replace(/\s*[\r\n]+\s*/g, " ").trim();
    if (!w) return;
    const x = labelX + font.widthOfTextAtSize(labelMetColon, SZ) + 6;
    page.drawText(w, { x, y, size: SZ, font, color: DONKER });
  };

  // Waarde op de "-"-regel onder het label; krimpt qua font en kapt desnoods af zodat het op één regel binnen de marge blijft.
  const maxBlokW = PW - 96 - 40;
  const blok = (y: number, waarde: string) => {
    let t = (waarde || "").replace(/\s*[\r\n]+\s*/g, " · ").trim();
    if (!t) return;
    let size = SZ;
    while (size > 6.5 && font.widthOfTextAtSize(t, size) > maxBlokW) size -= 0.5;
    if (font.widthOfTextAtSize(t, size) > maxBlokW) {
      while (t.length > 1 && font.widthOfTextAtSize(t + "…", size) > maxBlokW) t = t.slice(0, -1);
      t += "…";
    }
    page.drawText(t, { x: 96, y, size, font, color: DONKER });
  };

  // Zet het gekozen antwoord (JA/NEE) vetgedrukt en rood over het formulier — geen rondje meer.
  const janee = (xStart: number, y: number, keuze: JaNee) => {
    if (keuze !== "JA" && keuze !== "NEE") return;
    const wJa = font.widthOfTextAtSize("JA", SZ);
    const wSep = font.widthOfTextAtSize(" / ", SZ);
    const ja = keuze === "JA";
    const woord = ja ? "JA" : "NEE";
    const wordX = ja ? xStart : xStart + wJa + wSep;
    page.drawText(woord, { x: wordX, y, size: SZ, font: fontBold, color: ROOD });
  };

  // ── Velden plaatsen (coördinaten opgemeten in het sjabloon, oorsprong linksonder) ──
  inline("Straatnaam:", 70.8, 636.7, v.straatnaam);
  inline("Postcode:", 70.8, 616.3, v.postcode);
  inline("Plaats:", 70.8, 595.9, v.plaats);
  janee(262.0, 575.5, v.meerdereStraten);
  blok(534.7, v.aantalWoningen);
  blok(493.9, v.aantalEntrees);
  blok(453.1, v.namenHuisbaasVVE);
  blok(412.1, v.adressenHuisbaasVVE);
  janee(112.9, 391.8, v.gasloos);
  janee(148.0, 371.3, v.blokverwarming);
  blok(330.5, v.bijzondereLocatieZorg);
  blok(290.6, v.bijzondereLocatieKeuken);
  blok(227.2, v.aantalStijgleidingen);

  // ── Foto's van gasbordjes: onder de label (y≈196) en daarna op vervolgpagina's ──
  if (v.fotos.length) {
    const ML = 70.8, MR = 40, MB = 40, gap = 12;
    const colW = (PW - ML - MR - gap) / 2;
    const colX = [ML, ML + colW + gap];
    const maxH = PH - 2 * MB; // een rij past altijd op één pagina
    let top = 196;
    for (let i = 0; i < v.fotos.length; i += 2) {
      const rij: { img: import("pdf-lib").PDFImage; w: number; h: number; x: number }[] = [];
      for (let j = 0; j < 2 && i + j < v.fotos.length; j++) {
        try {
          const { bytes, png } = dataUrlNaarBytes(v.fotos[i + j]);
          const img = png ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
          let w = colW, h = (img.height / img.width) * colW;
          if (h > maxH) { h = maxH; w = (img.width / img.height) * maxH; } // hoge foto: schaal proportioneel terug
          rij.push({ img, w, h, x: colX[j] });
        } catch { /* onleesbare foto overslaan */ }
      }
      if (!rij.length) continue;
      const rowH = Math.max(...rij.map((o) => o.h));
      if (top - rowH < MB) { page = pdf.addPage([PW, PH]); top = PH - MB; }
      rij.forEach((o) => page.drawImage(o.img, { x: o.x, y: top - o.h, width: o.w, height: o.h }));
      top -= rowH + gap;
    }
  }

  return pdf.save();
}

const veilig = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "");
const bestandsnaam = (v: Voorschouw) => `Voorschouw_${veilig(v.straatnaam) || "onbekend"}${v.plaats ? "_" + veilig(v.plaats) : ""}`;

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

function meldFout() {
  if (typeof alert !== "undefined") alert("De voorschouw-PDF kon niet worden gemaakt. Ververs de app en probeer het opnieuw.");
}

// Bundelt meerdere voorschouwen tot één ZIP-blob (kan throwen als het sjabloon ontbreekt).
async function genereerZipBlob(lijst: Voorschouw[]): Promise<Blob> {
  const zip = new JSZip();
  const gebruikt = new Set<string>();
  for (const v of lijst) {
    const bytes = await maakVoorschouwPdfBytes(v);
    let naam = `${bestandsnaam(v)}.pdf`;
    let n = 2;
    while (gebruikt.has(naam)) naam = `${bestandsnaam(v)}_${n++}.pdf`;
    gebruikt.add(naam);
    zip.file(naam, bytes);
  }
  return zip.generateAsync({ type: "blob" });
}

export async function downloadVoorschouwPdf(v: Voorschouw) {
  try {
    const bytes = await maakVoorschouwPdfBytes(v);
    triggerDownload(new Blob([bytes as BlobPart], { type: "application/pdf" }), `${bestandsnaam(v)}.pdf`);
  } catch {
    meldFout();
  }
}

// Bundelt meerdere voorschouwen tot één ZIP-map met PDF's.
export async function downloadVoorschouwenZip(lijst: Voorschouw[]) {
  if (lijst.length === 0) return;
  try {
    const blob = await genereerZipBlob(lijst);
    triggerDownload(blob, `Voorschouwen_Stedin_${new Date().toISOString().slice(0, 10)}.zip`);
  } catch {
    meldFout();
  }
}

// Bundelt de PDF's (als ZIP) én opent een kant-en-klare mail naar Stedin.
export async function mailVoorschouwenNaarStedin(lijst: Voorschouw[]) {
  if (lijst.length === 0) return;
  let blob: Blob;
  try {
    blob = await genereerZipBlob(lijst);
  } catch {
    meldFout();
    return; // geen mail openen als de PDF's niet gemaakt konden worden
  }
  triggerDownload(blob, `Voorschouwen_Stedin_${new Date().toISOString().slice(0, 10)}.zip`);

  const adressen = lijst
    .map((v) => `- ${v.straatnaam || "Onbekend"}${v.plaats ? `, ${v.plaats}` : ""}`)
    .join("\n");
  const onderwerp = `Voorschouwen Wire Solutions (${lijst.length} ${lijst.length === 1 ? "adres" : "adressen"})`;
  const tekst =
    `Beste Stedin,\n\n` +
    `Hierbij de ingevulde voorschouwen voor de volgende adressen:\n${adressen}\n\n` +
    `De bijbehorende PDF's zitten in het zojuist gedownloade bestand "Voorschouwen_Stedin".\n` +
    `Voeg dat bestand toe als bijlage bij deze mail.\n\n` +
    `Met vriendelijke groet,\nWire Solutions`;

  window.location.href = `mailto:${STEDIN_EMAIL}?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(tekst)}`;
}

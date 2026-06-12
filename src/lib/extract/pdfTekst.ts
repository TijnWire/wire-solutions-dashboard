// Lokale, 100%-betrouwbare PDF-uitlezing voor Stedin "Afschakelbrieven" (tekst-PDF, geen AI/sleutel nodig).
// Elke brief bevat het adres in een vast blok:
//   Aan de bewoners van
//   <straat> <huisnummer> [toevoeging]
//   <postcode> <PLAATS>
// We lezen de tekst van álle pagina's uit en halen elk adres-blok eruit.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { netjesPlaats } from "../brieven";
import type { RuweRij } from "./types";

let pdfjsKlaar: Promise<typeof import("pdfjs-dist")> | null = null;
async function laadPdfjs() {
  if (!pdfjsKlaar) {
    pdfjsKlaar = (async () => {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
      return pdfjs;
    })();
  }
  return pdfjsKlaar;
}

// Het adres-blok: na "Aan de bewoners van" komt straat+nr(+toevoeging), dan postcode + plaats,
// tot aan het volgende vaste kopje van de brief.
const EIND = "(?:Belangrijk|Retouradres|Datum|Ordernummer|Onderwerp|Behandeld door|Beste klant|Stedin Netbeheer|www\\.)";
const BLOK = new RegExp(`Aan de bewoners van\\s+(.+?)\\s+(\\d{4}\\s?[A-Za-z]{2})\\s+(.+?)\\s+${EIND}`, "gi");

function parseStraat(blok: string): { straat: string; huisnummer: string; toevoeging: string } {
  // Straat kan meerdere woorden zijn (bijv. "Tiendweg West"); huisnummer = eerste getal; rest = toevoeging.
  const m = blok.trim().match(/^(.+?)\s+(\d+)\s*(.*)$/);
  if (!m) return { straat: blok.trim(), huisnummer: "", toevoeging: "" };
  return { straat: m[1].trim(), huisnummer: m[2], toevoeging: m[3].trim() };
}

export type PdfTekstResultaat = { ok: true; rijen: RuweRij[]; pdNummer?: string } | { ok: false; fout: string };

export async function leesPdfTekst(file: File): Promise<PdfTekstResultaat> {
  try {
    const pdfjs = await laadPdfjs();
    const data = new Uint8Array(await file.arrayBuffer());
    const taak = pdfjs.getDocument({ data });
    const doc = await taak.promise;
    let tekst = "";
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const inhoud = await page.getTextContent();
      for (const item of inhoud.items as { str?: string; hasEOL?: boolean }[]) {
        if (typeof item.str === "string") tekst += item.str + (item.hasEOL ? "\n" : " ");
      }
      tekst += "\n";
    }
    await taak.destroy();

    // Alle witruimte (incl. nieuwe regels) platslaan → het blok-patroon is dan tolerant voor lay-outverschillen.
    const plat = tekst.replace(/\s+/g, " ");
    const gezien = new Set<string>();
    const rijen: RuweRij[] = [];
    for (const m of plat.matchAll(BLOK)) {
      const { straat, huisnummer, toevoeging } = parseStraat(m[1]);
      const postcode = m[2].replace(/(\d{4})\s*([A-Za-z]{2})/, "$1 $2").toUpperCase();
      const plaats = netjesPlaats(m[3].trim());
      if (!straat || !huisnummer) continue;
      const sleutel = `${straat}|${huisnummer}|${toevoeging}|${postcode}`.toLowerCase();
      if (gezien.has(sleutel)) continue; // zelfde adres niet dubbel (bv. brief over 2 pagina's)
      gezien.add(sleutel);
      rijen.push({ straat, huisnummer, toevoeging, postcode, plaats, naam: "", telefoon: "", type: "woning", notitie: "" });
    }
    if (rijen.length === 0) {
      return { ok: false, fout: "Geen adressen herkend. Verwacht een Stedin-afschakelbrief-PDF met blokken 'Aan de bewoners van …'." };
    }
    // Stedin-ordernummer (PD…) — staat op de brieven als "Ordernummer PD137103".
    const pd = plat.match(/Ordernummer\s+(PD\s?\d{4,})/i);
    const pdNummer = pd ? pd[1].replace(/\s+/g, "") : undefined;
    return { ok: true, rijen, pdNummer };
  } catch (e) {
    return { ok: false, fout: `Kon de PDF niet lezen: ${e instanceof Error ? e.message : String(e)}` };
  }
}

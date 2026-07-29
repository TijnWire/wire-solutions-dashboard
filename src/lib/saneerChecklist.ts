// De Checklist M&A Saneren invullen met de adressen en telefoonnummers uit het dossier.
// ─────────────────────────────────────────────────────────────────────────────
// public/Template Checklist Saneren.pdf is het formulier dat de schouwer op papier invult. Bovenaan
// staat het gebouw (adres + postcode), daaronder een tabel met per voordeur het huisnummer, de naam
// en het telefoonnummer. Precies de gegevens die na de import al in het dossier staan.
//
// Die overtypen is werk dat niemand hoeft te doen, en waar bij tweeëntwintig voordeuren gegarandeerd
// een cijfer in verspringt. Dus vullen we het formulier zelf in: één checklist per groep, want een
// groep is één postcode en dus één gebouw.
//
// Het origineel blijft ongemoeid — we stempelen alleen tekst op een kopie. Alle vaste vragen op het
// formulier blijven leeg, want die vult de schouwer ter plekke in.

import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { Cluster, FlowAdres } from "./saneerflowWerk";
import type { Dossier } from "./saneerflow";

const SJABLOON = "/Template Checklist Saneren.pdf";

// Waar de waarden op het formulier horen te staan. De getallen komen uit het sjabloon zelf: dit zijn
// de posities van de labels, met de waarde ernaast. Verandert het formulier, dan hoeven alleen deze
// getallen mee te veranderen.
const PLEK = {
  postcode:  { x: 104, y: 746 },
  adres:     { x: 297, y: 746 },
  uitvoering:{ x: 150, y: 675 },
  schouw:    { x: 115, y: 608 },
  // De tabel onder de kopregel op y=360.
  tabel: { top: 345, regelhoogte: 15, min: 190, huisnr: 32, naam: 176, telefoon: 387 },
};
const REGELS_PER_BLAD = Math.floor((PLEK.tabel.top - PLEK.tabel.min) / PLEK.tabel.regelhoogte) + 1;

const datumNL = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().map(Number).join("-") : "");
const adresRegel = (a: FlowAdres) => `${a.huisnummer}${a.toevoeging}`.trim();

function download(blob: Blob, naam: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export type ChecklistGroep = { cluster: Cluster; adressen: FlowAdres[] };

// Eén PDF met per groep (en per elf voordeuren) een ingevulde checklist.
export async function maakChecklists(dossier: Dossier, groepen: ChecklistGroep[]): Promise<{ ok: boolean; fout?: string; bladen?: number }> {
  let sjabloonBytes: ArrayBuffer;
  try {
    const r = await fetch(SJABLOON);
    if (!r.ok) throw new Error(`kon het sjabloon niet ophalen (${r.status})`);
    sjabloonBytes = await r.arrayBuffer();
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : "Het sjabloon is niet gevonden." };
  }

  const sjabloon = await PDFDocument.load(sjabloonBytes);
  const uit = await PDFDocument.create();
  const font = await uit.embedFont(StandardFonts.Helvetica);
  const vet = await uit.embedFont(StandardFonts.HelveticaBold);
  const inkt = rgb(0.05, 0.09, 0.16);

  let bladen = 0;
  for (const groep of groepen) {
    if (groep.adressen.length === 0) continue;
    // Op volgorde van huisnummer, zoals je ze ook langsloopt.
    const adressen = [...groep.adressen].sort((a, b) => {
      const na = parseInt(a.huisnummer.replace(/\D/g, ""), 10) || 0;
      const nb = parseInt(b.huisnummer.replace(/\D/g, ""), 10) || 0;
      return na - nb || a.toevoeging.localeCompare(b.toevoeging);
    });

    // Past de groep niet op één blad, dan gaat hij over meerdere bladen — met dezelfde kop.
    for (let start = 0; start < adressen.length; start += REGELS_PER_BLAD) {
      const [blad] = await uit.copyPages(sjabloon, [0]);
      uit.addPage(blad);
      bladen++;

      const schrijf = (t: string, x: number, y: number, groot = false) => {
        if (!t) return;
        blad.drawText(t, { x, y, size: groot ? 10 : 8.5, font: groot ? vet : font, color: inkt });
      };

      const eerste = adressen[0];
      schrijf(eerste.straat, PLEK.adres.x, PLEK.adres.y, true);
      schrijf(eerste.postcode, PLEK.postcode.x, PLEK.postcode.y, true);
      schrijf(datumNL(groep.cluster.definitieve_datum), PLEK.uitvoering.x, PLEK.uitvoering.y);
      schrijf(datumNL(dossier.uitvoering_van), PLEK.schouw.x, PLEK.schouw.y);

      adressen.slice(start, start + REGELS_PER_BLAD).forEach((a, i) => {
        const y = PLEK.tabel.top - i * PLEK.tabel.regelhoogte;
        schrijf(adresRegel(a), PLEK.tabel.huisnr, y);
        schrijf(a.bewoner.slice(0, 28), PLEK.tabel.naam, y);
        schrijf(a.telefoon, PLEK.tabel.telefoon, y);
      });
    }
  }

  if (bladen === 0) return { ok: false, fout: "Er zijn nog geen adressen om een checklist van te maken." };

  const bytes = await uit.save();
  const naam = `${dossier.pd_nummer} checklists saneren ${new Date().toISOString().slice(0, 10)}.pdf`;
  download(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), naam);
  return { ok: true, bladen };
}

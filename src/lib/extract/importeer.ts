import type { Adres, Afspraak, Brievenronde, Klant } from "../types";
import type { ImportDoel, ScanRij } from "./types";
import { leesExcel } from "./excel";
import { leesPdfViaClaude } from "./claude";
import { leesPdfTekst } from "./pdfTekst";
import { maakAdresId, markeerDuplicaten, normaliseerRij, valideer } from "./normaliseer";

export type Bestandsoort = "excel" | "pdf" | "onbekend";

export function bestandsoort(file: File): Bestandsoort {
  const n = file.name.toLowerCase();
  if (n.endsWith(".pdf") || file.type === "application/pdf") return "pdf";
  if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) return "excel";
  return "onbekend";
}

export type VerwerkResultaat =
  | { ok: true; rijen: ScanRij[]; herkend?: string[]; onherkend?: string[] }
  | { ok: false; fout: string };

// Leest een bestand → genormaliseerde, gededupliceerde ScanRij[] (klaar voor de review-tabel).
export async function verwerkBestand(
  file: File,
  apiKey: string,
  rondes: Brievenronde[],
  klanten: Klant[],
  signal?: AbortSignal
): Promise<VerwerkResultaat> {
  const soort = bestandsoort(file);
  if (soort === "onbekend") {
    return { ok: false, fout: "Bestandstype niet ondersteund. Gebruik PDF, Excel (.xlsx/.xls) of CSV." };
  }

  let genormaliseerd: ScanRij[];
  let herkend: string[] | undefined;
  let onherkend: string[] | undefined;

  if (soort === "excel") {
    const r = await leesExcel(file);
    if (!r.ok) return r;
    genormaliseerd = r.rijen.map((x, i) => normaliseerRij(x, i + 1, 1));
    herkend = r.herkend;
    onherkend = r.onherkend;
  } else {
    // PDF: probeer eerst de lokale, exacte tekst-uitlezing (Stedin-afschakelbrieven) — geen sleutel nodig,
    // en bij een tekst-PDF 100% betrouwbaar. Lukt dat niet, val (met sleutel) terug op AI-scan.
    const tekst = await leesPdfTekst(file);
    if (tekst.ok) {
      genormaliseerd = tekst.rijen.map((x, i) => normaliseerRij(x, i + 1, 1));
    } else if (apiKey.trim()) {
      const r = await leesPdfViaClaude(file, apiKey, signal);
      if (!r.ok) return r;
      genormaliseerd = r.rijen.map((x, i) =>
        normaliseerRij(
          { straat: x.straat, huisnummer: x.huisnummer, toevoeging: x.toevoeging, postcode: x.postcode, plaats: x.plaats, naam: x.naam, telefoon: x.telefoon, type: x.type, notitie: x.notitie },
          i + 1,
          typeof x.confidence === "number" ? x.confidence : 0.9
        )
      );
    } else {
      return { ok: false, fout: `${tekst.fout} Is het een andere soort PDF? Vul dan een Claude API-sleutel in (Instellingen → Integraties) om PDF's met AI te scannen.` };
    }
  }

  const rijen = markeerDuplicaten(genormaliseerd, rondes, klanten);
  return { ok: true, rijen, herkend, onherkend };
}

// ── Opslaan ──
export type OpslaanCtx = {
  projectId: string;
  projectNaam: string;
  mapNaam?: string; // alle rondes uit deze import in één map groeperen
  rondes: Brievenronde[];
  addRonde: (r: Omit<Brievenronde, "id">) => string;
  updateRonde: (id: string, patch: Partial<Brievenronde>) => void;
  addKlant: (k: Omit<Klant, "id">) => string;
  addAfspraak: (a: Omit<Afspraak, "id">) => string;
};

const sleutel = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
const klantHuisnummer = (r: ScanRij) => r.huisnummer + (r.toevoeging ? `-${r.toevoeging}` : "");

// Slaat de aangevinkte, valide rijen op volgens het gekozen doel. Geeft het aantal opgeslagen records terug.
export function bevestigOpslaan(rijen: ScanRij[], doel: ImportDoel, ctx: OpslaanCtx): { aantal: number } {
  const teImporteren = rijen.filter((r) => r.opnemen && valideer(r, doel).fouten.length === 0);
  if (teImporteren.length === 0) return { aantal: 0 };

  if (doel === "klant") {
    for (const r of teImporteren) {
      ctx.addKlant({ naam: r.naam, straat: r.straat, huisnummer: klantHuisnummer(r), postcode: r.postcode, plaats: r.plaats, telefoon: r.telefoon, notitie: r.notitie, fotos: [] });
    }
    return { aantal: teImporteren.length };
  }

  if (doel === "afspraak") {
    for (const r of teImporteren) {
      ctx.addAfspraak({
        locatie: ctx.projectNaam || r.straat,
        soort: "straat",
        klantNaam: r.naam,
        telefoon: r.telefoon,
        straat: r.straat,
        huisnummer: klantHuisnummer(r),
        postcode: r.postcode,
        plaats: r.plaats,
        type: r.type,
        datum: "",
        tijd: "",
        status: "Open",
        notitie: r.notitie,
      });
    }
    return { aantal: teImporteren.length };
  }

  // Brievenronde: groepeer per (straat, postcode, plaats); voeg toe aan bestaande ronde of maak een nieuwe.
  const groepen = new Map<string, ScanRij[]>();
  for (const r of teImporteren) {
    const key = `${sleutel(r.straat)}|${sleutel(r.postcode)}|${sleutel(r.plaats)}`;
    const lijst = groepen.get(key);
    if (lijst) lijst.push(r);
    else groepen.set(key, [r]);
  }

  for (const rs of groepen.values()) {
    const e = rs[0];
    const adressen: Adres[] = rs
      .map((r) => ({
        id: maakAdresId(),
        huisnummer: Number(String(r.huisnummer).replace(/\D/g, "")) || 0,
        toevoeging: r.toevoeging,
        type: r.type,
        status: "Te doen" as const,
        ontbreekt: !String(r.huisnummer).trim(),
        notitie: r.notitie,
      }))
      // Op huisnummer (+ toevoeging) sorteren = de looproute door de straat.
      .sort((a, b) => a.huisnummer - b.huisnummer || a.toevoeging.localeCompare(b.toevoeging, "nl", { numeric: true }));

    const bestaande = ctx.rondes.find(
      (rd) => sleutel(rd.straat) === sleutel(e.straat) && sleutel(rd.postcode) === sleutel(e.postcode) && sleutel(rd.plaats) === sleutel(e.plaats)
    );
    if (bestaande) {
      ctx.updateRonde(bestaande.id, { adressen: [...bestaande.adressen, ...adressen], projectId: bestaande.projectId ?? ctx.projectId, mapNaam: bestaande.mapNaam ?? ctx.mapNaam });
    } else {
      ctx.addRonde({ straat: e.straat, postcode: e.postcode, plaats: e.plaats, projectId: ctx.projectId, mapNaam: ctx.mapNaam, aangemaakt: new Date().toISOString(), status: "nieuw", adressen });
    }
  }
  return { aantal: teImporteren.length };
}

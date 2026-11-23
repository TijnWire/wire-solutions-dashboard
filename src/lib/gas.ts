// Gasleidingen (vervangen gas): inlezen van de adreslijst, de tijdsblokken en de tellingen.
import { laadPdfjs } from "./pdfjsLaden";
import { leesExcel } from "./extract/excel";
import { leesPdfTekst } from "./extract/pdfTekst";
import type { GasAdres, GasBlok, GasProject } from "./types";

export const GAS_BLOKKEN: { key: GasBlok; label: string; kort: string }[] = [
  { key: "ochtend", label: "08:00 – 12:00", kort: "08–12" },
  { key: "middag", label: "12:00 – 16:00", kort: "12–16" },
];
export const blokLabel = (b?: GasBlok) => GAS_BLOKKEN.find((x) => x.key === b)?.label ?? "";

export type GasRij = Omit<GasAdres, "id" | "projectId">;

// Straatnamen in de lijst van Stedin staan in HOOFDLETTERS; netjes maken voor het scherm.
export function netjesStraat(s: string): string {
  return s.trim().toLowerCase().replace(/(^|[\s\-'(])([a-zà-ÿ])/g, (_m, a: string, b: string) => a + b.toUpperCase())
    .replace(/\b(Van|De|Der|Den|Het|Te|Ten|Ter|Aan|In|Op|Bij)\b/g, (w, _x, i: number) => (i === 0 ? w : w.toLowerCase()))
    .replace(/\b[IVXivx]{2,4}\b/g, (w) => w.toUpperCase()); // Romeinse cijfers: "Dirk III Straat"
}
const normPc = (p: string) => p.replace(/\s+/g, "").toUpperCase();

// ── Inlezen ──
// De adreslijst van Stedin (PDF) is een tabel: Straat · Huisnr. · Toev. · Postcode · Plaats · Brief ja/nee.
// We lezen de tekst per regel (op hoogte gegroepeerd) en herkennen een adres aan de postcode.
async function leesAdreslijstPdf(file: File): Promise<{ rijen: GasRij[]; plaats?: string }> {
  const pdfjs = await laadPdfjs();
  const taak = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const doc = await taak.promise;
  const rijen: GasRij[] = [];
  const gezien = new Set<string>();
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const inhoud = await page.getTextContent();
    const regels = new Map<number, { x: number; s: string }[]>();
    for (const it of inhoud.items as { str?: string; transform?: number[] }[]) {
      if (!it.str || !it.str.trim() || !it.transform) continue;
      const y = Math.round(it.transform[5] / 2);
      const lijst = regels.get(y) ?? [];
      lijst.push({ x: it.transform[4], s: it.str.trim() });
      regels.set(y, lijst);
    }
    const ys = [...regels.keys()].sort((a, b) => b - a);
    for (const y of ys) {
      const delen = regels.get(y)!.sort((a, b) => a.x - b.x).map((d) => d.s);
      const pcIdx = delen.findIndex((d) => /^\d{4}\s?[A-Za-z]{2}$/.test(d));
      if (pcIdx < 2) continue;
      // Huisnummer = laatste losse getal vóór de postcode; daartussen de toevoeging.
      let nrIdx = -1;
      for (let i = pcIdx - 1; i >= 1; i--) if (/^\d+$/.test(delen[i])) { nrIdx = i; break; }
      if (nrIdx < 1) continue;
      const straat = delen.slice(0, nrIdx).join(" ");
      const toevoeging = delen.slice(nrIdx + 1, pcIdx).join(" ");
      const plaats = delen[pcIdx + 1] && !/^(ja|nee)$/i.test(delen[pcIdx + 1]) ? delen[pcIdx + 1] : "";
      const sleutel = `${straat}|${delen[nrIdx]}|${toevoeging}|${normPc(delen[pcIdx])}`.toLowerCase();
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      rijen.push({
        volgorde: rijen.length + 1, straat: netjesStraat(straat), huisnummer: delen[nrIdx], toevoeging,
        postcode: normPc(delen[pcIdx]), plaats: netjesStraat(plaats), status: "open",
      });
    }
  }
  await taak.destroy();
  return { rijen, plaats: rijen[0]?.plaats };
}

export async function leesGasAdressen(file: File): Promise<{ ok: true; rijen: GasRij[]; plaats?: string } | { ok: false; fout: string }> {
  const n = file.name.toLowerCase();
  try {
    if (n.endsWith(".pdf") || file.type === "application/pdf") {
      const r = await leesAdreslijstPdf(file);
      if (r.rijen.length) return { ok: true, ...r };
      // Geen tabel? Misschien een stapel brieven ("Aan de bewoners van …").
      const b = await leesPdfTekst(file);
      if (b.ok) {
        const rijen = b.rijen.map((x, i): GasRij => ({ volgorde: i + 1, straat: netjesStraat(x.straat), huisnummer: String(x.huisnummer), toevoeging: x.toevoeging ?? "", postcode: normPc(x.postcode ?? ""), plaats: netjesStraat(x.plaats ?? ""), status: "open" }));
        return { ok: true, rijen, plaats: rijen[0]?.plaats };
      }
      return { ok: false, fout: "Geen adressen herkend in deze PDF. Verwacht een adreslijst met straat, huisnummer en postcode." };
    }
    if (n.endsWith(".xlsx") || n.endsWith(".xls") || n.endsWith(".csv")) {
      const r = await leesExcel(file);
      if (!r.ok) return r;
      const rijen = r.rijen.filter((x) => x.straat && x.huisnummer).map((x, i): GasRij => ({
        volgorde: i + 1, straat: netjesStraat(x.straat), huisnummer: String(x.huisnummer), toevoeging: x.toevoeging ?? "",
        postcode: normPc(x.postcode ?? ""), plaats: netjesStraat(x.plaats ?? ""), status: "open",
      }));
      if (!rijen.length) return { ok: false, fout: "Geen adressen gevonden in dit bestand." };
      return { ok: true, rijen, plaats: rijen[0]?.plaats };
    }
    return { ok: false, fout: "Gebruik een PDF- of Excel-bestand met de adreslijst." };
  } catch (e) {
    return { ok: false, fout: `Kon het bestand niet lezen: ${e instanceof Error ? e.message : String(e)}` };
  }
}

// ── Adressen ──
export const adresTekst = (a: Pick<GasAdres, "straat" | "huisnummer" | "toevoeging">) => `${a.straat} ${a.huisnummer}${a.toevoeging ? ` ${a.toevoeging}` : ""}`;
export const sorteerAdressen = (a: GasAdres, b: GasAdres) =>
  a.straat.localeCompare(b.straat, "nl") || (parseInt(a.huisnummer) || 0) - (parseInt(b.huisnummer) || 0) || a.toevoeging.localeCompare(b.toevoeging, "nl", { numeric: true });

export type StraatGroep = { straat: string; adressen: GasAdres[]; brief: number; afgesproken: number; open: number };
export function perStraat(adressen: GasAdres[]): StraatGroep[] {
  const m = new Map<string, GasAdres[]>();
  for (const a of [...adressen].sort(sorteerAdressen)) m.set(a.straat, [...(m.get(a.straat) ?? []), a]);
  return [...m.entries()].map(([straat, lijst]) => ({
    straat, adressen: lijst,
    brief: lijst.filter((a) => a.briefOp).length,
    afgesproken: lijst.filter((a) => a.status === "afgesproken").length,
    open: lijst.filter((a) => a.status === "open" || a.status === "niet_thuis").length,
  }));
}

export type GasTelling = { totaal: number; brief: number; afgesproken: number; nietThuis: number; weigert: number; teDoen: number; viaTelefoon: number; viaDeur: number };
export function telling(adressen: GasAdres[]): GasTelling {
  const t: GasTelling = { totaal: adressen.length, brief: 0, afgesproken: 0, nietThuis: 0, weigert: 0, teDoen: 0, viaTelefoon: 0, viaDeur: 0 };
  for (const a of adressen) {
    if (a.briefOp) t.brief++;
    if (a.status === "afgesproken") { t.afgesproken++; if (a.via === "deur") t.viaDeur++; else t.viaTelefoon++; }
    else if (a.status === "niet_thuis") { t.nietThuis++; t.teDoen++; }
    else if (a.status === "weigert") t.weigert++;
    else t.teDoen++;
  }
  return t;
}

// ── Planning ──
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const vandaagISO = () => iso(new Date());
export function plusDagen(s: string, n: number): string { const d = new Date(s + "T00:00:00"); d.setDate(d.getDate() + n); return iso(d); }
export function maandagVan(s: string): string { const d = new Date(s + "T00:00:00"); const dag = (d.getDay() + 6) % 7; d.setDate(d.getDate() - dag); return iso(d); }
export const isWerkdag = (s: string) => { const d = new Date(s + "T00:00:00").getDay(); return d >= 1 && d <= 5; };

// Werkdagen van het project: ma t/m vr binnen de periode, zonder de vrije dagen.
export function isProjectDag(p: GasProject, dag: string): boolean {
  if (!isWerkdag(dag)) return false;
  if (p.vanaf && dag < p.vanaf) return false;
  if (p.tot && dag > p.tot) return false;
  return !(p.vrijeDagen ?? []).includes(dag);
}

export type Slot = { datum: string; blok: GasBlok; bezet: number; vrij: number };
export function bezetting(adressen: GasAdres[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const a of adressen) if (a.status === "afgesproken" && a.datum && a.blok) m.set(`${a.datum}|${a.blok}`, (m.get(`${a.datum}|${a.blok}`) ?? 0) + 1);
  return m;
}
// De eerstvolgende tijdsblokken met plek (vanaf vandaag of de start van het project).
export function vrijeSlots(p: GasProject, adressen: GasAdres[], aantal = 12, maxDagen = 120): Slot[] {
  const bez = bezetting(adressen);
  const uit: Slot[] = [];
  let dag = [vandaagISO(), p.vanaf ?? ""].sort().pop()!;
  for (let i = 0; i < maxDagen && uit.length < aantal; i++, dag = plusDagen(dag, 1)) {
    if (p.tot && dag > p.tot) break;
    if (!isProjectDag(p, dag)) continue;
    for (const b of GAS_BLOKKEN) {
      const bezet = bez.get(`${dag}|${b.key}`) ?? 0;
      const vrij = Math.max(0, (p.ploegen || 1) - bezet);
      if (vrij > 0) uit.push({ datum: dag, blok: b.key, bezet, vrij });
    }
  }
  return uit.slice(0, aantal);
}

export const dagKort = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" });
export const dagLang = (s: string) => new Date(s + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

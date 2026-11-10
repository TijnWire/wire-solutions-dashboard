// "Checklist Consument Saneren" inscannen: van printscan (PDF) of telefoonfoto naar invulbare gegevens.
// ─────────────────────────────────────────────────────────────────────────────
// Twee routes, de betrouwbaarste eerst:
//  1. Een PDF mét tekstlaag (een digitaal ingevulde checklist, zoals een export uit Excel): we lezen de
//     tekst en kijken op welke plek van het formulier elk stukje staat. Exact, zonder AI.
//  2. Een foto, een gescande PDF zonder tekst, of als route 1 te weinig oplevert: de afbeelding gaat via
//     de AI-proxy (lib/aiTransport) naar een multimodaal model, dat de velden via een vast schema teruggeeft.
// Het resultaat is altijd een voorstel: de medewerker ziet alles op een pagina en kan het aanpassen.
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { postClaude, aiBeschikbaar } from "./aiTransport";
import { CHECKLIST_ANKERS, CHECKLIST_OPMERKINGEN, CHECKLIST_TABEL, CHECKLIST_VELDEN, type ChecklistVeld } from "./checklistVelden";
import type { ChecklistBewoner } from "./types";

export type ChecklistGegevens = { velden: Record<string, string>; bewoners: ChecklistBewoner[]; opmerkingen: string };
export type ScanResultaat = ({ ok: true; bron: "pdf" | "ai" } & ChecklistGegevens) | { ok: false; fout: string };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();

/** Een getypte/gelezen waarde terugbrengen naar één van de opties van een keuzeveld ("" als onduidelijk). */
export function kiesOptie(veld: ChecklistVeld, waarde: string): string {
  const opties = veld.opties ?? [];
  const w = norm(waarde);
  if (!w) return "";
  // Staat het hele rijtje er nog ("Ja / Nee"), dan is er niets gekozen.
  if (w === norm(opties.map((o) => o.label).join(" / "))) return "";
  const exact = opties.find((o) => norm(o.label) === w);
  if (exact) return exact.label;
  // "ja" / "j" / "x ja" e.d.
  const begin = opties.filter((o) => w.startsWith(norm(o.label)) || norm(o.label).startsWith(w));
  return begin.length === 1 ? begin[0].label : "";
}

// ── Route 1: tekst-PDF ──
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

type Stukje = { tekst: string; x0: number; x1: number; ym: number };

export async function leesChecklistTekstPdf(file: File): Promise<ScanResultaat> {
  let stukjes: Stukje[] = [];
  try {
    const pdfjs = await laadPdfjs();
    const taak = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
    const doc = await taak.promise;
    const pagina = await doc.getPage(1); // het formulier staat op blad 1; blad 2 is meestal de beheerkaart
    const vp = pagina.getViewport({ scale: 1 });
    const inhoud = await pagina.getTextContent();
    for (const it of inhoud.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
      const tekst = (it.str ?? "").trim();
      if (!tekst || !it.transform) continue;
      const [, , , , e, f] = it.transform;
      const h = it.height || Math.abs(it.transform[3]) || 8;
      stukjes.push({ tekst, x0: e, x1: e + (it.width ?? 0), ym: vp.height - f - h * 0.35 });
    }
    await taak.destroy();
  } catch {
    return { ok: false, fout: "Deze PDF kon niet als tekst gelezen worden." };
  }
  if (stukjes.length < 10) return { ok: false, fout: "Deze PDF bevat (bijna) geen tekst — waarschijnlijk een scan of foto." };

  // Het ingevulde exemplaar kan iets verschoven/geschaald zijn t.o.v. ons lege formulier: leg het erop
  // met twee vaste labels ("Postcode" bovenaan en "Huisnr" boven de tabel).
  const zoek = (t: string) => stukjes.find((s) => s.tekst === t || s.tekst.startsWith(t + " "));
  const pc = zoek("Postcode"), hn = zoek("Huisnr");
  if (!pc || !hn || !stukjes.some((s) => /checklist/i.test(s.tekst))) {
    return { ok: false, fout: "Dit lijkt geen Checklist Consument Saneren te zijn." };
  }
  const [tPcX, tPcY] = CHECKLIST_ANKERS.Postcode, [, tHnY] = CHECKLIST_ANKERS.Huisnr;
  const schaal = (tHnY - tPcY) / Math.max(1, hn.ym - pc.ym) || 1;
  // ym is het midden van de tekst; de ankers zijn de bovenkant van het woord → kleine correctie (≈ 0,6 × letterhoogte).
  const naarSjabloon = (s: Stukje): Stukje => ({
    ...s,
    x0: tPcX + (s.x0 - pc.x0) * schaal,
    x1: tPcX + (s.x1 - pc.x0) * schaal,
    ym: tPcY + 4 + (s.ym - pc.ym) * schaal,
  });
  stukjes = stukjes.map(naarSjabloon);
  const midX = (s: Stukje) => (s.x0 + s.x1) / 2;
  const inVak = (s: Stukje, [x0, top, x1, bottom]: readonly number[]) => midX(s) > x0 && midX(s) < x1 && s.ym > top && s.ym < bottom;
  const tekstIn = (vak: readonly number[]) => stukjes.filter((s) => inVak(s, vak)).sort((a, b) => a.ym - b.ym || a.x0 - b.x0).map((s) => s.tekst).join(" ").replace(/\s+/g, " ").trim();

  const velden: Record<string, string> = {};
  for (const v of CHECKLIST_VELDEN) {
    const t = tekstIn(v.cel);
    velden[v.key] = v.soort === "keuze" ? kiesOptie(v, t) : t;
  }

  const bewoners: ChecklistBewoner[] = [];
  const { top, regelhoogte, regels, kolommen } = CHECKLIST_TABEL;
  for (let r = 0; r < regels; r++) {
    const t0 = top + r * regelhoogte, t1 = t0 + regelhoogte;
    const cel = (k: keyof typeof kolommen) => tekstIn([kolommen[k][0], t0, kolommen[k][1], t1]);
    const rij = { huisnr: cel("huisnr"), naam: cel("naam"), telefoon: cel("telefoon"), opmerking: cel("opmerking") };
    if (rij.huisnr || rij.naam || rij.telefoon || rij.opmerking) bewoners.push(rij);
  }
  const [ox0, otop, ox1, obot] = CHECKLIST_OPMERKINGEN;
  const opmerkingen = tekstIn([ox0, otop + 2, ox1, obot]);

  const gevuld = Object.values(velden).filter(Boolean).length + bewoners.length;
  if (gevuld < 2) return { ok: false, fout: "Er stond (bijna) niets ingevuld op deze PDF." };
  return { ok: true, bron: "pdf", velden, bewoners, opmerkingen };
}

// ── Route 2: foto / scan via AI ──

// Foto's verkleinen en als JPEG versturen: scheelt veel data en werkt ook voor HEIC van iPhones (de
// browser decodeert die zelf).
async function afbeeldingNaarJpeg(file: File, max = 2200): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error("Kon de afbeelding niet openen."));
      i.src = url;
    });
    const f = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * f);
    c.height = Math.round(img.naturalHeight * f);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", 0.85).split(",")[1];
  } finally {
    URL.revokeObjectURL(url);
  }
}

function naarBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("lezen mislukt"));
    r.onload = () => { const s = String(r.result || ""); const i = s.indexOf("base64,"); resolve(i >= 0 ? s.slice(i + 7) : s); };
    r.readAsDataURL(file);
  });
}

const SYSTEEM =
  "Je leest een ingevuld Nederlands formulier 'Checklist Consument Saneren' (netbeheer, Stedin) van een foto of scan. " +
  "Neem precies over wat er staat; verzin niets en laat een veld leeg (\"\") als het niet is ingevuld of onleesbaar is. " +
  "Bij keuzevelden staan de opties voorgedrukt (bijv. 'Ja / Nee'). Kies alleen een optie als die duidelijk is aangeduid " +
  "(omcirkeld, onderstreept, aangekruist, gemarkeerd, of als de andere opties zijn doorgestreept/weggehaald). Staat het rijtje er " +
  "onaangeroerd, dan is het veld leeg. Geef de optie exact zoals in de lijst. Data als dd-mm-jjjj of zoals geschreven. " +
  "Telefoonnummers zoals geschreven. De bewonerstabel heeft kolommen Huisnr, Naam, Telefoonnummers, Opmerkingen: één object per regel " +
  "met inhoud. Roep exact één keer de tool 'lever_checklist' aan.";

function toolSchema() {
  const props: Record<string, unknown> = {};
  for (const v of CHECKLIST_VELDEN) {
    props[v.key] = v.soort === "keuze"
      ? { type: "string", description: `${v.label} — één van: ${(v.opties ?? []).map((o) => o.label).join(", ")}, of leeg`, enum: ["", ...(v.opties ?? []).map((o) => o.label)] }
      : { type: "string", description: v.label };
  }
  return {
    name: "lever_checklist",
    description: "Lever alle gegevens van de ingevulde checklist.",
    input_schema: {
      type: "object",
      properties: {
        velden: { type: "object", properties: props, required: Object.keys(props), additionalProperties: false },
        bewoners: {
          type: "array",
          items: {
            type: "object",
            properties: { huisnr: { type: "string" }, naam: { type: "string" }, telefoon: { type: "string" }, opmerking: { type: "string" } },
            required: ["huisnr", "naam", "telefoon", "opmerking"],
            additionalProperties: false,
          },
        },
        opmerkingen: { type: "string", description: "Tekst in het vak 'Opmerkingen schouw / AVO tekening'" },
      },
      required: ["velden", "bewoners", "opmerkingen"],
      additionalProperties: false,
    },
  };
}

export async function leesChecklistViaAI(bestanden: File[], signal?: AbortSignal): Promise<ScanResultaat> {
  if (!aiBeschikbaar()) return { ok: false, fout: "Foto's uitlezen kan alleen als je online bent ingelogd (de AI loopt via de server)." };
  const blokken: unknown[] = [];
  try {
    for (const f of bestanden) {
      if (f.type === "application/pdf" || /\.pdf$/i.test(f.name)) {
        blokken.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: await naarBase64(f) } });
      } else {
        blokken.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: await afbeeldingNaarJpeg(f) } });
      }
    }
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : "Kon het bestand niet lezen." };
  }
  const tool = toolSchema();
  const antwoord = await postClaude("", {
    model: "google/gemini-2.5-flash",
    max_tokens: 8000,
    system: [{ type: "text", text: SYSTEEM }],
    tools: [tool],
    tool_choice: { type: "tool", name: tool.name },
    messages: [{ role: "user", content: [...blokken, { type: "text", text: "Lees deze checklist uit en lever alle velden via de tool." }] }],
  }, signal);
  if (!antwoord.ok) return { ok: false, fout: antwoord.fout };
  const content = (antwoord.data as { content?: unknown[] })?.content;
  const blok = Array.isArray(content)
    ? (content.find((b) => (b as { type?: string; name?: string }).type === "tool_use") as { input?: Partial<ChecklistGegevens> } | undefined)
    : undefined;
  const inp = blok?.input;
  if (!inp || typeof inp !== "object") return { ok: false, fout: "De checklist kon niet worden uitgelezen. Probeer een scherpere foto, recht van boven." };

  const velden: Record<string, string> = {};
  for (const v of CHECKLIST_VELDEN) {
    const w = String((inp.velden as Record<string, unknown> | undefined)?.[v.key] ?? "").trim();
    velden[v.key] = v.soort === "keuze" ? kiesOptie(v, w) : w;
  }
  const bewoners = (Array.isArray(inp.bewoners) ? inp.bewoners : [])
    .map((b) => ({ huisnr: String(b?.huisnr ?? "").trim(), naam: String(b?.naam ?? "").trim(), telefoon: String(b?.telefoon ?? "").trim(), opmerking: String(b?.opmerking ?? "").trim() }))
    .filter((b) => b.huisnr || b.naam || b.telefoon || b.opmerking);
  return { ok: true, bron: "ai", velden, bewoners, opmerkingen: String(inp.opmerkingen ?? "").trim() };
}

/** Kies zelf de beste route: tekst-PDF eerst, anders (of bij te weinig resultaat) via AI. */
export async function scanChecklist(bestanden: File[], signal?: AbortSignal): Promise<ScanResultaat> {
  const pdfs = bestanden.filter((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  if (bestanden.length === 1 && pdfs.length === 1) {
    const r = await leesChecklistTekstPdf(pdfs[0]);
    if (r.ok) return r;
  }
  return leesChecklistViaAI(bestanden, signal);
}

export function legeChecklistGegevens(): ChecklistGegevens {
  return { velden: Object.fromEntries(CHECKLIST_VELDEN.map((v) => [v.key, ""])), bewoners: [], opmerkingen: "" };
}

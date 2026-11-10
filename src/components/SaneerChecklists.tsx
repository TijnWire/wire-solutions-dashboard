// Checklists Consument Saneren bij een sanering: inscannen (printscan-PDF of foto met de telefoon),
// de uitgelezen gegevens nalopen en aanvullen, en daarna als volledig ingevuld formulier downloaden.
import { useRef, useState } from "react";
import { Camera, ChevronDown, ChevronUp, ClipboardList, Download, FilePlus2, FileUp, Loader2, Plus, Trash2, UserPlus, X } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Bevestig, Card } from "./ui";
import { CHECKLIST_VELDEN, type ChecklistVeld } from "../lib/checklistVelden";
import { legeChecklistGegevens, scanChecklist } from "../lib/checklistScan";
import { checklistBestandsnaam, maakChecklistPdf } from "../lib/checklistPdf";
import { legeSaneerAdres, type ChecklistBewoner, type SaneerAdres, type SaneerChecklist } from "../lib/types";

const uid = () => Math.random().toString(36).slice(2, 10);
const knop = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";
const veldCls = "w-full rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50";
const GROEPEN: { key: ChecklistVeld["groep"]; titel: string }[] = [
  { key: "Adres", titel: "Adres & aansluitingen" },
  { key: "Planning", titel: "Planning & betrokkenen" },
  { key: "Techniek", titel: "Techniek" },
  { key: "Situatie", titel: "Situatie ter plaatse" },
];

function download(blob: Blob, naam: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
}

// "Monnetlaan 94 - 116, Utrecht" → straat "Monnetlaan", plaats "Utrecht".
export function splitsAdres(adres: string): { straat: string; plaats: string } {
  const [voor, ...na] = adres.split(",");
  const plaats = na.join(",").trim();
  const m = voor.trim().match(/^(.+?)\s+\d/);
  return { straat: (m ? m[1] : voor).trim(), plaats };
}
export const netPostcode = (p: string) => p.replace(/\s+/g, "").toUpperCase().replace(/^(\d{4})([A-Z]{2})$/, "$1 $2");
export const adresSleutel = (straat: string, nr: string) => `${straat}|${nr}`.toLowerCase().replace(/\s+/g, "");

// ── Eén keuzeveld als knoppen ──
function Keuzes({ veld, waarde, onChange, uit }: { veld: ChecklistVeld; waarde: string; onChange: (w: string) => void; uit: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(veld.opties ?? []).map((o) => {
        const actief = waarde === o.label;
        return (
          <button
            key={o.label}
            type="button"
            disabled={uit}
            onClick={() => onChange(actief ? "" : o.label)}
            aria-pressed={actief}
            className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-default ${actief ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-600 hover:border-brand-300 hover:bg-brand-50"}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ── De invulpagina van één checklist ──
function ChecklistBewerker({ c, uit, onWijzig, onSluit, onVerwijder, onOvernemen }: {
  c: SaneerChecklist;
  uit: boolean;
  onWijzig: (patch: Partial<SaneerChecklist>) => void;
  onSluit: () => void;
  onVerwijder: () => void;
  onOvernemen?: () => Promise<string> | string;
}) {
  const [pdfBezig, setPdfBezig] = useState(false);
  const [melding, setMelding] = useState<string | null>(null);
  const zetVeld = (k: string, w: string) => onWijzig({ velden: { ...c.velden, [k]: w } });
  const zetBewoner = (i: number, patch: Partial<ChecklistBewoner>) => onWijzig({ bewoners: c.bewoners.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const extraBewoner = () => {
    // Volgend huisnummer alvast voorstellen (94, 96, … → 98).
    const laatst = c.bewoners[c.bewoners.length - 1];
    const voor = c.bewoners[c.bewoners.length - 2];
    const n = Number(laatst?.huisnr), stap = Number(laatst?.huisnr) - Number(voor?.huisnr);
    const volgend = Number.isFinite(n) && n > 0 ? String(n + (Number.isFinite(stap) && stap > 0 && stap <= 4 ? stap : 1)) : "";
    onWijzig({ bewoners: [...c.bewoners, { huisnr: volgend, naam: "", telefoon: "", opmerking: "" }] });
  };

  const pdf = async () => {
    setPdfBezig(true);
    setMelding(null);
    try {
      download(await maakChecklistPdf(c), checklistBestandsnaam(c));
    } catch (e) {
      setMelding(e instanceof Error ? e.message : "De PDF kon niet worden gemaakt.");
    } finally {
      setPdfBezig(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" onClick={onSluit} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-500 hover:text-ink-800"><ChevronUp className="h-4 w-4" /> Inklappen</button>
        <div className="flex flex-wrap gap-2">
          {!uit && onOvernemen && <button type="button" onClick={async () => setMelding(await onOvernemen())} className={knop}><UserPlus className="h-4 w-4" /> Gegevens naar adressen</button>}
          <button type="button" onClick={pdf} disabled={pdfBezig} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
            {pdfBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Ingevulde checklist (PDF)
          </button>
        </div>
      </div>
      {melding && <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">{melding}</p>}
      {c.bron === "ai" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Automatisch uitgelezen van een foto/scan. Loop de gegevens even na, vooral namen en telefoonnummers.</p>
      )}

      {GROEPEN.map((g) => (
        <fieldset key={g.key} className="rounded-xl border border-ink-200 p-3 sm:p-4">
          <legend className="px-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">{g.titel}</legend>
          <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
            {CHECKLIST_VELDEN.filter((v) => v.groep === g.key).map((v) => (
              <label key={v.key} className={`block ${v.key === "typeSanering" || v.key === "adres" || v.key === "datumUitvoering" ? "sm:col-span-2" : ""}`}>
                <span className="mb-1 block text-xs font-semibold text-ink-600">{v.label}</span>
                {v.soort === "keuze" ? (
                  <Keuzes veld={v} waarde={c.velden[v.key] ?? ""} onChange={(w) => zetVeld(v.key, w)} uit={uit} />
                ) : (
                  <input value={c.velden[v.key] ?? ""} disabled={uit} onChange={(e) => zetVeld(v.key, e.target.value)} placeholder={v.soort === "datum" ? "bijv. 29-10-2026" : ""} className={veldCls} />
                )}
              </label>
            ))}
          </div>
        </fieldset>
      ))}

      {/* Bewoners: huisnummers, namen en telefoonnummers */}
      <fieldset className="rounded-xl border border-ink-200 p-3 sm:p-4">
        <legend className="px-1.5 text-xs font-bold uppercase tracking-wide text-ink-500">Bewoners ({c.bewoners.length})</legend>
        <div className="hidden grid-cols-[4.5rem_1fr_1fr_1.3fr_2rem] gap-2 px-0.5 pb-1 text-[11px] font-semibold uppercase text-ink-400 sm:grid">
          <span>Huisnr</span><span>Naam</span><span>Telefoon</span><span>Opmerking</span><span />
        </div>
        <div className="space-y-2">
          {c.bewoners.map((b, i) => (
            <div key={i} className="grid grid-cols-[4.5rem_1fr_2rem] gap-2 rounded-lg bg-ink-50/60 p-2 sm:grid-cols-[4.5rem_1fr_1fr_1.3fr_2rem] sm:bg-transparent sm:p-0">
              <input value={b.huisnr} disabled={uit} onChange={(e) => zetBewoner(i, { huisnr: e.target.value })} placeholder="Nr" aria-label="Huisnummer" className={veldCls} />
              <input value={b.naam} disabled={uit} onChange={(e) => zetBewoner(i, { naam: e.target.value })} placeholder="Naam" aria-label="Naam" className={veldCls} />
              <button type="button" disabled={uit} onClick={() => onWijzig({ bewoners: c.bewoners.filter((_, j) => j !== i) })} className="row-span-1 flex items-center justify-center rounded-lg text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30 sm:order-last" title="Regel verwijderen" aria-label="Regel verwijderen"><X className="h-4 w-4" /></button>
              <input value={b.telefoon} disabled={uit} onChange={(e) => zetBewoner(i, { telefoon: e.target.value })} placeholder="Telefoonnummer" inputMode="tel" aria-label="Telefoonnummer" className={`${veldCls} col-span-3 sm:col-span-1`} />
              <input value={b.opmerking} disabled={uit} onChange={(e) => zetBewoner(i, { opmerking: e.target.value })} placeholder="Opmerking" aria-label="Opmerking" className={`${veldCls} col-span-3 sm:col-span-1`} />
            </div>
          ))}
        </div>
        {!uit && <button type="button" onClick={extraBewoner} className={`${knop} mt-3`}><Plus className="h-4 w-4" /> Bewoner toevoegen</button>}
      </fieldset>

      <label className="block">
        <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-ink-500">Opmerkingen schouw / AVO tekening</span>
        <textarea value={c.opmerkingen} disabled={uit} onChange={(e) => onWijzig({ opmerkingen: e.target.value })} rows={4} className={veldCls} />
      </label>

      {!uit && (
        <div className="flex justify-end">
          <button type="button" onClick={onVerwijder} className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-600 hover:underline"><Trash2 className="h-4 w-4" /> Checklist verwijderen</button>
        </div>
      )}
    </div>
  );
}

// Waar de checklists bij horen: een saneerdossier (PD-nummer) of een oudere sanering. `overnemen` zet
// huisnummers/namen/telefoons uit de checklist door naar de adressen daarvan en geeft een melding terug.
export function SaneerChecklists({ pdNummer, saneringId, bewerkbaar, overnemen }: {
  pdNummer?: string;
  saneringId?: string;
  bewerkbaar: boolean;
  overnemen?: (c: SaneerChecklist) => Promise<string> | string;
}) {
  const { saneerChecklists, addSaneerChecklist, updateSaneerChecklist, deleteSaneerChecklist } = useApp();
  const [openId, setOpenId] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [weg, setWeg] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement | null>(null);
  const bestand = useRef<HTMLInputElement | null>(null);
  const lijst = saneerChecklists
    .filter((c) => (pdNummer ? c.pdNummer === pdNummer : c.saneringId === saneringId))
    .sort((a, b) => a.aangemaakt.localeCompare(b.aangemaakt));
  const nu = () => new Date().toISOString();

  const nieuw = (g: ReturnType<typeof legeChecklistGegevens>, bron: SaneerChecklist["bron"], bestandNaam?: string) => {
    const c: SaneerChecklist = { id: `cl-${uid()}`, aangemaakt: nu(), bijgewerktOp: nu(), bron, bestandNaam, pdNummer, saneringId, ...g };
    addSaneerChecklist(c);
    setOpenId(c.id);
  };

  const scan = async (files: File[]) => {
    if (!files.length) return;
    setBezig(true);
    setFout(null);
    const r = await scanChecklist(files);
    setBezig(false);
    if (!r.ok) { setFout(r.fout); return; }
    nieuw({ velden: { ...legeChecklistGegevens().velden, ...r.velden }, bewoners: r.bewoners, opmerkingen: r.opmerkingen }, r.bron, files.map((f) => f.name).join(", "));
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><ClipboardList className="h-4 w-4 text-brand-600" /> Checklists consument saneren</h3>
          <p className="mt-0.5 text-xs text-ink-500">Scan een ingevulde checklist (printscan of foto). De gegevens komen hier te staan om aan te vullen; download daarna het volledig ingevulde formulier.</p>
        </div>
        {bewerkbaar && (
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button type="button" disabled={bezig} onClick={() => camera.current?.click()} className={`${knop} flex-1 sm:flex-none`}><Camera className="h-4 w-4" /> Foto maken</button>
            <button type="button" disabled={bezig} onClick={() => bestand.current?.click()} className={`${knop} flex-1 sm:flex-none`}><FileUp className="h-4 w-4" /> Scan / PDF kiezen</button>
            <button type="button" disabled={bezig} onClick={() => nieuw(legeChecklistGegevens(), "handmatig")} className={`${knop} flex-1 sm:flex-none`}><FilePlus2 className="h-4 w-4" /> Leeg formulier</button>
            {/* capture opent op de telefoon direct de camera */}
            <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" aria-label="Foto van checklist maken" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void scan(f); }} />
            <input ref={bestand} type="file" accept="application/pdf,image/*" multiple className="hidden" aria-label="Scan of PDF van checklist kiezen" onChange={(e) => { const f = [...(e.target.files ?? [])]; e.target.value = ""; void scan(f); }} />
          </div>
        )}
      </div>

      {bezig && (
        <div className="flex items-center gap-3 rounded-lg bg-brand-50 px-3 py-3 text-sm text-brand-800">
          <Loader2 className="h-5 w-5 shrink-0 animate-spin" /> De checklist wordt uitgelezen… dit kan bij een foto zo'n 10–30 seconden duren.
        </div>
      )}
      {fout && (
        <div className="flex items-start justify-between gap-3 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <span>{fout}</span>
          <button type="button" onClick={() => setFout(null)} aria-label="Sluiten" className="shrink-0 text-red-400 hover:text-red-700"><X className="h-4 w-4" /></button>
        </div>
      )}

      {lijst.length === 0 && !bezig ? (
        <p className="rounded-lg bg-ink-50 px-3 py-5 text-center text-sm text-ink-400">Nog geen checklists.{bewerkbaar ? " Maak een foto, kies een scan of begin met een leeg formulier." : ""}</p>
      ) : (
        <div className="space-y-2">
          {lijst.map((c) => {
            const open = openId === c.id;
            return (
              <div key={c.id} className={`rounded-xl border ${open ? "border-brand-200 bg-white p-3 sm:p-4" : "border-ink-200"}`}>
                {open ? (
                  <ChecklistBewerker
                    c={c}
                    uit={!bewerkbaar}
                    onWijzig={(p) => updateSaneerChecklist(c.id, p)}
                    onSluit={() => setOpenId(null)}
                    onVerwijder={() => setWeg(c.id)}
                    onOvernemen={overnemen ? () => overnemen(c) : undefined}
                  />
                ) : (
                  <button type="button" onClick={() => setOpenId(c.id)} className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-ink-50">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><ClipboardList className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink-900">{c.velden.adres || "Checklist zonder adres"}{c.velden.postcode ? ` · ${c.velden.postcode}` : ""}</span>
                      <span className="block truncate text-xs text-ink-500">
                        {c.velden.datumUitvoering ? `Uitvoering ${c.velden.datumUitvoering} · ` : ""}{c.bewoners.length} bewoner{c.bewoners.length === 1 ? "" : "s"}
                        {c.bron === "ai" ? " · uit foto/scan" : c.bron === "pdf" ? " · uit PDF" : ""}
                      </span>
                    </span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-ink-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Bevestig
        open={!!weg}
        titel="Checklist verwijderen?"
        tekst="De ingevulde gegevens van deze checklist gaan verloren. De adressen van de sanering blijven staan."
        onBevestig={() => { if (weg) deleteSaneerChecklist(weg); setWeg(null); setOpenId(null); }}
        onAnnuleer={() => setWeg(null)}
      />
    </Card>
  );
}

// Voor een (oudere) sanering: vul namen/telefoons aan bij bestaande adressen en voeg ontbrekende toe.
export function checklistNaarSaneerAdressen(c: SaneerChecklist, adressen: SaneerAdres[]): { adressen: SaneerAdres[]; n: number } {
  const { straat, plaats } = splitsAdres(c.velden.adres ?? "");
  const postcode = netPostcode(c.velden.postcode ?? "");
  const uitkomst = [...adressen];
  let n = 0;
  for (const b of c.bewoners) {
    const nr = b.huisnr.trim();
    if (!nr) continue;
    const i = uitkomst.findIndex((a) => adresSleutel(a.straat, a.huisnummer) === adresSleutel(straat, nr));
    if (i >= 0) {
      const a = uitkomst[i];
      uitkomst[i] = { ...a, naam: a.naam || b.naam, telefoon: a.telefoon || b.telefoon, postcode: a.postcode || postcode, plaats: a.plaats || plaats, notitie: a.notitie || b.opmerking };
    } else {
      uitkomst.push({ ...legeSaneerAdres(uid()), straat, huisnummer: nr, postcode, plaats, naam: b.naam, telefoon: b.telefoon, notitie: b.opmerking });
    }
    n++;
  }
  return { adressen: uitkomst, n };
}

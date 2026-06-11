import { useEffect, useRef, useState } from "react";
import { Upload, X, Loader2, Check, KeyRound } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Keuze } from "./Keuze";
import { bestandsoort, verwerkBestand, bevestigOpslaan } from "../lib/extract/importeer";
import { valideer } from "../lib/extract/normaliseer";
import type { ImportDoel, ScanRij, WoningType } from "../lib/extract/types";

type Fase = "idle" | "bezig" | "geenSleutel" | "review" | "klaar";

const DOEL_LABEL: Record<ImportDoel, string> = {
  brievenronde: "Brievenronde",
  klant: "Klanten",
  afspraak: "Afspraken",
};

// Eén bewerkbare regel in de review-tabel.
function RijKaart({ rij, doel, onWijzig }: { rij: ScanRij; doel: ImportDoel; onWijzig: (id: string, patch: Partial<ScanRij>) => void }) {
  const v = valideer(rij, doel);
  const heeftFout = v.fouten.length > 0;
  const rand = heeftFout ? "border-red-300 bg-red-50/40" : rij.dupVan ? "border-amber-300 bg-amber-50/40" : "border-ink-200";
  const inp = "min-w-0 rounded-md border border-ink-200 px-2 py-1 text-sm outline-none focus:border-brand-400 focus:ring-1 focus:ring-brand-100";
  return (
    <div className={`rounded-xl border p-3 ${rand}`}>
      <div className="flex items-start gap-2.5">
        <input
          type="checkbox"
          checked={rij.opnemen && !heeftFout}
          disabled={heeftFout}
          onChange={(e) => onWijzig(rij.id, { opnemen: e.target.checked })}
          className="mt-1.5 h-4 w-4 shrink-0 accent-brand-600 disabled:opacity-40"
          title="Opnemen in import"
        />
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:grid-cols-12">
          <input value={rij.straat} onChange={(e) => onWijzig(rij.id, { straat: e.target.value })} placeholder="Straat" className={`${inp} col-span-2 sm:col-span-4`} />
          <input value={rij.huisnummer} onChange={(e) => onWijzig(rij.id, { huisnummer: e.target.value })} placeholder="Nr" className={`${inp} sm:col-span-2`} />
          <input value={rij.toevoeging} onChange={(e) => onWijzig(rij.id, { toevoeging: e.target.value })} placeholder="Toev." className={`${inp} sm:col-span-2`} />
          <input value={rij.postcode} onChange={(e) => onWijzig(rij.id, { postcode: e.target.value })} placeholder="Postcode" className={`${inp} sm:col-span-2`} />
          <input value={rij.plaats} onChange={(e) => onWijzig(rij.id, { plaats: e.target.value })} placeholder="Plaats" className={`${inp} col-span-2 sm:col-span-2`} />
          <input value={rij.naam} onChange={(e) => onWijzig(rij.id, { naam: e.target.value })} placeholder="Naam (optioneel)" className={`${inp} col-span-2 sm:col-span-5`} />
          <input value={rij.telefoon} onChange={(e) => onWijzig(rij.id, { telefoon: e.target.value })} placeholder="Telefoon" className={`${inp} sm:col-span-4`} />
          <div className="sm:col-span-3"><Keuze value={rij.type} onChange={(w) => onWijzig(rij.id, { type: w as WoningType })} opties={[{ waarde: "woning", label: "Woning" }, { waarde: "bedrijf", label: "Bedrijf" }]} size="sm" title="Type pand" /></div>
        </div>
      </div>
      {(heeftFout || v.warnings.length > 0 || rij.dupVan || rij.confidence < 0.85) && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 pl-7 text-xs">
          {rij.dupVan && <span className="text-amber-600">⚠ Bestaat al — standaard niet meegenomen</span>}
          {v.fouten.map((f) => <span key={f} className="font-medium text-red-600">● {f}</span>)}
          {v.warnings.map((w) => <span key={w} className="text-amber-600">● {w}</span>)}
          {rij.confidence < 0.85 && <span className="text-amber-600">● Lage zekerheid ({Math.round(rij.confidence * 100)}%) — controleer</span>}
        </div>
      )}
    </div>
  );
}

// Review-tabel: doelkeuze, bewerkbare rijen, samenvatting en importeerknop.
function ScanReview({
  rijen,
  setRijen,
  doel,
  setDoel,
  onBevestig,
  onOpnieuw,
}: {
  rijen: ScanRij[];
  setRijen: (updater: (prev: ScanRij[]) => ScanRij[]) => void;
  doel: ImportDoel;
  setDoel: (d: ImportDoel) => void;
  onBevestig: () => void;
  onOpnieuw: () => void;
}) {
  const wijzig = (id: string, patch: Partial<ScanRij>) => setRijen((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const importeerbaar = rijen.filter((r) => r.opnemen && valideer(r, doel).fouten.length === 0).length;
  const nDup = rijen.filter((r) => r.dupVan).length;
  const nFout = rijen.filter((r) => valideer(r, doel).fouten.length > 0).length;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-5 py-3 text-xs">
        <span className="text-ink-500">Importeren als:</span>
        <div className="inline-flex overflow-hidden rounded-lg border border-ink-200">
          {(["brievenronde", "klant", "afspraak"] as ImportDoel[]).map((d) => (
            <button key={d} type="button" onClick={() => setDoel(d)} className={`px-3 py-1.5 font-semibold transition-colors ${doel === d ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
              {DOEL_LABEL[d]}
            </button>
          ))}
        </div>
        <span className="ml-auto text-ink-400">{rijen.length} regels gevonden</span>
      </div>

      <div className="scrollbar-thin flex-1 space-y-2 overflow-y-auto px-5 py-3">
        {rijen.map((r) => (
          <RijKaart key={r.id} rij={r} doel={doel} onWijzig={wijzig} />
        ))}
      </div>

      <div className="border-t border-ink-100 px-5 py-3">
        <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <span className="font-semibold text-ink-700">{importeerbaar} klaar om te importeren</span>
          {nDup > 0 && <span className="text-amber-600">{nDup} duplicaat{nDup === 1 ? "" : "en"} (uitgevinkt)</span>}
          {nFout > 0 && <span className="text-red-600">{nFout} met fouten (corrigeer eerst)</span>}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onOpnieuw} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50">Ander bestand</button>
          <button type="button" onClick={onBevestig} disabled={importeerbaar === 0} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
            <Check className="h-4 w-4" /> Importeer ({importeerbaar})
          </button>
        </div>
      </div>
    </>
  );
}

export function BestandScanModal({ open, projectId, projectNaam, onSluit }: { open: boolean; projectId: string; projectNaam: string; onSluit: () => void }) {
  const { instellingen, rondes, klanten, addRonde, updateRonde, addKlant, addAfspraak } = useApp();
  const { navigeer } = useNav();
  const [fase, setFase] = useState<Fase>("idle");
  const [rijen, setRijen] = useState<ScanRij[]>([]);
  const [doel, setDoel] = useState<ImportDoel>("brievenronde");
  const [fout, setFout] = useState<string | null>(null);
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [resultaat, setResultaat] = useState(0);
  const [sleep, setSleep] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Begin altijd schoon bij (her)openen — voorkomt dat oude rijen/fouten van een vorig bestand blijven hangen.
  useEffect(() => {
    if (!open) return;
    setFase("idle");
    setRijen([]);
    setDoel("brievenronde");
    setFout(null);
    setBestandsnaam("");
    setResultaat(0);
  }, [open]);

  if (!open) return null;
  const heeftSleutel = !!instellingen.claudeKey.trim();
  const isPdf = bestandsnaam.toLowerCase().endsWith(".pdf");

  const reset = () => {
    setFase("idle");
    setRijen([]);
    setDoel("brievenronde");
    setFout(null);
    setBestandsnaam("");
    setResultaat(0);
  };
  const sluit = () => {
    abortRef.current?.abort();
    reset();
    onSluit();
  };

  const scan = async (file: File) => {
    setFase("bezig");
    const ac = new AbortController();
    abortRef.current = ac;
    const r = await verwerkBestand(file, instellingen.claudeKey, rondes, klanten, ac.signal);
    // Gebruiker sloot/annuleerde tijdens het scannen → niets meer instellen (voorkomt state-lek).
    if (ac.signal.aborted) return;
    abortRef.current = null;
    if (!r.ok) {
      setFout(r.fout);
      setFase("idle");
      return;
    }
    setRijen(r.rijen);
    setFase("review");
  };

  const kiesBestand = (file?: File | null) => {
    if (!file) return;
    setFout(null);
    setBestandsnaam(file.name);
    const soort = bestandsoort(file);
    if (soort === "onbekend") {
      setFout("Bestandstype niet ondersteund. Gebruik PDF, Excel (.xlsx/.xls) of CSV.");
      return;
    }
    // PDF's worden eerst lokaal uitgelezen (Stedin-afschakelbrieven, geen sleutel nodig); pas als dat niet
    // lukt is er een Claude-sleutel nodig — dat handelt verwerkBestand af met een duidelijke melding.
    void scan(file);
  };

  const bevestig = () => {
    const { aantal } = bevestigOpslaan(rijen, doel, { projectId, projectNaam, rondes, addRonde, updateRonde, addKlant, addAfspraak });
    setResultaat(aantal);
    setFase("klaar");
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={sluit} />
      <div className="relative flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink-900">Bestand scannen</h3>
            <p className="truncate text-xs text-ink-500">{projectNaam}</p>
          </div>
          <button type="button" onClick={sluit} className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100" title="Sluiten">
            <X className="h-5 w-5" />
          </button>
        </div>

        {fase === "idle" && (
          <div className="px-5 py-5">
            <div
              onDragOver={(e) => { e.preventDefault(); setSleep(true); }}
              onDragLeave={() => setSleep(false)}
              onDrop={(e) => { e.preventDefault(); setSleep(false); kiesBestand(e.dataTransfer.files?.[0]); }}
              className={`rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${sleep ? "border-brand-400 bg-brand-50" : "border-ink-200"}`}
            >
              <Upload className="mx-auto h-9 w-9 text-ink-300" />
              <p className="mt-3 text-sm font-semibold text-ink-800">Sleep een bestand hierheen</p>
              <button type="button" onClick={() => inputRef.current?.click()} className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                Kies bestand
              </button>
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; kiesBestand(f); }}
              />
              <p className="mx-auto mt-3 max-w-md text-xs text-ink-400">
                PDF, Excel (.xlsx/.xls) of CSV. <span className="font-medium text-ink-600">Stedin-afschakelbrieven (PDF)</span>, Excel en CSV worden direct lokaal en exact ingelezen — geen sleutel nodig.{heeftSleutel ? "" : " Andere PDF-soorten vragen een Claude API-sleutel."}
              </p>
            </div>
            {fout && <div className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}
          </div>
        )}

        {fase === "bezig" && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm font-semibold text-ink-800">{bestandsnaam || "Bestand"} wordt gescand…</p>
            <p className="max-w-xs text-xs text-ink-400">{isPdf ? "De adressen worden uit de PDF gelezen…" : "Bezig met inlezen."}</p>
            <button type="button" onClick={() => { abortRef.current?.abort(); setFase("idle"); }} className="mt-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50">
              Annuleren
            </button>
          </div>
        )}

        {fase === "geenSleutel" && (
          <div className="px-5 py-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-800">
                <KeyRound className="h-5 w-5" />
                <span className="font-semibold">Claude API-sleutel nodig voor PDF</span>
              </div>
              <p className="mt-2 text-sm text-amber-700">
                Om PDF's automatisch te scannen is een Claude API-sleutel vereist. Excel- en CSV-bestanden werken wél direct, zonder sleutel.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { onSluit(); reset(); navigeer("instellingen"); }} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  Naar Instellingen
                </button>
                <button type="button" onClick={() => { setFase("idle"); setBestandsnaam(""); }} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
                  Ander bestand kiezen
                </button>
              </div>
            </div>
          </div>
        )}

        {fase === "review" && (
          <ScanReview rijen={rijen} setRijen={setRijen} doel={doel} setDoel={setDoel} onBevestig={bevestig} onOpnieuw={reset} />
        )}

        {fase === "klaar" && (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <Check className="h-7 w-7 text-green-600" />
            </div>
            <p className="text-base font-bold text-ink-900">{resultaat} {resultaat === 1 ? "adres" : "adressen"} geïmporteerd</p>
            <p className="max-w-xs text-xs text-ink-400">Toegevoegd als {DOEL_LABEL[doel].toLowerCase()} aan {projectNaam}.</p>
            <button type="button" onClick={sluit} className="mt-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              Klaar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

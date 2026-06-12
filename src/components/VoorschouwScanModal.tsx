import { useEffect, useRef, useState } from "react";
import { X, Loader2, KeyRound, ScanLine, Trash2 } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { FotoKnoppen } from "./FotoKnoppen";
import { leesVoorschouwViaFotos } from "../lib/voorschouwScan";
import type { Voorschouw } from "../lib/types";

type Fase = "idle" | "bezig" | "geenSleutel";

// Fotografeer een met de hand ingevuld voorschouw-formulier → AI leest de velden → het formulier
// opent zich vooraf ingevuld (met de foto's erbij), zodat het als nette PDF eruit komt.
export function VoorschouwScanModal({ open, onSluit, onResultaat }: {
  open: boolean;
  onSluit: () => void;
  onResultaat: (velden: Partial<Voorschouw>, fotos: string[]) => void;
}) {
  const { instellingen } = useApp();
  const { navigeer } = useNav();
  const [fase, setFase] = useState<Fase>("idle");
  const [fotos, setFotos] = useState<File[]>([]);
  const [fout, setFout] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!open) return;
    setFase("idle"); setFotos([]); setFout(null);
  }, [open]);

  if (!open) return null;
  const heeftSleutel = !!instellingen.claudeKey.trim();

  const voegToe = (files: FileList | null) => {
    if (!files?.length) return;
    setFout(null);
    setFotos((p) => [...p, ...Array.from(files)]);
  };
  const verwijder = (i: number) => setFotos((p) => p.filter((_, idx) => idx !== i));

  const sluit = () => { abortRef.current?.abort(); onSluit(); };

  const scan = async () => {
    if (!fotos.length) return;
    if (!heeftSleutel) { setFase("geenSleutel"); return; }
    setFase("bezig");
    const ac = new AbortController();
    abortRef.current = ac;
    const r = await leesVoorschouwViaFotos(fotos, instellingen.claudeKey, ac.signal);
    if (ac.signal.aborted) return;
    abortRef.current = null;
    if (!r.ok) { setFout(r.fout); setFase("idle"); return; }
    onResultaat(r.velden, r.fotos);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={sluit} />
      <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-brand-50 p-2 text-brand-600"><ScanLine className="h-5 w-5" /></div>
            <div>
              <h3 className="text-base font-bold text-ink-900">Formulier scannen</h3>
              <p className="text-xs text-ink-500">Foto van een ingevuld voorschouw-blaadje → automatisch invullen.</p>
            </div>
          </div>
          <button type="button" onClick={sluit} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100" title="Sluiten"><X className="h-5 w-5" /></button>
        </div>

        {fase === "geenSleutel" ? (
          <div className="px-5 py-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-amber-800"><KeyRound className="h-5 w-5" /><span className="font-semibold">Claude API-sleutel nodig</span></div>
              <p className="mt-2 text-sm text-amber-700">Handgeschreven formulieren lezen met AI vereist een Claude API-sleutel. Vul die eenmalig in bij Instellingen → Integraties.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { onSluit(); navigeer("instellingen"); }} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Naar Instellingen</button>
                <button type="button" onClick={() => setFase("idle")} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">Terug</button>
              </div>
            </div>
          </div>
        ) : fase === "bezig" ? (
          <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
            <p className="text-sm font-semibold text-ink-800">Het formulier wordt gelezen…</p>
            <p className="max-w-xs text-xs text-ink-400">De AI leest de velden van de foto('s). Dit duurt een paar seconden.</p>
            <button type="button" onClick={() => { abortRef.current?.abort(); setFase("idle"); }} className="mt-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-medium text-ink-600 hover:bg-ink-50">Annuleren</button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <p className="text-sm text-ink-600">Maak een foto van het ingevulde formulier (of kies er een uit je galerij). Meerdere foto's mag — handig bij een formulier van twee kanten.</p>
            {fotos.length > 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
                {fotos.map((f, i) => (
                  <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-ink-200">
                    <img src={URL.createObjectURL(f)} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                    <button type="button" onClick={() => verwijder(i)} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100" title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
                <FotoKnoppen onFiles={voegToe} bezig={false} />
              </div>
            )}
            {fotos.length === 0 && (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-4"><FotoKnoppen onFiles={voegToe} bezig={false} /></div>
            )}
            {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}
            <button type="button" onClick={() => void scan()} disabled={fotos.length === 0} className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
              <ScanLine className="h-4 w-4" /> Scan en vul in ({fotos.length} foto{fotos.length === 1 ? "" : "'s"})
            </button>
            <p className="text-center text-xs text-ink-400">Je controleert daarna alles in het formulier voordat je opslaat.</p>
          </div>
        )}
      </div>
    </div>
  );
}

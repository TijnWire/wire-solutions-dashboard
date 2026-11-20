// Afsprakenperiode en tijdblokken instellen — gedeeld door Bodemonderzoeken en Schouwafspraken, zodat
// medewerkers en beheerders overal hetzelfde systeem zien.
//   • Periode: "Van – tot" (met werkdagen) of "Losse dagen" (bijv. ma 17-11, di 18-11 en vr 21-11).
//   • Tijdblokken: van, tot en de lengte van een tijdvak (bijv. 08:00–14:00 per uur), per project anders.
import type { ReactNode } from "react";
import { useState } from "react";
import { CalendarRange, Clock, Loader2, Plus, X } from "lucide-react";
import { DatumKiezer } from "./DatumKiezer";
import { dagenVanVenster, dagLabel, STANDAARD_WERKDAGEN, DAGNAMEN } from "../lib/bodemonderzoek";

export type Periode = { losseDagen?: boolean; start?: string; eind?: string; werkdagen?: number[]; dagen?: string[] };
export type Tijden = { van: string; tot: string; minuten: number };
export const STANDAARD_TIJDEN: Tijden = { van: "08:00", tot: "16:00", minuten: 60 };

// De tijden waaruit je kiest: elk kwartier van 06:00 tot 21:00.
const TIJDEN = Array.from({ length: 61 }, (_, i) => `${String(6 + Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const BLOKLENGTES = [15, 30, 45, 60, 90, 120];
const lengteLabel = (m: number) => (m < 60 ? `${m} minuten` : m === 60 ? "1 uur" : `${String(m / 60).replace(".", ",")} uur`);

export const dagenVanPeriode = (p?: Periode): string[] =>
  p ? dagenVanVenster({ start: p.start ?? "", weken: 2, eind: p.eind, werkdagen: p.werkdagen, losseDagen: p.losseDagen, dagen: p.dagen }) : [];

export function AfsprakenPeriode({ periode, onWijzig, extra }: {
  periode: Periode | undefined;
  onWijzig: (patch: Periode) => void;
  extra?: ReactNode; // bijv. "past het werk erin?"
}) {
  const losse = !!periode?.losseDagen;
  const dagen = dagenVanPeriode(periode);
  const werkdagen = periode?.werkdagen?.length ? periode.werkdagen : STANDAARD_WERKDAGEN;
  const [blokVan, setBlokVan] = useState("");
  const [blokTot, setBlokTot] = useState("");
  // Een blok dagen toevoegen (bijv. 13 t/m 14 nov, later nog 18 t/m 19 nov). Weekenden en
  // feestdagen slaan we over; één dag = alleen "van" invullen.
  const voegBlokToe = () => {
    if (!blokVan) return;
    const eind = blokTot && blokTot >= blokVan ? blokTot : blokVan;
    const nieuw = blokVan === eind ? [blokVan] : dagenVanVenster({ start: blokVan, weken: 0, eind });
    onWijzig({ dagen: [...new Set([...(periode?.dagen ?? []), ...nieuw])].sort() });
    setBlokVan(""); setBlokTot("");
  };

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
        <CalendarRange className="h-4 w-4 text-ink-400" /> Afsprakenperiode
      </div>
      <div className="mb-3 inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
        {([false, true] as const).map((l) => (
          <button key={String(l)} type="button" onClick={() => onWijzig({ losseDagen: l })}
            className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${losse === l ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
            {l ? "Losse dagen / blokken" : "Van – tot"}
          </button>
        ))}
      </div>

      {losse ? (
        <>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-500">Van</span>
              <DatumKiezer value={blokVan} onChange={setBlokVan} placeholder="Eerste dag" />
            </div>
            <span className="pb-2.5 text-sm text-ink-400">t/m</span>
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-500">Tot en met (optioneel)</span>
              <DatumKiezer value={blokTot} onChange={setBlokTot} placeholder="Laatste dag" />
            </div>
            <button type="button" onClick={voegBlokToe} disabled={!blokVan}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              <Plus className="h-4 w-4" /> Toevoegen
            </button>
          </div>
          <p className="mt-1 text-xs text-ink-500">Voeg zo vaak toe als nodig, bijvoorbeeld 13 t/m 14 nov en daarna 18 t/m 19 nov.</p>
          {dagen.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dagen.map((d) => (
                <span key={d} className="inline-flex items-center gap-1 rounded-full border border-brand-300 bg-brand-50 py-1 pl-3 pr-1 text-sm font-semibold text-brand-800">
                  {dagLabel(d)}
                  <button type="button" onClick={() => onWijzig({ dagen: (periode?.dagen ?? []).filter((x) => x !== d) })}
                    aria-label={`${dagLabel(d)} weghalen`} className="rounded-full p-1 text-brand-600 hover:bg-brand-100"><X className="h-3.5 w-3.5" /></button>
                </span>
              ))}
            </div>
          )}
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-500">Eerste dag</span>
              <DatumKiezer value={periode?.start ?? ""} onChange={(iso) => onWijzig({ start: iso })} placeholder="Kies de startdag" />
            </div>
            <span className="pb-2.5 text-sm text-ink-400">t/m</span>
            <div>
              <span className="mb-1 block text-xs font-medium text-ink-500">Laatste dag</span>
              <DatumKiezer value={periode?.eind ?? (dagen.length ? dagen[dagen.length - 1] : "")} onChange={(iso) => onWijzig({ eind: iso })} placeholder="Kies de einddag" />
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-ink-500">werkdagen:</span>
            {[1, 2, 3, 4, 5, 6, 0].map((d) => {
              const aan = werkdagen.includes(d);
              return (
                <button key={d} type="button" aria-pressed={aan}
                  onClick={() => onWijzig({ werkdagen: aan ? werkdagen.filter((x) => x !== d) : [...werkdagen, d].sort() })}
                  className={`h-9 w-9 rounded-lg border-2 text-xs font-bold uppercase transition-colors ${aan ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-400 hover:bg-ink-50"}`}>
                  {DAGNAMEN[d]}
                </button>
              );
            })}
          </div>
        </>
      )}

      <div className="mt-1.5 text-xs text-ink-500">
        {dagen.length > 0
          ? (losse ? `${dagen.length} ${dagen.length === 1 ? "dag" : "dagen"} gekozen.` : `${dagen.length} dagen: ${dagLabel(dagen[0])} t/m ${dagLabel(dagen[dagen.length - 1])} · feestdagen vallen automatisch weg.`)
          : losse ? "Voeg de dagen toe die de opdrachtgever heeft doorgegeven." : "Kies een eerste dag."}
      </div>
      {extra}
    </div>
  );
}

export function TijdblokKeuze({ tijden, onWijzig, bezig, children, alleenUren }: {
  tijden: Tijden | undefined;
  alleenUren?: boolean; // alleen hele uren, tijdvak altijd 1 uur
  onWijzig: (t: Tijden) => void;
  bezig?: boolean;
  children?: ReactNode; // bijv. de lijst met blokken aan/uit
}) {
  const t = tijden ?? STANDAARD_TIJDEN;
  const keuzes = alleenUren ? TIJDEN.filter((x) => x.endsWith(":00")) : TIJDEN;
  const select = "rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-sm font-semibold text-ink-800 outline-none focus:border-brand-400";
  const zet = (patch: Partial<Tijden>) => onWijzig({ ...t, ...patch });
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
        <Clock className="h-4 w-4 text-ink-400" /> Tijdblokken
        {bezig && <Loader2 className="h-3.5 w-3.5 animate-spin text-ink-400" />}
      </div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Van</span>
          <select value={t.van} onChange={(e) => zet({ van: e.target.value })} className={select}>
            {keuzes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Tot</span>
          <select value={t.tot} onChange={(e) => zet({ tot: e.target.value })} className={select}>
            {keuzes.map((x) => <option key={x} value={x}>{x}</option>)}
          </select>
        </label>
        {alleenUren ? (
          <span className="pb-2.5 text-sm font-semibold text-ink-600">per uur</span>
        ) : <label className="block">
          <span className="mb-1 block text-xs font-medium text-ink-500">Tijdvak</span>
          <select value={t.minuten} onChange={(e) => zet({ minuten: Number(e.target.value) })} className={select}>
            {BLOKLENGTES.map((m) => <option key={m} value={m}>{lengteLabel(m)}</option>)}
          </select>
        </label>}
      </div>
      {children}
    </div>
  );
}

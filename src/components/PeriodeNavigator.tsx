import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DatumKiezer } from "./DatumKiezer";
import { weekStartISO, weekEindISO, verschuifWeek, weekBereik, weekNummer } from "../lib/week";

export type Periode = "week" | "maand" | "kwartaal" | "alles";

const MAAND_NL = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const isoVan = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// Datumbereik [start,eind] (ISO) van de gekozen periode rond de ankerdatum. null = "alles" (geen filter).
export function periodeRange(periode: Periode, anker: string): { start: string; eind: string } | null {
  if (periode === "alles") return null;
  const ank = new Date(anker + "T00:00:00");
  if (periode === "week") { const ma = weekStartISO(anker) || anker; return { start: ma, eind: weekEindISO(ma) }; }
  if (periode === "maand") return { start: isoVan(new Date(ank.getFullYear(), ank.getMonth(), 1)), eind: isoVan(new Date(ank.getFullYear(), ank.getMonth() + 1, 0)) };
  const qq = Math.floor(ank.getMonth() / 3);
  return { start: isoVan(new Date(ank.getFullYear(), qq * 3, 1)), eind: isoVan(new Date(ank.getFullYear(), qq * 3 + 3, 0)) };
}

// Nette periode-schakelaar (week/maand/kwartaal/alles) met een ‹ vorige / volgende › navigator.
// Klik op het midden-label → een datumkiezer-popup waarmee je zelf een datum (en dus periode) prikt.
export function PeriodeNavigator({ periode, setPeriode, anker, setAnker, rechts }: {
  periode: Periode;
  setPeriode: (p: Periode) => void;
  anker: string;
  setAnker: (iso: string) => void;
  rechts?: ReactNode;
}) {
  const ank = new Date(anker + "T00:00:00");
  let label = "Alle periodes";
  let sub = "";
  if (periode === "week") { const ma = weekStartISO(anker) || anker; label = `Week ${weekNummer(ma)}`; sub = weekBereik(ma); }
  else if (periode === "maand") { label = `${MAAND_NL[ank.getMonth()]} ${ank.getFullYear()}`; }
  else if (periode === "kwartaal") { const qq = Math.floor(ank.getMonth() / 3); label = `Kwartaal ${qq + 1} · ${ank.getFullYear()}`; sub = `${MAAND_NL[qq * 3].slice(0, 3)}–${MAAND_NL[qq * 3 + 2].slice(0, 3)}`; }

  const verschuif = (delta: number) => {
    if (periode === "week") setAnker(verschuifWeek(anker, delta));
    else if (periode === "maand") setAnker(isoVan(new Date(ank.getFullYear(), ank.getMonth() + delta, 1)));
    else if (periode === "kwartaal") setAnker(isoVan(new Date(ank.getFullYear(), ank.getMonth() + delta * 3, 1)));
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl border border-ink-200 bg-white p-0.5">
          {(["week", "maand", "kwartaal", "alles"] as const).map((p) => (
            <button key={p} type="button" onClick={() => setPeriode(p)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${periode === p ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>{p}</button>
          ))}
        </div>
        {rechts && <div className="ml-auto">{rechts}</div>}
      </div>

      {periode !== "alles" && (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-ink-200 bg-white p-2">
          <button type="button" onClick={() => verschuif(-1)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-ink-50"><ChevronLeft className="h-4 w-4" /> Vorige</button>
          <div className="min-w-0 flex-1 px-1">
            <DatumKiezer
              value={anker}
              onChange={(iso) => setAnker(iso || anker)}
              weergave={sub ? `${label} · ${sub}` : label}
              triggerClassName="flex w-full items-center justify-center gap-1.5 rounded-lg px-2 py-1 text-center text-sm font-bold text-ink-900 hover:bg-ink-50"
            />
          </div>
          <button type="button" onClick={() => verschuif(1)} className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-600 hover:bg-ink-50">Volgende <ChevronRight className="h-4 w-4" /></button>
        </div>
      )}
    </div>
  );
}

import { type ReactNode } from "react";
import { Check, ChevronRight, Lock } from "lucide-react";
import { stapVan, stapOntgrendeld, volgendeStatus, type StapDef } from "../lib/flow";
import type { FlowStap, StapStatus } from "../lib/types";

const dotKleur: Record<StapStatus, string> = {
  open: "bg-ink-300 text-ink-600",
  bezig: "bg-amber-500 text-white",
  klaar: "bg-green-500 text-white",
};

export type FlowBoardProps = {
  defs: StapDef[];
  stappen: FlowStap[];
  onStatus: (key: string, status: StapStatus) => void;
  onActie: (def: StapDef) => void; // voor module-stappen (deep-link)
  renderPaneel: (key: string, stap: FlowStap) => ReactNode; // inline-inhoud per stap
};

export function FlowBoard({ defs, stappen, onStatus, onActie, renderPaneel }: FlowBoardProps) {
  const aantalKlaar = defs.filter((d) => stapVan(stappen, d.key).status === "klaar").length;
  const pct = defs.length ? Math.round((aantalKlaar / defs.length) * 100) : 0;
  const eersteOpen = defs.find((d) => stapVan(stappen, d.key).status !== "klaar" && stapOntgrendeld(d, stappen));

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
      <div className="border-b border-ink-100 px-4 py-3">
        <div className="mb-1.5 flex items-center justify-between text-sm">
          <span className="font-bold text-ink-900">Werkstroom</span>
          <span className="text-ink-500">{aantalKlaar} / {defs.length} klaar</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      <div className="space-y-2 p-3">
        {defs.map((def, i) => {
          const stap = stapVan(stappen, def.key);
          const ontgrendeld = stapOntgrendeld(def, stappen);
          const klaar = stap.status === "klaar";
          const actief = eersteOpen?.key === def.key;
          return (
            <div key={def.key} className={`rounded-xl border p-3 ${!ontgrendeld ? "border-ink-200 opacity-50" : actief && !klaar ? "border-brand-300 bg-brand-50/40" : "border-ink-200"}`}>
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  disabled={!ontgrendeld}
                  onClick={() => onStatus(def.key, volgendeStatus(stap.status))}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${dotKleur[stap.status]} disabled:cursor-not-allowed`}
                  title="Status wijzigen (open → bezig → klaar)"
                >
                  {klaar ? <Check className="h-4 w-4" /> : i + 1}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-ink-900">{def.label}</div>
                  {def.hint && <div className="text-xs text-ink-500">{def.hint}</div>}
                </div>
                {klaar && <span className="text-xs font-semibold text-green-600">klaar</span>}
                {!ontgrendeld && <Lock className="h-3.5 w-3.5 text-ink-400" />}
              </div>

              {ontgrendeld && (
                <div className="mt-2.5 space-y-2 pl-9">
                  {def.actie.soort === "inline" && renderPaneel(def.key, stap)}
                  {def.actie.soort === "module" && (
                    <button
                      type="button"
                      onClick={() => onActie(def)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"
                    >
                      Open in {def.label} <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {def.actie.soort === "markeer" && (
                    <button
                      type="button"
                      onClick={() => onStatus(def.key, klaar ? "open" : "klaar")}
                      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold ${klaar ? "border border-ink-200 text-ink-600 hover:bg-ink-50" : "bg-brand-600 text-white hover:bg-brand-700"}`}
                    >
                      <Check className="h-4 w-4" /> {klaar ? "Heropenen" : "Markeer als klaar"}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

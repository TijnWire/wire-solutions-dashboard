import { useMemo, useState } from "react";
import { CalendarDays, FileDown, FileText, Users, Loader2 } from "lucide-react";
import { Card } from "./ui";
import { dagLabel, telefoonNet, voortgangVan, TIJDSLOTS } from "../lib/bodemonderzoek";
import { exporteerBodemExcel, exporteerBodemPdf } from "../lib/bodemExport";
import type { TauwAdres, TauwOpdracht, User } from "../lib/types";

// Wat de beheerder ziet als de ronde loopt: hoe ver het staat, wat er per dag gepland is, en de knop
// om het naar TAUW of Van der Helm te sturen.

const knop = "inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40";

function Tegel({ n, label, kleur }: { n: number; label: string; kleur: string }) {
  return (
    <div className="rounded-xl border border-ink-200 bg-white px-3 py-2">
      <div className={`text-xl font-bold ${kleur}`}>{n}</div>
      <div className="text-[11px] leading-tight text-ink-500">{label}</div>
    </div>
  );
}

export function BodemOverzicht({ opdracht, users }: { opdracht: TauwOpdracht; users: User[] }) {
  const [bezig, setBezig] = useState<"" | "excel" | "pdf">("");
  const naamVan = (id?: string) => (id ? users.find((u) => u.id === id)?.naam ?? "Onbekend" : "—");
  const v = voortgangVan(opdracht.adressen);

  // Alle geplande afspraken, gegroepeerd per dag en dan per tijdblok — precies zoals de aannemer
  // zijn dag indeelt.
  const perDag = useMemo(() => {
    const m = new Map<string, Map<string, TauwAdres[]>>();
    for (const a of opdracht.adressen) {
      if (a.aanwezig !== "ja" || !a.datum || !a.tijdslot) continue;
      const dag = m.get(a.datum) ?? new Map<string, TauwAdres[]>();
      dag.set(a.tijdslot, [...(dag.get(a.tijdslot) ?? []), a]);
      m.set(a.datum, dag);
    }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [opdracht.adressen]);

  const exporteer = async (soort: "excel" | "pdf") => {
    setBezig(soort);
    try {
      if (soort === "excel") await exporteerBodemExcel(opdracht, naamVan);
      else exporteerBodemPdf(opdracht);
    } finally { setBezig(""); }
  };

  if (!opdracht.adressen.length) return null;

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-900">Voortgang en export</h3>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exporteer("excel")} disabled={!!bezig} className={knop}>
            {bezig === "excel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileDown className="h-4 w-4" />} Excel
          </button>
          <button type="button" onClick={() => void exporteer("pdf")} disabled={!!bezig} className={knop}>
            {bezig === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
          </button>
        </div>
      </div>

      {/* Cijfers in één oogopslag */}
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        <Tegel n={v.totaal} label="Adressen" kleur="text-ink-900" />
        <Tegel n={v.ja} label="Wil erbij zijn" kleur="text-green-700" />
        <Tegel n={v.nee} label="Hoeft niet" kleur="text-ink-700" />
        <Tegel n={v.geenGehoor + v.later} label="Nog terug" kleur={v.geenGehoor + v.later ? "text-amber-700" : "text-ink-400"} />
        <Tegel n={v.weigert + v.ongeldig} label="Weigert / ongeldig" kleur={v.weigert + v.ongeldig ? "text-red-700" : "text-ink-400"} />
        <Tegel n={v.open} label="Nog niet langs" kleur={v.open ? "text-ink-900" : "text-ink-400"} />
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink-500">
          <span>{v.behandeld} van {v.totaal} adressen afgehandeld</span>
          <span>{v.totaal ? Math.round((v.behandeld / v.totaal) * 100) : 0}%</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${v.totaal ? (v.behandeld / v.totaal) * 100 : 0}%` }} />
        </div>
      </div>

      {/* Per medewerker */}
      {(opdracht.team ?? []).length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <Users className="h-4 w-4 text-ink-400" /> Per medewerker
          </div>
          <div className="space-y-1.5">
            {(opdracht.team ?? []).map((id) => {
              const eigen = opdracht.adressen.filter((a) => a.toegewezenAan === id);
              const ev = voortgangVan(eigen);
              const pct = ev.totaal ? Math.round((ev.behandeld / ev.totaal) * 100) : 0;
              return (
                <div key={id} className="flex items-center gap-3">
                  <span className="w-28 shrink-0 truncate text-sm text-ink-700">{naamVan(id)}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-ink-100">
                    <div className="h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="w-20 shrink-0 text-right text-xs text-ink-500">{ev.behandeld}/{ev.totaal}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Agenda: wat staat er per dag gepland */}
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <CalendarDays className="h-4 w-4 text-ink-400" /> Geplande afspraken
        </div>
        {perDag.length === 0 ? (
          <p className="rounded-lg bg-ink-50 px-3 py-3 text-sm text-ink-500">Nog geen afspraken ingepland.</p>
        ) : (
          <div className="space-y-3">
            {perDag.map(([datum, blokken]) => (
              <div key={datum} className="overflow-hidden rounded-lg border border-ink-200">
                <div className="flex items-center justify-between bg-ink-50 px-3 py-1.5">
                  <span className="text-sm font-bold text-ink-800">{dagLabel(datum)}</span>
                  <span className="text-xs text-ink-500">
                    {(() => { const n = [...blokken.values()].reduce((s, l) => s + l.length, 0); return `${n} ${n === 1 ? "afspraak" : "afspraken"}`; })()}
                  </span>
                </div>
                {TIJDSLOTS.filter((s) => blokken.has(s)).map((s) => (
                  <div key={s} className="flex gap-3 border-t border-ink-100 px-3 py-1.5">
                    <span className="w-24 shrink-0 text-xs font-semibold text-ink-600">{s.replace("-", " – ")}</span>
                    <div className="min-w-0 flex-1 space-y-0.5">
                      {blokken.get(s)!.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-baseline gap-x-2 text-xs">
                          <span className="font-medium text-ink-800">{`${a.straat} ${a.huisnummer}`.trim()}</span>
                          <span className="text-ink-500">{a.plaats}</span>
                          <span className="text-ink-500">· {a.bewoner || "—"}</span>
                          <span className="text-ink-500">{telefoonNet(a.telefoon)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, Check, X, Trash2, CalendarDays, Plane } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { adresVanAfspraak } from "../lib/afspraak";
import { VERLOF_TYPES, type VerlofType } from "../lib/types";

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const verlofKleur: Record<VerlofType, string> = { Vakantie: "bg-green-500", Verlof: "bg-indigo-500", Ziek: "bg-red-500" };
const verlofTone: Record<VerlofType, string> = { Vakantie: "green", Verlof: "indigo", Ziek: "red" };

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

export function Agenda({ startForm = false }: { startForm?: boolean }) {
  const { afspraken, verlof, users, currentUser, addVerlof, updateVerlof, deleteVerlof } = useApp();
  const vandaag = new Date();
  const [jaar, setJaar] = useState(vandaag.getFullYear());
  const [maand, setMaand] = useState(vandaag.getMonth());
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(startForm);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";
  const initVan = (id: string) => users.find((u) => u.id === id)?.initialen ?? "?";

  const zichtbareAfspraken = isLeiding ? afspraken : afspraken.filter((a) => a.toegewezenAan === currentUser.id);

  // Verlofformulier
  const [vMedewerker, setVMedewerker] = useState(currentUser.id);
  const [vType, setVType] = useState<VerlofType>("Vakantie");
  const [vVan, setVVan] = useState(toISO(vandaag));
  const [vTot, setVTot] = useState(toISO(vandaag));
  const [vNotitie, setVNotitie] = useState("");

  // Bij het openen van het verlofformulier: er soepel naartoe scrollen + even laten oplichten.
  const [netGeopend, setNetGeopend] = useState(false);
  useEffect(() => {
    if (!formOpen) return;
    document.getElementById("verlof-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setNetGeopend(true);
    const t = setTimeout(() => setNetGeopend(false), 1200);
    return () => clearTimeout(t);
  }, [formOpen]);

  const opslaanVerlof = () => {
    if (!vVan || !vTot) return;
    addVerlof({
      medewerkerId: isLeiding ? vMedewerker : currentUser.id,
      type: vType,
      van: vVan <= vTot ? vVan : vTot,
      tot: vTot >= vVan ? vTot : vVan,
      status: isLeiding ? "Goedgekeurd" : "Aangevraagd",
      notitie: vNotitie.trim(),
    });
    setFormOpen(false);
    setVNotitie("");
  };

  // Kalendergrid (6 weken, maandag-start)
  const eerste = new Date(jaar, maand, 1);
  const start = (eerste.getDay() + 6) % 7;
  const cellen: Date[] = [];
  for (let i = 0; i < 42; i++) cellen.push(new Date(jaar, maand, 1 - start + i));

  const afsprakenOp = (iso: string) => zichtbareAfspraken.filter((a) => a.datum === iso);
  const verlofOp = (iso: string) => verlof.filter((v) => iso >= v.van && iso <= v.tot);

  const vorige = () => { if (maand === 0) { setMaand(11); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (maand === 11) { setMaand(0); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const naarVandaag = () => { setJaar(vandaag.getFullYear()); setMaand(vandaag.getMonth()); setGekozen(toISO(vandaag)); };

  const vandaagISO = toISO(vandaag);
  const mijnVerlof = isLeiding ? verlof : verlof.filter((v) => v.medewerkerId === currentUser.id);
  const sortedVerlof = [...mijnVerlof].sort((a, b) => a.van.localeCompare(b.van));
  // Openstaande aanvragen die de leiding/boekhouding nog moet goedkeuren.
  const aangevraagd = verlof.filter((v) => v.status === "Aangevraagd").sort((a, b) => a.van.localeCompare(b.van));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Agenda</h2>
          <p className="text-sm text-ink-500">Afspraken en verlof in één overzicht.</p>
        </div>
        <button type="button" onClick={() => { setFormOpen(true); setVMedewerker(currentUser.id); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          <Plane className="h-4 w-4" /> Verlof aanvragen
        </button>
      </div>

      {/* Verlof aanvragen — bovenaan zodat je 'm meteen ziet */}
      {formOpen && (
        <Card id="verlof-form" className={`space-y-3 p-4 transition-all duration-500 ${netGeopend ? "ring-4 ring-brand-400" : "ring-2 ring-brand-200"}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Verlof aanvragen</h3>
            <button type="button" onClick={() => setFormOpen(false)} className="text-ink-400 hover:text-ink-600" title="Sluiten"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Medewerker</label>
              {/* Werknemer kan alleen voor zichzelf verlof aanvragen; leiding mag iedereen kiezen. */}
              <Keuze
                value={isLeiding ? vMedewerker : currentUser.id}
                onChange={isLeiding ? setVMedewerker : () => {}}
                opties={isLeiding ? users.map((u) => ({ waarde: u.id, label: u.naam })) : [{ waarde: currentUser.id, label: currentUser.naam }]}
                disabled={!isLeiding}
                title="Medewerker"
              />
            </div>
            <div>
              <label className={labelCls}>Soort</label>
              <Keuze value={vType} onChange={(w) => setVType(w as VerlofType)} opties={VERLOF_TYPES.map((t) => ({ waarde: t, label: t }))} title="Soort verlof" />
            </div>
            <div>
              <label className={labelCls}>Van</label>
              <DatumKiezer value={vVan} onChange={setVVan} />
            </div>
            <div>
              <label className={labelCls}>Tot en met</label>
              <DatumKiezer value={vTot} onChange={setVTot} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Notitie (optioneel)</label>
            <input value={vNotitie} onChange={(e) => setVNotitie(e.target.value)} placeholder="Bijv. reden of bijzonderheid" className={veld} />
          </div>
          <button type="button" onClick={opslaanVerlof} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> {isLeiding ? "Inplannen" : "Aanvragen"}
          </button>
        </Card>
      )}

      {/* Goedkeuren — openstaande verlofaanvragen voor de leiding/boekhouding */}
      {isLeiding && aangevraagd.length > 0 && (
        <Card className="border-2 border-amber-200 bg-amber-50/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <Plane className="h-4 w-4 text-amber-600" /> Te beoordelen verlofaanvragen
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{aangevraagd.length}</span>
          </h3>
          <div className="space-y-2">
            {aangevraagd.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white p-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${verlofKleur[v.type]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-900">{naamVan(v.medewerkerId)} · {v.type}</div>
                  <div className="text-xs text-ink-500">{fmt(v.van)} t/m {fmt(v.tot)}{v.notitie ? ` · ${v.notitie}` : ""}</div>
                </div>
                <button type="button" onClick={() => updateVerlof(v.id, { status: "Goedgekeurd" })} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"><Check className="h-4 w-4" /> Goedkeuren</button>
                <button type="button" onClick={() => updateVerlof(v.id, { status: "Afgewezen" })} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"><X className="h-4 w-4" /> Afwijzen</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Kalender */}
      <Card className="p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-xl font-bold text-ink-900">{MAANDEN[maand]} {jaar}</h3>
          <div className="flex items-center gap-1.5">
            <button type="button" onClick={naarVandaag} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">Vandaag</button>
            <button type="button" onClick={vorige} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Vorige maand"><ChevronLeft className="h-5 w-5" /></button>
            <button type="button" onClick={volgende} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Volgende maand"><ChevronRight className="h-5 w-5" /></button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1.5">
          {DAGEN.map((d) => (<div key={d} className="pb-2 text-center text-sm font-semibold uppercase tracking-wide text-ink-400">{d}</div>))}
          {cellen.map((d) => {
            const iso = toISO(d);
            const inMaand = d.getMonth() === maand;
            const isVandaag = iso === vandaagISO;
            const afs = afsprakenOp(iso);
            const vrl = verlofOp(iso);
            return (
              <button
                key={iso}
                type="button"
                onClick={() => setGekozen(iso)}
                className={`flex min-h-[112px] flex-col rounded-xl border p-2 text-left align-top transition-colors ${
                  gekozen === iso ? "border-brand-400 ring-2 ring-brand-200" : "border-ink-100 hover:bg-ink-50"
                } ${inMaand ? "bg-white" : "bg-ink-50/50"}`}
              >
                <div className={`text-sm font-bold ${isVandaag ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white" : inMaand ? "text-ink-800" : "text-ink-300"}`}>{d.getDate()}</div>
                {afs.length > 0 && (
                  <div className="mt-1.5 truncate rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{afs.length} afspr.</div>
                )}
                {vrl.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {vrl.slice(0, 5).map((v) => (
                      <span key={v.id} className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ${verlofKleur[v.type]}`} title={`${naamVan(v.medewerkerId)} — ${v.type}`}>
                        {initVan(v.medewerkerId)}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Legenda */}
        <div className="mt-4 flex flex-wrap gap-5 border-t border-ink-100 pt-4 text-sm text-ink-500">
          {VERLOF_TYPES.map((t) => (
            <span key={t} className="inline-flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${verlofKleur[t]}`} /> {t}</span>
          ))}
        </div>
      </Card>

      {/* Gekozen dag */}
      {gekozen && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold text-ink-900">{new Date(gekozen + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" })}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-500">Afspraken</div>
              {afsprakenOp(gekozen).length === 0 ? <p className="text-sm text-ink-400">Geen afspraken.</p> : (
                <div className="space-y-1.5">
                  {afsprakenOp(gekozen).sort((a, b) => (a.tijd || "").localeCompare(b.tijd || "")).map((a) => (
                    <div key={a.id} className="rounded-lg border border-ink-200 p-2 text-sm">
                      <span className="font-semibold text-ink-800">{a.tijd || "—"}</span> · {a.klantNaam || "—"} · <span className="text-ink-500">{adresVanAfspraak(a)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-500">Verlof / afwezig</div>
              {verlofOp(gekozen).length === 0 ? <p className="text-sm text-ink-400">Iedereen aanwezig.</p> : (
                <div className="space-y-1.5">
                  {verlofOp(gekozen).map((v) => (
                    <div key={v.id} className="flex items-center gap-2 rounded-lg border border-ink-200 p-2 text-sm">
                      <span className={`h-2.5 w-2.5 rounded-full ${verlofKleur[v.type]}`} />
                      <span className="font-medium text-ink-800">{naamVan(v.medewerkerId)}</span>
                      <span className="text-ink-500">{v.type}</span>
                      <Badge tone={v.status === "Goedgekeurd" ? "green" : v.status === "Afgewezen" ? "red" : "amber"}>{v.status}</Badge>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* Verlofoverzicht (HR) */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
          <CalendarDays className="h-4 w-4 text-ink-500" />
          {isLeiding ? "Verlofoverzicht (HR)" : "Mijn verlof"}
        </h3>
        {sortedVerlof.length === 0 ? (
          <p className="text-sm text-ink-400">Geen verlof ingepland.</p>
        ) : (
          <div className="space-y-2">
            {sortedVerlof.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${verlofKleur[v.type]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-900">{naamVan(v.medewerkerId)} · {v.type}</div>
                  <div className="text-xs text-ink-500">{fmt(v.van)} t/m {fmt(v.tot)}{v.notitie ? ` · ${v.notitie}` : ""}</div>
                </div>
                <Badge tone={(verlofTone[v.type] && v.status === "Goedgekeurd") ? "green" : v.status === "Afgewezen" ? "red" : "amber"}>{v.status}</Badge>
                {isLeiding && v.status === "Aangevraagd" && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => updateVerlof(v.id, { status: "Goedgekeurd" })} className="rounded-lg p-1.5 text-green-600 hover:bg-green-50" title="Goedkeuren"><Check className="h-4 w-4" /></button>
                    <button type="button" onClick={() => updateVerlof(v.id, { status: "Afgewezen" })} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Afwijzen"><X className="h-4 w-4" /></button>
                  </div>
                )}
                {(isLeiding || (v.medewerkerId === currentUser.id && v.status === "Aangevraagd")) && (
                  <button type="button" onClick={() => deleteVerlof(v.id)} className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

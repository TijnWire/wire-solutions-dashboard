import { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, CalendarDays, Plane, CheckSquare, Square, Filter, Cake, Megaphone, PartyPopper, Video, type LucideIcon } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer } from "../components/TijdKiezer";
import { Keuze } from "../components/Keuze";
import { weekStartISO, verschuifWeek, weekBereik } from "../lib/week";
import { VERLOF_TYPES, type VerlofType, type VerlofStatus, type Verlof as VerlofT } from "../lib/types";
import { useVerlofBeslissingen } from "../lib/verlofBeslissingen";
import { TelefoonAgenda } from "../components/TelefoonAgenda";
import { AGENDA_SOORTEN, AGENDA_SOORT_LABEL, gebeurtenissenTussen, valtOp, type AgendaGebeurtenis, type AgendaSoort } from "../lib/agendaFeed";

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

const verlofKleur: Record<VerlofType, string> = { Vakantie: "bg-green-500", Verlof: "bg-indigo-500", Ziek: "bg-red-500" };

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmt(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
}
function dagLang(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
}

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

// Kleur en icoon per soort gebeurtenis. De agenda toont uitsluitend deze vijf soorten.
const SOORT_STIJL: Record<AgendaSoort, { chip: string; icoon: LucideIcon }> = {
  verlof: { chip: "bg-indigo-50 text-indigo-700", icoon: Plane },
  meeting: { chip: "bg-brand-100 text-brand-800", icoon: Video },
  mededeling: { chip: "bg-amber-50 text-amber-700", icoon: Megaphone },
  verjaardag: { chip: "bg-pink-50 text-pink-700", icoon: Cake },
  feestdag: { chip: "bg-red-50 text-red-700", icoon: PartyPopper },
};

// ── Compacte dag-pop-up: wat staat er op deze dag, snel een meeting toevoegen + to-do-lijst ──
function DagPopup({ iso, gebeurtenissen, onClose }: { iso: string; gebeurtenissen: AgendaGebeurtenis[]; onClose: () => void }) {
  const { todos, users, currentUser, addAgendaItem, deleteAgendaItem, addTodo, updateTodo, deleteTodo } = useApp();
  const [titel, setTitel] = useState("");
  const [tijd, setTijd] = useState("");
  const [wie, setWie] = useState(currentUser?.id ?? "");
  const [todoTekst, setTodoTekst] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  const opDag = gebeurtenissen.filter((g) => valtOp(g, iso));
  const dagTodos = todos.filter((t) => t.userId === currentUser.id && (t.datum === iso || !t.datum)).sort((a, b) => Number(a.klaar) - Number(b.klaar) || b.aangemaakt.localeCompare(a.aangemaakt));

  const voegItem = () => { if (!titel.trim()) return; addAgendaItem({ titel: titel.trim(), datum: iso, tijd, toegewezenAan: (isLeiding ? wie : currentUser.id) || undefined }); setTitel(""); setTijd(""); };
  const voegTodo = () => { if (!todoTekst.trim()) return; addTodo({ tekst: todoTekst.trim(), klaar: false, userId: currentUser.id, datum: iso }); setTodoTekst(""); };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4" onClick={onClose}>
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 shadow-cardhover sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold capitalize text-ink-900">{dagLang(iso)}</h3>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Sluiten"><X className="h-5 w-5" /></button>
        </div>

        {/* Snel een meeting toevoegen */}
        <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
          <div className="flex flex-wrap gap-2">
            <input value={titel} onChange={(e) => setTitel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") voegItem(); }} placeholder="Meeting of afspraak in de agenda…" className={veld + " min-w-0 flex-1"} />
            <div className="w-28 shrink-0"><TijdKiezer value={tijd} onChange={setTijd} size="sm" placeholder="Tijd" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLeiding && (
              <div className="min-w-40 flex-1"><Keuze value={wie} onChange={setWie} altijdZoeken opties={[{ waarde: "", label: "Iedereen" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Voor wie" /></div>
            )}
            <button type="button" onClick={voegItem} disabled={!titel.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"><Plus className="h-4 w-4" /> Toevoegen</button>
          </div>
        </div>

        {/* Overzicht van de dag */}
        <div className="mt-4 space-y-1.5">
          {opDag.length === 0 ? (
            <p className="text-sm text-ink-400">Niets in de agenda op deze dag.</p>
          ) : (
            opDag.map((g) => {
              const st = SOORT_STIJL[g.soort];
              const Icoon = st.icoon;
              return (
                <div key={g.id} className="flex items-start gap-2 rounded-lg border border-ink-200 p-2 text-sm">
                  <span className={`mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${st.chip}`}><Icoon className="h-3.5 w-3.5" /></span>
                  <div className="min-w-0 flex-1">
                    <div className="text-ink-800">{g.tijd ? <span className="mr-1.5 font-semibold">{g.tijd}</span> : null}{g.titel}</div>
                    <div className="text-xs text-ink-400">{AGENDA_SOORT_LABEL[g.soort]}{g.totDatum && g.totDatum !== g.datum ? ` · ${fmt(g.datum)} t/m ${fmt(g.totDatum)}` : ""}</div>
                  </div>
                  {g.soort === "meeting" && g.bronId && (isLeiding || !g.wie || g.wie === currentUser.id) && (
                    <button type="button" onClick={() => deleteAgendaItem(g.bronId!)} className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* To-do-lijst */}
        <div className="mt-4 border-t border-ink-100 pt-3">
          <h4 className="mb-2 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-ink-500"><CheckSquare className="h-3.5 w-3.5" /> To-do</h4>
          <div className="mb-2 flex gap-2">
            <input value={todoTekst} onChange={(e) => setTodoTekst(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") voegTodo(); }} placeholder="Nieuwe to-do…" className={veld + " min-w-0 flex-1"} />
            <button type="button" onClick={voegTodo} disabled={!todoTekst.trim()} title="To-do toevoegen" aria-label="To-do toevoegen" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40"><Plus className="h-4 w-4" /></button>
          </div>
          {dagTodos.length === 0 ? (
            <p className="text-sm text-ink-400">Geen to-do's.</p>
          ) : (
            <div className="space-y-1">
              {dagTodos.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm">
                  <button type="button" onClick={() => updateTodo(t.id, { klaar: !t.klaar })} className="shrink-0 text-brand-600" title={t.klaar ? "Markeer als open" : "Markeer als klaar"}>
                    {t.klaar ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-ink-400" />}
                  </button>
                  <span className={`min-w-0 flex-1 truncate ${t.klaar ? "text-ink-400 line-through" : "text-ink-800"}`}>{t.tekst}</span>
                  <button type="button" onClick={() => deleteTodo(t.id)} className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Agenda() {
  const { verlof, agendaItems, mededelingen, users, currentUser, addVerlof, deleteVerlof } = useApp();
  const { map: beslissingen } = useVerlofBeslissingen();
  const vandaag = new Date();
  const [weergave, setWeergave] = useState<"maand" | "week">("maand");
  const [jaar, setJaar] = useState(vandaag.getFullYear());
  const [maand, setMaand] = useState(vandaag.getMonth());
  const [weekAnker, setWeekAnker] = useState(weekStartISO(toISO(vandaag)));
  const [popupDag, setPopupDag] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Filter op soort (geldt voor maand én week) en op medewerker (alleen leiding)
  const [zichtbareSoorten, setZichtbareSoorten] = useState<Set<AgendaSoort>>(new Set(AGENDA_SOORTEN));
  const [ftWie, setFtWie] = useState("");

  // Kalendergrid (6 weken, maandag-start)
  const eerste = new Date(jaar, maand, 1);
  const start = (eerste.getDay() + 6) % 7;
  const cellen: Date[] = [];
  for (let i = 0; i < 42; i++) cellen.push(new Date(jaar, maand, 1 - start + i));
  // Week-dagen (7) vanaf de maandag-anker
  const weekDagen: string[] = [];
  {
    const ma = new Date(weekAnker + "T00:00:00");
    for (let i = 0; i < 7; i++) { const d = new Date(ma); d.setDate(ma.getDate() + i); weekDagen.push(toISO(d)); }
  }
  const vanISO = weergave === "maand" ? toISO(cellen[0]) : weekDagen[0];
  const totISO = weergave === "maand" ? toISO(cellen[41]) : weekDagen[6];
  const isLeiding = !!currentUser && (currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr");

  const verlofStatus = useMemo(() => Object.fromEntries(Object.entries(beslissingen).map(([id, b]) => [id, b.status as string])), [beslissingen]);
  const alle = useMemo(
    () => (currentUser ? gebeurtenissenTussen({ users, verlof, agendaItems, mededelingen, verlofStatus }, vanISO, totISO, { id: currentUser.id, leiding: isLeiding }) : []),
    [users, verlof, agendaItems, mededelingen, verlofStatus, vanISO, totISO, currentUser, isLeiding],
  );
  // Verlof en meetings kun je op medewerker filteren; feestdagen, verjaardagen en mededelingen blijven staan.
  const gebeurtenissen = useMemo(
    () => alle.filter((g) => zichtbareSoorten.has(g.soort) && (!ftWie || !(g.soort === "verlof" || g.soort === "meeting") || g.wie === ftWie || (g.soort === "meeting" && !g.wie))),
    [alle, zichtbareSoorten, ftWie],
  );

  // Verlofformulier
  const [vMedewerker, setVMedewerker] = useState(currentUser?.id ?? "");
  const [vType, setVType] = useState<VerlofType>("Vakantie");
  const [vVan, setVVan] = useState(toISO(vandaag));
  const [vTot, setVTot] = useState(toISO(vandaag));
  const [vNotitie, setVNotitie] = useState("");
  const [netGeopend, setNetGeopend] = useState(false);
  useEffect(() => {
    if (!formOpen) return;
    document.getElementById("verlof-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
    setNetGeopend(true);
    const t = setTimeout(() => setNetGeopend(false), 1200);
    return () => clearTimeout(t);
  }, [formOpen]);

  if (!currentUser) return null;
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";
  const initVan = (id: string) => users.find((u) => u.id === id)?.initialen ?? "?";
  const effStatus = (v: VerlofT): VerlofStatus => beslissingen[v.id]?.status ?? v.status;

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

  const opDag = (iso: string) => gebeurtenissen.filter((g) => valtOp(g, iso));
  const verlofType = (g: AgendaGebeurtenis): VerlofType => verlof.find((v) => v.id === g.bronId)?.type ?? "Verlof";

  const vorige = () => { if (maand === 0) { setMaand(11); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (maand === 11) { setMaand(0); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const naarVandaag = () => { setJaar(vandaag.getFullYear()); setMaand(vandaag.getMonth()); setWeekAnker(weekStartISO(toISO(vandaag))); };

  const vandaagISO = toISO(vandaag);
  const mijnVerlof = isLeiding ? verlof : verlof.filter((v) => v.medewerkerId === currentUser.id);
  const sortedVerlof = [...mijnVerlof].sort((a, b) => a.van.localeCompare(b.van));

  const wisselSoort = (s: AgendaSoort) => setZichtbareSoorten((prev) => { const n = new Set(prev); n.has(s) ? n.delete(s) : n.add(s); return n; });

  // Filterbalk: welke soorten tonen (en voor leiding: van wie)
  const filterBalk = (
    <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-ink-50/50 p-2">
      <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500"><Filter className="h-3.5 w-3.5" /> Toon</span>
      {AGENDA_SOORTEN.map((s) => {
        const aan = zichtbareSoorten.has(s);
        const Icoon = SOORT_STIJL[s].icoon;
        return (
          <button key={s} type="button" onClick={() => wisselSoort(s)} aria-pressed={aan ? "true" : "false"} className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${aan ? SOORT_STIJL[s].chip + " ring-1 ring-inset ring-black/5" : "bg-white text-ink-400 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
            <Icoon className="h-3.5 w-3.5" /> {AGENDA_SOORT_LABEL[s]}
          </button>
        );
      })}
      {isLeiding && (
        <div className="ml-auto w-44"><Keuze value={ftWie} onChange={setFtWie} altijdZoeken opties={[{ waarde: "", label: "Iedereen" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Medewerker" /></div>
      )}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Agenda</h2>
          <p className="text-sm text-ink-500">Verlof, meetings, mededelingen, verjaardagen en feestdagen.</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Maand / Week schakelaar */}
          <div className="flex rounded-xl border border-ink-200 bg-white p-0.5">
            {(["maand", "week"] as const).map((w) => (
              <button key={w} type="button" onClick={() => setWeergave(w)} className={`rounded-lg px-3 py-1.5 text-sm font-semibold capitalize transition-colors ${weergave === w ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>{w}</button>
            ))}
          </div>
          <button type="button" onClick={() => { setFormOpen(true); setVMedewerker(currentUser.id); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plane className="h-4 w-4" /> Verlof
          </button>
        </div>
      </div>

      {/* Verlof aanvragen */}
      {formOpen && (
        <Card id="verlof-form" className={`space-y-3 p-4 transition-all duration-500 ${netGeopend ? "ring-4 ring-brand-400" : "ring-2 ring-brand-200"}`}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Verlof aanvragen</h3>
            <button type="button" onClick={() => setFormOpen(false)} className="text-ink-400 hover:text-ink-600" title="Sluiten"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Medewerker</label>
              <Keuze value={isLeiding ? vMedewerker : currentUser.id} onChange={isLeiding ? setVMedewerker : () => {}} altijdZoeken opties={isLeiding ? users.map((u) => ({ waarde: u.id, label: u.naam })) : [{ waarde: currentUser.id, label: currentUser.naam }]} disabled={!isLeiding} title="Medewerker" />
            </div>
            <div>
              <label className={labelCls}>Soort</label>
              <Keuze value={vType} onChange={(w) => setVType(w as VerlofType)} opties={VERLOF_TYPES.map((t) => ({ waarde: t, label: t }))} title="Soort verlof" />
            </div>
            <div><label className={labelCls}>Van</label><DatumKiezer value={vVan} onChange={setVVan} /></div>
            <div><label className={labelCls}>Tot en met</label><DatumKiezer value={vTot} onChange={setVTot} /></div>
          </div>
          <div><label className={labelCls}>Notitie (optioneel)</label><input value={vNotitie} onChange={(e) => setVNotitie(e.target.value)} placeholder="Bijv. reden of bijzonderheid" className={veld} /></div>
          <button type="button" onClick={opslaanVerlof} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> {isLeiding ? "Inplannen" : "Aanvragen"}</button>
        </Card>
      )}

      {weergave === "maand" ? (
        /* ── Maandkalender ── */
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-xl font-bold text-ink-900">{MAANDEN[maand]} {jaar}</h3>
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={naarVandaag} className="rounded-xl border border-ink-200 px-4 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">Vandaag</button>
              <button type="button" onClick={vorige} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Vorige maand"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={volgende} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Volgende maand"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
          {filterBalk}
          <div className="grid grid-cols-7 gap-1.5">
            {DAGEN.map((d) => (<div key={d} className="pb-2 text-center text-sm font-semibold uppercase tracking-wide text-ink-400">{d}</div>))}
            {cellen.map((d) => {
              const iso = toISO(d);
              const inMaand = d.getMonth() === maand;
              const isVandaag = iso === vandaagISO;
              const dag = opDag(iso);
              const vrl = dag.filter((g) => g.soort === "verlof");
              const rest = dag.filter((g) => g.soort !== "verlof");
              const getoond = rest.slice(0, 3);
              const meer = rest.length - getoond.length;
              const feest = dag.some((g) => g.soort === "feestdag");
              return (
                <button key={iso} type="button" onClick={() => setPopupDag(iso)} className={`flex min-h-[112px] flex-col rounded-xl border p-2 text-left align-top transition-colors hover:border-brand-300 hover:bg-brand-50/40 ${inMaand ? (feest ? "border-red-100 bg-red-50/30" : "border-ink-100 bg-white") : "border-ink-100 bg-ink-50/50"}`}>
                  <div className={`text-sm font-bold ${isVandaag ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white" : inMaand ? "text-ink-800" : "text-ink-300"}`}>{d.getDate()}</div>
                  {getoond.map((g) => {
                    const Icoon = SOORT_STIJL[g.soort].icoon;
                    return <div key={g.id} className={`mt-1 flex items-center gap-1 truncate rounded-lg px-1.5 py-0.5 text-[11px] font-semibold ${SOORT_STIJL[g.soort].chip}`} title={g.titel}><Icoon className="h-3 w-3 shrink-0" /><span className="truncate">{g.tijd ? `${g.tijd} ` : ""}{g.titel}</span></div>;
                  })}
                  {meer > 0 && <div className="mt-1 px-1 text-[11px] font-semibold text-ink-400">+{meer} meer</div>}
                  {vrl.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {vrl.slice(0, 5).map((g) => (
                        <span key={g.id} className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ${verlofKleur[verlofType(g)]}`} title={g.titel}>{g.wie ? initVan(g.wie) : "?"}</span>
                      ))}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-5 border-t border-ink-100 pt-4 text-sm text-ink-500">
            {VERLOF_TYPES.map((t) => (<span key={t} className="inline-flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${verlofKleur[t]}`} /> {t}</span>))}
          </div>
        </Card>
      ) : (
        /* ── Weekweergave ── */
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setWeekAnker((w) => verschuifWeek(w, -1))} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Vorige week"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => setWeekAnker(weekStartISO(toISO(vandaag)))} className="rounded-xl px-3 py-2 text-lg font-bold text-ink-900 hover:bg-ink-50" title="Naar deze week">{weekBereik(weekAnker)}</button>
              <button type="button" onClick={() => setWeekAnker((w) => verschuifWeek(w, 1))} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Volgende week"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
          {filterBalk}
          <div className="space-y-2">
            {weekDagen.map((iso) => {
              const dag = opDag(iso);
              const isVandaag = iso === vandaagISO;
              return (
                <div key={iso} className={`rounded-xl border p-3 ${isVandaag ? "border-brand-300 bg-brand-50/40" : "border-ink-200"}`}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-bold capitalize text-ink-800">{dagLang(iso)}</span>
                    <button type="button" onClick={() => setPopupDag(iso)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Toevoegen</button>
                  </div>
                  {dag.length === 0 ? (
                    <p className="text-xs text-ink-400">Niets in de agenda.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {dag.map((g) => {
                        const Icoon = SOORT_STIJL[g.soort].icoon;
                        return <span key={g.id} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium ${SOORT_STIJL[g.soort].chip}`}><Icoon className="h-3 w-3" /> {g.tijd ? `${g.tijd} ` : ""}{g.titel}</span>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <TelefoonAgenda />

      {/* Verlofoverzicht (HR) — goedkeuren gebeurt op de Verlof-pagina */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><CalendarDays className="h-4 w-4 text-ink-500" /> {isLeiding ? "Verlofoverzicht (HR)" : "Mijn verlof"}</h3>
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
                <Badge tone={effStatus(v) === "Goedgekeurd" ? "green" : effStatus(v) === "Afgewezen" ? "red" : "amber"}>{effStatus(v)}</Badge>
                {(isLeiding || (v.medewerkerId === currentUser.id && effStatus(v) === "Aangevraagd")) && (
                  <button type="button" onClick={() => deleteVerlof(v.id)} className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {popupDag && <DagPopup iso={popupDag} gebeurtenissen={alle} onClose={() => setPopupDag(null)} />}
    </div>
  );
}

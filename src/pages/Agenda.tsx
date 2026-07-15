import { useState, useEffect } from "react";
import { ChevronLeft, ChevronRight, Plus, X, Trash2, CalendarDays, Plane, Clock, ClipboardCheck, CheckSquare, Square, Filter } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer } from "../components/TijdKiezer";
import { Keuze } from "../components/Keuze";
import { adresVanAfspraak } from "../lib/afspraak";
import { weekStartISO, verschuifWeek, weekBereik } from "../lib/week";
import { VERLOF_TYPES, type VerlofType, type VerlofStatus, type Verlof as VerlofT } from "../lib/types";
import { useVerlofBeslissingen } from "../lib/verlofBeslissingen";

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

// ── Compacte dag-pop-up: snel iets met tijd toevoegen + to-do-lijst + overzicht van de dag ──
function DagPopup({ iso, onClose, effStatus }: { iso: string; onClose: () => void; effStatus: (v: VerlofT) => VerlofStatus }) {
  const { afspraken, schouwafspraken, verlof, agendaItems, todos, users, currentUser, addAgendaItem, deleteAgendaItem, addTodo, updateTodo, deleteTodo } = useApp();
  const [titel, setTitel] = useState("");
  const [tijd, setTijd] = useState("");
  const [wie, setWie] = useState(currentUser?.id ?? "");
  const [todoTekst, setTodoTekst] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";

  const afs = afspraken.filter((a) => a.datum === iso && (isLeiding || a.toegewezenAan === currentUser.id)).sort((a, b) => (a.tijd || "").localeCompare(b.tijd || ""));
  const sch = schouwafspraken.filter((s) => s.datum === iso && (isLeiding || s.toegewezenAan === currentUser.id)).sort((a, b) => (a.tijd || "").localeCompare(b.tijd || ""));
  const vrl = verlof.filter((v) => iso >= v.van && iso <= v.tot);
  const items = agendaItems.filter((a) => a.datum === iso).sort((a, b) => (a.tijd || "").localeCompare(b.tijd || ""));
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

        {/* Snel toevoegen met tijd */}
        <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
          <div className="flex flex-wrap gap-2">
            <input value={titel} onChange={(e) => setTitel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") voegItem(); }} placeholder="Wat moet er gebeuren?" className={veld + " min-w-0 flex-1"} />
            <div className="w-28 shrink-0"><TijdKiezer value={tijd} onChange={setTijd} size="sm" placeholder="Tijd" /></div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isLeiding && (
              <div className="min-w-40 flex-1"><Keuze value={wie} onChange={setWie} altijdZoeken opties={[{ waarde: "", label: "Niemand" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Wie" /></div>
            )}
            <button type="button" onClick={voegItem} disabled={!titel.trim()} className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"><Plus className="h-4 w-4" /> Toevoegen</button>
          </div>
        </div>

        {/* Overzicht van de dag */}
        <div className="mt-4 space-y-1.5">
          {afs.length + sch.length + items.length + vrl.length === 0 ? (
            <p className="text-sm text-ink-400">Nog niets gepland op deze dag.</p>
          ) : (
            <>
              {items.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50/50 p-2 text-sm">
                  <Clock className="h-4 w-4 shrink-0 text-brand-600" />
                  <span className="font-semibold text-ink-800">{a.tijd || "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">{a.titel}{a.toegewezenAan ? ` · ${naamVan(a.toegewezenAan)}` : ""}</span>
                  <button type="button" onClick={() => deleteAgendaItem(a.id)} className="rounded p-1 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {afs.map((a) => (
                <div key={a.id} className="flex items-center gap-2 rounded-lg border border-ink-200 p-2 text-sm">
                  <CalendarDays className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="font-semibold text-ink-800">{a.tijd || "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">{a.klantNaam || adresVanAfspraak(a)}</span>
                  <Badge tone={a.status === "Geannuleerd" ? "red" : a.status === "Bevestigd" ? "green" : a.status === "Afgerond" ? "slate" : "amber"}>{a.status}</Badge>
                </div>
              ))}
              {sch.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-lg border border-ink-200 p-2 text-sm">
                  <ClipboardCheck className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="font-semibold text-ink-800">{s.tijd || "—"}</span>
                  <span className="min-w-0 flex-1 truncate text-ink-700">Schouw {s.straat} {s.huisnummer}</span>
                  <Badge tone="slate">{s.status}</Badge>
                </div>
              ))}
              {vrl.map((v) => (
                <div key={v.id} className="flex items-center gap-2 rounded-lg border border-ink-200 p-2 text-sm">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${verlofKleur[v.type]}`} />
                  <span className="min-w-0 flex-1 truncate text-ink-700">{naamVan(v.medewerkerId)} · {v.type}</span>
                  <Badge tone={effStatus(v) === "Goedgekeurd" ? "green" : effStatus(v) === "Afgewezen" ? "red" : "amber"}>{effStatus(v)}</Badge>
                </div>
              ))}
            </>
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
  const { afspraken, schouwafspraken, verlof, agendaItems, users, currentUser, addVerlof, deleteVerlof } = useApp();
  const { map: beslissingen } = useVerlofBeslissingen();
  const vandaag = new Date();
  const [weergave, setWeergave] = useState<"maand" | "week">("maand");
  const [jaar, setJaar] = useState(vandaag.getFullYear());
  const [maand, setMaand] = useState(vandaag.getMonth());
  const [weekAnker, setWeekAnker] = useState(weekStartISO(toISO(vandaag)));
  const [popupDag, setPopupDag] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  // Week-filter
  const [ftAfspraken, setFtAfspraken] = useState(true);
  const [ftSchouw, setFtSchouw] = useState(true);
  const [ftAgenda, setFtAgenda] = useState(true);
  const [ftVerlof, setFtVerlof] = useState(true);
  const [ftWie, setFtWie] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";
  const initVan = (id: string) => users.find((u) => u.id === id)?.initialen ?? "?";
  const effStatus = (v: VerlofT): VerlofStatus => beslissingen[v.id]?.status ?? v.status;

  const zichtbareAfspraken = isLeiding ? afspraken : afspraken.filter((a) => a.toegewezenAan === currentUser.id);
  const zichtbareSchouw = isLeiding ? schouwafspraken : schouwafspraken.filter((s) => s.toegewezenAan === currentUser.id);

  // Verlofformulier
  const [vMedewerker, setVMedewerker] = useState(currentUser.id);
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
  const schouwOp = (iso: string) => zichtbareSchouw.filter((s) => s.datum === iso);
  const agendaOp = (iso: string) => agendaItems.filter((a) => a.datum === iso && (isLeiding || a.toegewezenAan === currentUser.id || !a.toegewezenAan));
  const verlofOp = (iso: string) => verlof.filter((v) => iso >= v.van && iso <= v.tot);

  const vorige = () => { if (maand === 0) { setMaand(11); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (maand === 11) { setMaand(0); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };
  const naarVandaag = () => { setJaar(vandaag.getFullYear()); setMaand(vandaag.getMonth()); setWeekAnker(weekStartISO(toISO(vandaag))); };

  const vandaagISO = toISO(vandaag);
  const mijnVerlof = isLeiding ? verlof : verlof.filter((v) => v.medewerkerId === currentUser.id);
  const sortedVerlof = [...mijnVerlof].sort((a, b) => a.van.localeCompare(b.van));

  // Week-dagen (7) vanaf de maandag-anker
  const weekDagen: string[] = [];
  {
    const ma = new Date(weekAnker + "T00:00:00");
    for (let i = 0; i < 7; i++) { const d = new Date(ma); d.setDate(ma.getDate() + i); weekDagen.push(toISO(d)); }
  }

  const wieFilter = (id?: string) => !ftWie || id === ftWie;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Agenda</h2>
          <p className="text-sm text-ink-500">Afspraken, schouw en verlof in één overzicht.</p>
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
          <div className="grid gap-3 sm:grid-cols-2">
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
          <div className="grid grid-cols-7 gap-1.5">
            {DAGEN.map((d) => (<div key={d} className="pb-2 text-center text-sm font-semibold uppercase tracking-wide text-ink-400">{d}</div>))}
            {cellen.map((d) => {
              const iso = toISO(d);
              const inMaand = d.getMonth() === maand;
              const isVandaag = iso === vandaagISO;
              const afs = afsprakenOp(iso), sch = schouwOp(iso), items = agendaOp(iso), vrl = verlofOp(iso);
              return (
                <button key={iso} type="button" onClick={() => setPopupDag(iso)} className={`flex min-h-[112px] flex-col rounded-xl border p-2 text-left align-top transition-colors hover:border-brand-300 hover:bg-brand-50/40 ${inMaand ? "border-ink-100 bg-white" : "border-ink-100 bg-ink-50/50"}`}>
                  <div className={`text-sm font-bold ${isVandaag ? "inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-600 text-white" : inMaand ? "text-ink-800" : "text-ink-300"}`}>{d.getDate()}</div>
                  {items.length > 0 && <div className="mt-1.5 truncate rounded-lg bg-brand-100 px-2 py-0.5 text-xs font-semibold text-brand-700">{items.length} item{items.length === 1 ? "" : "s"}</div>}
                  {afs.length > 0 && <div className="mt-1 truncate rounded-lg bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700">{afs.length} afspr.</div>}
                  {sch.length > 0 && <div className="mt-1 truncate rounded-lg bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{sch.length} schouw</div>}
                  {vrl.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {vrl.slice(0, 5).map((v) => (
                        <span key={v.id} className={`flex h-6 w-6 items-center justify-center rounded-full text-[9px] font-bold text-white ${verlofKleur[v.type]}`} title={`${naamVan(v.medewerkerId)} — ${v.type}`}>{initVan(v.medewerkerId)}</span>
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
        /* ── Weekweergave: klik bovenaan om te wisselen, met filter ── */
        <Card className="p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setWeekAnker((w) => verschuifWeek(w, -1))} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Vorige week"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={() => setWeekAnker(weekStartISO(toISO(vandaag)))} className="rounded-xl px-3 py-2 text-lg font-bold text-ink-900 hover:bg-ink-50" title="Naar deze week">{weekBereik(weekAnker)}</button>
              <button type="button" onClick={() => setWeekAnker((w) => verschuifWeek(w, 1))} className="rounded-xl border border-ink-200 p-2 text-ink-600 hover:bg-ink-50" title="Volgende week"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>

          {/* Filterbalk */}
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-ink-50/50 p-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500"><Filter className="h-3.5 w-3.5" /> Toon</span>
            {([["Afspraken", ftAfspraken, setFtAfspraken], ["Schouw", ftSchouw, setFtSchouw], ["Agenda", ftAgenda, setFtAgenda], ["Verlof", ftVerlof, setFtVerlof]] as const).map(([label, aan, set]) => (
              <button key={label} type="button" onClick={() => set((v) => !v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors ${aan ? "bg-brand-600 text-white" : "bg-white text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50"}`}>{label}</button>
            ))}
            {isLeiding && (
              <div className="ml-auto w-44"><Keuze value={ftWie} onChange={setFtWie} altijdZoeken opties={[{ waarde: "", label: "Iedereen" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Medewerker" /></div>
            )}
          </div>

          <div className="space-y-2">
            {weekDagen.map((iso) => {
              const afs = ftAfspraken ? afsprakenOp(iso).filter((a) => wieFilter(a.toegewezenAan)) : [];
              const sch = ftSchouw ? schouwOp(iso).filter((s) => wieFilter(s.toegewezenAan)) : [];
              const items = ftAgenda ? agendaOp(iso).filter((a) => wieFilter(a.toegewezenAan)) : [];
              const vrl = ftVerlof ? verlofOp(iso).filter((v) => wieFilter(v.medewerkerId)) : [];
              const leeg = afs.length + sch.length + items.length + vrl.length === 0;
              const isVandaag = iso === vandaagISO;
              return (
                <div key={iso} className={`rounded-xl border p-3 ${isVandaag ? "border-brand-300 bg-brand-50/40" : "border-ink-200"}`}>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-sm font-bold capitalize text-ink-800">{dagLang(iso)}</span>
                    <button type="button" onClick={() => setPopupDag(iso)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2 py-1 text-xs font-semibold text-ink-600 hover:bg-ink-50"><Plus className="h-3.5 w-3.5" /> Toevoegen</button>
                  </div>
                  {leeg ? (
                    <p className="text-xs text-ink-400">Niets gepland.</p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {items.map((a) => (<span key={a.id} className="inline-flex items-center gap-1 rounded-lg bg-brand-100 px-2 py-1 text-xs font-medium text-brand-800"><Clock className="h-3 w-3" /> {a.tijd ? `${a.tijd} ` : ""}{a.titel}</span>))}
                      {afs.map((a) => (<span key={a.id} className="inline-flex items-center gap-1 rounded-lg bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700"><CalendarDays className="h-3 w-3" /> {a.tijd ? `${a.tijd} ` : ""}{a.klantNaam || `${a.straat} ${a.huisnummer}`}</span>))}
                      {sch.map((s) => (<span key={s.id} className="inline-flex items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700"><ClipboardCheck className="h-3 w-3" /> {s.tijd ? `${s.tijd} ` : ""}Schouw {s.straat} {s.huisnummer}</span>))}
                      {vrl.map((v) => (<span key={v.id} className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-xs font-medium text-ink-600"><span className={`h-2 w-2 rounded-full ${verlofKleur[v.type]}`} /> {naamVan(v.medewerkerId)} {v.type}</span>))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

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

      {popupDag && <DagPopup iso={popupDag} onClose={() => setPopupDag(null)} effStatus={effStatus} />}
    </div>
  );
}

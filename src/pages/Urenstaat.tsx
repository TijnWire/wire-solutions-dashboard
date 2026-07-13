import { useState, Fragment } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Wand2, RotateCcw, FolderKanban, Plus, User as UserIcon, Trash2 } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import { Keuze } from "../components/Keuze";
import { feestdagNaam } from "../lib/feestdagen";
import type { User, Urenregel } from "../lib/types";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const STANDAARD_CONTRACT = 40; // u/week als er (nog) geen contract is ingesteld
const LEEG: number[] = [0, 0, 0, 0, 0, 0, 0];

const VERLOF_TINT: Record<string, string> = { Vakantie: "bg-green-50 text-green-700", Verlof: "bg-indigo-50 text-indigo-700", Ziek: "bg-red-50 text-red-700" };
const VERLOF_STIP: Record<string, string> = { Vakantie: "bg-green-500", Verlof: "bg-indigo-500", Ziek: "bg-red-500" };

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const maandagVan = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const weekNr = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dag + 3);
  const eersteDonderdag = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fd = (eersteDonderdag.getUTCDay() + 6) % 7;
  eersteDonderdag.setUTCDate(eersteDonderdag.getUTCDate() - fd + 3);
  return 1 + Math.round((t.getTime() - eersteDonderdag.getTime()) / (7 * 24 * 3600 * 1000));
};
const somUren = (uren?: number[]) => (uren ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace(".", ","));

// Eén uur-invoervakje met de kleuring voor verlof/feestdag.
function UurCel({ waarde, onChange, verlofType, feestdag, notitie, voorstel, aria }: {
  waarde: number;
  onChange: (n: number) => void;
  verlofType?: string;
  feestdag?: string;
  notitie?: string;
  voorstel?: boolean;
  aria: string;
}) {
  const tint = verlofType ? `border-transparent ${VERLOF_TINT[verlofType]}` : feestdag ? "border-transparent bg-amber-50 text-amber-700" : "border-ink-200 bg-white text-ink-800";
  return (
    <div className="relative inline-block">
      <input
        inputMode="decimal"
        value={waarde ? uurTekst(waarde) : ""}
        onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); onChange(Number.isFinite(n) && n >= 0 ? n : 0); }}
        placeholder="0"
        title={verlofType ? `${verlofType}${notitie ? ` · ${notitie}` : ""}` : feestdag ? feestdag : aria}
        aria-label={aria}
        className={`w-12 rounded-lg border px-1.5 py-1.5 text-center text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${tint} ${voorstel ? "italic text-ink-400" : ""}`}
      />
      {(verlofType || feestdag) && <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${verlofType ? VERLOF_STIP[verlofType] : "bg-amber-500"} ring-2 ring-white`} title={verlofType || feestdag} />}
    </div>
  );
}

export function Urenstaat() {
  const { users, projects, urenstaat, verlof, currentUser, addUren, updateUren, deleteUren } = useApp();
  const [weekISO, setWeekISO] = useState(() => toISO(maandagVan(new Date())));
  const [weergave, setWeergave] = useState<"persoon" | "project">("persoon");
  const [projSel, setProjSel] = useState(""); // "" = algemeen (geen project)
  const [persSel, setPersSel] = useState("");
  const [voegToe, setVoegToe] = useState("");        // medewerker toevoegen (project-weergave)
  const [voegProject, setVoegProject] = useState(""); // project toevoegen (medewerker-weergave)

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">De urenstaat is alleen voor de boekhouding/leiding.</Card>;

  const weekDate = new Date(weekISO + "T00:00:00");
  const weekEinde = new Date(weekDate); weekEinde.setDate(weekEinde.getDate() + 6);
  const verschuif = (dagen: number) => { const d = new Date(weekDate); d.setDate(d.getDate() + dagen); setWeekISO(toISO(maandagVan(d))); };
  const dezeWeek = toISO(maandagVan(new Date())) === weekISO;
  const weekLabel = `${weekDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${weekEinde.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
  const weekISOs = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekDate); d.setDate(d.getDate() + i); return toISO(d); });
  const jaar = weekDate.getFullYear();

  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  const actieveProjecten = projects.filter((p) => p.boekhouding !== "gefactureerd").sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  const projectLabel = (pid?: string) => (pid ? (projects.find((p) => p.id === pid)?.naam ?? "Onbekend project") : "Algemeen");
  const projectSub = (pid?: string) => { const p = pid ? projects.find((x) => x.id === pid) : undefined; return p?.wijk ?? ""; };

  const contractUren = (u: User) => (u.contract?.uren != null ? u.contract.uren : STANDAARD_CONTRACT);
  const contractDag = (u: User) => contractUren(u) / 5;
  const verlofOp = (userId: string, iso: string) => verlof.find((v) => v.medewerkerId === userId && v.status === "Goedgekeurd" && v.van <= iso && v.tot >= iso);
  const autoUren = (u: User) => weekISOs.map((iso, i) => (i >= 5 || verlofOp(u.id, iso) || feestdagNaam(iso) ? 0 : contractDag(u)));

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Urenstaat</h2>
        <p className="text-sm text-ink-500">Boek per medewerker de uren per dag, elke dag op het juiste project, met een notitie erbij. Wissel eventueel naar "Per project" om iedereen op één project ineens in te vullen. Vrije dagen staan op de aparte pagina <span className="font-semibold text-ink-600">Vrije dagen</span>.</p>
      </div>

      {/* Week-navigatie + weergave-schakelaar + keuze */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => verschuif(-7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><ChevronLeft className="h-4 w-4" /> Vorige</button>
          <div className="flex min-w-0 flex-1 flex-col items-center px-2 text-center">
            <span className="text-sm font-bold text-ink-900">Week {weekNr(weekDate)} · {jaar}</span>
            <span className="text-xs text-ink-500">{weekLabel}</span>
          </div>
          <button type="button" onClick={() => verschuif(7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Volgende <ChevronRight className="h-4 w-4" /></button>
          {!dezeWeek && <button type="button" onClick={() => setWeekISO(toISO(maandagVan(new Date())))} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Deze week</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <div className="flex shrink-0 overflow-hidden rounded-lg border border-ink-200">
            <button type="button" onClick={() => setWeergave("persoon")} className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${weergave === "persoon" ? "bg-brand-600 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}><UserIcon className="h-3.5 w-3.5" /> Per medewerker</button>
            <button type="button" onClick={() => setWeergave("project")} className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold transition-colors ${weergave === "project" ? "bg-brand-600 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}><FolderKanban className="h-3.5 w-3.5" /> Per project</button>
          </div>
          {weergave === "persoon" ? (
            <>
              <UserIcon className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="shrink-0 text-sm font-semibold text-ink-600">Medewerker:</span>
              <div className="min-w-0 flex-1 sm:max-w-xs"><Keuze value={persSel || medewerkers[0]?.id || ""} onChange={(w) => { setPersSel(w); setVoegProject(""); }} opties={medewerkers.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker kiezen" /></div>
            </>
          ) : (
            <>
              <FolderKanban className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="shrink-0 text-sm font-semibold text-ink-600">Project:</span>
              <div className="min-w-0 flex-1 sm:max-w-md"><Keuze value={projSel} onChange={(w) => { setProjSel(w); setVoegToe(""); }} opties={[{ waarde: "", label: "Algemeen (geen project)" }, ...actieveProjecten.map((p) => ({ waarde: p.id, label: p.wijk ? `${p.naam} · ${p.wijk}` : p.naam }))]} title="Project kiezen" /></div>
            </>
          )}
        </div>
      </Card>

      {weergave === "persoon"
        ? <PerMedewerker
            key={persSel || medewerkers[0]?.id}
            persoon={medewerkers.find((u) => u.id === (persSel || medewerkers[0]?.id))}
            weekISO={weekISO} weekISOs={weekISOs} weekNr={weekNr(weekDate)}
            records={urenstaat.filter((x) => x.medewerkerId === (persSel || medewerkers[0]?.id) && x.week === weekISO)}
            actieveProjecten={actieveProjecten} projectLabel={projectLabel} projectSub={projectSub}
            verlofOp={verlofOp} autoUren={autoUren}
            voegProject={voegProject} setVoegProject={setVoegProject}
            addUren={addUren} updateUren={updateUren} deleteUren={deleteUren}
          />
        : <PerProject
            weekISO={weekISO} weekISOs={weekISOs} weekNr={weekNr(weekDate)}
            projSel={projSel} projects={projects} medewerkers={medewerkers} urenstaat={urenstaat}
            contractUren={contractUren} verlofOp={verlofOp} autoUren={autoUren}
            voegToe={voegToe} setVoegToe={setVoegToe}
            addUren={addUren} updateUren={updateUren}
          />
      }
    </div>
  );
}

// ── Weergave PER MEDEWERKER: per project een rij (Ma–Zo) + notitie; zo boek je elke dag op een ander project ──
function PerMedewerker({ persoon, weekISO, weekISOs, weekNr, records, actieveProjecten, projectLabel, projectSub, verlofOp, autoUren, voegProject, setVoegProject, addUren, updateUren, deleteUren }: {
  persoon?: User;
  weekISO: string; weekISOs: string[]; weekNr: number;
  records: Urenregel[];
  actieveProjecten: { id: string; naam: string; wijk: string }[];
  projectLabel: (pid?: string) => string;
  projectSub: (pid?: string) => string;
  verlofOp: (userId: string, iso: string) => { type: string; notitie?: string } | undefined;
  autoUren: (u: User) => number[];
  voegProject: string; setVoegProject: (v: string) => void;
  addUren: (u: Omit<Urenregel, "id">) => string;
  updateUren: (id: string, patch: Partial<Urenregel>) => void;
  deleteUren: (id: string) => void;
}) {
  if (!persoon) return <Card className="p-8 text-center text-sm text-ink-400">Kies een medewerker.</Card>;

  const rijen = [...records].sort((a, b) => {
    const an = a.projectId ? 0 : 1, bn = b.projectId ? 0 : 1;
    if (an !== bn) return an - bn;
    return projectLabel(a.projectId).localeCompare(projectLabel(b.projectId), "nl");
  });
  const dagTotaal = (i: number) => records.reduce((s, r) => s + (Number(r.uren[i]) || 0), 0);
  const weekTot = records.reduce((s, r) => s + somUren(r.uren), 0);

  const gebruikt = new Set(records.map((r) => r.projectId ?? "__alg"));
  const toevoegOpties: { waarde: string; label: string }[] = [{ waarde: "", label: "Project toevoegen…" }];
  if (!gebruikt.has("__alg")) toevoegOpties.push({ waarde: "__alg", label: "Algemeen (geen project)" });
  toevoegOpties.push(...actieveProjecten.filter((p) => !gebruikt.has(p.id)).map((p) => ({ waarde: p.id, label: p.wijk ? `${p.naam} · ${p.wijk}` : p.naam })));

  const voegRijToe = (val: string) => {
    if (!val) return;
    const projectId = val === "__alg" ? undefined : val;
    addUren({ medewerkerId: persoon.id, week: weekISO, projectId, uren: [0, 0, 0, 0, 0, 0, 0] });
    setVoegProject("");
  };
  const zetUur = (rec: Urenregel, dag: number, waarde: number) => { const uren = [...rec.uren]; uren[dag] = waarde; updateUren(rec.id, { uren }); };
  const autoAlgemeen = () => {
    const bestaand = records.find((r) => !r.projectId);
    const uren = autoUren(persoon);
    if (bestaand) updateUren(bestaand.id, { uren });
    else addUren({ medewerkerId: persoon.id, week: weekISO, uren });
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-white">{persoon.initialen}</span>
        <span className="text-sm font-bold text-ink-900">{persoon.naam} · week {weekNr}</span>
        <button type="button" onClick={autoAlgemeen} title="Vul 'Algemeen' automatisch (contract − verlof/feestdag)" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700"><Wand2 className="h-3.5 w-3.5" /> Auto (Algemeen)</button>
        <span className="ml-auto text-sm font-semibold text-ink-500">Totaal: <span className="text-ink-900">{uurTekst(weekTot)} u</span></span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
              <th className="px-4 py-2.5 text-left font-semibold">Project</th>
              {DAGEN.map((d, i) => (<th key={d} className={`px-1 py-2.5 text-center font-semibold ${i >= 5 ? "text-ink-400" : ""}`}>{d}</th>))}
              <th className="px-3 py-2.5 text-right font-semibold">Totaal</th>
              <th className="px-2 py-2.5"><span className="sr-only">Verwijderen</span></th>
            </tr>
          </thead>
          <tbody>
            {rijen.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-6 text-center text-sm text-ink-400">Nog geen uren voor {persoon.naam} deze week. Voeg hieronder een project toe of gebruik "Auto (Algemeen)".</td></tr>
            ) : rijen.map((rec) => {
              const tot = somUren(rec.uren);
              return (
                <Fragment key={rec.id}>
                  <tr className="border-b border-ink-50 hover:bg-ink-50/40">
                    <td className="px-4 py-2 align-top">
                      <div className="font-medium text-ink-900">{projectLabel(rec.projectId)}</div>
                      {projectSub(rec.projectId) && <div className="text-[11px] text-ink-400">{projectSub(rec.projectId)}</div>}
                    </td>
                    {DAGEN.map((d, i) => {
                      const v = verlofOp(persoon.id, weekISOs[i]);
                      const fd = !v && i < 5 ? feestdagNaam(weekISOs[i]) : undefined;
                      return (
                        <td key={d} className={`px-1 py-2 text-center ${i >= 5 ? "bg-ink-50/40" : ""}`}>
                          <UurCel waarde={rec.uren[i]} onChange={(n) => zetUur(rec, i, n)} verlofType={v?.type} feestdag={fd} notitie={v?.notitie} aria={`${persoon.naam} ${d} ${projectLabel(rec.projectId)}`} />
                        </td>
                      );
                    })}
                    <td className="px-3 py-2 text-right font-bold text-ink-900">{tot > 0 ? `${uurTekst(tot)} u` : "—"}</td>
                    <td className="px-2 py-2 text-center align-top">
                      <button type="button" onClick={() => deleteUren(rec.id)} title="Deze projectregel verwijderen" className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                    </td>
                  </tr>
                  <tr className="border-b border-ink-100">
                    <td colSpan={10} className="px-4 pb-2.5">
                      <input
                        value={rec.notitie ?? ""}
                        onChange={(e) => updateUren(rec.id, { notitie: e.target.value })}
                        placeholder={`Notitie bij ${projectLabel(rec.projectId)} (bijv. wat er die dag(en) is gedaan)…`}
                        className="w-full rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs text-ink-700 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
          {rijen.length > 0 && (
            <tfoot>
              <tr className="border-t border-ink-200 bg-ink-50/60 text-sm">
                <td className="px-4 py-2.5 font-bold text-ink-900">Dagtotaal</td>
                {DAGEN.map((d, i) => { const t = dagTotaal(i); return (<td key={d} className={`px-1 py-2.5 text-center font-semibold ${t > 0 ? "text-ink-900" : "text-ink-300"}`}>{t > 0 ? uurTekst(t) : "—"}</td>); })}
                <td className="px-3 py-2.5 text-right font-bold text-ink-900">{uurTekst(weekTot)} u</td>
                <td />
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {toevoegOpties.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-2.5">
          <Plus className="h-4 w-4 text-ink-400" />
          <span className="text-xs font-semibold text-ink-500">Project toevoegen:</span>
          <div className="w-64"><Keuze value={voegProject} onChange={voegRijToe} opties={toevoegOpties} title="Project toevoegen" size="sm" /></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Vakantie</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Verlof</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Ziek</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Feestdag</span>
      </div>
    </Card>
  );
}

// ── Weergave PER PROJECT: iedereen op één project ineens invullen (Ma–Zo). Handig voor bulk. ──
function PerProject({ weekISO, weekISOs, weekNr, projSel, projects, medewerkers, urenstaat, contractUren, verlofOp, autoUren, voegToe, setVoegToe, addUren, updateUren }: {
  weekISO: string; weekISOs: string[]; weekNr: number;
  projSel: string;
  projects: { id: string; naam: string; toegewezenAan: string[]; boekhouding?: string }[];
  medewerkers: User[];
  urenstaat: Urenregel[];
  contractUren: (u: User) => number;
  verlofOp: (userId: string, iso: string) => { type: string; notitie?: string } | undefined;
  autoUren: (u: User) => number[];
  voegToe: string; setVoegToe: (v: string) => void;
  addUren: (u: Omit<Urenregel, "id">) => string;
  updateUren: (id: string, patch: Partial<Urenregel>) => void;
}) {
  const algemeen = projSel === "";
  const huidigProject = projects.find((p) => p.id === projSel);

  const regelVan = (userId: string) => urenstaat.find((x) => x.medewerkerId === userId && x.week === weekISO && (x.projectId ?? "") === projSel);
  const toonUren = (u: User) => regelVan(u.id)?.uren ?? (algemeen ? autoUren(u) : LEEG);
  const zetUur = (u: User, dag: number, waarde: number) => {
    const bestaand = regelVan(u.id);
    const uren = [...(bestaand?.uren ?? (algemeen ? autoUren(u) : LEEG))];
    uren[dag] = waarde;
    if (bestaand) updateUren(bestaand.id, { uren });
    else addUren({ medewerkerId: u.id, week: weekISO, projectId: projSel || undefined, uren });
  };
  const zetRijAuto = (u: User) => {
    const bestaand = regelVan(u.id);
    const uren = algemeen ? autoUren(u) : LEEG;
    if (bestaand) updateUren(bestaand.id, { uren });
    else addUren({ medewerkerId: u.id, week: weekISO, projectId: projSel || undefined, uren });
  };

  const relevanteIds = new Set<string>(
    algemeen ? medewerkers.map((u) => u.id) : [...(huidigProject?.toegewezenAan ?? []), ...urenstaat.filter((x) => x.week === weekISO && (x.projectId ?? "") === projSel).map((x) => x.medewerkerId)]
  );
  const getoond = medewerkers.filter((u) => relevanteIds.has(u.id));
  const toevoegbaar = medewerkers.filter((u) => !relevanteIds.has(u.id));
  const voegPersoonToe = (userId: string) => { if (userId && !regelVan(userId)) addUren({ medewerkerId: userId, week: weekISO, projectId: projSel || undefined, uren: LEEG }); setVoegToe(""); };

  const nogNietIngevuld = getoond.filter((u) => !regelVan(u.id)).length;
  const vulAllesAuto = () => getoond.forEach((u) => { if (!regelVan(u.id)) addUren({ medewerkerId: u.id, week: weekISO, projectId: projSel || undefined, uren: autoUren(u) }); });
  const weekTotaal = getoond.reduce((s, u) => s + somUren(toonUren(u)), 0);

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
        <CalendarDays className="h-4 w-4 text-brand-600" />
        <span className="text-sm font-bold text-ink-900">{algemeen ? "Algemeen" : huidigProject?.naam ?? "Project"} · week {weekNr}</span>
        {nogNietIngevuld > 0 && (
          <button type="button" onClick={vulAllesAuto} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700">
            <Wand2 className="h-3.5 w-3.5" /> {algemeen ? `Automatisch invullen (${nogNietIngevuld})` : `Alles tonen (${nogNietIngevuld})`}
          </button>
        )}
        <span className="ml-auto text-sm font-semibold text-ink-500">Totaal: <span className="text-ink-900">{uurTekst(weekTotaal)} u</span></span>
      </div>

      {getoond.length === 0 ? (
        <p className="p-8 text-center text-sm text-ink-400">{algemeen ? "Nog geen medewerkers." : "Nog niemand op dit project. Voeg hieronder een medewerker toe."}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="sticky left-0 z-10 bg-ink-50/60 px-4 py-2.5 text-left font-semibold">Medewerker</th>
                {DAGEN.map((d, i) => (<th key={d} className={`px-1 py-2.5 text-center font-semibold ${i >= 5 ? "text-ink-400" : ""}`}>{d}</th>))}
                <th className="px-3 py-2.5 text-right font-semibold">Totaal</th>
                <th className="px-2 py-2.5"><span className="sr-only">Acties</span></th>
              </tr>
            </thead>
            <tbody>
              {getoond.map((u) => {
                const uren = toonUren(u);
                const bevestigd = !!regelVan(u.id);
                const tot = somUren(uren);
                return (
                  <tr key={u.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                    <td className="sticky left-0 z-10 bg-white px-4 py-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-white">{u.initialen}</span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-ink-900">{u.naam}</span>
                          {algemeen && <span className="block text-[11px] text-ink-400">{contractUren(u)} u/week{bevestigd ? "" : " · voorstel"}</span>}
                        </span>
                      </div>
                    </td>
                    {DAGEN.map((d, i) => {
                      const v = verlofOp(u.id, weekISOs[i]);
                      const fd = !v && i < 5 ? feestdagNaam(weekISOs[i]) : undefined;
                      return (
                        <td key={d} className={`px-1 py-2 text-center ${i >= 5 ? "bg-ink-50/40" : ""}`}>
                          <UurCel waarde={uren[i]} onChange={(n) => zetUur(u, i, n)} verlofType={v?.type} feestdag={fd} notitie={v?.notitie} voorstel={algemeen && !bevestigd} aria={`${u.naam} ${d}`} />
                        </td>
                      );
                    })}
                    <td className={`px-3 py-2 text-right font-bold ${bevestigd || tot > 0 ? "text-ink-900" : "text-ink-400"}`}>{tot > 0 ? `${uurTekst(tot)} u` : "—"}</td>
                    <td className="px-2 py-2 text-center">
                      <button type="button" onClick={() => zetRijAuto(u)} title={algemeen ? "Rij (opnieuw) automatisch invullen" : "Rij leegmaken"} className="rounded-lg p-1.5 text-ink-300 hover:bg-ink-100 hover:text-brand-600"><RotateCcw className="h-4 w-4" /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {toevoegbaar.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-4 py-2.5">
          <Plus className="h-4 w-4 text-ink-400" />
          <span className="text-xs font-semibold text-ink-500">Medewerker toevoegen:</span>
          <div className="w-56"><Keuze value={voegToe} onChange={voegPersoonToe} opties={[{ waarde: "", label: "Kies medewerker…" }, ...toevoegbaar.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Medewerker toevoegen" size="sm" /></div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Vakantie</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Verlof</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Ziek</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Feestdag</span>
        {algemeen && <span className="italic text-ink-400">Schuine grijze cijfers = automatisch voorstel, nog niet bevestigd.</span>}
      </div>
    </Card>
  );
}

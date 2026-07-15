import { useState, Fragment } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Wand2, RotateCcw, FolderKanban, Plus, User as UserIcon, Users, Trash2, Check, Search, X, Wallet, FileSpreadsheet } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card } from "../components/ui";
import { Keuze } from "../components/Keuze";
import { feestdagNaam } from "../lib/feestdagen";
import { lopendeProjectOpties, werkNaam } from "../lib/lopendWerk";
import { exporteerUrenstaat } from "../lib/urenstaatExcel";
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
  const { users, projects, rondes, voorschouwMappen, tauwOpdrachten, urenstaat, verlof, bedrijf, currentUser, addUren, updateUren, deleteUren } = useApp();
  const { navigeer } = useNav();
  const [weekISO, setWeekISO] = useState(() => toISO(maandagVan(new Date())));
  const [weergave, setWeergave] = useState<"persoon" | "project" | "bulk">("persoon");
  const [projSel, setProjSel] = useState(""); // "" = algemeen (geen project)
  const [persSel, setPersSel] = useState("");
  const [voegToe, setVoegToe] = useState("");        // medewerker toevoegen (project-weergave)
  const [voegProject, setVoegProject] = useState(""); // project toevoegen (medewerker-weergave)

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">De urenstaat is alleen voor de boekhouding/leiding.</Card>;

  const weekDate = new Date(weekISO + "T00:00:00");
  const weekEinde = new Date(weekDate); weekEinde.setDate(weekEinde.getDate() + 6);
  const verschuif = (dagen: number) => { const d = new Date(weekDate); d.setDate(d.getDate() + dagen); setWeekISO(toISO(maandagVan(d))); };
  const dezeWeek = toISO(maandagVan(new Date())) === weekISO;
  const weekLabel = `${weekDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${weekEinde.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
  const weekISOs = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekDate); d.setDate(d.getDate() + i); return toISO(d); });
  const jaar = weekDate.getFullYear();

  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  const werkCtx = { projects, voorschouwMappen, tauwOpdrachten };
  const actieveProjecten = lopendeProjectOpties(projects, rondes, voorschouwMappen, tauwOpdrachten);
  const projectLabel = (pid?: string) => werkNaam(pid, werkCtx) ?? "Algemeen";
  const projectSub = (pid?: string) => { const p = pid && !pid.includes(":") ? projects.find((x) => x.id === pid) : undefined; return p?.wijk ?? ""; };

  const contractUren = (u: User) => (u.contract?.uren != null ? u.contract.uren : STANDAARD_CONTRACT);
  const contractDag = (u: User) => contractUren(u) / 5;
  const verlofOp = (userId: string, iso: string) => verlof.find((v) => v.medewerkerId === userId && v.status === "Goedgekeurd" && v.van <= iso && v.tot >= iso);
  const autoUren = (u: User) => weekISOs.map((iso, i) => (i >= 5 || verlofOp(u.id, iso) || feestdagNaam(iso) ? 0 : contractDag(u)));

  // Professionele urenstaat van de hele ploeg voor de getoonde week naar Excel (met formules).
  const exporteerNaarExcel = () => {
    const personen = medewerkers
      .map((u) => {
        const regels = urenstaat
          .filter((x) => x.medewerkerId === u.id && x.week === weekISO)
          .map((rec) => ({ label: projectLabel(rec.projectId), uren: rec.uren, notitie: rec.notitie }));
        let verlofDagen = 0, ziekDagen = 0, feestdagDagen = 0;
        weekISOs.forEach((iso, i) => {
          const v = verlofOp(u.id, iso);
          if (v) { if (v.type === "Ziek") ziekDagen++; else verlofDagen++; }
          else if (i < 5 && feestdagNaam(iso)) feestdagDagen++;
        });
        return { u, regels, verlofDagen, ziekDagen, feestdagDagen };
      })
      .filter((x) => x.regels.length > 0 || x.verlofDagen > 0 || x.ziekDagen > 0)
      .map(({ u, regels, verlofDagen, ziekDagen, feestdagDagen }) => ({
        naam: u.naam,
        functie: u.functie ?? "",
        persnr: "",
        projectRegels: regels,
        verlofDagen,
        ziekDagen,
        feestdagDagen,
      }));
    exporteerUrenstaat({
      bedrijfsnaam: bedrijf.naam,
      weekNr: weekNr(weekDate),
      jaar,
      periodeLabel: weekLabel,
      opsteller: currentUser.naam,
      dagen: DAGEN,
      datums: weekISOs,
      personen,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink-900">Urenstaat</h2>
          <p className="text-sm text-ink-500">Boek per medewerker de uren per dag, elke dag op het juiste project, met een notitie erbij. Wissel eventueel naar "Per project" om iedereen op één project ineens in te vullen. Vrije dagen staan op de aparte pagina <span className="font-semibold text-ink-600">Vrije dagen</span>.</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={exporteerNaarExcel} title="Professionele urenstaat van deze week (hele ploeg) exporteren naar Excel — met formules en goedkeuringsblok" className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel-urenstaat
          </button>
          <button type="button" onClick={() => navigeer("loonstroken", { loonWeek: weekISO })} title="Op basis van deze uren automatisch loonstroken aanmaken" className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Wallet className="h-4 w-4 text-ink-500" /> Loonstroken maken
          </button>
        </div>
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
            <button type="button" onClick={() => setWeergave("project")} className={`inline-flex items-center gap-1.5 border-l border-ink-200 px-3 py-2 text-xs font-bold transition-colors ${weergave === "project" ? "bg-brand-600 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}><FolderKanban className="h-3.5 w-3.5" /> Per project</button>
            <button type="button" onClick={() => setWeergave("bulk")} className={`inline-flex items-center gap-1.5 border-l border-ink-200 px-3 py-2 text-xs font-bold transition-colors ${weergave === "bulk" ? "bg-brand-600 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}><Users className="h-3.5 w-3.5" /> Meerdere tegelijk</button>
          </div>
          {weergave === "bulk" ? (
            <span className="text-xs text-ink-400">Selecteer hieronder meerdere medewerkers en boek ze in één keer op een project.</span>
          ) : weergave === "persoon" ? (
            <>
              <UserIcon className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="shrink-0 text-sm font-semibold text-ink-600">Medewerker:</span>
              <div className="min-w-0 flex-1 sm:max-w-xs"><Keuze value={persSel || medewerkers[0]?.id || ""} onChange={(w) => { setPersSel(w); setVoegProject(""); }} altijdZoeken opties={medewerkers.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker kiezen" /></div>
            </>
          ) : (
            <>
              <FolderKanban className="h-4 w-4 shrink-0 text-brand-600" />
              <span className="shrink-0 text-sm font-semibold text-ink-600">Project:</span>
              <div className="min-w-0 flex-1 sm:max-w-md"><Keuze value={projSel} onChange={(w) => { setProjSel(w); setVoegToe(""); }} altijdZoeken opties={[{ waarde: "", label: "Algemeen (geen project)" }, ...actieveProjecten.map((p) => ({ waarde: p.id, label: p.naam }))]} title="Project kiezen" /></div>
            </>
          )}
        </div>
      </Card>

      {weergave === "bulk" ? (
        <BulkBoeken
          weekISO={weekISO} weekISOs={weekISOs} weekNr={weekNr(weekDate)}
          medewerkers={medewerkers} actieveProjecten={actieveProjecten} urenstaat={urenstaat}
          verlofOp={verlofOp} autoUren={autoUren}
          addUren={addUren} updateUren={updateUren}
        />
      ) : weergave === "persoon" ? (
        <PerMedewerker
          key={persSel || medewerkers[0]?.id}
          persoon={medewerkers.find((u) => u.id === (persSel || medewerkers[0]?.id))}
          weekISO={weekISO} weekISOs={weekISOs} weekNr={weekNr(weekDate)}
          records={urenstaat.filter((x) => x.medewerkerId === (persSel || medewerkers[0]?.id) && x.week === weekISO)}
          actieveProjecten={actieveProjecten} projectLabel={projectLabel} projectSub={projectSub}
          verlofOp={verlofOp} autoUren={autoUren}
          voegProject={voegProject} setVoegProject={setVoegProject}
          addUren={addUren} updateUren={updateUren} deleteUren={deleteUren}
        />
      ) : (
        <PerProject
          weekISO={weekISO} weekISOs={weekISOs} weekNr={weekNr(weekDate)}
          projSel={projSel} projects={projects} medewerkers={medewerkers} urenstaat={urenstaat}
          contractUren={contractUren} verlofOp={verlofOp} autoUren={autoUren} projectLabel={projectLabel}
          voegToe={voegToe} setVoegToe={setVoegToe}
          addUren={addUren} updateUren={updateUren}
        />
      )}
    </div>
  );
}

// ── BULK: selecteer meerdere medewerkers en boek ze in één keer op een project (verlof/feestdag → 0) ──
function BulkBoeken({ weekISO, weekISOs, weekNr, medewerkers, actieveProjecten, urenstaat, verlofOp, autoUren, addUren, updateUren }: {
  weekISO: string; weekISOs: string[]; weekNr: number;
  medewerkers: User[];
  actieveProjecten: { id: string; naam: string }[];
  urenstaat: Urenregel[];
  verlofOp: (userId: string, iso: string) => { type: string; notitie?: string } | undefined;
  autoUren: (u: User) => number[];
  addUren: (u: Omit<Urenregel, "id">) => string;
  updateUren: (id: string, patch: Partial<Urenregel>) => void;
}) {
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [projectId, setProjectId] = useState(""); // "" = Algemeen
  const [patroon, setPatroon] = useState<number[]>([8, 8, 8, 8, 8, 0, 0]);
  const [auto, setAuto] = useState(false);
  const [geboekt, setGeboekt] = useState(0);
  const [zoek, setZoek] = useState("");

  const gekozenLijst = medewerkers.filter((u) => gekozen.has(u.id));
  const q = zoek.trim().toLowerCase();
  const gefilterd = medewerkers.filter((u) => !gekozen.has(u.id) && (q === "" || u.naam.toLowerCase().includes(q)));

  const toggle = (id: string) => { setGeboekt(0); setGekozen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const allesAan = medewerkers.length > 0 && medewerkers.every((u) => gekozen.has(u.id));
  const toggleAlles = () => { setGeboekt(0); setGekozen(allesAan ? new Set() : new Set(medewerkers.map((u) => u.id))); };
  const zetPatroon = (i: number, waarde: number) => { setGeboekt(0); setPatroon((p) => p.map((x, j) => (j === i ? waarde : x))); };
  const patroonTotaal = patroon.reduce((a, b) => a + b, 0);

  const projectNaam = projectId ? (actieveProjecten.find((p) => p.id === projectId)?.naam ?? "project") : "Algemeen";

  const boek = () => {
    const ids = [...gekozen];
    if (ids.length === 0) return;
    for (const id of ids) {
      const u = medewerkers.find((x) => x.id === id);
      if (!u) continue;
      // Verlof/vakantie/ziek en feestdagen worden per persoon op 0 gezet, ook bij een vast patroon.
      const uren = auto ? autoUren(u) : patroon.map((h, i) => (verlofOp(u.id, weekISOs[i]) || feestdagNaam(weekISOs[i]) ? 0 : h));
      const bestaand = urenstaat.find((x) => x.medewerkerId === id && x.week === weekISO && (x.projectId ?? "") === projectId);
      if (bestaand) updateUren(bestaand.id, { uren });
      else addUren({ medewerkerId: id, week: weekISO, projectId: projectId || undefined, uren });
    }
    setGeboekt(ids.length);
  };

  const veldCls = "w-14 rounded-lg border border-ink-200 bg-white px-1.5 py-1.5 text-center text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Users className="h-4 w-4 text-brand-600" />
        <span className="text-sm font-bold text-ink-900">Meerdere tegelijk boeken · week {weekNr}</span>
        <span className="ml-auto text-xs font-semibold text-ink-500">{gekozen.size} geselecteerd</span>
      </div>

      {/* Medewerkers kiezen: typ een naam om te zoeken, klik/Enter om toe te voegen; gekozen staan bovenaan */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-ink-500">Medewerkers ({gekozen.size} geselecteerd)</span>
          <button type="button" onClick={toggleAlles} className="text-xs font-semibold text-brand-600 hover:underline">{allesAan ? "Alles wissen" : "Alles selecteren"}</button>
        </div>

        {gekozenLijst.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {gekozenLijst.map((u) => (
              <span key={u.id} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 py-1.5 pl-2.5 pr-1.5 text-xs font-semibold text-white">
                {u.naam}
                <button type="button" onClick={() => toggle(u.id)} className="rounded p-0.5 hover:bg-white/25" aria-label={`${u.naam} verwijderen`}><X className="h-3 w-3" /></button>
              </span>
            ))}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-ink-200">
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              value={zoek}
              onChange={(e) => { setGeboekt(0); setZoek(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter" && gefilterd[0]) { e.preventDefault(); toggle(gefilterd[0].id); } }}
              placeholder="Typ een naam om toe te voegen…"
              className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
            />
            {zoek && <button type="button" onClick={() => setZoek("")} className="rounded p-0.5 text-ink-400 hover:text-ink-700" aria-label="Zoekterm wissen"><X className="h-4 w-4" /></button>}
          </div>
          <div className="max-h-52 overflow-y-auto p-1">
            {gefilterd.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-ink-400">{q ? "Geen medewerker gevonden." : "Iedereen is al geselecteerd."}</div>
            ) : gefilterd.map((u) => (
              <button key={u.id} type="button" onClick={() => toggle(u.id)} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-brand-50">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[10px] font-semibold text-white">{u.initialen}</span>
                <span className="flex-1 truncate text-ink-800">{u.naam}</span>
                <Plus className="h-4 w-4 shrink-0 text-ink-300" />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Project + uren */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <span className="mb-1 block text-xs font-semibold text-ink-500">Project</span>
          <Keuze value={projectId} onChange={(w) => { setGeboekt(0); setProjectId(w); }} altijdZoeken opties={[{ waarde: "", label: "Algemeen (geen project)" }, ...actieveProjecten.map((p) => ({ waarde: p.id, label: p.naam }))]} title="Project" />
        </div>
        <label className="flex items-end gap-2 pb-1.5">
          <input type="checkbox" checked={auto} onChange={(e) => { setGeboekt(0); setAuto(e.target.checked); }} className="h-4 w-4 accent-brand-600" />
          <span className="text-sm text-ink-700">Ieders eigen contract gebruiken (contract − verlof/feestdag)</span>
        </label>
      </div>

      {!auto && (
        <div>
          <span className="mb-1.5 block text-xs font-semibold text-ink-500">Uren per dag <span className="font-normal text-ink-400">(verlof/feestdag wordt per persoon vanzelf 0)</span></span>
          <div className="flex flex-wrap items-end gap-3">
            {DAGEN.map((d, i) => (
              <label key={d} className="text-center">
                <span className={`mb-1 block text-[11px] font-semibold ${i >= 5 ? "text-ink-400" : "text-ink-500"}`}>{d}</span>
                <input inputMode="decimal" value={patroon[i] ? uurTekst(patroon[i]) : ""} onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); zetPatroon(i, Number.isFinite(n) && n >= 0 ? n : 0); }} placeholder="0" aria-label={`Uren ${d}`} className={veldCls} />
              </label>
            ))}
            <div className="flex flex-wrap gap-1.5 pb-1">
              <button type="button" onClick={() => { setGeboekt(0); setPatroon([8, 8, 8, 8, 8, 0, 0]); }} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">8 u ma–vr</button>
              <button type="button" onClick={() => { setGeboekt(0); setPatroon([0, 0, 0, 0, 0, 0, 0]); }} className="rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">Leeg</button>
            </div>
            <span className="pb-2 text-xs text-ink-400">{uurTekst(patroonTotaal)} u/week</span>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3">
        <button type="button" onClick={boek} disabled={gekozen.size === 0} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
          <Check className="h-4 w-4" /> Boek voor {gekozen.size} {gekozen.size === 1 ? "medewerker" : "medewerkers"}
        </button>
        {geboekt > 0 && <span className="text-sm font-semibold text-emerald-600">✓ Geboekt voor {geboekt} {geboekt === 1 ? "medewerker" : "medewerkers"} op “{projectNaam}”.</span>}
      </div>
      <p className="text-xs text-ink-400">Dit vervangt de uren van de geselecteerde medewerkers voor deze week op het gekozen project. In "Per medewerker" of "Per project" kun je daarna nog per persoon bijstellen.</p>
    </Card>
  );
}

// ── Weergave PER MEDEWERKER: per project een rij (Ma–Zo) + notitie; zo boek je elke dag op een ander project ──
function PerMedewerker({ persoon, weekISO, weekISOs, weekNr, records, actieveProjecten, projectLabel, projectSub, verlofOp, autoUren, voegProject, setVoegProject, addUren, updateUren, deleteUren }: {
  persoon?: User;
  weekISO: string; weekISOs: string[]; weekNr: number;
  records: Urenregel[];
  actieveProjecten: { id: string; naam: string }[];
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
  toevoegOpties.push(...actieveProjecten.filter((p) => !gebruikt.has(p.id)).map((p) => ({ waarde: p.id, label: p.naam })));

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
          <div className="w-64"><Keuze value={voegProject} onChange={voegRijToe} altijdZoeken opties={toevoegOpties} title="Project toevoegen" size="sm" /></div>
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
function PerProject({ weekISO, weekISOs, weekNr, projSel, projects, medewerkers, urenstaat, contractUren, verlofOp, autoUren, projectLabel, voegToe, setVoegToe, addUren, updateUren }: {
  weekISO: string; weekISOs: string[]; weekNr: number;
  projSel: string;
  projects: { id: string; naam: string; toegewezenAan: string[]; boekhouding?: string }[];
  projectLabel: (pid?: string) => string;
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
        <span className="text-sm font-bold text-ink-900">{algemeen ? "Algemeen" : projectLabel(projSel)} · week {weekNr}</span>
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
          <div className="w-56"><Keuze value={voegToe} onChange={voegPersoonToe} altijdZoeken opties={[{ waarde: "", label: "Kies medewerker…" }, ...toevoegbaar.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Medewerker toevoegen" size="sm" /></div>
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

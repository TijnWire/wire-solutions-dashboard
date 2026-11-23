// Gasleidingen — vervangen van de bestaande gasleidingen, per plaats een project.
// ─────────────────────────────────────────────────────────────────────────────
// De werkvolgorde staat in het scherm zelf, in drie stappen:
//   1. Brieven bezorgen   → per adres of per hele straat afvinken (zoals de adreslijst van Stedin).
//   2. Afspraken maken    → bewoners bellen zelf (nummer in de brief); wie niet belt, gaat het team langs.
//   3. Planning           → per werkdag twee tijdsblokken (08–12 en 12–16), per blok één afspraak per
//                           ploeg van Stedin. Geen naam nodig, alleen het adres (telefoon optioneel).
// Het "Huizenoverzicht" laat per straat elk huis als blokje zien in de kleur van zijn stand, zodat je in
// één oogopslag ziet waar nog brieven of afspraken ontbreken.
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft, Check, ChevronDown, ChevronLeft, ChevronRight, DoorOpen, Download, Flame, FolderOpen, Loader2, Mail,
  MailCheck, Phone, Plus, Search, Settings2, Trash2, Upload, UserX, X, CalendarCheck, Ban, Undo2,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { isToegewezen } from "../lib/toewijzing";
import type { GasAdres, GasBlok, GasProject } from "../lib/types";
import {
  GAS_BLOKKEN, adresTekst, bezetting, blokLabel, dagKort, dagLang, isProjectDag, leesGasAdressen, maandagVan, perStraat,
  plusDagen, sorteerAdressen, telling, vandaagISO, vrijeSlots, type GasRij, type StraatGroep,
} from "../lib/gas";
import { exporteerGasAdreslijst, exporteerGasPlanning } from "../lib/gasExcel";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// Kleur per stand van een adres — overal hetzelfde (blokjes, badges, legenda).
const STAND = {
  geenBrief: { label: "Nog geen brief", blok: "bg-ink-200", tekst: "text-ink-600" },
  brief: { label: "Brief bezorgd", blok: "bg-sky-400", tekst: "text-sky-700" },
  nietThuis: { label: "Niet thuis", blok: "bg-amber-400", tekst: "text-amber-700" },
  afgesproken: { label: "Afgesproken", blok: "bg-green-500", tekst: "text-green-700" },
  weigert: { label: "Weigert", blok: "bg-red-500", tekst: "text-red-700" },
} as const;
type StandKey = keyof typeof STAND;
const standVan = (a: GasAdres): StandKey =>
  a.status === "afgesproken" ? "afgesproken" : a.status === "weigert" ? "weigert" : a.status === "niet_thuis" ? "nietThuis" : a.briefOp ? "brief" : "geenBrief";

export function Gasleidingen({ initieelProject }: { initieelProject?: string }) {
  const { gasProjecten, gasAdressen, currentUser } = useApp();
  const [gekozen, setGekozen] = useState<string | null>(initieelProject ?? null);
  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const zichtbaar = gasProjecten.filter((p) => !p.gearchiveerd && (isLeiding || !p.toegewezenAan || isToegewezen(p, currentUser.id)));
  const open = zichtbaar.find((p) => p.id === gekozen);
  if (open) return <ProjectDetail project={open} adressen={gasAdressen.filter((a) => a.projectId === open.id)} terug={() => setGekozen(null)} isLeiding={isLeiding} />;
  return <ProjectLijst projecten={zichtbaar} kies={setGekozen} isLeiding={isLeiding} />;
}

// ───────────────────────── Overzicht van de projecten ─────────────────────────
function ProjectLijst({ projecten, kies, isLeiding }: { projecten: GasProject[]; kies: (id: string) => void; isLeiding: boolean }) {
  const { gasAdressen, addGasProject, deleteGasProject } = useApp();
  const [naam, setNaam] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [rijen, setRijen] = useState<GasRij[] | null>(null);
  const [bestand, setBestand] = useState("");
  const invoer = useRef<HTMLInputElement | null>(null);

  const lees = async (f: File) => {
    setBezig(true); setFout(""); setRijen(null);
    const r = await leesGasAdressen(f);
    setBezig(false);
    if (!r.ok) { setFout(r.fout); return; }
    setRijen(r.rijen);
    setBestand(f.name);
    if (!naam.trim() && r.plaats) setNaam(r.plaats);
  };
  const maak = () => {
    if (!naam.trim()) return;
    const id = addGasProject({ naam: naam.trim(), ploegen: 1 }, rijen ?? []);
    setNaam(""); setRijen(null); setBestand("");
    kies(id);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Gasleidingen</h2>
        <p className="text-sm text-ink-500">Vervangen van de bestaande gasleidingen. Per plaats een project: brieven bezorgen, afspraken maken (telefonisch of aan de deur) en inplannen in twee tijdsblokken per dag.</p>
      </div>

      {isLeiding && (
        <Card className="p-4">
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Nieuw project (plaats)</span>
              <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Bijvoorbeeld Nieuw-Lekkerland"
                className="w-full rounded-xl border border-ink-200 px-4 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <button type="button" onClick={() => invoer.current?.click()} disabled={bezig}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60">
              {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Adreslijst (PDF/Excel)
            </button>
            <button type="button" onClick={maak} disabled={!naam.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
              <Plus className="h-4 w-4" /> Project aanmaken
            </button>
            <input ref={invoer} type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" aria-label="Adreslijst kiezen"
              onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void lees(f); }} />
          </div>
          {fout && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</p>}
          {rijen && (
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-sm text-green-800">
              <Check className="h-4 w-4" />
              <span><b>{rijen.length} adressen</b> in {new Set(rijen.map((r) => r.straat)).size} straten gelezen uit {bestand}.</span>
              <button type="button" onClick={() => { setRijen(null); setBestand(""); }} className="ml-auto text-xs font-semibold text-green-700 underline">weghalen</button>
            </div>
          )}
        </Card>
      )}

      {projecten.length === 0 ? (
        <Card className="p-10 text-center">
          <Flame className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">{isLeiding ? "Nog geen projecten. Maak hierboven een project aan en lees de adreslijst van Stedin in." : "Er staan nog geen projecten voor je klaar."}</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projecten.map((p) => {
            const lijst = gasAdressen.filter((a) => a.projectId === p.id);
            const t = telling(lijst);
            return (
              <Card key={p.id} className="p-0">
                <button type="button" onClick={() => kies(p.id)} className="flex w-full items-start gap-3 rounded-2xl p-4 text-left hover:bg-ink-50">
                  <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><Flame className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink-900">{p.naam}</span>
                      {p.pdNummer && <span className="shrink-0 rounded-md bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">{p.pdNummer}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">{t.totaal} adressen · {p.ploegen} {p.ploegen === 1 ? "ploeg" : "ploegen"}</div>
                    <div className="mt-2.5 space-y-1.5">
                      <MiniBalk label="Brieven" waarde={t.brief} totaal={t.totaal} kleur="bg-sky-400" />
                      <MiniBalk label="Afgesproken" waarde={t.afgesproken} totaal={t.totaal} kleur="bg-green-500" />
                    </div>
                  </div>
                </button>
                {isLeiding && t.afgesproken === 0 && (
                  <div className="border-t border-ink-100 px-4 py-2 text-right">
                    <button type="button" onClick={() => { if (confirm(`Project "${p.naam}" met ${t.totaal} adressen verwijderen?`)) deleteGasProject(p.id); }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700">
                      <Trash2 className="h-3.5 w-3.5" /> Project verwijderen
                    </button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MiniBalk({ label, waarde, totaal, kleur }: { label: string; waarde: number; totaal: number; kleur: string }) {
  return (
    <div>
      <div className="flex justify-between text-[11px] text-ink-500"><span>{label}</span><span className="font-semibold text-ink-700">{waarde}/{totaal}</span></div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className={`h-full rounded-full ${kleur}`} style={{ width: `${pct(waarde, totaal)}%` }} /></div>
    </div>
  );
}

// ───────────────────────── Eén project ─────────────────────────
type Tab = "overzicht" | "brieven" | "deur" | "planning";

function ProjectDetail({ project: p, adressen, terug, isLeiding }: { project: GasProject; adressen: GasAdres[]; terug: () => void; isLeiding: boolean }) {
  const t = telling(adressen);
  const [tab, setTab] = useState<Tab>(t.brief === 0 ? "brieven" : "overzicht");
  const [adresId, setAdresId] = useState<string | null>(null);
  const [straatFilter, setStraatFilter] = useState("");
  const [instellingen, setInstellingen] = useState(false);
  const gekozen = adressen.find((a) => a.id === adresId);
  const straten = useMemo(() => perStraat(adressen), [adressen]);

  const naarStraat = (straat: string, doel: Tab) => { setStraatFilter(straat); setTab(doel); };

  return (
    <div className="space-y-5">
      <button type="button" onClick={terug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-600 hover:text-brand-700">
        <ArrowLeft className="h-4 w-4" /> Alle projecten
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink-900">{p.naam}</h2>
            {p.pdNummer && <span className="rounded-md bg-ink-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">{p.pdNummer}</span>}
          </div>
          <p className="text-sm text-ink-500">
            Vervangen gasleidingen · {t.totaal} adressen in {straten.length} straten · {p.ploegen} {p.ploegen === 1 ? "ploeg" : "ploegen"} ({p.ploegen * 2} afspraken per dag)
            {p.belnummer && <> · bewoners bellen <a href={`tel:${p.belnummer.replace(/[^0-9+]/g, "")}`} className="font-semibold text-brand-700">{p.belnummer}</a></>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => void exporteerGasAdreslijst(p, adressen)} className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Download className="h-4 w-4" /> Adreslijst
          </button>
          <button type="button" onClick={() => void exporteerGasPlanning(p, adressen)} className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700">
            <Download className="h-4 w-4" /> Planning voor Stedin (Excel)
          </button>
        </div>
      </div>

      {/* De drie stappen, met de voortgang van elk */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Stap nr={1} titel="Brieven bezorgen" icon={Mail} waarde={t.brief} totaal={t.totaal} kleur="bg-sky-400" sub={t.totaal - t.brief ? `nog ${t.totaal - t.brief} te bezorgen` : "alle brieven bezorgd"} onClick={() => setTab("brieven")} actief={tab === "brieven"} />
        <Stap nr={2} titel="Afspraken maken" icon={Phone} waarde={t.afgesproken} totaal={t.totaal - t.weigert} kleur="bg-green-500"
          sub={`${t.viaTelefoon} gebeld · ${t.viaDeur} aan de deur${t.nietThuis ? ` · ${t.nietThuis} niet thuis` : ""}`} onClick={() => setTab("deur")} actief={tab === "deur"} />
        <Stap nr={3} titel="Nog af te spreken" icon={DoorOpen} waarde={t.teDoen} totaal={t.totaal} kleur="bg-amber-400" omgekeerd
          sub={t.weigert ? `${t.weigert} ${t.weigert === 1 ? "weigert" : "weigeren"}` : "langs de deur of nabellen"} onClick={() => setTab("overzicht")} actief={tab === "overzicht"} />
      </div>

      <div className="flex gap-0.5 rounded-lg border border-ink-200 bg-white p-0.5 shadow-card sm:gap-1 sm:rounded-xl sm:p-1">
        {([["overzicht", "Huizenoverzicht"], ["brieven", "Brieven"], ["deur", "Afspraken maken"], ["planning", "Planning"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:py-2 sm:text-sm ${tab === k ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overzicht" && <HuizenOverzicht straten={straten} kiesAdres={setAdresId} naarStraat={naarStraat} />}
      {tab === "brieven" && <BrievenLijst straten={straten} filter={straatFilter} setFilter={setStraatFilter} />}
      {tab === "deur" && <DeurLijst project={p} straten={straten} filter={straatFilter} setFilter={setStraatFilter} kiesAdres={setAdresId} alle={adressen} />}
      {tab === "planning" && <Planning project={p} adressen={adressen} kiesAdres={setAdresId} />}

      {isLeiding && (
        <Card className="p-0">
          <button type="button" onClick={() => setInstellingen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
            <Settings2 className="h-4 w-4 text-ink-500" />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink-900">Project instellen</div>
              <div className="text-xs text-ink-500">
                {p.ploegen} {p.ploegen === 1 ? "ploeg" : "ploegen"} · {p.vanaf ? `vanaf ${dagKort(p.vanaf)}` : "nog geen startdatum"}{p.tot ? ` t/m ${dagKort(p.tot)}` : ""}
              </div>
            </div>
            <ChevronDown className={`h-4 w-4 text-ink-400 transition-transform ${instellingen ? "rotate-180" : ""}`} />
          </button>
          {instellingen && <ProjectInstellingen project={p} />}
        </Card>
      )}

      {gekozen && <AdresVenster project={p} adres={gekozen} alle={adressen} sluit={() => setAdresId(null)} />}
    </div>
  );
}

function Stap({ nr, titel, icon: Icon, waarde, totaal, kleur, sub, onClick, actief, omgekeerd }: {
  nr: number; titel: string; icon: typeof Mail; waarde: number; totaal: number; kleur: string; sub: string; onClick: () => void; actief: boolean; omgekeerd?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={`rounded-2xl border bg-white p-2.5 text-left shadow-card transition-all hover:shadow-cardhover sm:p-4 ${actief ? "border-brand-300 ring-2 ring-brand-100" : "border-ink-200"}`}>
      <div className="flex items-center gap-3">
        <div className="relative hidden rounded-xl bg-brand-50 p-2.5 text-brand-600 sm:block">
          <Icon className="h-5 w-5" />
          <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-ink-900 text-[10px] font-bold text-white">{nr}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-ink-500 sm:text-xs"><span className="sm:hidden">{nr}. </span>{titel}</div>
          <div className="text-lg font-bold text-ink-900 sm:text-xl">{waarde}<span className="text-xs font-semibold text-ink-400 sm:text-sm"> / {totaal}</span></div>
        </div>
        <div className="hidden text-right text-sm font-bold text-ink-700 sm:block">{omgekeerd ? "" : `${pct(waarde, totaal)}%`}</div>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-ink-100"><div className={`h-full rounded-full ${kleur} transition-all`} style={{ width: `${pct(waarde, totaal)}%` }} /></div>
      <div className="mt-1.5 hidden text-xs text-ink-500 sm:block">{sub}</div>
    </button>
  );
}

function Legenda() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-600">
      {(Object.keys(STAND) as StandKey[]).map((k) => (
        <span key={k} className="inline-flex items-center gap-1.5"><span className={`h-3 w-3 rounded-[3px] ${STAND[k].blok}`} /> {STAND[k].label}</span>
      ))}
    </div>
  );
}

// ── Huizenoverzicht: elk huis een blokje, per straat ──
function HuizenOverzicht({ straten, kiesAdres, naarStraat }: { straten: StraatGroep[]; kiesAdres: (id: string) => void; naarStraat: (s: string, t: Tab) => void }) {
  const [zoek, setZoek] = useState("");
  const [alleenOpen, setAlleenOpen] = useState(false);
  const q = zoek.trim().toLowerCase();
  const lijst = straten.filter((s) => (!q || s.straat.toLowerCase().includes(q)) && (!alleenOpen || s.open > 0));
  return (
    <Card className="p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek straat…"
            className="w-full rounded-xl border border-ink-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={alleenOpen} onChange={(e) => setAlleenOpen(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Alleen straten met open adressen
        </label>
      </div>
      <div className="mb-4"><Legenda /></div>
      <div className="divide-y divide-ink-100">
        {lijst.map((s) => (
          <div key={s.straat} className="py-3">
            <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
              <span className="text-sm font-bold text-ink-900">{s.straat}</span>
              <span className="text-xs text-ink-500">{s.adressen.length} adressen · {s.brief} brieven · {s.afgesproken} afgesproken</span>
              <div className="ml-auto flex gap-1.5">
                {s.brief < s.adressen.length && <button type="button" onClick={() => naarStraat(s.straat, "brieven")} className="rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100">Brieven</button>}
                {s.open > 0 && <button type="button" onClick={() => naarStraat(s.straat, "deur")} className="rounded-lg border border-brand-200 bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-700 hover:bg-brand-100">Langs de deur</button>}
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {s.adressen.map((a) => {
                const st = STAND[standVan(a)];
                return (
                  <button key={a.id} type="button" onClick={() => kiesAdres(a.id)} title={`${adresTekst(a)} — ${st.label}${a.status === "afgesproken" && a.datum ? `, ${dagKort(a.datum)} ${blokLabel(a.blok)}` : ""}`}
                    className={`flex h-7 min-w-[2.25rem] items-center justify-center rounded-md px-1 text-[11px] font-bold transition-transform hover:scale-110 ${st.blok} ${standVan(a) === "geenBrief" ? "text-ink-600" : "text-white"}`}>
                    {a.huisnummer}{a.toevoeging}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {lijst.length === 0 && <p className="py-6 text-center text-sm text-ink-500">Geen straten gevonden.</p>}
      </div>
    </Card>
  );
}

function StraatKiezer({ straten, filter, setFilter, telLabel }: { straten: StraatGroep[]; filter: string; setFilter: (s: string) => void; telLabel: (s: StraatGroep) => string }) {
  return (
    <select value={filter} onChange={(e) => setFilter(e.target.value)}
      className="w-full rounded-xl border border-ink-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 sm:w-auto sm:min-w-[18rem]">
      <option value="">Alle straten ({straten.length})</option>
      {straten.map((s) => <option key={s.straat} value={s.straat}>{s.straat} — {telLabel(s)}</option>)}
    </select>
  );
}

// ── Stap 1: brieven bezorgen ──
function BrievenLijst({ straten, filter, setFilter }: { straten: StraatGroep[]; filter: string; setFilter: (s: string) => void }) {
  const { updateGasAdressen, currentUser } = useApp();
  const [nogTeDoen, setNogTeDoen] = useState(false);
  const lijst = straten.filter((s) => (!filter || s.straat === filter) && (!nogTeDoen || s.brief < s.adressen.length));
  const zet = (ids: string[], aan: boolean) =>
    updateGasAdressen(ids, aan ? { briefOp: new Date().toISOString(), briefDoor: currentUser?.id } : { briefOp: undefined, briefDoor: undefined });

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <StraatKiezer straten={straten} filter={filter} setFilter={setFilter} telLabel={(s) => `${s.brief}/${s.adressen.length} bezorgd`} />
        <label className="inline-flex items-center gap-2 text-sm text-ink-700">
          <input type="checkbox" checked={nogTeDoen} onChange={(e) => setNogTeDoen(e.target.checked)} className="h-4 w-4 accent-brand-600" /> Alleen nog te bezorgen
        </label>
        <p className="w-full text-xs text-ink-500">Tik op een huisnummer als de brief daar in de bus zit, of vink in één keer de hele straat af.</p>
      </Card>
      {lijst.map((s) => {
        const klaar = s.brief === s.adressen.length;
        const even = s.adressen.filter((a) => (parseInt(a.huisnummer) || 0) % 2 === 0);
        const oneven = s.adressen.filter((a) => (parseInt(a.huisnummer) || 0) % 2 === 1);
        return (
          <Card key={s.straat} className="overflow-hidden p-0">
            <div className={`flex flex-wrap items-center gap-3 border-b px-4 py-3 ${klaar ? "border-green-100 bg-green-50" : "border-ink-100 bg-sky-50/60"}`}>
              {klaar ? <MailCheck className="h-5 w-5 text-green-600" /> : <Mail className="h-5 w-5 text-sky-600" />}
              <div className="min-w-0 flex-1">
                <div className="text-sm font-bold text-ink-900">{s.straat}</div>
                <div className="text-xs text-ink-500">{s.brief} van {s.adressen.length} brieven bezorgd</div>
              </div>
              {klaar ? (
                <button type="button" onClick={() => { if (confirm(`Brieven van ${s.straat} weer op "nee" zetten?`)) zet(s.adressen.map((a) => a.id), false); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-ink-500 hover:text-ink-800"><Undo2 className="h-3.5 w-3.5" /> terugzetten</button>
              ) : (
                <button type="button" onClick={() => zet(s.adressen.filter((a) => !a.briefOp).map((a) => a.id), true)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-700">
                  <Check className="h-4 w-4" /> Hele straat bezorgd
                </button>
              )}
            </div>
            <div className="grid gap-3 p-4 md:grid-cols-2">
              {[["Oneven kant", oneven], ["Even kant", even]].map(([titel, rij]) => (rij as GasAdres[]).length > 0 && (
                <div key={titel as string}>
                  <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{titel as string}</div>
                  <div className="flex flex-wrap gap-1.5">
                    {(rij as GasAdres[]).map((a) => (
                      <button key={a.id} type="button" onClick={() => zet([a.id], !a.briefOp)} title={`${adresTekst(a)} · ${a.postcode}`}
                        className={`inline-flex h-9 min-w-[3rem] items-center justify-center gap-1 rounded-lg px-2 text-sm font-bold transition-colors ${a.briefOp ? "bg-sky-500 text-white hover:bg-sky-600" : "border border-ink-200 bg-white text-ink-700 hover:border-sky-300 hover:bg-sky-50"}`}>
                        {a.briefOp && <Check className="h-3.5 w-3.5" />}{a.huisnummer}{a.toevoeging && <span className="text-[11px] font-semibold opacity-80">{a.toevoeging}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        );
      })}
      {lijst.length === 0 && <Card className="p-8 text-center text-sm text-ink-500">Alle brieven in deze selectie zijn bezorgd.</Card>}
    </div>
  );
}

// ── Stap 2: afspraken maken (telefonisch binnengekomen of langs de deur) ──
function DeurLijst({ project, straten, filter, setFilter, kiesAdres, alle }: { project: GasProject; straten: StraatGroep[]; filter: string; setFilter: (s: string) => void; kiesAdres: (id: string) => void; alle: GasAdres[] }) {
  const { updateGasAdressen, currentUser } = useApp();
  const [zoek, setZoek] = useState("");
  const [toon, setToon] = useState<"open" | "alles">("open");
  const q = zoek.trim().toLowerCase();
  const eerstVrij = useMemo(() => vrijeSlots(project, alle, 1)[0], [project, alle]);
  const groepen = straten
    .filter((s) => !filter || s.straat === filter)
    .map((s) => ({ ...s, rij: s.adressen.filter((a) => (toon === "alles" || a.status === "open" || a.status === "niet_thuis") && (!q || `${adresTekst(a)} ${a.postcode}`.toLowerCase().includes(q))) }))
    .filter((s) => s.rij.length);

  const nietThuis = (a: GasAdres) => updateGasAdressen([a.id], (x) => ({ status: "niet_thuis", bezoeken: [...(x.bezoeken ?? []), { op: new Date().toISOString(), door: currentUser?.id }] }));

  return (
    <div className="space-y-3">
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <StraatKiezer straten={straten} filter={filter} setFilter={setFilter} telLabel={(s) => `${s.open} open`} />
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek adres of postcode (bijv. als een bewoner belt)…"
              className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </div>
          <div className="flex rounded-lg border border-ink-200 p-0.5 text-xs font-semibold">
            {(["open", "alles"] as const).map((k) => (
              <button key={k} type="button" onClick={() => setToon(k)} className={`rounded-md px-3 py-1.5 ${toon === k ? "bg-ink-900 text-white" : "text-ink-600"}`}>{k === "open" ? "Nog af te spreken" : "Alle adressen"}</button>
            ))}
          </div>
        </div>
        <p className="text-xs text-ink-500">
          Belt een bewoner? Zoek het adres en klik op <b>Afspraak</b>. Aan de deur: <b>Afspraak</b> als het lukt, <b>Niet thuis</b> als er niemand opendoet (wordt bijgehouden), of <b>Weigert</b>.
          {eerstVrij && <> Eerstvolgende vrije plek: <b className="text-ink-800">{dagKort(eerstVrij.datum)} · {blokLabel(eerstVrij.blok)}</b>.</>}
        </p>
      </Card>

      {groepen.map((s) => (
        <Card key={s.straat} className="overflow-hidden p-0">
          <div className="flex items-center gap-2 border-b border-ink-100 bg-brand-50/60 px-4 py-2.5">
            <DoorOpen className="h-4 w-4 text-brand-600" />
            <span className="text-sm font-bold text-ink-900">{s.straat}</span>
            <span className="text-xs text-ink-500">{s.open} nog af te spreken · {s.afgesproken} afgesproken</span>
          </div>
          <div className="divide-y divide-ink-100">
            {s.rij.map((a) => {
              const st = STAND[standVan(a)];
              const n = a.bezoeken?.length ?? 0;
              return (
                <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
                  <button type="button" onClick={() => kiesAdres(a.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left">
                    <span className={`h-3 w-3 shrink-0 rounded-[3px] ${st.blok}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-bold text-ink-900">{adresTekst(a)}</span>
                      <span className="block text-xs text-ink-500">
                        {a.postcode}{!a.briefOp && " · nog geen brief"}{n > 0 && ` · ${n}× niet thuis`}
                        {a.status === "afgesproken" && a.datum && ` · ${dagKort(a.datum)} ${blokLabel(a.blok)}`}
                      </span>
                    </span>
                  </button>
                  {a.status === "afgesproken" ? (
                    <Badge tone="green">Afgesproken</Badge>
                  ) : a.status === "weigert" ? (
                    <Badge tone="red">Weigert</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => kiesAdres(a.id)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">
                        <CalendarCheck className="h-4 w-4" /> Afspraak
                      </button>
                      <button type="button" onClick={() => nietThuis(a)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-semibold text-amber-700 hover:bg-amber-100">
                        <UserX className="h-4 w-4" /> Niet thuis
                      </button>
                      <button type="button" onClick={() => { if (confirm(`${adresTekst(a)}: bewoner werkt niet mee?`)) updateGasAdressen([a.id], { status: "weigert" }); }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm font-semibold text-ink-500 hover:bg-ink-50" title="Weigert">
                        <Ban className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      ))}
      {groepen.length === 0 && <Card className="p-8 text-center text-sm text-ink-500">{q ? "Geen adres gevonden." : "Alles in deze selectie is afgesproken."}</Card>}
    </div>
  );
}

// ── Stap 3: planning per week, twee tijdsblokken per dag ──
function Planning({ project: p, adressen, kiesAdres }: { project: GasProject; adressen: GasAdres[]; kiesAdres: (id: string) => void }) {
  const { updateGasAdressen, updateGasProject, currentUser } = useApp();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";
  const start = useMemo(() => {
    const v = vandaagISO();
    const eerste = adressen.filter((a) => a.status === "afgesproken" && a.datum && a.datum >= v).map((a) => a.datum!).sort()[0];
    return maandagVan(p.vanaf && p.vanaf > v ? p.vanaf : eerste ?? v);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [maandag, setMaandag] = useState(start);
  const [kiezen, setKiezen] = useState<{ datum: string; blok: GasBlok } | null>(null);
  const bez = bezetting(adressen);
  const dagen = [0, 1, 2, 3, 4].map((i) => plusDagen(maandag, i));
  const perSlot = (datum: string, blok: GasBlok) => adressen.filter((a) => a.status === "afgesproken" && a.datum === datum && a.blok === blok).sort(sorteerAdressen);
  const weekTotaal = dagen.reduce((s, d) => s + GAS_BLOKKEN.reduce((x, b) => x + (bez.get(`${d}|${b.key}`) ?? 0), 0), 0);
  const weekCap = dagen.filter((d) => isProjectDag(p, d)).length * 2 * (p.ploegen || 1);

  return (
    <div className="space-y-3">
      <Card className="flex flex-wrap items-center gap-3 p-3">
        <button type="button" onClick={() => setMaandag(plusDagen(maandag, -7))} className="rounded-lg border border-ink-200 p-2 hover:bg-ink-50" aria-label="Vorige week"><ChevronLeft className="h-4 w-4" /></button>
        <div className="min-w-0 flex-1 text-center">
          <div className="text-sm font-bold text-ink-900">{dagKort(dagen[0])} – {dagKort(dagen[4])}</div>
          <div className="text-xs text-ink-500">{weekTotaal} van {weekCap} plekken gevuld</div>
        </div>
        <button type="button" onClick={() => setMaandag(plusDagen(maandag, 7))} className="rounded-lg border border-ink-200 p-2 hover:bg-ink-50" aria-label="Volgende week"><ChevronRight className="h-4 w-4" /></button>
      </Card>

      <div className="grid gap-3 lg:grid-cols-5">
        {dagen.map((d) => {
          const werk = isProjectDag(p, d);
          const vrijGezet = (p.vrijeDagen ?? []).includes(d);
          return (
            <Card key={d} className={`overflow-hidden p-0 ${werk ? "" : "opacity-60"}`}>
              <div className={`flex items-center justify-between px-3 py-2 ${werk ? "bg-amber-50" : "bg-ink-50"}`}>
                <div>
                  <div className="text-sm font-bold capitalize text-ink-900">{new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "long" })}</div>
                  <div className="text-xs text-ink-500">{new Date(d + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "long" })}</div>
                </div>
                {isLeiding && (vrijGezet || werk) && (
                  <button type="button" onClick={() => updateGasProject(p.id, { vrijeDagen: vrijGezet ? (p.vrijeDagen ?? []).filter((x) => x !== d) : [...(p.vrijeDagen ?? []), d] })}
                    className="text-[11px] font-semibold text-ink-400 hover:text-ink-700">{vrijGezet ? "weer werkdag" : "vrije dag"}</button>
                )}
              </div>
              {!werk ? (
                <p className="px-3 py-4 text-xs text-ink-500">{vrijGezet ? "Vrije dag" : p.vanaf && d < p.vanaf ? "Vóór de start" : "Geen werkdag"}</p>
              ) : (
                <div className="divide-y divide-ink-100">
                  {GAS_BLOKKEN.map((b) => {
                    const rij = perSlot(d, b.key);
                    const vrij = Math.max(0, (p.ploegen || 1) - rij.length);
                    return (
                      <div key={b.key} className="space-y-1.5 px-3 py-2.5">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wide text-ink-400">
                          <span>{b.label}</span><span className={rij.length >= (p.ploegen || 1) ? "text-green-600" : ""}>{rij.length}/{p.ploegen || 1}</span>
                        </div>
                        {rij.map((a) => (
                          <div key={a.id} className="group flex items-center gap-1.5 rounded-lg bg-green-50 px-2 py-1.5 ring-1 ring-green-200">
                            <button type="button" onClick={() => kiesAdres(a.id)} className="min-w-0 flex-1 text-left">
                              <span className="block truncate text-xs font-bold text-ink-900">{adresTekst(a)}</span>
                              <span className="block truncate text-[11px] text-ink-500">{a.via === "deur" ? "aan de deur" : "gebeld"}{a.telefoon ? ` · ${a.telefoon}` : ""}</span>
                            </button>
                            <button type="button" title="Afspraak weghalen" onClick={() => { if (confirm(`Afspraak ${adresTekst(a)} weghalen?`)) updateGasAdressen([a.id], { status: "open", datum: undefined, blok: undefined }); }}
                              className="rounded p-0.5 text-ink-300 hover:bg-white hover:text-red-500"><X className="h-3.5 w-3.5" /></button>
                          </div>
                        ))}
                        {Array.from({ length: vrij }).map((_, i) => (
                          <button key={i} type="button" onClick={() => setKiezen({ datum: d, blok: b.key })}
                            className="flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-ink-300 px-2 py-1.5 text-xs font-semibold text-ink-500 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
                            <Plus className="h-3.5 w-3.5" /> Inplannen
                          </button>
                        ))}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {kiezen && <AdresKiezer adressen={adressen} titel={`${dagLang(kiezen.datum)} · ${blokLabel(kiezen.blok)}`} sluit={() => setKiezen(null)}
        kies={(a, via) => { updateGasAdressen([a.id], { status: "afgesproken", datum: kiezen.datum, blok: kiezen.blok, via, afgesprokenOp: new Date().toISOString(), afgesprokenDoor: currentUser?.id }); setKiezen(null); }} />}
    </div>
  );
}

// Een adres kiezen voor een leeg tijdsblok (bijv. een bewoner belt voor een vrije plek).
function AdresKiezer({ adressen, titel, kies, sluit }: { adressen: GasAdres[]; titel: string; kies: (a: GasAdres, via: "telefoon" | "deur") => void; sluit: () => void }) {
  const [zoek, setZoek] = useState("");
  const [via, setVia] = useState<"telefoon" | "deur">("telefoon");
  const q = zoek.trim().toLowerCase();
  const lijst = adressen.filter((a) => (a.status === "open" || a.status === "niet_thuis") && (!q || `${adresTekst(a)} ${a.postcode}`.toLowerCase().includes(q))).sort(sorteerAdressen).slice(0, 40);
  return (
    <Venster titel="Adres inplannen" sub={titel} sluit={sluit}>
      <div className="space-y-3 p-4">
        <ViaKeuze via={via} setVia={setVia} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Straat, huisnummer of postcode…"
            className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </div>
        <div className="max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
          {lijst.map((a) => (
            <button key={a.id} type="button" onClick={() => kies(a, via)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-brand-50">
              <span className={`h-2.5 w-2.5 rounded-[3px] ${STAND[standVan(a)].blok}`} />
              <span className="flex-1 text-sm font-semibold text-ink-900">{adresTekst(a)}</span>
              <span className="text-xs text-ink-500">{a.postcode}</span>
            </button>
          ))}
          {lijst.length === 0 && <p className="px-3 py-6 text-center text-sm text-ink-500">Geen open adres gevonden.</p>}
        </div>
      </div>
    </Venster>
  );
}

function ViaKeuze({ via, setVia }: { via: "telefoon" | "deur"; setVia: (v: "telefoon" | "deur") => void }) {
  return (
    <div className="flex rounded-xl border border-ink-200 p-0.5 text-sm font-semibold">
      <button type="button" onClick={() => setVia("telefoon")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 ${via === "telefoon" ? "bg-ink-900 text-white" : "text-ink-600"}`}><Phone className="h-4 w-4" /> Bewoner belde</button>
      <button type="button" onClick={() => setVia("deur")} className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 ${via === "deur" ? "bg-ink-900 text-white" : "text-ink-600"}`}><DoorOpen className="h-4 w-4" /> Aan de deur</button>
    </div>
  );
}

function Venster({ titel, sub, sluit, children }: { titel: string; sub?: string; sluit: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink-900/40 p-0 sm:items-center sm:p-4" onClick={sluit}>
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-start gap-3 border-b border-ink-100 bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-ink-900">{titel}</div>
            {sub && <div className="text-xs text-ink-500">{sub}</div>}
          </div>
          <button type="button" onClick={sluit} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100" aria-label="Sluiten"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ── Eén adres: brief, afspraak maken of wijzigen, bezoeken ──
function AdresVenster({ project, adres: a, alle, sluit }: { project: GasProject; adres: GasAdres; alle: GasAdres[]; sluit: () => void }) {
  const { updateGasAdressen, currentUser, users } = useApp();
  const [via, setVia] = useState<"telefoon" | "deur">(a.via ?? "telefoon");
  const [telefoon, setTelefoon] = useState(a.telefoon ?? "");
  const [opmerking, setOpmerking] = useState(a.opmerking ?? "");
  const [datum, setDatum] = useState(a.datum ?? "");
  const [blok, setBlok] = useState<GasBlok | "">(a.blok ?? "");
  const anderen = alle.filter((x) => x.id !== a.id);
  const slots = useMemo(() => vrijeSlots(project, anderen, 10), [project, anderen]);
  const bez = bezetting(anderen);
  const vol = datum && blok ? (bez.get(`${datum}|${blok}`) ?? 0) >= (project.ploegen || 1) : false;
  const naam = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";
  const st = STAND[standVan(a)];

  const bewaar = () => {
    if (!datum || !blok) return;
    updateGasAdressen([a.id], { status: "afgesproken", datum, blok, via, telefoon: telefoon.trim() || undefined, opmerking: opmerking.trim() || undefined, afgesprokenOp: a.afgesprokenOp ?? new Date().toISOString(), afgesprokenDoor: a.afgesprokenDoor ?? currentUser?.id });
    sluit();
  };

  return (
    <Venster titel={adresTekst(a)} sub={`${a.postcode} ${a.plaats}`} sluit={sluit}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ring-ink-200 ${st.tekst}`}><span className={`h-2.5 w-2.5 rounded-[3px] ${st.blok}`} /> {st.label}</span>
          <button type="button" onClick={() => updateGasAdressen([a.id], a.briefOp ? { briefOp: undefined, briefDoor: undefined } : { briefOp: new Date().toISOString(), briefDoor: currentUser?.id })}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${a.briefOp ? "bg-sky-100 text-sky-800" : "bg-ink-100 text-ink-600 hover:bg-sky-50"}`}>
            {a.briefOp ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {a.briefOp ? `Brief bezorgd ${new Date(a.briefOp).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}${a.briefDoor ? ` · ${naam(a.briefDoor)}` : ""}` : "Brief nog niet bezorgd — afvinken"}
          </button>
        </div>

        <div className="space-y-3 rounded-xl border border-ink-200 p-3">
          <div className="text-sm font-bold text-ink-900">{a.status === "afgesproken" ? "Afspraak wijzigen" : "Afspraak maken"}</div>
          <ViaKeuze via={via} setVia={setVia} />
          {slots.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-600">Eerstvolgende vrije plekken</div>
              <div className="flex flex-wrap gap-1.5">
                {slots.map((s) => {
                  const aan = datum === s.datum && blok === s.blok;
                  return (
                    <button key={`${s.datum}|${s.blok}`} type="button" onClick={() => { setDatum(s.datum); setBlok(s.blok); }}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${aan ? "bg-brand-600 text-white" : "border border-ink-200 bg-white text-ink-700 hover:border-brand-300 hover:bg-brand-50"}`}>
                      {dagKort(s.datum)} · {GAS_BLOKKEN.find((b) => b.key === s.blok)?.kort}{(project.ploegen || 1) > 1 && <span className="opacity-70"> ({s.vrij} vrij)</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          {!project.vanaf && <p className="text-xs text-amber-700">Tip: stel bij "Project instellen" de startdatum in, dan zie je hier alleen de werkdagen van het project.</p>}
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Datum</span>
              <input type="date" value={datum} onChange={(e) => setDatum(e.target.value)} className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Tijdsblok</span>
              <select value={blok} onChange={(e) => setBlok(e.target.value as GasBlok)} className="w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
                <option value="">Kies…</option>
                {GAS_BLOKKEN.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
              </select>
            </label>
          </div>
          {vol && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Dit tijdsblok zit al vol ({project.ploegen} {project.ploegen === 1 ? "ploeg" : "ploegen"}). Kies een andere plek.</p>}
          {datum && !isProjectDag(project, datum) && <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Let op: dit is geen werkdag van het project.</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Telefoon (optioneel)</span>
              <input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} inputMode="tel" placeholder="06…" className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Opmerking</span>
              <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} placeholder="bv. meterkast in schuur" className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
          </div>
          <button type="button" onClick={bewaar} disabled={!datum || !blok || vol}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            <CalendarCheck className="h-4 w-4" /> {a.status === "afgesproken" ? "Wijziging opslaan" : "Afspraak vastleggen"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {a.status !== "afgesproken" && a.status !== "weigert" && (
            <button type="button" onClick={() => { updateGasAdressen([a.id], (x) => ({ status: "niet_thuis", bezoeken: [...(x.bezoeken ?? []), { op: new Date().toISOString(), door: currentUser?.id }] })); sluit(); }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"><UserX className="h-4 w-4" /> Niet thuis</button>
          )}
          {a.status !== "weigert" ? (
            <button type="button" onClick={() => { if (confirm("Bewoner werkt niet mee?")) { updateGasAdressen([a.id], { status: "weigert", datum: undefined, blok: undefined }); sluit(); } }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-100"><Ban className="h-4 w-4" /> Weigert</button>
          ) : (
            <button type="button" onClick={() => updateGasAdressen([a.id], { status: "open" })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Undo2 className="h-4 w-4" /> Weer open zetten</button>
          )}
          {a.status === "afgesproken" && (
            <button type="button" onClick={() => { if (confirm("Afspraak weghalen?")) { updateGasAdressen([a.id], { status: "open", datum: undefined, blok: undefined }); sluit(); } }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><X className="h-4 w-4" /> Afspraak weghalen</button>
          )}
        </div>

        {(a.bezoeken?.length ?? 0) > 0 && (
          <div>
            <div className="mb-1 text-xs font-semibold text-ink-600">Aangebeld zonder afspraak</div>
            <ul className="space-y-0.5 text-xs text-ink-500">
              {a.bezoeken!.map((b, i) => <li key={i}>{new Date(b.op).toLocaleString("nl-NL", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}{b.door ? ` · ${naam(b.door)}` : ""}</li>)}
            </ul>
          </div>
        )}
        {a.status === "afgesproken" && a.afgesprokenDoor && <p className="text-xs text-ink-400">Afgesproken door {naam(a.afgesprokenDoor)}{a.via === "deur" ? " aan de deur" : " (bewoner belde)"}.</p>}
      </div>
    </Venster>
  );
}

// ── Instellingen van het project (leiding) ──
function ProjectInstellingen({ project: p }: { project: GasProject }) {
  const { updateGasProject, users } = useApp();
  const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const label = "mb-1 block text-xs font-semibold text-ink-600";
  return (
    <div className="grid gap-3 border-t border-ink-100 p-4 sm:grid-cols-2 lg:grid-cols-3">
      <div>
        <span className={label}>Ploegen van Stedin</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => updateGasProject(p.id, { ploegen: Math.max(1, (p.ploegen || 1) - 1) })} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-bold hover:bg-ink-50">−</button>
          <span className="min-w-[2rem] text-center text-lg font-bold text-ink-900">{p.ploegen || 1}</span>
          <button type="button" onClick={() => updateGasProject(p.id, { ploegen: Math.min(10, (p.ploegen || 1) + 1) })} className="rounded-lg border border-ink-200 px-3 py-2 text-sm font-bold hover:bg-ink-50">+</button>
          <span className="text-xs text-ink-500">= {p.ploegen || 1} per tijdsblok, {(p.ploegen || 1) * 2} per dag</span>
        </div>
      </div>
      <label className="block"><span className={label}>Eerste werkdag</span><input type="date" value={p.vanaf ?? ""} onChange={(e) => updateGasProject(p.id, { vanaf: e.target.value || undefined })} className={veld} /></label>
      <label className="block"><span className={label}>Laatste werkdag (optioneel)</span><input type="date" value={p.tot ?? ""} onChange={(e) => updateGasProject(p.id, { tot: e.target.value || undefined })} className={veld} /></label>
      <label className="block"><span className={label}>Belnummer in de brief</span><input defaultValue={p.belnummer ?? ""} onBlur={(e) => updateGasProject(p.id, { belnummer: e.target.value.trim() || undefined })} placeholder="bv. 010 - 123 45 67" className={veld} /></label>
      <label className="block"><span className={label}>PD-nummer</span><input defaultValue={p.pdNummer ?? ""} onBlur={(e) => { const c = e.target.value.replace(/[^0-9]/g, ""); updateGasProject(p.id, { pdNummer: c ? `PD${c}` : undefined }); }} placeholder="PD…" className={veld} /></label>
      <label className="block"><span className={label}>Verantwoordelijk</span>
        <select value={p.toegewezenAan ?? ""} onChange={(e) => updateGasProject(p.id, { toegewezenAan: e.target.value || undefined })} className={`${veld} bg-white`}>
          <option value="">Iedereen</option>
          {users.map((u) => <option key={u.id} value={u.id}>{u.naam}</option>)}
        </select>
      </label>
      <p className="text-xs text-ink-500 sm:col-span-2 lg:col-span-3"><FolderOpen className="mr-1 inline h-3.5 w-3.5" />Werkdagen zijn maandag t/m vrijdag. Een losse dag vrij geven doe je in de planning met "vrije dag".</p>
    </div>
  );
}

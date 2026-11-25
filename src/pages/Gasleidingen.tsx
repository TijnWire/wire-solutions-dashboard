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
  MailCheck, Phone, Plus, Search, Settings2, Trash2, Upload, X, CalendarCheck, Ban, Undo2,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import { isToegewezen } from "../lib/toewijzing";
import type { GasAdres, GasBlok, GasProject } from "../lib/types";
import {
  GAS_BLOKKEN, adresTekst, bezetting, blokLabel, dagKort, dagLang, isProjectDag, leesGasAdressen, maandagVan, perStraat,
  plusDagen, sorteerAdressen, telling, vandaagISO, vrijeSlots, type GasRij, type StraatGroep,
} from "../lib/gas";
import { exporteerGasAdreslijst, exporteerGasPlanning } from "../lib/gasExcel";
import { weekNummer } from "../lib/week";

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);

// Kleur per stand van een adres — overal hetzelfde (blokjes, badges, legenda).
const STAND = {
  geenBrief: { label: "Nog geen brief", blok: "bg-ink-200", tekst: "text-ink-600" },
  brief: { label: "Brief bezorgd", blok: "bg-sky-400", tekst: "text-sky-700" },
  afgesproken: { label: "Afgesproken", blok: "bg-green-500", tekst: "text-green-700" },
  weigert: { label: "Weigert", blok: "bg-red-500", tekst: "text-red-700" },
} as const;
type StandKey = keyof typeof STAND;
const standVan = (a: GasAdres): StandKey =>
  a.status === "afgesproken" ? "afgesproken" : a.status === "weigert" ? "weigert" : a.briefOp ? "brief" : "geenBrief";

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
type Tab = "overzicht" | "planning";

function ProjectDetail({ project: p, adressen, terug, isLeiding }: { project: GasProject; adressen: GasAdres[]; terug: () => void; isLeiding: boolean }) {
  const t = telling(adressen);
  const [tab, setTab] = useState<Tab>("overzicht");
  const [modus, setModus] = useState<Modus>(t.brief < t.totaal ? "brieven" : "afspraak");
  const [adresId, setAdresId] = useState<string | null>(null);
  const [instellingen, setInstellingen] = useState(false);
  const gekozen = adressen.find((a) => a.id === adresId);
  const straten = useMemo(() => perStraat(adressen), [adressen]);

  const naar = (m: Modus) => { setModus(m); setTab("overzicht"); };

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
        <Stap nr={1} titel="Brieven bezorgen" icon={Mail} waarde={t.brief} totaal={t.totaal} kleur="bg-sky-400" sub={t.totaal - t.brief ? `nog ${t.totaal - t.brief} te bezorgen` : "alle brieven bezorgd"} onClick={() => naar("brieven")} actief={tab === "overzicht" && modus === "brieven"} />
        <Stap nr={2} titel="Afspraken maken" icon={Phone} waarde={t.afgesproken} totaal={t.totaal - t.weigert} kleur="bg-green-500"
          sub={`${pct(t.afgesproken, t.totaal - t.weigert)}% van de adressen afgesproken`} onClick={() => naar("afspraak")} actief={tab === "overzicht" && modus === "afspraak"} />
        <Stap nr={3} titel="Nog af te spreken" icon={DoorOpen} waarde={t.teDoen} totaal={t.totaal} kleur="bg-amber-400" omgekeerd
          sub={t.weigert ? `${t.weigert} ${t.weigert === 1 ? "weigert" : "weigeren"}` : "nog in te plannen"} onClick={() => naar("afspraak")} actief={false} />
      </div>

      <div className="flex gap-0.5 rounded-lg border border-ink-200 bg-white p-0.5 shadow-card sm:gap-1 sm:rounded-xl sm:p-1">
        {([["overzicht", "Overzicht"], ["planning", "Planning"]] as [Tab, string][]).map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
            className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:py-2 sm:text-sm ${tab === k ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
            {l}
          </button>
        ))}
      </div>

      {tab === "overzicht" && <Overzicht straten={straten} modus={modus} setModus={setModus} kiesAdres={setAdresId} />}
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

// ── Overzicht: elk huis een blokje, per straat. Hier gebeurt alles. ──
// Bovenaan kies je wat je aan het doen bent: brieven bezorgen of afspraken maken. Daarna is het
// alleen nog tikken op een huis — bij brieven zet één tik het vinkje, bij afspraken opent het venster.
export type Modus = "brieven" | "afspraak";
export function Overzicht({ straten, modus, setModus, kiesAdres }: { straten: StraatGroep[]; modus: Modus; setModus: (m: Modus) => void; kiesAdres: (id: string) => void }) {
  const { updateGasAdressen, currentUser } = useApp();
  const [zoek, setZoek] = useState("");
  const [alleenWerk, setAlleenWerk] = useState(false);
  const [laatste, setLaatste] = useState<{ ids: string[]; tekst: string } | null>(null);
  const brieven = modus === "brieven";

  // Zoeken op straat én huisnummer ("bovenkruier 12"): straten filteren, het huis oplichten.
  const m = zoek.trim().toLowerCase().match(/^(.*?)\s*(\d+\s*[a-z]?)?$/);
  const qStraat = (m?.[1] ?? "").trim();
  const qNr = (m?.[2] ?? "").replace(/\s+/g, "");
  const lijst = straten.filter((s) =>
    (!qStraat || s.straat.toLowerCase().includes(qStraat)) &&
    (!alleenWerk || (brieven ? s.brief < s.adressen.length : s.open > 0)));

  const zetBrief = (ids: string[], aan: boolean, tekst: string) => {
    updateGasAdressen(ids, aan ? { briefOp: new Date().toISOString(), briefDoor: currentUser?.id } : { briefOp: undefined, briefDoor: undefined });
    setLaatste(aan ? { ids, tekst } : null);
  };
  const tik = (a: GasAdres) => {
    if (!brieven) { kiesAdres(a.id); return; }
    zetBrief([a.id], !a.briefOp, `Brief bezorgd: ${adresTekst(a)}`);
  };

  return (
    <div className="space-y-3">
      {/* Wat ga je doen? Twee grote knoppen, verder niets. */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        {([
          ["brieven", Mail, "Brieven bezorgen", "Tik op een huis zodra de brief in de bus zit", "border-sky-400 bg-sky-50 text-sky-800 ring-sky-100", "bg-sky-500"],
          ["afspraak", CalendarCheck, "Afspraak maken", "Tik op een huis om een afspraak in te plannen", "border-green-500 bg-green-50 text-green-800 ring-green-100", "bg-green-600"],
        ] as const).map(([k, Icon, titel, uitleg, aan, bol]) => (
          <button key={k} type="button" onClick={() => { setModus(k); setLaatste(null); }} aria-pressed={modus === k}
            className={`flex items-center gap-3 rounded-2xl border-2 p-3 text-left transition-all sm:p-4 ${modus === k ? `${aan} ring-4` : "border-ink-200 bg-white text-ink-600 hover:border-ink-300"}`}>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-white sm:h-12 sm:w-12 ${modus === k ? bol : "bg-ink-300"}`}><Icon className="h-5 w-5 sm:h-6 sm:w-6" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-bold sm:text-base">{titel}</span>
              <span className="hidden text-xs opacity-80 sm:block">{uitleg}</span>
            </span>
          </button>
        ))}
      </div>

      <Card className="p-4 sm:p-5">
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <div className="relative min-w-[12rem] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek straat of adres, bv. Bovenkruier 12"
              className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            {zoek && <button type="button" onClick={() => setZoek("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:text-ink-700" aria-label="Wissen"><X className="h-4 w-4" /></button>}
          </div>
          <label className="inline-flex items-center gap-2 text-sm text-ink-700">
            <input type="checkbox" checked={alleenWerk} onChange={(e) => setAlleenWerk(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            {brieven ? "Alleen straten waar nog brieven moeten" : "Alleen straten met open adressen"}
          </label>
        </div>
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <Legenda />
          <span className="text-xs font-semibold text-ink-500 sm:hidden">{brieven ? "Tik = brief bezorgd" : "Tik = afspraak maken"}</span>
        </div>

        <div className="divide-y divide-ink-100">
          {lijst.map((s) => {
            const allesBezorgd = s.brief === s.adressen.length;
            return (
              <div key={s.straat} className="py-3.5">
                <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="text-sm font-bold text-ink-900">{s.straat}</span>
                  <span className="text-xs text-ink-500">
                    {brieven ? `${s.brief}/${s.adressen.length} brieven` : `${s.afgesproken}/${s.adressen.length} afgesproken`}
                  </span>
                  {brieven && (allesBezorgd ? (
                    <span className="ml-auto inline-flex items-center gap-1 rounded-lg bg-sky-50 px-2 py-1 text-xs font-semibold text-sky-700"><MailCheck className="h-3.5 w-3.5" /> Hele straat bezorgd</span>
                  ) : (
                    <button type="button" onClick={() => zetBrief(s.adressen.filter((a) => !a.briefOp).map((a) => a.id), true, `Hele ${s.straat} bezorgd`)}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-700">
                      <Check className="h-3.5 w-3.5" /> Hele straat bezorgd
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {s.adressen.map((a) => {
                    const stand = standVan(a);
                    const st = STAND[stand];
                    const raak = !!qNr && `${a.huisnummer}${a.toevoeging}`.toLowerCase().replace(/\s+/g, "") === qNr;
                    return (
                      <button key={a.id} type="button" onClick={() => tik(a)}
                        title={`${adresTekst(a)} — ${st.label}${a.status === "afgesproken" && a.datum ? `, ${dagKort(a.datum)} ${blokLabel(a.blok)}` : ""}`}
                        className={`relative flex h-9 min-w-[2.75rem] items-center justify-center gap-0.5 rounded-lg px-1.5 text-xs font-bold transition-transform active:scale-95 sm:hover:scale-105 ${st.blok} ${stand === "geenBrief" ? "text-ink-600" : "text-white"} ${raak ? "ring-4 ring-brand-400 ring-offset-1" : ""}`}>
                        {brieven && a.briefOp && stand === "brief" && <Check className="h-3 w-3" />}
                        {stand === "afgesproken" && <CalendarCheck className="h-3 w-3" />}
                        {a.huisnummer}{a.toevoeging}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          {lijst.length === 0 && <p className="py-6 text-center text-sm text-ink-500">{alleenWerk ? (brieven ? "Overal zijn de brieven bezorgd." : "Alles is afgesproken.") : "Geen straat gevonden."}</p>}
        </div>
      </Card>

      {/* Even terug kunnen als je per ongeluk tikt */}
      {laatste && (
        <div className="fixed inset-x-0 bottom-20 z-40 flex justify-center px-4 md:bottom-6">
          <div className="flex items-center gap-3 rounded-full bg-ink-900 py-2 pl-4 pr-2 text-sm text-white shadow-2xl">
            <MailCheck className="h-4 w-4 text-sky-300" />
            <span className="max-w-[14rem] truncate">{laatste.tekst}</span>
            <button type="button" onClick={() => zetBrief(laatste.ids, false, "")} className="rounded-full bg-white/15 px-3 py-1 text-xs font-semibold hover:bg-white/25">Ongedaan</button>
            <button type="button" onClick={() => setLaatste(null)} className="rounded-full p-1 text-white/60 hover:text-white" aria-label="Sluiten"><X className="h-4 w-4" /></button>
          </div>
        </div>
      )}
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
  const [inplannen, setInplannen] = useState<string | null>(null);
  const inplannenAdres = adressen.find((a) => a.id === inplannen);
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
          <div className="text-sm font-bold text-ink-900">Week {weekNummer(maandag)} · {dagKort(dagen[0])} – {dagKort(dagen[4])}</div>
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
                              <span className="block truncate text-[11px] text-ink-500">{a.telefoon || "geen telefoon"}</span>
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

      {kiezen && !inplannen && <AdresKiezer adressen={adressen} titel={`${dagLang(kiezen.datum)} · ${blokLabel(kiezen.blok)}`} sluit={() => setKiezen(null)}
        kies={(a) => setInplannen(a.id)} />}
      {kiezen && inplannenAdres && <AdresVenster project={p} adres={inplannenAdres} alle={adressen} startDatum={kiezen.datum} startBlok={kiezen.blok} sluit={() => { setInplannen(null); setKiezen(null); }} />}
    </div>
  );
}

// Een adres kiezen voor een leeg tijdsblok (bijv. een bewoner belt voor een vrije plek).
function AdresKiezer({ adressen, titel, kies, sluit }: { adressen: GasAdres[]; titel: string; kies: (a: GasAdres) => void; sluit: () => void }) {
  const [zoek, setZoek] = useState("");
  const q = zoek.trim().toLowerCase();
  const lijst = adressen.filter((a) => (a.status === "open" || a.status === "niet_thuis") && (!q || `${adresTekst(a)} ${a.postcode}`.toLowerCase().includes(q))).sort(sorteerAdressen).slice(0, 40);
  return (
    <Venster titel="Adres inplannen" sub={titel} sluit={sluit}>
      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input autoFocus value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Straat, huisnummer of postcode…"
            className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </div>
        <div className="max-h-80 divide-y divide-ink-100 overflow-y-auto rounded-xl border border-ink-200">
          {lijst.map((a) => (
            <button key={a.id} type="button" onClick={() => kies(a)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-brand-50">
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
function AdresVenster({ project, adres: a, alle, sluit, startDatum, startBlok }: { project: GasProject; adres: GasAdres; alle: GasAdres[]; sluit: () => void; startDatum?: string; startBlok?: GasBlok }) {
  const { updateGasAdressen, currentUser, users } = useApp();
  const [telefoon, setTelefoon] = useState(a.telefoon ?? "");
  const [opmerking, setOpmerking] = useState(a.opmerking ?? "");
  const [datum, setDatum] = useState(startDatum ?? a.datum ?? "");
  const [blok, setBlok] = useState<GasBlok | "">(startBlok ?? a.blok ?? "");
  const telOk = telefoon.replace(/\D/g, "").length >= 10;
  const anderen = alle.filter((x) => x.id !== a.id);
  const slots = useMemo(() => vrijeSlots(project, anderen, 10), [project, anderen]);
  const bez = bezetting(anderen);
  const vol = datum && blok ? (bez.get(`${datum}|${blok}`) ?? 0) >= (project.ploegen || 1) : false;
  const naam = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";

  const bewaar = () => {
    if (!datum || !blok || !telOk) return;
    updateGasAdressen([a.id], { status: "afgesproken", datum, blok, telefoon: telefoon.trim(), opmerking: opmerking.trim() || undefined, afgesprokenOp: a.afgesprokenOp ?? new Date().toISOString(), afgesprokenDoor: a.afgesprokenDoor ?? currentUser?.id });
    sluit();
  };

  return (
    <Venster titel={adresTekst(a)} sub={`${a.postcode} ${a.plaats}`} sluit={sluit}>
      <div className="space-y-4 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => updateGasAdressen([a.id], a.briefOp ? { briefOp: undefined, briefDoor: undefined } : { briefOp: new Date().toISOString(), briefDoor: currentUser?.id })}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${a.briefOp ? "bg-sky-100 text-sky-800" : "bg-ink-100 text-ink-600 hover:bg-sky-50"}`}>
            {a.briefOp ? <MailCheck className="h-3.5 w-3.5" /> : <Mail className="h-3.5 w-3.5" />}
            {a.briefOp ? `Brief bezorgd ${new Date(a.briefOp).toLocaleDateString("nl-NL", { day: "numeric", month: "short" })}${a.briefDoor ? ` · ${naam(a.briefDoor)}` : ""}` : "Brief nog niet bezorgd — afvinken"}
          </button>
        </div>

        <div className="space-y-3 rounded-xl border border-ink-200 p-3">
          <div className="text-sm font-bold text-ink-900">{a.status === "afgesproken" ? "Afspraak wijzigen" : "Afspraak maken"}</div>
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
              <span className="mb-1 block text-xs font-semibold text-ink-600">Telefoon <span className="text-red-500">*</span></span>
              <input value={telefoon} required onChange={(e) => setTelefoon(e.target.value)} inputMode="tel" placeholder="06…" className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">Opmerking</span>
              <input value={opmerking} onChange={(e) => setOpmerking(e.target.value)} placeholder="bv. meterkast in schuur" className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            </label>
          </div>
          {telefoon.trim() !== "" && !telOk && <p className="text-xs text-red-600">Vul een volledig telefoonnummer in (10 cijfers).</p>}
          <button type="button" onClick={bewaar} disabled={!datum || !blok || vol || !telOk}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
            <CalendarCheck className="h-4 w-4" /> {a.status === "afgesproken" ? "Wijziging opslaan" : "Afspraak vastleggen"}
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
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

        {a.status === "afgesproken" && a.afgesprokenDoor && <p className="text-xs text-ink-400">Afgesproken door {naam(a.afgesprokenDoor)}.</p>}
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

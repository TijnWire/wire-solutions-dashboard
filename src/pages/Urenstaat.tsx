import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ChevronDown, Plus, Copy, Trash2, Wallet, FileSpreadsheet, SlidersHorizontal, Save, ArrowLeft, ArrowRight, Clock, CheckCircle2, Circle, Users2, Search, CalendarCheck, AlertCircle } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Bevestig } from "../components/ui";
import { Keuze } from "../components/Keuze";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer } from "../components/TijdKiezer";
import { feestdagNaam } from "../lib/feestdagen";
import { exporteerUrenstaat } from "../lib/urenstaatExcel";
import { WERK_CATEGORIEEN, werkCategorieNaam } from "../lib/lopendWerk";
import type { Bedrijf, Urenregel, Uursoort, User } from "../lib/types";

const DAGNAAM = ["zo", "ma", "di", "wo", "do", "vr", "za"];
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
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString().replace(".", ","));
const klok = (n: number) => `${String(Math.floor(n)).padStart(2, "0")}:${String(Math.round((n % 1) * 60)).padStart(2, "0")}`;

// Totaal = eindtijd − begintijd − pauze. Loopt de eindtijd over middernacht, dan telt de nachtdienst door.
export function berekenUren(begin?: string, eind?: string, pauze?: number): number | null {
  if (!begin || !eind) return null;
  const [bh, bm] = begin.split(":").map(Number);
  const [eh, em] = eind.split(":").map(Number);
  if (![bh, bm, eh, em].every((n) => Number.isFinite(n))) return null;
  let min = eh * 60 + em - (bh * 60 + bm);
  if (min < 0) min += 24 * 60;
  min -= Math.max(0, pauze || 0);
  return Math.max(0, Math.round((min / 60) * 100) / 100);
};

const STANDAARD_UURSOORTEN: Uursoort[] = [
  { id: "regulier", code: "", label: "Regulier" },
  { id: "overwerk", code: "", label: "Overwerk" },
];

// Standaard werkdag voor een nieuwe regel — per regel altijd zelf aan te passen.
const STANDAARD_BEGIN = "09:00";
const STANDAARD_EIND = "17:30";
const STANDAARD_PAUZE = 30;
const STANDAARD_DAG = 8; // uren per volle werkdag
// De werkweek loopt standaard van maandag t/m vrijdag; deze twee zet je er zelf bij als het nodig is.
const WEEKEND = [{ offset: 5, naam: "Zaterdag" }, { offset: 6, naam: "Zondag" }];

// Waar je op kunt filteren. "" = alles; ALGEMEEN staat voor regels zonder project — dat is iets
// anders dan "alle projecten", vandaar een eigen sleutel in plaats van een lege waarde.
const ALGEMEEN = "__algemeen";
const PROJECT_FILTERS = [
  { id: "", naam: "Alle projecten" },
  ...WERK_CATEGORIEEN,
  { id: ALGEMEEN, naam: "Algemeen" },
];
const regelPastBijProject = (projectId: string | undefined, filter: string) =>
  !filter || (filter === ALGEMEEN ? !projectId : projectId === filter);
// Contracturen per week; staat er niets ingevuld, dan 40 (zelfde afspraak als bij Vrije dagen).
const STANDAARD_CONTRACT = 40;
const contractUren = (u: User) => (u.contract?.uren != null ? u.contract.uren : STANDAARD_CONTRACT);

// Eindtijd = begintijd + gewerkte uren + pauze. 09:00 + 8 u + 30 min = 17:30.
const eindNa = (begin: string, uren: number, pauze: number) => {
  const [h, m] = begin.split(":").map(Number);
  const tot = h * 60 + m + Math.round(uren * 60) + Math.max(0, pauze || 0);
  return `${String(Math.floor(tot / 60) % 24).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
};

// Op welk onderdeel zijn de uren geboekt (of Algemeen).
const projectNaam = (id?: string) => werkCategorieNaam(id) ?? "Algemeen";
const uursoortenVan = (b: Bedrijf): Uursoort[] => (b.uursoorten?.length ? b.uursoorten : STANDAARD_UURSOORTEN);
const uursoortLabel = (u: Uursoort) => [u.code, u.label].filter(Boolean).join(" · ");

// Alle velden in een tabelrij zijn even hoog (34px): dezelfde padding en tekstgrootte.
// Keuze size="rij", DatumKiezer compact en TijdKiezer size="rij" komen op precies dezelfde maat uit.
const veld = "w-full rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

// ── Uursoorten beheren (zelf de lijst bepalen, net als de tarieven bij Facturen) ──
function UursoortBeheer({ bedrijf, updateBedrijf, onKlaar }: { bedrijf: Bedrijf; updateBedrijf: (p: Partial<Bedrijf>) => void; onKlaar: () => void }) {
  const [rijen, setRijen] = useState<Uursoort[]>(() => uursoortenVan(bedrijf).map((u) => ({ ...u })));
  const zet = (id: string, patch: Partial<Uursoort>) => setRijen((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const voegToe = () => setRijen((r) => [...r, { id: `us-${Date.now()}-${r.length}`, code: "", label: "" }]);
  const opslaan = () => { updateBedrijf({ uursoorten: rijen.filter((x) => x.code.trim() || x.label.trim()) }); onKlaar(); };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar de urenstaat</button>
      <div>
        <h2 className="text-xl font-bold text-ink-900">Uursoorten</h2>
        <p className="text-sm text-ink-500">De soorten uren die je op een regel kunt kiezen (bijv. code UT35061 · UT Level II Engineer). Pas ze hier aan; ze verschijnen meteen in de keuzelijst.</p>
      </div>
      <Card className="space-y-3 p-4">
        <div className="hidden gap-2 px-1 text-xs font-semibold text-ink-500 sm:grid sm:grid-cols-[9rem_1fr_2rem]">
          <span>Code</span><span>Omschrijving</span><span />
        </div>
        {rijen.length === 0 ? (
          <p className="px-1 py-3 text-sm text-ink-400">Nog geen uursoorten. Voeg er een toe.</p>
        ) : rijen.map((u) => (
          <div key={u.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_2rem] sm:items-center">
            <input value={u.code} onChange={(e) => zet(u.id, { code: e.target.value })} placeholder="UT35061" className={veld} />
            <input value={u.label} onChange={(e) => zet(u.id, { label: e.target.value })} placeholder="UT Level II Engineer" className={veld} />
            <button type="button" onClick={() => setRijen((r) => r.filter((x) => x.id !== u.id))} className="justify-self-end rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Uursoort verwijderen"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={voegToe} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"><Plus className="h-4 w-4" /> Uursoort toevoegen</button>
      </Card>
      <div className="flex gap-2">
        <button type="button" onClick={opslaan} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700"><Save className="h-4 w-4" /> Opslaan</button>
        <button type="button" onClick={onKlaar} className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
      </div>
    </div>
  );
}

// ── Medewerker kiezen: een scrollbaar menu met zoekveld waarin je meteen ziet wie je deze week
// al hebt ingevuld ("Klaar") en wie nog moet ("Nog te doen"). Het menu hangt via een portal aan
// het scherm, zodat het niet wordt afgeknipt door de kaart eromheen. ──
type UrenStatus = "leeg" | "deels" | "klaar";
const STATUS_ICOON: Record<UrenStatus, JSX.Element> = {
  klaar: <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />,
  deels: <AlertCircle className="h-4 w-4 shrink-0 text-amber-500" />,
  leeg: <Circle className="h-4 w-4 shrink-0 text-ink-300" />,
};

function MedewerkerKiezer({ medewerkers, waarde, onKies, urenVan, contractVan, statusVan, totaalIedereen }: {
  medewerkers: User[];
  waarde: string; // "" = iedereen
  onKies: (id: string) => void;
  urenVan: (id: string) => number;
  contractVan: (u: User) => number;
  statusVan: (u: User) => UrenStatus;
  totaalIedereen: number;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const [zoek, setZoek] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const zoekRef = useRef<HTMLInputElement | null>(null);
  const HOOGTE = 392;

  const openen = () => {
    setZoek("");
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      let top = r.bottom + 4;
      if (top + HOOGTE > window.innerHeight - 8) top = Math.max(8, r.top - HOOGTE - 4);
      const breedte = Math.max(r.width, 288);
      setPos({ top, left: Math.min(r.left, window.innerWidth - breedte - 8), width: breedte });
    }
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    setTimeout(() => zoekRef.current?.focus(), 0); // direct kunnen typen
    const buiten = (e: MouseEvent) => { if (btnRef.current?.contains(e.target as Node) || popRef.current?.contains(e.target as Node)) return; setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Sluiten als de pagina eronder scrolt, maar niet als je in de lijst zelf scrolt.
    const bijScroll = (e: Event) => { if (popRef.current?.contains(e.target as Node)) return; setOpen(false); };
    const bijResize = () => setOpen(false);
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", bijScroll, true);
    window.addEventListener("resize", bijResize);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", bijScroll, true);
      window.removeEventListener("resize", bijResize);
    };
  }, [open]);

  const q = zoek.trim().toLowerCase();
  const gevonden = medewerkers.filter((u) => !q || u.naam.toLowerCase().includes(q) || (u.functie ?? "").toLowerCase().includes(q));
  const teDoen = gevonden.filter((u) => statusVan(u) === "leeg");
  const deels = gevonden.filter((u) => statusVan(u) === "deels");
  const klaar = gevonden.filter((u) => statusVan(u) === "klaar");
  const gekozen = medewerkers.find((u) => u.id === waarde);
  const gekozenUren = gekozen ? urenVan(gekozen.id) : 0;

  const kies = (id: string) => { onKies(id); setOpen(false); };
  const rij = (u: User) => {
    const n = urenVan(u.id);
    const st = statusVan(u);
    const actief = u.id === waarde;
    return (
      <button key={u.id} type="button" onClick={() => kies(u.id)} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}>
        {STATUS_ICOON[st]}
        <span className="min-w-0 flex-1 truncate">{u.naam}</span>
        <span className={`shrink-0 text-xs tabular-nums ${st === "klaar" ? "font-semibold text-ink-600" : st === "deels" ? "font-semibold text-amber-600" : "text-ink-300"}`}>
          {st === "leeg" ? "—" : `${uurTekst(n)}/${uurTekst(contractVan(u))} u`}
        </span>
      </button>
    );
  };
  const kop = (tekst: string, n: number) => (
    <div className="sticky top-0 z-10 bg-white px-2.5 pb-1 pt-2 text-[11px] font-bold uppercase tracking-wide text-ink-400">{tekst} ({n})</div>
  );

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => (open ? setOpen(false) : openen())}
        className={`flex w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 py-2 text-sm outline-none transition-colors hover:border-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${open ? "border-brand-400 ring-2 ring-brand-100" : "border-ink-200"}`}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {gekozen ? STATUS_ICOON[statusVan(gekozen)] : <Users2 className="h-4 w-4 shrink-0 text-ink-400" />}
          <span className="truncate font-semibold text-ink-800">{gekozen ? gekozen.naam : "Iedereen"}</span>
          <span className="shrink-0 text-xs text-ink-400">
            {gekozen ? (gekozenUren > 0 ? `${uurTekst(gekozenUren)}/${uurTekst(contractVan(gekozen))} u` : "nog geen uren") : `${uurTekst(totaalIedereen)} u`}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && pos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }} className="z-[60] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-cardhover">
          <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              ref={zoekRef}
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const eerste = [...teDoen, ...klaar][0]; if (eerste) kies(eerste.id); } }}
              placeholder="Zoek een medewerker…"
              className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
            />
          </div>
          <div className="scrollbar-thin max-h-80 overflow-auto p-1">
            {!q && (
              <button type="button" onClick={() => kies("")} className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm outline-none ${waarde === "" ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}>
                <Users2 className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="min-w-0 flex-1 truncate">Iedereen</span>
                <span className="shrink-0 text-xs font-semibold tabular-nums text-ink-500">{uurTekst(totaalIedereen)} u</span>
              </button>
            )}
            {gevonden.length === 0 && <div className="px-3 py-6 text-center text-sm text-ink-400">Niemand gevonden</div>}
            {teDoen.length > 0 && kop("Nog te doen", teDoen.length)}
            {teDoen.map(rij)}
            {deels.length > 0 && kop("Niet compleet", deels.length)}
            {deels.map(rij)}
            {klaar.length > 0 && kop("Klaar", klaar.length)}
            {klaar.map(rij)}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function Urenstaat() {
  const { users, bedrijf, updateBedrijf, urenstaat, verlof, currentUser, addUren, updateUren, deleteUren } = useApp();
  const { navigeer } = useNav();
  const [weekISO, setWeekISO] = useState(() => toISO(maandagVan(new Date())));
  const [modus, setModus] = useState<"lijst" | "uursoorten">("lijst");
  const [vraagVullen, setVraagVullen] = useState(false); // bevestiging vóór de week volgens contract te vullen
  const [filterPersoon, setFilterPersoon] = useState(() => [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"))[0]?.id ?? ""); // standaard één medewerker; "" = iedereen
  const [filterProject, setFilterProject] = useState(""); // "" = alle projecten

  const weekDate = new Date(weekISO + "T00:00:00");
  const weekEinde = new Date(weekDate); weekEinde.setDate(weekEinde.getDate() + 6);
  const weekEindISO = toISO(weekEinde);

  // LET OP: alle hooks staan bewust vóór de early returns hieronder. Stond een useMemo eronder,
  // dan sloeg de "Uursoorten"-knop (die vroeg returnt) hem over en crashte React met
  // "Rendered fewer hooks than expected" — een wit scherm i.p.v. de pagina.
  const weekRegels = useMemo(() => urenstaat.filter((r) => r.datum >= weekISO && r.datum <= weekEindISO), [urenstaat, weekISO, weekEindISO]);
  const rijen = useMemo(() => {
    const naam = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";
    return weekRegels
      .filter((r) => !filterPersoon || r.medewerkerId === filterPersoon)
      .filter((r) => regelPastBijProject(r.projectId, filterProject))
      .sort((a, b) => a.datum.localeCompare(b.datum) || (a.begin ?? "").localeCompare(b.begin ?? "") || naam(a.medewerkerId).localeCompare(naam(b.medewerkerId), "nl"));
  }, [weekRegels, filterPersoon, filterProject, users]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">De urenstaat is alleen voor de boekhouding/leiding.</Card>;
  if (modus === "uursoorten") return <UursoortBeheer bedrijf={bedrijf} updateBedrijf={updateBedrijf} onKlaar={() => setModus("lijst")} />;

  const verschuif = (dagen: number) => { const d = new Date(weekDate); d.setDate(d.getDate() + dagen); setWeekISO(toISO(maandagVan(d))); };
  const dezeWeek = toISO(maandagVan(new Date())) === weekISO;
  const weekLabel = `${weekDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${weekEinde.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;

  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  const uursoorten = uursoortenVan(bedrijf);
  const urenVanPersoon = (id: string) => weekRegels.filter((r) => r.medewerkerId === id).reduce((s, r) => s + (Number(r.uren) || 0), 0);
  // Uren per project, binnen de medewerker die je nu bekijkt (of iedereen).
  const urenVanProject = (filter: string) =>
    weekRegels
      .filter((r) => !filterPersoon || r.medewerkerId === filterPersoon)
      .filter((r) => regelPastBijProject(r.projectId, filter))
      .reduce((s, r) => s + (Number(r.uren) || 0), 0);
  const totaalUren = rijen.reduce((s, r) => s + (Number(r.uren) || 0), 0);
  const weekTotaalIedereen = weekRegels.reduce((s, r) => s + (Number(r.uren) || 0), 0);

  // Overzicht: wie is deze week compleet volgens zijn contract, wie is begonnen maar nog niet
  // compleet, en wie staat nog op nul? Die middengroep is belangrijk: iemand met 24 van de 40 uur
  // ziet er anders "klaar" uit terwijl er nog 2 dagen ontbreken.
  const statusVan = (u: User): "leeg" | "deels" | "klaar" => {
    const n = urenVanPersoon(u.id);
    if (n <= 0) return "leeg";
    return n + 0.01 >= contractUren(u) ? "klaar" : "deels";
  };
  const klaarLijst = medewerkers.filter((u) => statusVan(u) === "klaar");
  const deelsLijst = medewerkers.filter((u) => statusVan(u) === "deels");
  const teDoenLijst = medewerkers.filter((u) => statusVan(u) === "leeg");
  const pctKlaar = medewerkers.length ? Math.round((klaarLijst.length / medewerkers.length) * 100) : 0;
  // Springt naar de volgende die nog niet compleet is (leeg óf te weinig uren).
  const nogNodig = medewerkers.filter((u) => statusVan(u) !== "klaar");
  const volgendeOnaf = () => {
    const i = medewerkers.findIndex((u) => u.id === filterPersoon);
    const volgorde = [...medewerkers.slice(i + 1), ...medewerkers.slice(0, Math.max(0, i + 1))];
    const v = volgorde.find((u) => statusVan(u) !== "klaar");
    if (v) setFilterPersoon(v.id);
  };

  // Vult de week volgens het contract: volle dagen van 8 uur vanaf maandag, de rest op de laatste dag.
  // 40 u → ma t/m vr 09:00–17:30. 32 u → ma t/m do. 36 u → 4 volle dagen + een halve vrijdag.
  // Bewust alleen ma t/m vr (i < 5): weekendwerk is een uitzondering en zet je er zelf bij.
  const contractRegels = (u: User): Omit<Urenregel, "id">[] => {
    let rest = contractUren(u);
    const uit: Omit<Urenregel, "id">[] = [];
    for (let i = 0; i < 5 && rest > 0.01; i++) {
      const uren = Math.min(STANDAARD_DAG, rest);
      rest -= uren;
      const d = new Date(weekDate); d.setDate(d.getDate() + i);
      uit.push({
        medewerkerId: u.id,
        datum: toISO(d),
        uursoortId: uursoorten[0]?.id,
        begin: STANDAARD_BEGIN,
        eind: eindNa(STANDAARD_BEGIN, uren, STANDAARD_PAUZE),
        pauze: STANDAARD_PAUZE,
        uren,
        notitie: "",
      });
    }
    return uit;
  };
  // Alleen wie nog niets heeft staan krijgt regels — zo kan dit nooit dubbele uren opleveren.
  const vulWeekVolgensContract = () => {
    for (const u of teDoenLijst) for (const r of contractRegels(u)) addUren(r);
    setVraagVullen(false);
  };
  const contractTotaal = teDoenLijst.reduce((s, u) => s + contractUren(u), 0);

  // Tijden/pauze wijzigen → totaal automatisch herberekenen (handmatig overschrijven blijft mogelijk).
  const zet = (r: Urenregel, patch: Partial<Urenregel>) => {
    const n = { ...r, ...patch };
    if ("begin" in patch || "eind" in patch || "pauze" in patch) {
      const berekend = berekenUren(n.begin, n.eind, n.pauze);
      if (berekend !== null) patch = { ...patch, uren: berekend };
    }
    updateUren(r.id, patch);
  };
  const nieuweRegel = () => {
    const laatste = rijen[rijen.length - 1];
    addUren({
      medewerkerId: filterPersoon || laatste?.medewerkerId || medewerkers[0]?.id || "",
      datum: laatste?.datum ?? (dezeWeek ? toISO(new Date()) : weekISO),
      uursoortId: laatste?.uursoortId ?? uursoorten[0]?.id,
      projectId: laatste?.projectId,
      begin: STANDAARD_BEGIN,
      eind: STANDAARD_EIND,
      pauze: STANDAARD_PAUZE,
      uren: berekenUren(STANDAARD_BEGIN, STANDAARD_EIND, STANDAARD_PAUZE) ?? 0,
      notitie: "",
    });
  };
  const dupliceer = (r: Urenregel) => { const { id: _id, ...rest } = r; void _id; addUren({ ...rest }); };

  // Weekend: standaard werken we ma t/m vr, dus zaterdag/zondag zet je er zelf bij als het een keer nodig is.
  const voegDagToe = (dagOffset: number) => {
    const d = new Date(weekDate); d.setDate(d.getDate() + dagOffset);
    addUren({
      medewerkerId: filterPersoon || medewerkers[0]?.id || "",
      datum: toISO(d),
      uursoortId: rijen[rijen.length - 1]?.uursoortId ?? uursoorten[0]?.id,
      projectId: rijen[rijen.length - 1]?.projectId,
      begin: STANDAARD_BEGIN,
      eind: STANDAARD_EIND,
      pauze: STANDAARD_PAUZE,
      uren: berekenUren(STANDAARD_BEGIN, STANDAARD_EIND, STANDAARD_PAUZE) ?? 0,
      notitie: "",
    });
  };

  const exporteerNaarExcel = () => {
    const personen = medewerkers
      .map((u) => ({ u, regels: rijen.filter((r) => r.medewerkerId === u.id) }))
      .filter((x) => x.regels.length > 0)
      .map(({ u, regels }) => ({
        naam: u.naam,
        functie: u.functie ?? "",
        persnr: "",
        regels: regels.map((r) => ({
          datum: r.datum,
          dag: DAGNAAM[new Date(r.datum + "T00:00:00").getDay()],
          uursoort: uursoorten.find((x) => x.id === r.uursoortId)?.label ?? "",
          project: projectNaam(r.projectId),
          begin: r.begin ?? "",
          eind: r.eind ?? "",
          pauze: r.pauze ?? 0,
          uren: Number(r.uren) || 0,
          notitie: r.notitie ?? "",
          feestdag: feestdagNaam(r.datum) ?? "",
          verlof: verlof.find((v) => v.medewerkerId === u.id && v.status === "Goedgekeurd" && v.van <= r.datum && v.tot >= r.datum)?.type ?? "",
        })),
      }));
    exporteerUrenstaat({
      bedrijfsnaam: bedrijf.naam,
      weekNr: weekNr(weekDate),
      jaar: weekDate.getFullYear(),
      periodeLabel: weekLabel,
      opsteller: currentUser.naam,
      personen,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink-900">Urenstaat</h2>
          <p className="text-sm text-ink-500">Eén regel per gewerkte periode: wie, welke uursoort, welke dag en van hoe laat tot hoe laat. Het totaal rekent zichzelf uit (eind − begin − pauze).</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => setModus("uursoorten")} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <SlidersHorizontal className="h-4 w-4 text-ink-500" /> Uursoorten
          </button>
          <button type="button" onClick={exporteerNaarExcel} disabled={rijen.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40">
            <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel-urenstaat
          </button>
          <button type="button" onClick={() => navigeer("loonstroken", { loonWeek: weekISO })} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Wallet className="h-4 w-4 text-ink-500" /> Loonstroken maken
          </button>
        </div>
      </div>

      {/* Week-navigatie + medewerker kiezen */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => verschuif(-7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><ChevronLeft className="h-4 w-4" /> Vorige</button>
          <div className="flex min-w-0 flex-1 flex-col items-center px-2 text-center">
            <span className="text-sm font-bold text-ink-900">Week {weekNr(weekDate)} · {weekDate.getFullYear()}</span>
            <span className="text-xs text-ink-500">{weekLabel}</span>
          </div>
          <button type="button" onClick={() => verschuif(7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Volgende <ChevronRight className="h-4 w-4" /></button>
          {!dezeWeek && <button type="button" onClick={() => setWeekISO(toISO(maandagVan(new Date())))} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Deze week</button>}
        </div>

        <div className="space-y-2.5 border-t border-ink-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="shrink-0 text-sm font-semibold text-ink-600">Kies een medewerker:</span>
            <div className="w-full sm:w-80">
              <MedewerkerKiezer medewerkers={medewerkers} waarde={filterPersoon} onKies={setFilterPersoon} urenVan={urenVanPersoon} contractVan={contractUren} statusVan={statusVan} totaalIedereen={weekTotaalIedereen} />
            </div>
            {nogNodig.length > 0 && (
              <button type="button" onClick={volgendeOnaf} title="Spring naar de volgende medewerker die nog niet compleet is" className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-xs font-semibold text-ink-600 hover:bg-ink-50">
                Volgende onaf <ArrowRight className="h-3.5 w-3.5" />
              </button>
            )}
            <span className="ml-auto shrink-0 text-sm font-semibold text-ink-500">
              Totaal: <span className="text-ink-900">{uurTekst(totaalUren)} u</span>
            </span>
          </div>

          {/* Klik een project aan om alleen die uren te zien. De uren van de gekozen medewerker
              staan er meteen bij, dus je ziet in een oogopslag hoe zijn week verdeeld is. */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 shrink-0 text-sm font-semibold text-ink-600">Project:</span>
            {PROJECT_FILTERS.map((c) => {
              const aan = filterProject === c.id;
              const n = urenVanProject(c.id);
              return (
                <button
                  key={c.id || "alle"}
                  type="button"
                  onClick={() => setFilterProject(c.id)}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${aan ? "bg-brand-600 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
                >
                  {c.naam}
                  <span className={aan ? "text-white/70" : "text-ink-400"}>{n > 0 ? `${uurTekst(n)} u` : "—"}</span>
                </button>
              );
            })}
          </div>

          {/* Overzicht: hoeveel medewerkers heb je al gehad, en hoeveel moeten er nog? */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
              <span className="font-semibold text-ink-600">{klaarLijst.length} van de {medewerkers.length} medewerkers compleet volgens contract</span>
              <span className="flex items-center gap-2">
                {deelsLijst.length > 0 && <span className="font-semibold text-amber-600">{deelsLijst.length} niet compleet</span>}
                {teDoenLijst.length > 0 && <span className="text-ink-400">{teDoenLijst.length} nog te doen</span>}
                {nogNodig.length === 0 && <span className="font-semibold text-green-600">iedereen is klaar</span>}
              </span>
            </div>
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctKlaar}%` }} />
            </div>
          </div>

          {/* Hele week in één klik volgens contract. Alleen wie nog niets heeft staan wordt gevuld. */}
          {teDoenLijst.length > 0 && (
            <button
              type="button"
              onClick={() => setVraagVullen(true)}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-bold text-brand-700 transition-colors hover:bg-brand-100"
            >
              <CalendarCheck className="h-4 w-4" />
              Vul week {weekNr(weekDate)} volgens contract
              <span className="font-semibold text-brand-600/70">· {teDoenLijst.length} {teDoenLijst.length === 1 ? "medewerker" : "medewerkers"}, {uurTekst(contractTotaal)} u</span>
            </button>
          )}
        </div>
      </Card>

      {/* Werk periodes */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3">
          <Clock className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-bold text-ink-900">Werk periodes</h3>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">{rijen.length}</span>
        </div>

        {rijen.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">Nog geen uren in week {weekNr(weekDate)}. Voeg hieronder een regel toe.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/40 text-xs font-semibold text-ink-500">
                  <th className="px-3 py-2.5 text-left">Medewerker</th>
                  <th className="px-3 py-2.5 text-left">Uursoort</th>
                  <th className="px-3 py-2.5 text-left">Project</th>
                  <th className="px-3 py-2.5 text-left">Datum</th>
                  <th className="px-3 py-2.5 text-left">Begintijd</th>
                  <th className="px-3 py-2.5 text-left">Eindtijd</th>
                  <th className="px-3 py-2.5 text-left">Pauze</th>
                  <th className="px-3 py-2.5 text-left">Totaal</th>
                  <th className="px-3 py-2.5 text-left">Opmerking</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Acties</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {rijen.map((r) => {
                  const fd = feestdagNaam(r.datum);
                  const vrij = verlof.find((v) => v.medewerkerId === r.medewerkerId && v.status === "Goedgekeurd" && v.van <= r.datum && v.tot >= r.datum);
                  return (
                    <tr key={r.id} className={`align-top hover:bg-ink-50/40 ${fd || vrij ? "bg-amber-50/40" : ""}`}>
                      <td className="w-48 px-3 py-2">
                        <Keuze value={r.medewerkerId} onChange={(w) => zet(r, { medewerkerId: w })} altijdZoeken size="rij" opties={medewerkers.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker" />
                      </td>
                      <td className="w-52 px-3 py-2">
                        <Keuze value={r.uursoortId ?? ""} onChange={(w) => zet(r, { uursoortId: w || undefined })} altijdZoeken size="rij" opties={[{ waarde: "", label: "—" }, ...uursoorten.map((u) => ({ waarde: u.id, label: uursoortLabel(u) }))]} title="Uursoort" />
                      </td>
                      <td className="w-44 px-3 py-2">
                        <Keuze value={r.projectId ?? ""} onChange={(w) => zet(r, { projectId: w || undefined })} altijdZoeken size="rij" opties={[{ waarde: "", label: "Algemeen" }, ...WERK_CATEGORIEEN.map((c) => ({ waarde: c.id, label: c.naam }))]} title="Project / onderdeel" />
                      </td>
                      <td className="w-40 px-3 py-2">
                        <DatumKiezer value={r.datum} onChange={(iso) => zet(r, { datum: iso })} compact />
                        <span className="mt-0.5 block text-[11px] text-ink-400">{DAGNAAM[new Date(r.datum + "T00:00:00").getDay()]}{fd ? ` · ${fd}` : ""}{vrij ? ` · ${vrij.type}` : ""}</span>
                      </td>
                      <td className="w-28 px-3 py-2"><TijdKiezer value={r.begin ?? ""} onChange={(t) => zet(r, { begin: t })} size="rij" placeholder="--:--" title="Begintijd" /></td>
                      <td className="w-28 px-3 py-2"><TijdKiezer value={r.eind ?? ""} onChange={(t) => zet(r, { eind: t })} size="rij" placeholder="--:--" title="Eindtijd" /></td>
                      <td className="w-24 px-3 py-2">
                        <input inputMode="numeric" value={r.pauze ?? 0} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); zet(r, { pauze: Number.isFinite(n) ? n : 0 }); }} aria-label="Pauze in minuten" className={veld} />
                        <span className="mt-0.5 block text-[11px] text-ink-400">min</span>
                      </td>
                      <td className="w-24 px-3 py-2">
                        <input
                          inputMode="decimal"
                          value={uurTekst(Number(r.uren) || 0)}
                          onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); updateUren(r.id, { uren: Number.isFinite(n) && n >= 0 ? n : 0 }); }}
                          aria-label="Totaal uren"
                          className={veld + " bg-ink-50 font-semibold"}
                        />
                        <span className="mt-0.5 block text-[11px] text-ink-400">{klok(Number(r.uren) || 0)}</span>
                      </td>
                      <td className="min-w-[12rem] px-3 py-2">
                        <input value={r.notitie ?? ""} onChange={(e) => zet(r, { notitie: e.target.value })} placeholder="Opmerking…" className={veld} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => dupliceer(r)} title="Regel dupliceren" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"><Copy className="h-4 w-4" /></button>
                          <button type="button" onClick={() => deleteUren(r.id)} title="Regel verwijderen" className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-200 bg-ink-50/60 text-sm">
                  <td className="px-3 py-2.5 font-bold text-ink-900" colSpan={7}>Totaal week {weekNr(weekDate)}</td>
                  <td className="px-3 py-2.5 font-bold text-ink-900">{uurTekst(totaalUren)} u</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 px-5 py-3">
          <button type="button" onClick={nieuweRegel} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Toevoegen</button>
          {/* Standaard is de week ma t/m vr; een weekenddag zet je er hiermee los bij. */}
          {WEEKEND.map((w) => (
            <button
              key={w.offset}
              type="button"
              onClick={() => voegDagToe(w.offset)}
              title={`Voeg een regel voor ${w.naam.toLowerCase()} toe`}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-xs font-semibold text-ink-600 transition-colors hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
            >
              <Plus className="h-3.5 w-3.5" /> {w.naam}
            </button>
          ))}
          <span className="text-xs text-ink-400">Standaard ma t/m vr, {STANDAARD_BEGIN}–{STANDAARD_EIND} met {STANDAARD_PAUZE} min pauze; alles blijft aanpasbaar. Wijzigingen worden meteen opgeslagen en gedeeld met het team.</span>
        </div>
      </Card>

      <p className="text-xs text-ink-400">Het totaal wordt berekend uit begintijd − eindtijd − pauze; je kunt het altijd handmatig overschrijven. Feestdagen en goedgekeurd verlof worden bij de datum getoond. Contracturen stel je per persoon in bij <span className="font-semibold text-ink-500">Medewerkers</span>; staat er niets, dan rekenen we met {STANDAARD_CONTRACT} uur.</p>

      <Bevestig
        open={vraagVullen}
        titel={`Week ${weekNr(weekDate)} volgens contract vullen`}
        tekst={`${teDoenLijst.length} ${teDoenLijst.length === 1 ? "medewerker heeft" : "medewerkers hebben"} nog geen uren deze week. Ze krijgen elk hun contracturen op ma t/m vr (${STANDAARD_BEGIN}–${STANDAARD_EIND}, ${STANDAARD_PAUZE} min pauze), samen ${uurTekst(contractTotaal)} uur. Wie al uren heeft, blijft ongemoeid. Je kunt daarna alles gewoon aanpassen.`}
        bevestigLabel="Week vullen"
        bevestigTone="brand"
        onBevestig={vulWeekVolgensContract}
        onAnnuleer={() => setVraagVullen(false)}
      />
    </div>
  );
}

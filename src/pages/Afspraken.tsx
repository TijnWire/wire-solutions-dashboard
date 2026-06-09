import { useState } from "react";
import {
  Plus,
  ArrowLeft,
  MapPin,
  Building2,
  Home,
  Navigation,
  MessageCircle,
  Trash2,
  CalendarCheck,
  ChevronDown,
  ChevronRight,
  CalendarClock,
  X,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer } from "../components/TijdKiezer";
import { Keuze } from "../components/Keuze";
import { whatsappBevestiging, googleMapsAfspraak, datumLabel, googleMapsRoute, adresVanGroep, adresVanAfspraak, MAX_ROUTE_STOPS } from "../lib/afspraak";
import {
  AFSPRAAK_STATUSSEN,
  type Afspraak,
  type AfspraakStatus,
  type AfspraakSoort,
  type AdresType,
} from "../lib/types";

const statusTone: Record<AfspraakStatus, string> = {
  Open: "amber",
  Bevestigd: "green",
  Afgerond: "slate",
  Geannuleerd: "red",
};
const statusActief: Record<AfspraakStatus, string> = {
  Open: "bg-amber-500 text-white",
  Bevestigd: "bg-green-600 text-white",
  Afgerond: "bg-ink-700 text-white",
  Geannuleerd: "bg-red-500 text-white",
};
const soortLabel: Record<AfspraakSoort, string> = {
  woonwijk: "Woonwijk",
  straat: "Straat",
  appartement: "Appartement",
};

// ── Groeperen per werkweek (zelfde logica als de TAUW-pagina) ──
const NL_MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const isISODatum = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
function weekStartISO(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const dag = (d.getDay() + 6) % 7; // maandag = 0
  d.setDate(d.getDate() - dag);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekLabel(maandagISO: string): string {
  const [j, mnd, d] = maandagISO.split("-").map(Number);
  if (!j) return "Zonder datum";
  return `Week van ${d} ${NL_MAANDEN[mnd - 1]} ${j}`;
}

type RegelData = {
  straat: string;
  huisnummer: string;
  klantNaam: string;
  telefoon: string;
  type: AdresType;
  datum: string;
  tijd: string;
  status: AfspraakStatus;
  notitie: string;
};

function legeRegel(straat = "", datum = "", tijd = "", huisnummer = ""): RegelData {
  return { straat, huisnummer, klantNaam: "", telefoon: "", type: "woning", datum, tijd, status: "Open", notitie: "" };
}

function genReeks(van: number, tot: number, kant: "alle" | "oneven" | "even"): string[] {
  const lo = Math.min(van, tot);
  const hi = Math.max(van, tot);
  const out: string[] = [];
  for (let n = lo; n <= hi; n++) {
    if (kant === "oneven" && n % 2 !== 1) continue;
    if (kant === "even" && n % 2 !== 0) continue;
    out.push(String(n));
  }
  return out;
}

const veld =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

// ── Eén adres — compact ──
function RegelEditor({
  regel,
  toonStraat,
  afspraak,
  geselecteerd,
  onToggleSelect,
  onChange,
  onRemove,
}: {
  regel: RegelData;
  toonStraat: boolean;
  afspraak?: Afspraak;
  geselecteerd?: boolean;
  onToggleSelect?: () => void;
  onChange: (patch: Partial<RegelData>) => void;
  onRemove: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`rounded-xl border bg-white p-3 ${geselecteerd ? "border-brand-400 ring-1 ring-brand-300" : "border-ink-200"}`}>
      {/* Hele kop-regel is klikbaar om te (de)selecteren; vinkje en uitklap-knop houden hun eigen klik. */}
      <div
        className={`flex items-center gap-2.5 ${onToggleSelect ? "cursor-pointer" : ""}`}
        onClick={onToggleSelect}
        title={onToggleSelect ? (geselecteerd ? "Klik om te deselecteren" : "Klik om te selecteren") : undefined}
      >
        {onToggleSelect && (
          <input type="checkbox" checked={!!geselecteerd} onChange={onToggleSelect} onClick={(e) => e.stopPropagation()} className="h-4 w-4 shrink-0 accent-brand-600" title="Selecteer" />
        )}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-sm font-bold text-brand-700">
          {regel.huisnummer || "?"}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-900">{(regel.straat || "Adres") + " " + regel.huisnummer}</div>
          {regel.klantNaam && <div className="truncate text-xs text-ink-500">{regel.klantNaam}</div>}
        </div>
        {regel.type === "bedrijf" && (
          <Building2 className="h-4 w-4 shrink-0 text-brand-600" aria-label="Bedrijfspand" />
        )}
        <span className={`hidden h-2.5 w-2.5 shrink-0 rounded-full sm:block ${statusActief[regel.status].split(" ")[0]}`} />
        {/* Uitklap-knop: groot en duidelijk tikvlak op zowel mobiel als laptop */}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-ink-200 text-ink-500 hover:bg-ink-100 active:bg-ink-200 sm:h-10 sm:w-10"
          title={open ? "Minder tonen" : "Meer tonen"}
          aria-label={open ? "Minder tonen" : "Meer tonen"}
        >
          <ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      <div className="mt-2.5 grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>Datum</label>
          <DatumKiezer value={regel.datum} onChange={(iso) => onChange({ datum: iso })} />
        </div>
        <div>
          <label className={labelCls}>Tijd</label>
          <TijdKiezer value={regel.tijd} onChange={(tijd) => onChange({ tijd })} />
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t border-ink-100 pt-3">
          {toonStraat && (
            <div>
              <label className={labelCls}>Straat</label>
              <input value={regel.straat} onChange={(e) => onChange({ straat: e.target.value })} placeholder="Straatnaam" className={veld} />
            </div>
          )}
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Naam klant</label>
              <input value={regel.klantNaam} onChange={(e) => onChange({ klantNaam: e.target.value })} placeholder="Naam" className={veld} />
            </div>
            <div>
              <label className={labelCls}>Telefoon</label>
              <input value={regel.telefoon} onChange={(e) => onChange({ telefoon: e.target.value })} placeholder="06 12345678" className={veld} />
            </div>
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <div className="flex flex-wrap gap-1.5">
              {AFSPRAAK_STATUSSEN.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => onChange({ status: s })}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${regel.status === s ? statusActief[s] : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Notitie</label>
            <textarea value={regel.notitie} onChange={(e) => onChange({ notitie: e.target.value })} rows={2} placeholder="Bijzonderheden…" className={veld + " resize-none"} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => onChange({ type: regel.type === "bedrijf" ? "woning" : "bedrijf" })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
              {regel.type === "bedrijf" ? <Home className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
              {regel.type === "bedrijf" ? "Woning" : "Bedrijfspand"}
            </button>
            {afspraak && (
              <>
                <a href={whatsappBevestiging(afspraak)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700">
                  <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                </a>
                <a href={googleMapsAfspraak(afspraak)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                  <Navigation className="h-3.5 w-3.5" /> Navigeer
                </a>
              </>
            )}
            <button type="button" onClick={onRemove} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
              <Trash2 className="h-3.5 w-3.5" /> Verwijderen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Bulk-balk met uitleg (compact)
function ToevoegBalk({
  onReeks,
  onLos,
  onBasis,
}: {
  onReeks: (nummers: string[]) => void;
  onLos: (nr: string) => void;
  onBasis: (datum: string, tijd: string, alleenLege: boolean) => void;
}) {
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [kant, setKant] = useState<"alle" | "oneven" | "even">("alle");
  const [los, setLos] = useState("");
  const [bd, setBd] = useState("");
  const [bt, setBt] = useState("");

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h4 className="text-sm font-bold text-ink-900">1. Datum en tijd voor iedereen</h4>
        <p className="mb-2 text-xs text-ink-500">Kies één datum en tijd en vul ze in één klik bij alle adressen in.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-44">
            <label className={labelCls}>Datum</label>
            <DatumKiezer value={bd} onChange={setBd} />
          </div>
          <div>
            <label className={labelCls}>Tijd</label>
            <TijdKiezer value={bt} onChange={setBt} />
          </div>
          <button type="button" onClick={() => onBasis(bd, bt, false)} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Vul bij iedereen in</button>
          <button type="button" onClick={() => onBasis(bd, bt, true)} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Alleen waar leeg</button>
        </div>
      </div>
      <div className="border-t border-ink-100 pt-3">
        <h4 className="text-sm font-bold text-ink-900">2. Huisnummers toevoegen</h4>
        <p className="mb-2 text-xs text-ink-500">Bijvoorbeeld van 1 tot 30. Of voeg één nummer toe.</p>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className={labelCls}>Van</label>
            <input value={van} onChange={(e) => setVan(e.target.value)} inputMode="numeric" placeholder="1" className="w-24 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className={labelCls}>Tot</label>
            <input value={tot} onChange={(e) => setTot(e.target.value)} inputMode="numeric" placeholder="30" className="w-24 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          <div>
            <label className={labelCls}>Kant</label>
            <div className="w-24"><Keuze value={kant} onChange={(w) => setKant(w as typeof kant)} opties={[{ waarde: "alle", label: "Alle" }, { waarde: "oneven", label: "Oneven" }, { waarde: "even", label: "Even" }]} title="Kant" /></div>
          </div>
          <button
            type="button"
            onClick={() => {
              const v = parseInt(van, 10);
              const t = parseInt(tot, 10);
              if (!isNaN(v) && !isNaN(t)) {
                onReeks(genReeks(v, t, kant));
                setVan("");
                setTot("");
              }
            }}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Toevoegen
          </button>
          <span className="text-ink-300">|</span>
          <div>
            <label className={labelCls}>Eén nummer</label>
            <input value={los} onChange={(e) => setLos(e.target.value)} placeholder="12-A" className="w-24 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500" />
          </div>
          <button
            type="button"
            onClick={() => {
              if (los.trim()) {
                onLos(los.trim());
                setLos("");
              }
            }}
            className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            Toevoegen
          </button>
        </div>
      </div>
    </Card>
  );
}

// ── Nieuwe afspraakgroep ──
function NieuweGroep({ onKlaar }: { onKlaar: () => void }) {
  const { users, currentUser, addAfspraak } = useApp();
  const [soort, setSoort] = useState<AfspraakSoort>("straat");
  const [naam, setNaam] = useState("");
  const [straat, setStraat] = useState("");
  const [postcode, setPostcode] = useState("");
  const [plaats, setPlaats] = useState("");
  const [toegewezenAan, setToegewezenAan] = useState(currentUser?.rol === "monteur" ? currentUser.id : "");
  const [regels, setRegels] = useState<RegelData[]>([]);

  const setRegel = (i: number, patch: Partial<RegelData>) =>
    setRegels((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const voegReeks = (nummers: string[]) =>
    setRegels((prev) => {
      const bestaand = new Set(prev.map((r) => r.huisnummer));
      return [...prev, ...nummers.filter((n) => !bestaand.has(n)).map((n) => legeRegel(straat, "", "", n))];
    });
  const voegLos = (nr: string) =>
    setRegels((prev) => (prev.some((r) => r.huisnummer === nr) ? prev : [...prev, legeRegel(straat, "", "", nr)]));
  const basis = (datum: string, tijd: string, alleenLege: boolean) =>
    setRegels((prev) => prev.map((r) => ({ ...r, datum: alleenLege && r.datum ? r.datum : datum || r.datum, tijd: alleenLege && r.tijd ? r.tijd : tijd || r.tijd })));

  const opslaan = () => {
    if (!naam.trim() || regels.length === 0) return;
    for (const r of regels) {
      addAfspraak({
        locatie: naam.trim(),
        soort,
        klantNaam: r.klantNaam,
        telefoon: r.telefoon,
        straat: r.straat || straat,
        huisnummer: r.huisnummer,
        postcode,
        plaats,
        type: r.type,
        datum: r.datum,
        tijd: r.tijd,
        toegewezenAan: toegewezenAan || undefined,
        status: r.status,
        notitie: r.notitie,
      });
    }
    onKlaar();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">Nieuwe afspraakgroep</h2>

      <Card className="space-y-4 p-4">
        <div>
          <span className={labelCls}>Wat ga je inplannen?</span>
          <div className="flex flex-wrap gap-2">
            {(["woonwijk", "straat", "appartement"] as AfspraakSoort[]).map((s) => (
              <button key={s} type="button" onClick={() => setSoort(s)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${soort === s ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>
                {soortLabel[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Naam {soort === "woonwijk" ? "wijk" : soort === "appartement" ? "complex" : "straat"}</label>
            <input value={naam} onChange={(e) => setNaam(e.target.value)} placeholder={soort === "woonwijk" ? "bijv. Lindebuurt" : soort === "appartement" ? "bijv. Flat De Es" : "bijv. Kerkstraat"} className={veld} />
          </div>
          <div>
            <label className={labelCls}>{soort === "woonwijk" ? "Standaard straat" : "Straat"}</label>
            <input value={straat} onChange={(e) => setStraat(e.target.value)} placeholder="Straatnaam" className={veld} />
          </div>
          <div>
            <label className={labelCls}>Postcode</label>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="1234 AB" className={veld} />
          </div>
          <div>
            <label className={labelCls}>Plaats</label>
            <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder="Rotterdam" className={veld} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Wie gaat het doen?</label>
          <Keuze value={toegewezenAan} onChange={setToegewezenAan} opties={[{ waarde: "", label: "— Nog niet toewijzen —" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Wie gaat het doen?" />
        </div>
      </Card>

      <ToevoegBalk onReeks={voegReeks} onLos={voegLos} onBasis={basis} />

      {regels.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold text-ink-800">{regels.length} adres{regels.length === 1 ? "" : "sen"}</p>
          {regels.map((r, i) => (
            <RegelEditor key={i} regel={r} toonStraat={soort === "woonwijk"} onChange={(patch) => setRegel(i, patch)} onRemove={() => setRegels((prev) => prev.filter((_, idx) => idx !== i))} />
          ))}
        </div>
      )}

      <button type="button" onClick={opslaan} disabled={!naam.trim() || regels.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
        <Plus className="h-4 w-4" /> Opslaan ({regels.length})
      </button>
    </div>
  );
}

// ── Detail / bewerken van een groep ──
function GroepDetail({ locatie, onTerug }: { locatie: string; onTerug: () => void }) {
  const { afspraken, currentUser, addAfspraak, updateAfspraak, deleteAfspraak } = useApp();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bevestig, setBevestig] = useState<{ titel: string; tekst: string; actie: () => void } | null>(null);

  const rijen = afspraken
    .filter((a) => a.locatie === locatie && (isLeiding || a.toegewezenAan === currentUser?.id))
    .sort((a, b) => a.huisnummer.localeCompare(b.huisnummer, "nl", { numeric: true }));

  if (rijen.length === 0) {
    onTerug();
    return null;
  }
  const eerste = rijen[0];

  const toggle = (id: string) =>
    setSel((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const alleGeselecteerd = rijen.length > 0 && rijen.every((a) => sel.has(a.id));
  const toggleAlle = () => setSel(alleGeselecteerd ? new Set() : new Set(rijen.map((a) => a.id)));

  const vraagVerwijder = (a: Afspraak) =>
    setBevestig({
      titel: "Adres verwijderen",
      tekst: `Weet je het zeker dat je ${a.straat} ${a.huisnummer} wilt verwijderen?`,
      actie: () => {
        deleteAfspraak(a.id);
        setSel((p) => {
          const n = new Set(p);
          n.delete(a.id);
          return n;
        });
      },
    });
  const vraagVerwijderBulk = () =>
    setBevestig({
      titel: `${sel.size} adressen verwijderen`,
      tekst: `Weet je het zeker dat je deze ${sel.size} geselecteerde adressen wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`,
      actie: () => {
        sel.forEach((id) => deleteAfspraak(id));
        setSel(new Set());
      },
    });

  const basis = (datum: string, tijd: string, alleenLege: boolean) =>
    rijen.forEach((a) => updateAfspraak(a.id, { datum: alleenLege && a.datum ? a.datum : datum || a.datum, tijd: alleenLege && a.tijd ? a.tijd : tijd || a.tijd }));

  const voegToe = (nr: string) => {
    if (rijen.some((a) => a.huisnummer === nr)) return;
    addAfspraak({ locatie, soort: eerste.soort, klantNaam: "", telefoon: "", straat: eerste.straat, huisnummer: nr, postcode: eerste.postcode, plaats: eerste.plaats, type: "woning", datum: "", tijd: "", toegewezenAan: eerste.toegewezenAan, status: "Open", notitie: "" });
  };

  const tel = (s: AfspraakStatus) => rijen.filter((a) => a.status === s).length;

  // Route langs de geselecteerde adressen (of alle adressen als er niets is aangevinkt).
  const routeRijen = sel.size > 0 ? rijen.filter((a) => sel.has(a.id)) : rijen;
  const routeUrl = googleMapsRoute(routeRijen.map(adresVanAfspraak));

  return (
    <div className="space-y-5">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar overzicht
      </button>

      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold text-ink-900">{locatie}</h2>
          <Badge tone="slate">{soortLabel[eerste.soort]}</Badge>
        </div>
        <p className="text-sm text-ink-500">{[eerste.postcode, eerste.plaats].filter(Boolean).join(" · ")}</p>
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3.5">
        <span className="text-sm font-semibold text-ink-700">Status</span>
        <div className="ml-auto flex flex-wrap gap-1.5">
          {(["Open", "Bevestigd", "Afgerond"] as AfspraakStatus[]).map((s) => (
            <Badge key={s} tone={statusTone[s]}>{tel(s)} {s.toLowerCase()}</Badge>
          ))}
        </div>
      </Card>

      <ToevoegBalk onReeks={(nrs) => nrs.forEach(voegToe)} onLos={voegToe} onBasis={basis} />

      {/* Selectie-, route- en verwijderbalk */}
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-card">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
          <input type="checkbox" checked={alleGeselecteerd} onChange={toggleAlle} className="h-4 w-4 accent-brand-600" />
          {sel.size > 0 ? `${sel.size} geselecteerd` : "Alles selecteren"}
        </label>
        {sel.size > 0 && (
          <button type="button" onClick={() => setSel(new Set())} className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-600">
            <X className="h-3.5 w-3.5" /> Wissen
          </button>
        )}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <a
            href={routeUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3.5 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"
            title={sel.size > 0 ? "Route langs de geselecteerde adressen" : "Route langs alle adressen"}
          >
            <Navigation className="h-4 w-4" /> Route{sel.size > 0 ? ` (${Math.min(sel.size, MAX_ROUTE_STOPS)})` : ""}
          </a>
          {sel.size > 0 && (
            <button type="button" onClick={vraagVerwijderBulk} className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-red-700">
              <Trash2 className="h-4 w-4" /> Verwijder ({sel.size})
            </button>
          )}
        </div>
      </div>
      {routeRijen.length > MAX_ROUTE_STOPS && (
        <p className="-mt-2 text-xs text-amber-700">De route gebruikt de eerste {MAX_ROUTE_STOPS} van {routeRijen.length} adressen (Google Maps-limiet). Vink specifieke adressen aan voor een gerichte route.</p>
      )}

      <div className="space-y-2">
        {rijen.map((a) => (
          <RegelEditor
            key={a.id}
            regel={a}
            toonStraat={eerste.soort === "woonwijk"}
            afspraak={a}
            geselecteerd={sel.has(a.id)}
            onToggleSelect={() => toggle(a.id)}
            onChange={(patch) => updateAfspraak(a.id, patch)}
            onRemove={() => vraagVerwijder(a)}
          />
        ))}
      </div>

      <Bevestig
        open={!!bevestig}
        titel={bevestig?.titel ?? ""}
        tekst={bevestig?.tekst ?? ""}
        onBevestig={() => {
          bevestig?.actie();
          setBevestig(null);
        }}
        onAnnuleer={() => setBevestig(null)}
      />
    </div>
  );
}

// ── Overzicht per locatie ──
export function Afspraken({ initieelLocatie }: { initieelLocatie?: string }) {
  const { afspraken, users, currentUser, updateAfspraak } = useApp();
  const [modus, setModus] = useState<"lijst" | "nieuw">("lijst");
  const [openLocatie, setOpenLocatie] = useState<string | null>(initieelLocatie ?? null);
  const [routeSel, setRouteSel] = useState<Set<string>>(new Set());

  const toggleRoute = (loc: string) =>
    setRouteSel((prev) => {
      const next = new Set(prev);
      next.has(loc) ? next.delete(loc) : next.add(loc);
      return next;
    });

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";

  const zichtbaar = isLeiding ? afspraken : afspraken.filter((a) => a.toegewezenAan === currentUser.id);

  if (modus === "nieuw") return <NieuweGroep onKlaar={() => setModus("lijst")} />;
  if (openLocatie) return <GroepDetail locatie={openLocatie} onTerug={() => setOpenLocatie(null)} />;

  const groepen: { locatie: string; rijen: Afspraak[] }[] = [];
  for (const a of zichtbaar) {
    let g = groepen.find((x) => x.locatie === a.locatie);
    if (!g) {
      g = { locatie: a.locatie, rijen: [] };
      groepen.push(g);
    }
    g.rijen.push(a);
  }

  // Route langs de geselecteerde locaties: gesorteerd per plaats (dan straat) om heen-en-weer rijden te beperken.
  const routeStops = groepen
    .filter((g) => routeSel.has(g.locatie))
    .sort((a, b) => {
      const pa = a.rijen[0].plaats || "";
      const pb = b.rijen[0].plaats || "";
      return pa.localeCompare(pb, "nl") || (a.rijen[0].straat || a.locatie).localeCompare(b.rijen[0].straat || b.locatie, "nl", { numeric: true });
    })
    .map((g) => adresVanGroep(g.rijen));
  const routeUrl = googleMapsRoute(routeStops);

  // Samenvatting + groeperen per werkweek (zoals op de TAUW-pagina).
  const openAfspraken = zichtbaar.filter((a) => a.status === "Open").length;
  const openGroepen = groepen.filter((g) => g.rijen.some((a) => a.status === "Open")).length;
  const peil = (g: { rijen: Afspraak[] }) => g.rijen.map((a) => a.datum).filter(isISODatum).sort()[0] ?? "";
  const gesorteerd = [...groepen].sort((a, b) => {
    const pa = peil(a), pb = peil(b);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return (a.rijen[0].plaats || "").localeCompare(b.rijen[0].plaats || "", "nl") || a.locatie.localeCompare(b.locatie, "nl", { numeric: true });
  });
  const weken: { key: string; label: string; groepen: { locatie: string; rijen: Afspraak[] }[] }[] = [];
  for (const g of gesorteerd) {
    const wk = weekStartISO(peil(g)) || "zonder";
    let w = weken.find((x) => x.key === wk);
    if (!w) { w = { key: wk, label: weekLabel(wk), groepen: [] }; weken.push(w); }
    w.groepen.push(g);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Afspraken</h2>
          <p className="text-sm text-ink-500">{isLeiding ? "Overzicht per woonwijk, straat of appartement." : "Jouw toegewezen afspraken."}</p>
        </div>
        <button type="button" onClick={() => setModus("nieuw")} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Nieuwe afspraakgroep
        </button>
      </div>

      {/* Routebalk — verschijnt zodra je locaties aanvinkt */}
      {routeSel.size > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-brand-200 bg-brand-50 p-3 shadow-card">
          <Navigation className="h-4 w-4 shrink-0 text-brand-600" />
          <span className="text-sm font-semibold text-ink-800">{routeSel.size} locatie{routeSel.size === 1 ? "" : "s"} geselecteerd</span>
          <button type="button" onClick={() => setRouteSel(new Set())} className="inline-flex items-center gap-1 text-xs text-ink-500 hover:text-ink-700">
            <X className="h-3.5 w-3.5" /> Wissen
          </button>
          <a
            href={routeUrl ?? "#"}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"
          >
            <Navigation className="h-4 w-4" /> Route in Google Maps
          </a>
          {routeSel.size > MAX_ROUTE_STOPS && (
            <p className="w-full text-xs text-amber-700">Google Maps ondersteunt max. {MAX_ROUTE_STOPS} stops — de eerste {MAX_ROUTE_STOPS} worden gebruikt.</p>
          )}
        </div>
      )}

      {groepen.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarCheck className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Nog geen afspraken. Klik op <span className="font-semibold">Nieuwe afspraakgroep</span> om te beginnen.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Eén-oogopslag-samenvatting van wat er openstaat */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{openGroepen}</div>
              <div className="text-xs text-ink-500">{openGroepen === 1 ? "locatie open" : "locaties open"}</div>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{openAfspraken}</div>
              <div className="text-xs text-ink-500">afspraken te bevestigen</div>
            </div>
          </div>

          {routeSel.size === 0 && groepen.length > 1 && (
            <p className="-mt-3 text-xs text-ink-400">Tip: vink meerdere locaties aan voor een Google Maps-route langs alle stops.</p>
          )}

          {weken.map((wg) => {
            const openInWeek = wg.groepen.filter((g) => g.rijen.some((a) => a.status === "Open")).length;
            return (
              <div key={wg.key}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-700">{wg.label}</h3>
                  <span className="text-xs font-medium text-ink-500">{openInWeek} open · {wg.groepen.length} {wg.groepen.length === 1 ? "locatie" : "locaties"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {wg.groepen.map((g) => {
                    const soort = g.rijen[0].soort;
                    const bevestigd = g.rijen.filter((a) => a.status === "Bevestigd" || a.status === "Afgerond").length;
                    const pct = Math.round((bevestigd / g.rijen.length) * 100);
                    const open = g.rijen.filter((a) => a.status === "Open").length;
                    const data = g.rijen.map((a) => a.datum).filter(isISODatum).sort();
                    const bedrijven = g.rijen.filter((a) => a.type === "bedrijf").length;
                    return (
                      <div key={g.locatie} onClick={() => setOpenLocatie(g.locatie)} className={`cursor-pointer rounded-2xl border bg-white p-4 text-left shadow-card transition-all hover:shadow-cardhover ${routeSel.has(g.locatie) ? "border-brand-400 ring-1 ring-brand-300" : "border-ink-200 hover:border-brand-300"}`}>
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={routeSel.has(g.locatie)}
                            onClick={(e) => e.stopPropagation()}
                            onChange={() => toggleRoute(g.locatie)}
                            className="h-4 w-4 shrink-0 accent-brand-600"
                            title="Selecteer voor route"
                          />
                          <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                            <MapPin className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-ink-900">{g.locatie || g.rijen[0].straat || "Onbekende locatie"}</div>
                            <div className="truncate text-xs text-ink-500">{soortLabel[soort]} · {g.rijen[0].plaats}</div>
                          </div>
                          <Badge tone={open === 0 ? "green" : "amber"}>{open === 0 ? "Klaar" : `${open} open`}</Badge>
                          <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
                        </div>

                        {isLeiding && (
                          <div className="mt-3 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <span className="text-xs font-medium text-ink-500">Wie doet het?</span>
                            <WerknemerKiezer
                              value={g.rijen[0].toegewezenAan ?? ""}
                              onChange={(id) => g.rijen.forEach((a) => updateAfspraak(a.id, { toegewezenAan: id || undefined }))}
                              users={users}
                              leegLabel="— Niemand —"
                            />
                          </div>
                        )}

                        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                          <span className="text-ink-500">{g.rijen.length} afspra{g.rijen.length === 1 ? "ak" : "ken"} · {bevestigd} bevestigd{bedrijven > 0 ? ` · ${bedrijven} bedrijf${bedrijven === 1 ? "" : "en"}` : ""}</span>
                          <span className="inline-flex items-center gap-1 font-semibold text-ink-500"><CalendarClock className="h-3.5 w-3.5" /> {data.length ? datumLabel(data[0]) : "geen datum"}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

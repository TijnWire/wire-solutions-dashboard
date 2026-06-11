import { useState, Fragment } from "react";
import {
  Plus,
  ArrowLeft,
  MapPin,
  Building2,
  Home,
  AlertTriangle,
  Route,
  Trash2,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  X,
  Mailbox,
  Database,
  Check,
  RotateCcw,
  UserPlus,
  CalendarClock,
  Wand2,
  Mail,
  Receipt,
} from "lucide-react";
import { Navigation, ExternalLink, FileUp, Folder, Pencil } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { BestandScanModal } from "../components/BestandScanModal";
import { DatumKiezer } from "../components/DatumKiezer";
import { afleidRegio } from "../lib/regio";
import { bevestigingsMail, maakConceptFactuurVanRonde } from "../lib/brievenFlow";
import {
  looproute,
  ontbrekendeNummers,
  maakReeks,
  nieuwAdres,
  googleMapsRouteDelen,
  googleMapsAdresUrl,
  adresVolledig,
  googleMapsRouteVanTeksten,
} from "../lib/brieven";
import {
  BRIEF_STATUSSEN,
  TAUW_STATUS_VOLGORDE,
  TAUW_STATUS_LABEL,
  type Adres,
  type Brievenronde,
  type BriefStatus,
  type TauwStatus,
} from "../lib/types";

// ── Levenscyclus (zelfde stappen als TAUW) ──
const STATUS_TONE: Record<TauwStatus, string> = { nieuw: "slate", toegewezen: "amber", ter_controle: "indigo", gecontroleerd: "green", verstuurd: "green" };
// Brieven-rondes worden handmatig aangemaakt i.p.v. geïmporteerd — alleen de eerste stap krijgt een eigen woord.
const STATUS_LABEL: Record<TauwStatus, string> = { ...TAUW_STATUS_LABEL, nieuw: "Aangemaakt" };
const knopKlein = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";
const knopPrimair = "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };
function vandaagISO(): string { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }

const statusDot: Record<BriefStatus, string> = {
  "Te doen": "bg-ink-300",
  Gegooid: "bg-green-500",
  Blanco: "bg-amber-500",
  "Niet thuis": "bg-red-500",
};
const statusRand: Record<BriefStatus, string> = {
  "Te doen": "border-l-ink-200",
  Gegooid: "border-l-green-500",
  Blanco: "border-l-amber-500",
  "Niet thuis": "border-l-red-500",
};

function adresLabel(a: Adres) {
  return `${a.huisnummer}${a.toevoeging ? "-" + a.toevoeging : ""}`;
}

// ── Eén adres in de looproute ──
function AdresRij({
  adres,
  stap,
  navigeerUrl,
  vergrendeld = false,
  geselecteerd = false,
  onToggleSelectie,
  onUpdate,
  onVerwijder,
}: {
  adres: Adres;
  stap: number;
  navigeerUrl: string;
  vergrendeld?: boolean;
  geselecteerd?: boolean;
  onToggleSelectie?: () => void;
  onUpdate: (patch: Partial<Adres>) => void;
  onVerwijder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const isBedrijf = adres.type === "bedrijf";

  return (
    <div className={`rounded-xl border border-l-4 border-ink-200 bg-white ${statusRand[adres.status]} ${geselecteerd ? "ring-2 ring-brand-300" : ""}`}>
      <div className="flex flex-wrap items-center gap-2 p-3 sm:gap-3">
        {onToggleSelectie && (
          <input type="checkbox" checked={geselecteerd} onChange={onToggleSelectie} aria-label={`Selecteer ${adresLabel(adres)}`} className="h-4 w-4 shrink-0 rounded border-ink-300 text-brand-600 focus:ring-brand-200" />
        )}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600">
          {stap}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-ink-900">{adresLabel(adres)}</span>
            {isBedrijf && (
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700 ring-1 ring-inset ring-brand-200">
                <Building2 className="h-3 w-3" />
                Persoonlijk afgeven
              </span>
            )}
          </div>
        </div>

        <div className="flex w-full items-center gap-2 sm:ml-auto sm:w-auto">
          <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusDot[adres.status]}`} />
          <div className="min-w-0 flex-1 sm:w-32 sm:flex-none"><Keuze value={adres.status} onChange={(w) => onUpdate({ status: w as BriefStatus })} opties={BRIEF_STATUSSEN.map((s) => ({ waarde: s, label: s }))} disabled={vergrendeld} size="sm" title="Status van dit adres" /></div>
          <a
            href={navigeerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"
            title="Navigeer naar dit adres"
          >
            <Navigation className="h-4 w-4" />
          </a>
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`rounded-lg p-1.5 hover:bg-ink-100 ${
              adres.notitie ? "text-brand-600" : "text-ink-400"
            }`}
            title="Notitie / opties"
          >
            <MessageSquare className="h-4 w-4" />
            <ChevronDown className={`inline h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-100 p-3">
          <textarea
            value={adres.notitie}
            onChange={(e) => onUpdate({ notitie: e.target.value })}
            disabled={vergrendeld}
            placeholder="Notitie (bijv. brievenbus achterom, hond, etc.)"
            rows={2}
            className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={vergrendeld}
              onClick={() => onUpdate({ type: isBedrijf ? "woning" : "bedrijf" })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isBedrijf ? <Home className="h-3.5 w-3.5" /> : <Building2 className="h-3.5 w-3.5" />}
              {isBedrijf ? "Markeer als woning" : "Markeer als bedrijfspand"}
            </button>
            <button
              type="button"
              disabled={vergrendeld}
              onClick={() => onUpdate({ ontbreekt: true })}
              className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              Huisnummer ontbreekt
            </button>
            <button
              type="button"
              disabled={vergrendeld}
              onClick={onVerwijder}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Verwijderen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Detail van één ronde ──
function RondeDetail({ ronde, onTerug }: { ronde: Brievenronde; onTerug: () => void }) {
  const { updateRonde, deleteRonde, currentUser, users, addFactuur, facturen } = useApp();
  const { navigeer } = useNav();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [kant, setKant] = useState<"alle" | "oneven" | "even">("alle");
  const [losNr, setLosNr] = useState("");
  const [losToev, setLosToev] = useState("");
  const [verwijder, setVerwijder] = useState(false);
  const [naarDb, setNaarDb] = useState(false);
  const [bevestigGereed, setBevestigGereed] = useState(false);
  const [selectie, setSelectie] = useState<Set<string>>(new Set());

  // Rol-gebaseerde levenscyclus (zelfde stappen als TAUW).
  const status = ronde.status;
  const isToegewezen = !!currentUser && currentUser.id === ronde.toegewezenAan;
  const magWerken = isLeiding || isToegewezen;
  // Bewerken (adressen, reeksen, gaten melden) mag alleen zolang de ronde nog niet ter controle ligt.
  const bewerkbaar = magWerken && (status === "nieuw" || status === "toegewezen");
  const monteur = users.find((u) => u.id === ronde.toegewezenAan);
  const controleur = users.find((u) => u.id === ronde.gecontroleerdDoor);
  const nu = () => new Date().toISOString();
  const huidigIndex = TAUW_STATUS_VOLGORDE.indexOf(status);
  const teLaat = !!ronde.deadline && ronde.deadline < vandaagISO() && status !== "verstuurd";

  const adressen = ronde.adressen;
  // Buiten de bewerkbare fase is de ronde vergrendeld: adressen niet meer wijzigen (eerst heropenen).
  const setAdressen = (next: Adres[]) => {
    if (!bewerkbaar) return;
    updateRonde(ronde.id, { adressen: next });
  };

  // Levenscyclus-overgangen (rol-gebonden) — identiek aan TAUW/Saneren.
  const toewijzen = (id: string) => updateRonde(ronde.id, { toegewezenAan: id || undefined, status: id ? "toegewezen" : "nieuw", toegewezenOp: id ? nu() : undefined });
  const naarControle = () => updateRonde(ronde.id, { status: "ter_controle" });
  const terugNaarWerknemer = () => updateRonde(ronde.id, { status: "toegewezen", gecontroleerdDoor: undefined, gecontroleerdOp: undefined, verstuurdOp: undefined, boekhouding: undefined, doorgestuurdOp: undefined, gefactureerdOp: undefined });
  const goedkeuren = () => updateRonde(ronde.id, { status: "gecontroleerd", gecontroleerdDoor: currentUser?.id, gecontroleerdOp: nu() });
  // Afronden = klaar → meteen door naar de boekhouding (verschijnt bij Facturen + als melding).
  const afronden = () => updateRonde(ronde.id, { status: "verstuurd", verstuurdOp: nu(), boekhouding: "te_factureren", doorgestuurdOp: nu() });
  const naarDatabase = () => { updateRonde(ronde.id, { gearchiveerd: true, gearchiveerdOp: nu() }); setNaarDb(false); onTerug(); };

  // Concept-factuur aanmaken op basis van het aantal gegooide brieven (behoud van de oude werkstroom-stap).
  const maakFactuur = () => {
    const nummer = `${new Date().getFullYear()}-${String(facturen.length + 1).padStart(4, "0")}`;
    const id = addFactuur(maakConceptFactuurVanRonde(ronde, nummer, new Date().toISOString().slice(0, 10)));
    updateRonde(ronde.id, { factuurId: id });
    navigeer("facturen", { factuur: id });
  };

  const updateAdres = (id: string, patch: Partial<Adres>) =>
    setAdressen(adressen.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const verwijderAdres = (id: string) => setAdressen(adressen.filter((a) => a.id !== id));

  const bestaat = (hnr: number, toev: string) =>
    adressen.some((a) => a.huisnummer === hnr && a.toevoeging === toev);

  const voegReeksToe = () => {
    const v = parseInt(van, 10);
    const t = parseInt(tot, 10);
    if (isNaN(v) || isNaN(t)) return;
    const nieuwe = maakReeks(v, t, kant).filter((a) => !bestaat(a.huisnummer, a.toevoeging));
    setAdressen([...adressen, ...nieuwe]);
    setVan("");
    setTot("");
  };

  const voegLosToe = () => {
    const n = parseInt(losNr, 10);
    if (isNaN(n) || bestaat(n, losToev.trim())) return;
    setAdressen([...adressen, nieuwAdres(n, losToev.trim())]);
    setLosNr("");
    setLosToev("");
  };

  const markeerOntbrekend = (hnr: number) => {
    if (bestaat(hnr, "")) {
      updateAdres(adressen.find((a) => a.huisnummer === hnr && a.toevoeging === "")!.id, {
        ontbreekt: true,
      });
    } else {
      setAdressen([...adressen, { ...nieuwAdres(hnr), ontbreekt: true }]);
    }
  };

  const route = looproute(adressen);
  // Selecteren + in één keer een status zetten (gegooid / blanco / niet thuis).
  const toggleSel = (id: string) => setSelectie((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allesGeselecteerd = route.length > 0 && route.every((a) => selectie.has(a.id));
  const toggleAlles = () => setSelectie(allesGeselecteerd ? new Set() : new Set(route.map((a) => a.id)));
  const bulkStatus = (s: BriefStatus) => { setAdressen(adressen.map((a) => (selectie.has(a.id) ? { ...a, status: s } : a))); setSelectie(new Set()); };
  const nogTeDoen = route.filter((a) => a.status !== "Gegooid" && a.status !== "Blanco");
  const mapsBron = nogTeDoen.length ? nogTeDoen : route;
  // Google Maps doet max. 10 stops, dus de looproute wordt automatisch in delen van 10 gesplitst.
  const routeDelen = googleMapsRouteDelen(ronde.straat, ronde.postcode, ronde.plaats, mapsBron);
  const gaten = ontbrekendeNummers(adressen);
  const bedrijven = adressen.filter((a) => a.type === "bedrijf" && !a.ontbreekt);
  const ontbrekend = adressen.filter((a) => a.ontbreekt);
  const teBezorgen = adressen.filter((a) => !a.ontbreekt);
  const gegooid = teBezorgen.filter((a) => a.status === "Gegooid").length;
  const pct = teBezorgen.length ? Math.round((gegooid / teBezorgen.length) * 100) : 0;
  const openTeDoen = teBezorgen.filter((a) => a.status === "Te doen").length;

  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={onTerug}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar rondes
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold text-ink-900">{ronde.straat}</h2>
            <Badge tone={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>
          </div>
          <p className="text-sm text-ink-500">
            {[ronde.postcode, ronde.plaats, ronde.regio, monteur ? monteur.naam : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setVerwijder(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" /> Verwijderen
          </button>
        )}
      </div>

      {/* Levenscyclus + rol-acties (zelfde flow als TAUW) */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {TAUW_STATUS_VOLGORDE.map((s, i) => {
            const gedaan = i < huidigIndex, isNu = i === huidigIndex;
            return (
              <Fragment key={s}>
                <span className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${isNu ? "bg-brand-600 text-white" : gedaan ? "bg-green-100 text-green-700" : "bg-ink-100 text-ink-400"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${isNu ? "bg-white/25 text-white" : gedaan ? "bg-green-500 text-white" : "bg-ink-300 text-white"}`}>{gedaan ? "✓" : i + 1}</span>
                  {STATUS_LABEL[s]}
                </span>
                {i < TAUW_STATUS_VOLGORDE.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
              </Fragment>
            );
          })}
        </div>

        <div className="border-t border-ink-100 pt-3">
          {status === "nieuw" && (isLeiding ? (
            <div className="flex flex-wrap items-center gap-2">
              <UserPlus className="h-4 w-4 text-ink-400" />
              <span className="text-sm text-ink-600">Wijs toe aan een werknemer:</span>
              <WerknemerKiezer value={ronde.toegewezenAan ?? ""} onChange={toewijzen} users={users} leegLabel="Kies werknemer…" />
            </div>
          ) : <p className="text-sm text-ink-500">Nog niet vrijgegeven door de beheerder.</p>)}

          {status === "toegewezen" && (
            <div className="flex flex-wrap items-center gap-2">
              {magWerken ? (
                <button type="button" onClick={() => setBevestigGereed(true)} className={knopPrimair}><Check className="h-4 w-4" /> Brieven gegooid → naar controle</button>
              ) : <p className="text-sm text-ink-500">Wordt gelopen door {monteur?.naam ?? "de werknemer"}.</p>}
              {isLeiding && <WerknemerKiezer value={ronde.toegewezenAan ?? ""} onChange={toewijzen} users={users} leegLabel="Niet toegewezen" />}
            </div>
          )}

          {status === "ter_controle" && (isLeiding ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={goedkeuren} className={knopPrimair}><Check className="h-4 w-4" /> Goedkeuren</button>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar werknemer</button>
            </div>
          ) : isToegewezen ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-500">Klaar gemeld — wacht op controle.</span>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar mezelf — nog iets aanpassen</button>
            </div>
          ) : <p className="text-sm text-ink-500">Klaar gemeld — wacht op controle door de beheerder.</p>)}

          {status === "gecontroleerd" && (isLeiding ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={afronden} className={knopPrimair}><Check className="h-4 w-4" /> Afronden</button>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar werknemer</button>
            </div>
          ) : <p className="text-sm text-ink-500">Goedgekeurd{controleur ? ` door ${controleur.naam}` : ""} — wacht op afronden door de beheerder.</p>)}

          {status === "verstuurd" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700"><Check className="h-4 w-4" /> Afgerond{ronde.verstuurdOp ? ` op ${datumKort(ronde.verstuurdOp)}` : ""}.</span>
              {isLeiding && <button type="button" onClick={() => setNaarDb(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"><Database className="h-4 w-4" /> Naar database</button>}
              {isLeiding && <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Heropenen</button>}
            </div>
          )}
        </div>

        {/* Deadline — door de beheerder ingesteld, door iedereen zichtbaar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <CalendarClock className="h-4 w-4 text-ink-400" />
          <span className="text-sm text-ink-600">Deadline</span>
          {isLeiding ? (
            <>
              <div className="w-full sm:w-48"><DatumKiezer value={ronde.deadline ?? ""} onChange={(iso) => updateRonde(ronde.id, { deadline: iso || undefined })} placeholder="Geen deadline" /></div>
              {ronde.deadline && <button type="button" onClick={() => updateRonde(ronde.id, { deadline: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">wissen</button>}
            </>
          ) : (
            <span className={`text-sm font-semibold ${teLaat ? "text-red-600" : "text-ink-800"}`}>{ronde.deadline ? `${datumKort(ronde.deadline)}${teLaat ? " · te laat" : ""}` : "nog niet gezet"}</span>
          )}
        </div>
      </Card>

      {/* Regio — bepaalt de groepering in de database */}
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <span className="text-sm font-medium text-ink-600">Regio</span>
        <input value={ronde.regio ?? ""} disabled={!bewerkbaar} onChange={(e) => updateRonde(ronde.id, { regio: e.target.value })} placeholder="Onbekend" className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 disabled:bg-ink-50 disabled:text-ink-500 sm:w-40" />
        {bewerkbaar && <button type="button" onClick={() => updateRonde(ronde.id, { regio: afleidRegio(ronde.postcode, ronde.plaats) })} className={knopKlein}><Wand2 className="h-3.5 w-3.5" /> Auto uit postcode</button>}
      </Card>

      {/* Afronding: bevestigingsmail + concept-factuur (beschikbaar zodra het werk is goedgekeurd) */}
      {isLeiding && (status === "gecontroleerd" || status === "verstuurd") && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">Afronding</h3>
          <div className="flex flex-wrap items-center gap-2">
            <a href={bevestigingsMail(ronde)} onClick={() => updateRonde(ronde.id, { mailVerstuurdOp: nu() })} className={knopKlein}>
              <Mail className="h-3.5 w-3.5" /> Bevestiging per mail
            </a>
            {ronde.mailVerstuurdOp && <span className="text-xs text-green-600">verstuurd op {datumKort(ronde.mailVerstuurdOp)}</span>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {ronde.factuurId ? (
              <button type="button" onClick={() => navigeer("facturen", { factuur: ronde.factuurId })} className={knopKlein}><Receipt className="h-3.5 w-3.5" /> Open factuur</button>
            ) : (
              <button type="button" onClick={maakFactuur} className={knopPrimair}><Receipt className="h-4 w-4" /> Concept-factuur maken ({gegooid} brieven)</button>
            )}
          </div>
        </Card>
      )}

      {/* Voortgang + chips */}
      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="font-medium text-ink-700">Brieven gegooid</span>
          <span className="text-ink-500">
            {gegooid} / {teBezorgen.length} ({pct}%)
          </span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 text-center sm:grid-cols-3">
          <div className="rounded-lg bg-ink-50 p-3">
            <div className="text-lg font-bold text-ink-900">{teBezorgen.length}</div>
            <div className="text-xs text-ink-500">Adressen</div>
          </div>
          <div className="rounded-lg bg-brand-50 p-3">
            <div className="text-lg font-bold text-brand-700">{bedrijven.length}</div>
            <div className="text-xs text-brand-600">Bedrijfspanden</div>
          </div>
          <div className="rounded-lg bg-amber-50 p-3">
            <div className="text-lg font-bold text-amber-700">{gaten.length + ontbrekend.length}</div>
            <div className="text-xs text-amber-600">Ontbrekend</div>
          </div>
        </div>
      </Card>

      {/* Looproute openen in Google Maps — automatisch in delen van max. 10 stops */}
      {routeDelen.length > 0 && (
        <Card className="p-4">
          <div className="mb-3 flex items-center gap-2.5">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><MapPin className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-ink-900">Looproute in Google Maps</h4>
              <p className="text-xs text-ink-500">
                {routeDelen.length === 1
                  ? `${routeDelen[0].aantal} ${routeDelen[0].aantal === 1 ? "adres" : "adressen"} — open de wandelroute`
                  : `${mapsBron.length} adressen, opgedeeld in ${routeDelen.length} delen van max. 10 stops`}
              </p>
            </div>
          </div>

          {routeDelen.length === 1 ? (
            <a
              href={routeDelen[0].url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white hover:bg-brand-700"
            >
              <Navigation className="h-4 w-4" /> Open looproute in Google Maps
              <ExternalLink className="h-4 w-4 opacity-80" />
            </a>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {routeDelen.map((deel, i) => (
                <a
                  key={i}
                  href={deel.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-3 rounded-xl border border-ink-200 bg-ink-50/40 px-3 py-2.5 transition-colors hover:border-brand-300 hover:bg-brand-50"
                >
                  <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-ink-900">Deel {i + 1}</div>
                    <div className="text-xs text-ink-500">Adres {deel.van}–{deel.tot} · {deel.aantal} stops</div>
                  </div>
                  <ExternalLink className="h-4 w-4 shrink-0 text-ink-300 transition-colors group-hover:text-brand-600" />
                </a>
              ))}
            </div>
          )}

          <p className="mt-3 flex items-start gap-1.5 text-xs text-ink-400">
            <Navigation className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              {nogTeDoen.length ? "De adressen die nog gedaan moeten worden, in looproute-volgorde." : "Alles is al gegooid — dit is de volledige looproute."}
              {routeDelen.length > 1 && " Google Maps doet max. 10 stops per route, dus loop de delen één voor één."}
            </span>
          </p>
        </Card>
      )}

      {/* Bedrijfspanden */}
      {bedrijven.length > 0 && (
        <Card className="p-5">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <Building2 className="h-4 w-4 text-brand-600" />
            Bedrijfspanden — persoonlijk afgeven
          </h3>
          <div className="flex flex-wrap gap-2">
            {bedrijven.map((a) => (
              <span
                key={a.id}
                className="rounded-lg bg-brand-50 px-3 py-1.5 text-sm font-semibold text-brand-700 ring-1 ring-inset ring-brand-200"
              >
                {ronde.straat} {adresLabel(a)}
              </span>
            ))}
          </div>
        </Card>
      )}

      {/* Ontbrekende huisnummers */}
      {(gaten.length > 0 || ontbrekend.length > 0) && (
        <Card className="p-5" id="brieven-ontbrekend">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Ontbrekende huisnummers
          </h3>
          {gaten.length > 0 && (
            <div className="mb-3">
              <p className="mb-1.5 text-xs text-ink-500">
                Mogelijk overgeslagen in de nummering — klik om te melden:
              </p>
              <div className="flex flex-wrap gap-2">
                {gaten.map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={!bewerkbaar}
                    onClick={() => markeerOntbrekend(n)}
                    className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {ronde.straat} {n}
                  </button>
                ))}
              </div>
            </div>
          )}
          {ontbrekend.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {ontbrekend.map((a) => (
                <span
                  key={a.id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-sm font-medium text-amber-800"
                >
                  {ronde.straat} {adresLabel(a)} — gemeld
                  <button
                    type="button"
                    disabled={!bewerkbaar}
                    onClick={() => updateAdres(a.id, { ontbreekt: false })}
                    className="text-amber-600 hover:text-amber-900 disabled:opacity-40"
                    title="Terugzetten"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* Looproute */}
      <div id="brieven-route">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900">
            <Route className="h-4 w-4 text-brand-600" />
            Beste looproute ({route.length} stops)
          </h3>
          <button
            type="button"
            disabled={!bewerkbaar}
            onClick={() => setToevoegenOpen((o) => !o)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
            Adressen
          </button>
        </div>

        {/* Parkeer- & looptips bij de route */}
        {(bewerkbaar || ronde.parkeerNotitie) && (
          <textarea
            value={ronde.parkeerNotitie ?? ""}
            disabled={!bewerkbaar}
            onChange={(e) => updateRonde(ronde.id, { parkeerNotitie: e.target.value })}
            rows={2}
            placeholder="Parkeer- & looptips (bijv. parkeer bij nr. 2; oneven kant omhoog, even kant terug)"
            className="mb-3 w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-500"
          />
        )}

        {toevoegenOpen && (
          <Card className="mb-3 space-y-4 p-4">
            <div>
              <p className="mb-1.5 text-xs font-medium text-ink-600">Reeks toevoegen</p>
              <div className="flex flex-wrap items-end gap-2">
                <input value={van} onChange={(e) => setVan(e.target.value)} inputMode="numeric" placeholder="van" className="w-20 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
                <input value={tot} onChange={(e) => setTot(e.target.value)} inputMode="numeric" placeholder="tot" className="w-20 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
                <div className="w-28"><Keuze value={kant} onChange={(w) => setKant(w as typeof kant)} opties={[{ waarde: "alle", label: "Alle" }, { waarde: "oneven", label: "Oneven" }, { waarde: "even", label: "Even" }]} size="sm" title="Kant" /></div>
                <button type="button" onClick={voegReeksToe} className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white hover:bg-ink-900">
                  Toevoegen
                </button>
              </div>
            </div>
            <div className="border-t border-ink-100 pt-3">
              <p className="mb-1.5 text-xs font-medium text-ink-600">Los adres toevoegen</p>
              <div className="flex flex-wrap items-end gap-2">
                <input value={losNr} onChange={(e) => setLosNr(e.target.value)} inputMode="numeric" placeholder="huisnr" className="w-24 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
                <input value={losToev} onChange={(e) => setLosToev(e.target.value)} placeholder="toev. (A)" className="w-24 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
                <button type="button" onClick={voegLosToe} className="rounded-lg bg-ink-800 px-4 py-2 text-sm font-medium text-white hover:bg-ink-900">
                  Toevoegen
                </button>
              </div>
            </div>
          </Card>
        )}

        {/* Selecteren + in één keer een status zetten */}
        {bewerkbaar && route.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/60 px-3 py-2">
            <label className="flex items-center gap-2 text-sm font-medium text-ink-700">
              <input type="checkbox" checked={allesGeselecteerd} onChange={toggleAlles} className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-200" />
              Alles selecteren
            </label>
            {selectie.size > 0 ? (
              <>
                <span className="text-xs font-medium text-ink-500">{selectie.size} geselecteerd:</span>
                <button type="button" onClick={() => bulkStatus("Gegooid")} className="rounded-lg bg-green-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-green-700">Gegooid</button>
                <button type="button" onClick={() => bulkStatus("Blanco")} className="rounded-lg bg-slate-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-slate-600">Blanco</button>
                <button type="button" onClick={() => bulkStatus("Niet thuis")} className="rounded-lg bg-amber-500 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-600">Niet thuis</button>
                <button type="button" onClick={() => bulkStatus("Te doen")} className="rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-500 hover:bg-ink-100">Te doen</button>
                <button type="button" onClick={() => setSelectie(new Set())} className="ml-auto text-xs font-medium text-ink-400 hover:text-ink-600">wis selectie</button>
              </>
            ) : (
              <span className="text-xs text-ink-400">Vink adressen aan om ze in één keer op gegooid, blanco of niet thuis te zetten.</span>
            )}
          </div>
        )}

        {route.length === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-500">
            Nog geen adressen. Voeg een reeks toe (bijv. 1 t/m 30) om de looproute te maken.
          </Card>
        ) : (
          <div className="space-y-2" id="brieven-adressen">
            {route.map((a, i) => (
              <AdresRij
                key={a.id}
                adres={a}
                stap={i + 1}
                vergrendeld={!bewerkbaar}
                geselecteerd={selectie.has(a.id)}
                onToggleSelectie={bewerkbaar ? () => toggleSel(a.id) : undefined}
                navigeerUrl={googleMapsAdresUrl(ronde.straat, ronde.postcode, ronde.plaats, a)}
                onUpdate={(patch) => updateAdres(a.id, patch)}
                onVerwijder={() => verwijderAdres(a.id)}
              />
            ))}
          </div>
        )}
      </div>

      <Bevestig
        open={bevestigGereed}
        titel="Brieven klaar melden?"
        tekst={openTeDoen > 0
          ? `Let op: er ${openTeDoen === 1 ? "staat" : "staan"} nog ${openTeDoen} adres${openTeDoen === 1 ? "" : "sen"} op 'Te doen'. Weet je zeker dat je de ronde gereed meldt voor controle? De beheerder controleert je werk.`
          : `Alle ${teBezorgen.length} adressen zijn afgehandeld. Weet je zeker dat je de ronde gereed meldt voor controle?`}
        bevestigLabel="Ja, klaar melden"
        bevestigTone="brand"
        onBevestig={() => { setBevestigGereed(false); naarControle(); }}
        onAnnuleer={() => setBevestigGereed(false)}
      />
      <Bevestig
        open={verwijder}
        titel="Ronde verwijderen"
        tekst={`Weet je het zeker dat je de ronde "${ronde.straat}" wilt verwijderen? Alle ${adressen.length} adressen gaan verloren.`}
        onBevestig={() => { deleteRonde(ronde.id); setVerwijder(false); onTerug(); }}
        onAnnuleer={() => setVerwijder(false)}
      />
      <Bevestig
        open={naarDb}
        titel="Naar de database versturen"
        tekst={`Ronde "${ronde.straat}" naar de database versturen? Hij verdwijnt uit deze lijst en wordt bewaard in de database.`}
        bevestigLabel="Naar database"
        bevestigTone="brand"
        onBevestig={naarDatabase}
        onAnnuleer={() => setNaarDb(false)}
      />
    </div>
  );
}

// ── Nieuwe ronde aanmaken ──
function NieuweRonde({ onKlaar }: { onKlaar: () => void }) {
  const { addRonde, users, currentUser } = useApp();
  const [straat, setStraat] = useState("");
  const [postcode, setPostcode] = useState("");
  const [plaats, setPlaats] = useState("");
  const [toegewezenAan, setToegewezenAan] = useState(
    currentUser?.rol === "monteur" ? currentUser.id : ""
  );
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [kant, setKant] = useState<"alle" | "oneven" | "even">("alle");

  const maak = () => {
    if (!straat.trim()) return;
    const v = parseInt(van, 10);
    const t = parseInt(tot, 10);
    const adressen = !isNaN(v) && !isNaN(t) ? maakReeks(v, t, kant) : [];
    addRonde({
      straat: straat.trim(),
      postcode: postcode.trim(),
      plaats: plaats.trim(),
      toegewezenAan: toegewezenAan || undefined,
      aangemaakt: new Date().toISOString(),
      // Direct toegewezen → "Bij werknemer", anders "Aangemaakt".
      status: toegewezenAan ? "toegewezen" : "nieuw",
      toegewezenOp: toegewezenAan ? new Date().toISOString() : undefined,
      adressen,
      regio: afleidRegio(postcode.trim(), plaats.trim()),
    });
    onKlaar();
  };

  const inputCls =
    "w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" />
        Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">Nieuwe brievenronde</h2>

      <Card className="space-y-4 p-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Straatnaam</span>
          <input value={straat} onChange={(e) => setStraat(e.target.value)} placeholder="bijv. Dorpsstraat" className={inputCls} />
        </label>
        <div className="grid grid-cols-2 gap-4">
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Postcode</span>
            <input value={postcode} onChange={(e) => setPostcode(e.target.value)} placeholder="1234 AB" className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-ink-700">Plaats / wijk</span>
            <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder="Rotterdam-Noord" className={inputCls} />
          </label>
        </div>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Toewijzen aan medewerker</span>
          <Keuze value={toegewezenAan} onChange={setToegewezenAan} opties={[{ waarde: "", label: "— Nog niet toewijzen —" }, ...users.map((u) => ({ waarde: u.id, label: `${u.naam} (${u.functie})` }))]} title="Toewijzen aan medewerker" />
          <span className="mt-1 block text-xs text-ink-400">
            De medewerker ziet deze ronde direct op zijn eigen account.
          </span>
        </label>

        <div className="border-t border-ink-100 pt-4">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Huisnummers (optioneel — direct invullen)</span>
          <div className="flex flex-wrap items-end gap-2">
            <input value={van} onChange={(e) => setVan(e.target.value)} inputMode="numeric" placeholder="van" className="w-20 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
            <input value={tot} onChange={(e) => setTot(e.target.value)} inputMode="numeric" placeholder="tot" className="w-20 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
            <div className="w-28"><Keuze value={kant} onChange={(w) => setKant(w as typeof kant)} opties={[{ waarde: "alle", label: "Alle" }, { waarde: "oneven", label: "Oneven" }, { waarde: "even", label: "Even" }]} size="sm" title="Kant" /></div>
          </div>
        </div>
      </Card>

      <button type="button" onClick={maak} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
        <Plus className="h-4 w-4" />
        Ronde aanmaken
      </button>
    </div>
  );
}

// ── Hoofdcomponent ──
// ── Groeperen per werkweek (zelfde layout als de TAUW-pagina) ──
const NL_MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
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
const teGooien = (r: Brievenronde) => r.adressen.filter((a) => !a.ontbreekt && a.status !== "Gegooid").length;
const isOpenRonde = (r: Brievenronde) => r.status !== "verstuurd";
// Peildatum voor sortering/groepering: deadline → aanmaakdatum.
const peildatum = (r: Brievenronde) => r.deadline || r.aangemaakt.slice(0, 10);
const sorteerAdr = (adr: Adres[]) => [...adr].sort((a, b) => a.huisnummer - b.huisnummer || a.toevoeging.localeCompare(b.toevoeging, "nl", { numeric: true }));

// Eén import-map: alle rondes uit hetzelfde bestand. Map-brede acties (naam, PD-nummer, deadline,
// toewijzen, route, boekhouding) en de adressen per straat in looproute-volgorde.
function BrievenMap({ naam, rondes, isLeiding, onOpenRonde }: { naam: string; rondes: Brievenronde[]; isLeiding: boolean; onOpenRonde: (id: string) => void }) {
  const { updateRonde, users } = useApp();
  const [open, setOpen] = useState(false);
  const [naamBewerk, setNaamBewerk] = useState<string | null>(null);
  const [routeOpen, setRouteOpen] = useState(false);
  const [vraagBoek, setVraagBoek] = useState(false);
  const nu = () => new Date().toISOString();

  const straten = [...rondes].sort((a, b) => a.straat.localeCompare(b.straat, "nl") || a.postcode.localeCompare(b.postcode));
  const teBezorgen = rondes.flatMap((r) => r.adressen.filter((a) => !a.ontbreekt));
  const gegooid = teBezorgen.filter((a) => a.status === "Gegooid").length;
  const openA = teBezorgen.length - gegooid;
  const pct = teBezorgen.length ? Math.round((gegooid / teBezorgen.length) * 100) : 0;
  const alAfgerond = rondes.length > 0 && rondes.every((r) => r.status === "verstuurd");
  const pd = rondes.find((r) => r.pdNummer)?.pdNummer ?? "";
  const deadline = rondes.find((r) => r.deadline)?.deadline ?? "";
  const toegewezen = rondes.find((r) => r.toegewezenAan)?.toegewezenAan ?? "";

  const routeStops = straten.flatMap((r) => sorteerAdr(r.adressen.filter((a) => !a.ontbreekt)).map((a) => adresVolledig(r.straat, r.postcode, r.plaats, a)));
  const routeDelen = googleMapsRouteVanTeksten(routeStops);

  const hernoem = (v: string) => { const n = v.trim(); if (n) rondes.forEach((r) => updateRonde(r.id, { mapNaam: n })); setNaamBewerk(null); };
  const zetPd = (v: string) => rondes.forEach((r) => updateRonde(r.id, { pdNummer: v.trim() || undefined }));
  const zetDeadline = (d: string) => rondes.forEach((r) => updateRonde(r.id, { deadline: d || undefined }));
  const zetToegewezen = (id: string) => rondes.forEach((r) => updateRonde(r.id, id && r.status === "nieuw" ? { toegewezenAan: id || undefined, status: "toegewezen", toegewezenOp: nu() } : { toegewezenAan: id || undefined }));
  const naarBoekhouding = () => { rondes.forEach((r) => updateRonde(r.id, { status: "verstuurd", verstuurdOp: nu(), boekhouding: "te_factureren", doorgestuurdOp: nu() })); setVraagBoek(false); };
  const zetAdres = (rid: string, aid: string, status: BriefStatus) => { const r = rondes.find((x) => x.id === rid); if (!r) return; updateRonde(rid, { adressen: r.adressen.map((a) => (a.id === aid ? { ...a, status } : a)) }); };

  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
      <div className="flex items-center gap-2 px-4 py-3">
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-lg bg-brand-50 p-2.5 text-brand-600 hover:bg-brand-100" title="Uit-/inklappen"><Folder className="h-5 w-5" /></button>
        <div className="min-w-0 flex-1">
          {naamBewerk !== null ? (
            <input autoFocus aria-label="Mapnaam" value={naamBewerk} onChange={(e) => setNaamBewerk(e.target.value)} onBlur={() => hernoem(naamBewerk)} onKeyDown={(e) => { if (e.key === "Enter") hernoem(naamBewerk); if (e.key === "Escape") setNaamBewerk(null); }} className="w-full rounded border border-ink-300 px-2 py-1 text-sm font-semibold outline-none focus:border-brand-400" />
          ) : (
            <button type="button" onClick={() => setOpen((o) => !o)} className="block w-full truncate text-left font-semibold text-ink-900">{naam}</button>
          )}
          <div className="truncate text-xs text-ink-500">{rondes.length} {rondes.length === 1 ? "ronde" : "rondes"} · {teBezorgen.length} adressen · {openA} open{pd ? ` · ${pd}` : ""}{alAfgerond ? " · ✓ boekhouding" : ""}</div>
        </div>
        {isLeiding && naamBewerk === null && <button type="button" onClick={() => setNaamBewerk(naam)} className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100" title="Naam wijzigen"><Pencil className="h-4 w-4" /></button>}
        <button type="button" onClick={() => setOpen((o) => !o)} className="shrink-0 rounded-lg p-1 text-ink-400" title="Uit-/inklappen"><ChevronDown className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`} /></button>
      </div>
      <div className="h-1 bg-ink-100"><div className="h-full bg-green-500" style={{ width: `${pct}%` }} /></div>

      {open && (
        <div className="space-y-4 border-t border-ink-100 p-4">
          {isLeiding && (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink-600">PD-nummer</span>
                <input defaultValue={pd} onBlur={(e) => zetPd(e.target.value)} placeholder="bijv. PD137103" className="w-40 rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400" />
              </label>
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink-600">Deadline (week)</span>
                <div className="w-44"><DatumKiezer value={deadline} onChange={zetDeadline} placeholder="Geen deadline" /></div>
              </div>
              <div>
                <span className="mb-1 block text-xs font-semibold text-ink-600">Toewijzen</span>
                <WerknemerKiezer value={toegewezen} onChange={zetToegewezen} users={users} leegLabel="Niemand" />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setRouteOpen((o) => !o)} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Route className="h-4 w-4" /> Google Maps route{routeDelen.length > 1 ? ` (${routeDelen.length} delen)` : ""}</button>
            {isLeiding && !alAfgerond && <button type="button" onClick={() => setVraagBoek(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Receipt className="h-4 w-4" /> Hele map naar boekhouding</button>}
          </div>
          {routeOpen && (
            <div className="flex flex-wrap gap-2">
              {routeDelen.length === 0 ? <span className="text-xs text-ink-400">Geen adressen.</span> : routeDelen.map((d, i) => (
                <a key={i} href={d.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-ink-50 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-100"><Navigation className="h-3.5 w-3.5" /> {routeDelen.length > 1 ? `Deel ${i + 1}: ` : "Route: "}adres {d.van}–{d.tot} <ExternalLink className="h-3 w-3" /></a>
              ))}
            </div>
          )}

          <div className="space-y-3">
            {straten.map((r) => (
              <div key={r.id}>
                <button type="button" onClick={() => onOpenRonde(r.id)} className="mb-1.5 truncate text-sm font-semibold text-ink-800 hover:text-brand-700">{r.straat} <span className="font-normal text-ink-400">· {r.plaats} · {r.adressen.filter((a) => !a.ontbreekt).length}</span></button>
                <div className="flex flex-wrap gap-1.5">
                  {sorteerAdr(r.adressen).map((a) => {
                    const gegooidA = a.status === "Gegooid";
                    return (
                      <button key={a.id} type="button" onClick={() => zetAdres(r.id, a.id, gegooidA ? "Te doen" : "Gegooid")} title={a.ontbreekt ? "Ontbrekend huisnummer" : gegooidA ? "Gegooid — klik = te doen" : "Klik = gegooid"} className={`rounded-md px-2 py-1 text-xs font-medium transition-colors ${a.ontbreekt ? "bg-amber-100 text-amber-700" : gegooidA ? "bg-green-500 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}>
                        {a.huisnummer}{a.toevoeging ? ` ${a.toevoeging}` : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <Bevestig open={vraagBoek} titel="Hele map naar de boekhouding?" tekst={`Alle ${rondes.length} rondes (${teBezorgen.length} adressen) van "${naam}" worden afgerond en doorgestuurd naar de boekhouding.`} bevestigLabel="Naar boekhouding" bevestigTone="brand" onBevestig={naarBoekhouding} onAnnuleer={() => setVraagBoek(false)} />
    </div>
  );
}

export function Brieven({ initieelRonde }: { initieelRonde?: string }) {
  const { rondes, currentUser } = useApp();
  const [openId, setOpenId] = useState<string | null>(initieelRonde ?? null);
  const [nieuw, setNieuw] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  const zichtbaar = (isLeiding
    ? rondes
    : rondes.filter((r) => r.toegewezenAan === currentUser.id)
  ).filter((r) => !r.gearchiveerd);

  if (nieuw) return <NieuweRonde onKlaar={() => setNieuw(false)} />;

  const open = zichtbaar.find((r) => r.id === openId);
  if (open) return <RondeDetail ronde={open} onTerug={() => setOpenId(null)} />;

  // Samenvatting + groeperen per week (zelfde layout als TAUW)
  const vandaag = vandaagISO();
  const totOpenRondes = zichtbaar.filter(isOpenRonde).length;
  const totOpenAdr = zichtbaar.filter(isOpenRonde).reduce((s, r) => s + teGooien(r), 0);
  const gesorteerd = [...zichtbaar].sort((a, b) => {
    const pa = peildatum(a), pb = peildatum(b);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a.straat.localeCompare(b.straat, "nl");
  });
  // Rondes uit dezelfde import (mapNaam) groeperen we als één map; daarna alles per week sorteren —
  // maps én losse rondes komen in de week van hun (vroegste) peildatum.
  const mappen: { naam: string; items: Brievenronde[] }[] = [];
  const losse: Brievenronde[] = [];
  for (const r of gesorteerd) {
    if (r.mapNaam) {
      let m = mappen.find((x) => x.naam === r.mapNaam);
      if (!m) { m = { naam: r.mapNaam, items: [] }; mappen.push(m); }
      m.items.push(r);
    } else losse.push(r);
  }
  type Week = { key: string; label: string; mappen: { naam: string; items: Brievenronde[] }[]; rondes: Brievenronde[] };
  const weken: Week[] = [];
  const weekVoor = (key: string): Week => { let w = weken.find((x) => x.key === key); if (!w) { w = { key, label: weekLabel(key), mappen: [], rondes: [] }; weken.push(w); } return w; };
  for (const m of mappen) {
    const peil = m.items.map(peildatum).sort()[0] || "";
    weekVoor(weekStartISO(peil) || "zonder").mappen.push(m);
  }
  for (const r of losse) weekVoor(weekStartISO(peildatum(r)) || "zonder").rondes.push(r);
  weken.sort((a, b) => (a.key === "zonder" ? 1 : b.key === "zonder" ? -1 : a.key.localeCompare(b.key)));

  // Eén ronde-kaart (hergebruikt in de import-mappen én in de week-groepen).
  const rondeKaart = (r: Brievenronde) => {
    const teBezorgen = r.adressen.filter((a) => !a.ontbreekt);
    const gegooid = teBezorgen.filter((a) => a.status === "Gegooid").length;
    const pct = teBezorgen.length ? Math.round((gegooid / teBezorgen.length) * 100) : 0;
    const bedrijven = r.adressen.filter((a) => a.type === "bedrijf" && !a.ontbreekt).length;
    const openA = teBezorgen.length - gegooid;
    const teLaat = !!r.deadline && r.deadline < vandaag && r.status !== "verstuurd";
    return (
      <div key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-card transition-shadow hover:shadow-cardhover">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><MapPin className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-ink-900">{r.straat}</div>
            <div className="truncate text-xs text-ink-500">{[r.plaats, `${teBezorgen.length} adressen`, bedrijven > 0 ? `${bedrijven} bedrijf` : ""].filter(Boolean).join(" · ")}</div>
          </div>
          <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
          <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
        </div>
        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span className="text-ink-500">{gegooid}/{teBezorgen.length} gegooid{r.status !== "verstuurd" ? ` · ${openA} open` : ""}</span>
          {r.deadline && <span className={`inline-flex items-center gap-1 font-semibold ${teLaat ? "text-red-600" : "text-ink-500"}`}><CalendarClock className="h-3.5 w-3.5" /> {teLaat ? "Te laat" : datumKort(r.deadline)}</span>}
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Brieven & Routes</h2>
          <p className="text-sm text-ink-500">Looproutes, ontbrekende huisnummers en bedrijfspanden.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <FileUp className="h-4 w-4" />
            Brieven-PDF importeren
          </button>
          <button
            type="button"
            onClick={() => setNieuw(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Nieuwe ronde
          </button>
        </div>
      </div>
      <BestandScanModal open={scanOpen} projectId="" projectNaam="Brieven & Routes" onSluit={() => setScanOpen(false)} />


      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <Mailbox className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">
            Nog geen brievenrondes. Klik op <span className="font-medium">Brieven-PDF importeren</span> om de Stedin-afschakelbrieven in te lezen, of op <span className="font-medium">Nieuwe ronde</span> om handmatig te beginnen.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Eén-oogopslag-samenvatting van wat er openstaat */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{totOpenRondes}</div>
              <div className="text-xs text-ink-500">{totOpenRondes === 1 ? "ronde open" : "rondes open"}</div>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{totOpenAdr}</div>
              <div className="text-xs text-ink-500">adressen te gooien</div>
            </div>
          </div>

          {weken.map((g) => {
            const alle = [...g.mappen.flatMap((m) => m.items), ...g.rondes];
            const openInWeek = alle.filter(isOpenRonde).length;
            return (
              <div key={g.key}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-700">{g.label}</h3>
                  <span className="text-xs font-medium text-ink-500">{openInWeek} open · {alle.length} {alle.length === 1 ? "ronde" : "rondes"}</span>
                </div>
                <div className="space-y-3">
                  {g.mappen.map((m) => (
                    <BrievenMap key={`map-${m.naam}`} naam={m.naam} rondes={m.items} isLeiding={isLeiding} onOpenRonde={setOpenId} />
                  ))}
                  {g.rondes.length > 0 && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {g.rondes.map((r) => rondeKaart(r))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

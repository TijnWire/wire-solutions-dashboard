import { Fragment, useState } from "react";
import { ArrowLeft, Plus, FlaskConical, Trash2, MessageCircle, Phone, Navigation, FileDown, FileUp, Mail, Check, Wand2, ChevronRight, ChevronDown, X, UserPlus, RotateCcw, Footprints, Search, CalendarClock, Pencil } from "lucide-react";
import { useApp } from "../store/AppContext";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer } from "../components/TijdKiezer";
import { Card, Badge, Bevestig } from "../components/ui";
import { afleidRegio } from "../lib/regio";
import { waUrl } from "../lib/communicatie";
import { googleMapsRoute, MAX_ROUTE_STOPS } from "../lib/afspraak";
import { exporteerTauwExcel, mailTauwNaarStedin } from "../lib/tauwExcel";
import { BodemPlanning, BodemAfspraken } from "../components/BodemPlanning";
import { BodemImport } from "../components/BodemImport";
import { BodemToewijzen } from "../components/BodemToewijzen";
import { BodemOverzicht } from "../components/BodemOverzicht";
import { DeurRonde } from "./DeurRonde";
import { sorteerRoute, voortgangVan } from "../lib/bodemonderzoek";
import {
  TAUW_TYPES, TAUW_TYPE_LABEL, TAUW_STATUS_LABEL, TAUW_STATUS_VOLGORDE, TAUW_OPDRACHTGEVERS,
  type TauwAdres, type TauwOpdracht, type TauwType, type TauwStatus, type TauwOpdrachtgever,
} from "../lib/types";

const veld = "w-full min-w-0 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:bg-ink-50 disabled:text-ink-500";
const knopKlein = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";
const knopPrimair = "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";

const STATUS_TONE: Record<TauwStatus, string> = { nieuw: "slate", toegewezen: "amber", ter_controle: "indigo", gecontroleerd: "green", verstuurd: "green" };

const adresId = () => {
  try { return crypto.randomUUID(); } catch { return `ta-${Date.now()}-${Math.round(Math.random() * 1e6)}`; }
};
const leegAdres = (): TauwAdres => ({ id: adresId(), straat: "", huisnummer: "", postcode: "", plaats: "", bewoner: "", telefoon: "", datum: "", tijd: "", bevestigd: false, notitie: "" });
const isISO = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isTijd = (t: string) => /^\d{2}:\d{2}$/.test(t);
const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };
const adresTekst = (a: TauwAdres) => {
  const nr = `${a.straat} ${a.huisnummer}`.replace(/\s+/g, " ").trim();
  const pc = `${a.postcode} ${a.plaats}`.replace(/\s+/g, " ").trim();
  return [nr, pc].filter(Boolean).join(", "); // leeg adres -> "" (valt weg in de route)
};

// Per type een andere bewoording: bodemonderzoek draait om een afspraak, een bezoekronde om langsgaan.
const BEVESTIGD_LABEL: Record<TauwType, string> = { bodemonderzoek: "Afspraak bevestigd", bezoekronde: "Adres bezocht" };
const VERZAMEL_LABEL: Record<TauwType, string> = { bodemonderzoek: "bevestigd", bezoekronde: "bezocht" };

// Een adres met enige inhoud (i.t.t. een vers, leeg leegAdres()-rijtje).
const heeftInhoud = (a: TauwAdres) => !!(a.straat || a.huisnummer || a.postcode || a.plaats || a.bewoner || a.telefoon || a.notitie || a.datum || a.tijd);
// Zoek-match binnen één map (q = reeds getrimd + lowercase). Leeg = alles.
const matchtZoek = (a: TauwAdres, q: string) => !q || `${a.straat} ${a.huisnummer} ${a.postcode} ${a.plaats} ${a.bewoner}`.toLowerCase().includes(q);
// Lokale kalenderdatum (yyyy-mm-dd) — consistent met weekStartISO; niet UTC.
function vandaagISO(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

// Sorteert adressen op looproute-volgorde: zelfde plaats → zelfde postcode → zelfde straat → oplopend
// huisnummer (natuurlijk, dus 2 < 11 en 12a < 12b). Nederlandse postcodes zijn straat-/buurtgebonden,
// dus dichtbijzijnde adressen komen zo achter elkaar te staan — handig om van huis naar huis te lopen.
function sorteerOpRoute(adressen: TauwAdres[]): TauwAdres[] {
  return [...adressen].sort((a, b) => {
    const pa = a.plaats.trim().toLowerCase(), pb = b.plaats.trim().toLowerCase();
    if (pa !== pb) return pa < pb ? -1 : 1;
    const ca = a.postcode.replace(/\s+/g, "").toUpperCase(), cb = b.postcode.replace(/\s+/g, "").toUpperCase();
    if (ca !== cb) return ca < cb ? -1 : 1;
    const sa = a.straat.trim().toLowerCase(), sb = b.straat.trim().toLowerCase();
    if (sa !== sb) return sa < sb ? -1 : 1;
    return a.huisnummer.localeCompare(b.huisnummer, "nl", { numeric: true });
  });
}

// ── Scan-animatie tijdens het inlezen ──


// Leest een bestand met een staps-gewijze scan-animatie en levert de (op route gesorteerde) adressen.

// ── Eén adres = één balk. Datum/tijd altijd zichtbaar; klap uit voor de rest. Alles wordt direct opgeslagen. ──
const adresLabel = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-600";
function TauwAdresKaart({ adres, nr, type, vergrendeld, magVerwijderen, geselecteerd, onSelect, onChange, onVerwijder }: { adres: TauwAdres; nr: number; type: TauwType; vergrendeld: boolean; magVerwijderen: boolean; geselecteerd: boolean; onSelect: () => void; onChange: (patch: Partial<TauwAdres>) => void; onVerwijder: () => void }) {
  const [open, setOpen] = useState(false);
  const titel = `${adres.straat} ${adres.huisnummer}`.trim() || "Nieuw adres";
  const plek = `${adres.straat} ${adres.huisnummer}`.trim();
  const bericht = type === "bodemonderzoek"
    ? `Beste ${adres.bewoner || "bewoner"}, voor het geplande bodemonderzoek op ${plek} willen wij graag een afspraak met u maken. Met vriendelijke groet, Wire Solutions.`
    : `Beste ${adres.bewoner || "bewoner"}, wij willen graag bij u langskomen op ${plek}. Met vriendelijke groet, Wire Solutions.`;
  return (
    <div className={`overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-card ${geselecteerd ? "border-brand-400 ring-2 ring-brand-200" : adres.bevestigd ? "border-green-300" : "border-ink-200"}`}>
      <div className={`flex items-center gap-2.5 px-3 py-2.5 ${adres.bevestigd ? "bg-green-50/60" : "bg-brand-50/40"}`}>
        <input type="checkbox" checked={geselecteerd} onChange={onSelect} className="h-4 w-4 shrink-0 accent-brand-600" aria-label={`${titel} selecteren voor de route`} title="Selecteer voor de route" />
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${adres.bevestigd ? "bg-green-500 text-white" : "bg-brand-500 text-white"}`}>
          {adres.bevestigd ? <Check className="h-4 w-4" /> : nr}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-bold text-ink-900">{titel}</div>
          {(adres.bewoner || adres.plaats) && <div className="truncate text-xs text-ink-500">{[adres.bewoner, adres.plaats].filter(Boolean).join(" · ")}</div>}
        </button>
        {/* Bevestigen zonder uitklappen */}
        <label className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${adres.bevestigd ? "border-green-300 bg-green-50 text-green-700" : "border-ink-200 bg-white text-ink-500 hover:bg-ink-50"} ${vergrendeld ? "pointer-events-none opacity-60" : "cursor-pointer"}`} title={BEVESTIGD_LABEL[type]}>
          <input type="checkbox" disabled={vergrendeld} checked={adres.bevestigd} onChange={(e) => onChange({ bevestigd: e.target.checked })} className="h-4 w-4 accent-green-600" />
          <span className="hidden whitespace-nowrap sm:inline">{BEVESTIGD_LABEL[type]}</span>
        </label>
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-100 hover:text-brand-600" title={open ? "Inklappen" : "Meer gegevens"}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
        {magVerwijderen && <button type="button" onClick={onVerwijder} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><X className="h-4 w-4" /></button>}
      </div>

      {/* Altijd zichtbaar: afspraak datum + tijd */}
      <div className="grid grid-cols-2 gap-3 p-3">
        <label className="block">
          <span className={adresLabel}>Datum</span>
          <DatumKiezer value={isISO(adres.datum) ? adres.datum : ""} onChange={(iso) => onChange({ datum: iso })} disabled={vergrendeld} placeholder="Kies datum" />
        </label>
        <label className="block">
          <span className={adresLabel}>Tijd</span>
          <TijdKiezer value={isTijd(adres.tijd) ? adres.tijd : ""} onChange={(tijd) => onChange({ tijd })} disabled={vergrendeld} size="sm" />
        </label>
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-100 bg-ink-50/50 p-3">
          <div>
            <span className={adresLabel}>Adresgegevens</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
              <input value={adres.straat} disabled={vergrendeld} onChange={(e) => onChange({ straat: e.target.value })} placeholder="Straat" className={`${veld} col-span-2 sm:col-span-5`} />
              <input value={adres.huisnummer} disabled={vergrendeld} onChange={(e) => onChange({ huisnummer: e.target.value })} placeholder="Nr" className={`${veld} sm:col-span-2`} />
              <input value={adres.postcode} disabled={vergrendeld} onChange={(e) => onChange({ postcode: e.target.value })} placeholder="Postcode" className={`${veld} sm:col-span-2`} />
              <input value={adres.plaats} disabled={vergrendeld} onChange={(e) => onChange({ plaats: e.target.value })} placeholder="Plaats" className={`${veld} sm:col-span-3`} />
              <input value={adres.bewoner} disabled={vergrendeld} onChange={(e) => onChange({ bewoner: e.target.value })} placeholder="Naam bewoner" className={`${veld} col-span-2 sm:col-span-6`} />
              <input value={adres.telefoon} disabled={vergrendeld} onChange={(e) => onChange({ telefoon: e.target.value })} placeholder="Telefoon" inputMode="tel" className={`${veld} col-span-2 sm:col-span-6`} />
            </div>
          </div>
          <textarea value={adres.notitie} disabled={vergrendeld} onChange={(e) => onChange({ notitie: e.target.value })} rows={2} placeholder="Notitie / bijzonderheden" className={`${veld} resize-none`} />
          <div className="flex flex-wrap items-center gap-2">
            <a href={adres.telefoon ? waUrl(adres.telefoon, bericht) : undefined} target="_blank" rel="noopener noreferrer" className={`${knopKlein} ${adres.telefoon ? "" : "pointer-events-none opacity-40"}`}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
            <a href={adres.telefoon ? `tel:${adres.telefoon.replace(/\s/g, "")}` : undefined} className={`${knopKlein} ${adres.telefoon ? "" : "pointer-events-none opacity-40"}`} title="Bellen"><Phone className="h-3.5 w-3.5" /> Bellen</a>
            <label className={`ml-auto flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold ${adres.bevestigd ? "border-green-300 bg-green-50 text-green-700" : "border-ink-200 text-ink-600"} ${vergrendeld ? "opacity-60" : "cursor-pointer"}`}>
              <input type="checkbox" disabled={vergrendeld} checked={adres.bevestigd} onChange={(e) => onChange({ bevestigd: e.target.checked })} className="h-4 w-4 accent-green-600" />
              {BEVESTIGD_LABEL[type]}
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

function AdresEditor({ adressen, type, vergrendeld, magStructuur, selectie, zoek, onSelect, onChange }: { adressen: TauwAdres[]; type: TauwType; vergrendeld: boolean; magStructuur: boolean; selectie: Set<string>; zoek: string; onSelect: (id: string) => void; onChange: (next: TauwAdres[]) => void }) {
  const [verwijderId, setVerwijderId] = useState<string | null>(null);
  const set = (id: string, patch: Partial<TauwAdres>) => onChange(adressen.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const q = zoek.trim().toLowerCase();
  // Filter alleen voor weergave; bewerken/verwijderen werkt op de volledige lijst (via id), nummer blijft stabiel.
  const zichtbaar = adressen.map((a, i) => ({ a, i })).filter(({ a }) => matchtZoek(a, q));
  const teVerwijderen = adressen.find((a) => a.id === verwijderId);
  const verwijderNaam = teVerwijderen ? (`${teVerwijderen.straat} ${teVerwijderen.huisnummer}`.trim() || "dit adres") : "dit adres";
  return (
    <div className="space-y-2">
      {adressen.length === 0 && <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-500">Nog geen adressen. De beheerder leest deze in uit het Excel-bestand.</p>}
      {adressen.length > 0 && zichtbaar.length === 0 && <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-500">Geen adres gevonden voor “{zoek.trim()}”.</p>}
      {zichtbaar.map(({ a, i }) => (
        <TauwAdresKaart key={a.id} adres={a} nr={i + 1} type={type} vergrendeld={vergrendeld} magVerwijderen={magStructuur} geselecteerd={selectie.has(a.id)} onSelect={() => onSelect(a.id)} onChange={(patch) => set(a.id, patch)} onVerwijder={() => setVerwijderId(a.id)} />
      ))}
      {magStructuur && !q && <button type="button" onClick={() => onChange([...adressen, leegAdres()])} className={knopKlein}><Plus className="h-3.5 w-3.5" /> Adres toevoegen</button>}
      <Bevestig
        open={!!verwijderId}
        titel="Adres verwijderen"
        tekst={`Weet je zeker dat je “${verwijderNaam}” uit deze map wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        onBevestig={() => { if (verwijderId) onChange(adressen.filter((x) => x.id !== verwijderId)); setVerwijderId(null); }}
        onAnnuleer={() => setVerwijderId(null)}
      />
    </div>
  );
}

// ── Versie + referentie kiezen (segmented) ──
function TypeKiezer({ waarde, onKies }: { waarde: TauwType; onKies: (t: TauwType) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-ink-200 bg-white p-0.5">
      {TAUW_TYPES.map((t) => (
        <button key={t} type="button" onClick={() => onKies(t)} className={`rounded-md px-3 py-1.5 text-sm font-semibold transition-colors ${waarde === t ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
          {TAUW_TYPE_LABEL[t]}
        </button>
      ))}
    </div>
  );
}

// ── Nieuwe (lege) TAUW-opdracht handmatig ──
function TauwIntake({ type, onKlaar }: { type: TauwType; onKlaar: (id?: string) => void }) {
  const { addTauw } = useApp();
  const [referentie, setReferentie] = useState("");
  const [gekozen, setGekozen] = useState<TauwType>(type);
  const [opdrachtgever, setOpdrachtgever] = useState<TauwOpdrachtgever>("TAUW");
  const [importOpen, setImportOpen] = useState(false);

  const basis = () => ({
    aangemaakt: new Date().toISOString(),
    type: gekozen,
    status: "nieuw" as const,
    regio: "",
    opdrachtgever,
    stappen: [],
  });

  // Zelf invullen: één lege adresregel om mee te beginnen.
  const maakLeeg = () => onKlaar(addTauw({ ...basis(), referentie: referentie.trim(), adressen: [leegAdres()] }));

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <button type="button" onClick={() => onKlaar()} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">Nieuwe opdracht</h2>

      <Card className="space-y-4 p-5">
        {/* Voor wie werk je? */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Voor wie is deze opdracht?</span>
          <div className="flex gap-2">
            {TAUW_OPDRACHTGEVERS.map((o) => (
              <button
                key={o}
                type="button"
                onClick={() => setOpdrachtgever(o)}
                className={`flex-1 rounded-lg border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  opdrachtgever === o ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {o}
              </button>
            ))}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Soort opdracht</span>
          <TypeKiezer waarde={gekozen} onKies={setGekozen} />
          <p className="mt-1.5 text-xs text-ink-500">{gekozen === "bodemonderzoek" ? "Langs de deuren: bewoners spreken en afspraken inplannen." : "Adressen bezoeken — regio bepalen en route plannen over lange afstanden."}</p>
        </div>

        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Referentie / opdrachtnaam <span className="font-normal text-ink-400">(mag leeg)</span></span>
          <input value={referentie} onChange={(e) => setReferentie(e.target.value)} placeholder="bijv. Bodemonderzoek Lindebuurt" className={veld} />
        </label>
      </Card>

      {/* Hierna kies je zelf hoe de adressen erin komen. */}
      <div className="space-y-3">
        <h3 className="text-sm font-bold text-ink-900">Hoe komen de adressen erin?</h3>

        {importOpen ? (
          <BodemImport
            bestaand={[]}
            onAnnuleer={() => setImportOpen(false)}
            onKlaar={(adressen, bestandsnaam) => {
              onKlaar(addTauw({ ...basis(), referentie: referentie.trim() || bestandsnaam.replace(/\.[^.]+$/, ""), adressen: sorteerRoute(adressen) }));
            }}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setImportOpen(true)}
              className="flex w-full items-center gap-3 rounded-2xl border-2 border-dashed border-ink-300 bg-white px-5 py-6 text-left hover:border-brand-400 hover:bg-brand-50/40"
            >
              <span className="rounded-full border border-ink-200 bg-white p-2.5 text-ink-500"><FileUp className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-800">Bestand inlezen</span>
                <span className="block text-xs text-ink-500">Excel of CSV — je wijst zelf aan welke kolom wat is</span>
              </span>
              <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-ink-400" />
            </button>

            <div className="flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-ink-400">
              <span className="h-px flex-1 bg-ink-200" /> of <span className="h-px flex-1 bg-ink-200" />
            </div>

            <button
              type="button"
              onClick={maakLeeg}
              className="flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-left hover:border-brand-300 hover:bg-brand-50/40"
            >
              <span className="rounded-full border border-ink-200 bg-white p-2.5 text-ink-500"><Pencil className="h-5 w-5" /></span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-800">Zelf invullen</span>
                <span className="block text-xs text-ink-500">Begin met een lege lijst en voeg de adressen met de hand toe</span>
              </span>
              <ChevronRight className="ml-auto h-5 w-5 shrink-0 text-ink-400" />
            </button>
          </>
        )}
      </div>

    </div>
  );
}

function TauwDetail({ opdracht, onTerug }: { opdracht: TauwOpdracht; onTerug: () => void }) {
  const { users, currentUser, updateTauw, deleteTauw } = useApp();
  const [verwijder, setVerwijder] = useState(false);
  const [bevestigGereed, setBevestigGereed] = useState(false);
  const [naamBewerken, setNaamBewerken] = useState(false);
  const [naamConcept, setNaamConcept] = useState("");
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";
  const isToegewezen = !!currentUser && (
    currentUser.id === opdracht.toegewezenAan ||
    (opdracht.team ?? []).includes(currentUser.id) ||
    opdracht.adressen.some((a) => a.toegewezenAan === currentUser.id)
  );
  const magWerken = isLeiding || isToegewezen;
  const status = opdracht.status;
  const bewerkbaar = magWerken && (status === "nieuw" || status === "toegewezen");
  const monteur = users.find((u) => u.id === opdracht.toegewezenAan);
  const controleur = users.find((u) => u.id === opdracht.gecontroleerdDoor);

  const [rondeOpen, setRondeOpen] = useState(false); // de gefocuste deur-ronde (bodemonderzoek)
  const [importOpen, setImportOpen] = useState(false); // de import-wizard in een bestaande map
  const [zoek, setZoek] = useState(""); // zoeken op straat/plaats/bewoner binnen de map
  // Selectie van te-lopen adressen → route over de selectie, geordend op looproute-volgorde.
  const [selectie, setSelectie] = useState<Set<string>>(new Set());
  const setAdressen = (next: TauwAdres[]) => {
    updateTauw(opdracht.id, { adressen: next });
    // Verwijder id's van weggevallen adressen uit de selectie (verwijderen/herimport).
    setSelectie((prev) => {
      const ids = new Set(next.map((a) => a.id));
      const opgeschoond = [...prev].filter((id) => ids.has(id));
      return opgeschoond.length === prev.size ? prev : new Set(opgeschoond);
    });
  };
  // Eén adres bijwerken vanuit de deur-ronde. Altijd via de hele lijst, want de sync werkt per onderdeel.
  const patchAdres = (adresId: string, patch: Partial<TauwAdres>) => {
    updateTauw(opdracht.id, {
      adressen: opdracht.adressen.map((a) => (a.id === adresId ? { ...a, ...patch, bijgewerktOp: new Date().toISOString() } : a)),
    });
  };
  // De adressen die deze medewerker zelf moet aflopen, in looproute-volgorde. Is er niets verdeeld, dan
  // pakt de toegewezen medewerker gewoon de hele map.
  const eigenAdressen = sorteerRoute(
    opdracht.adressen.some((a) => a.toegewezenAan)
      ? opdracht.adressen.filter((a) => a.toegewezenAan === currentUser?.id)
      : isToegewezen ? opdracht.adressen : []
  );
  const isBodem = opdracht.type === "bodemonderzoek";
  const bodemVoortgang = voortgangVan(eigenAdressen);

  const eersteMetPostcode = opdracht.adressen.find((a) => a.postcode.trim());
  const bevestigd = opdracht.adressen.filter((a) => a.bevestigd).length;
  const nu = () => new Date().toISOString();
  const werknemerModus = !isLeiding; // de werknemer krijgt een gefocuste werkomgeving
  const magStructuur = isLeiding && bewerkbaar; // adressen toevoegen/verwijderen: alleen de beheerder
  const totaal = opdracht.adressen.length;
  const pct = totaal ? Math.round((bevestigd / totaal) * 100) : 0;
  const teLaat = !!opdracht.deadline && opdracht.deadline < vandaagISO() && status !== "verstuurd";

  const toggleSelect = (id: string) => setSelectie((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  // Select-all werkt op de zichtbare (gefilterde) adressen; bestaande selectie buiten het filter blijft staan.
  const zichtbareAdressen = opdracht.adressen.filter((a) => matchtZoek(a, zoek.trim().toLowerCase()));
  const allesGeselecteerd = zichtbareAdressen.length > 0 && zichtbareAdressen.every((a) => selectie.has(a.id));
  const toggleAlles = () => setSelectie((prev) => {
    const ids = zichtbareAdressen.map((a) => a.id);
    const n = new Set(prev);
    if (ids.every((id) => n.has(id))) ids.forEach((id) => n.delete(id));
    else ids.forEach((id) => n.add(id));
    return n;
  });
  const geselecteerd = sorteerOpRoute(opdracht.adressen.filter((a) => selectie.has(a.id))); // looproute-volgorde
  const selectieAantal = geselecteerd.length; // werkelijk bestaande selectie (geen stale id's)
  const selectieStops = geselecteerd.filter((a) => adresTekst(a)).length;
  const rijUrl = googleMapsRoute(geselecteerd.map(adresTekst), "driving");
  const loopUrl = googleMapsRoute(geselecteerd.map(adresTekst), "walking");

  // Levenscyclus-overgangen (rol-gebonden).
  const toewijzen = (uid: string) => updateTauw(opdracht.id, { toegewezenAan: uid || undefined, status: uid ? "toegewezen" : "nieuw", toegewezenOp: uid ? nu() : undefined });
  const naarControle = () => updateTauw(opdracht.id, { status: "ter_controle" });
  // Heropenen: ruim de (nu ongeldige) goedkeurings-/verstuurgegevens op.
  const terugNaarWerknemer = () => updateTauw(opdracht.id, { status: "toegewezen", gecontroleerdDoor: undefined, gecontroleerdOp: undefined, verstuurdOp: undefined });
  const goedkeuren = () => updateTauw(opdracht.id, { status: "gecontroleerd", gecontroleerdDoor: currentUser?.id, gecontroleerdOp: nu() });
  const doorsturen = () => updateTauw(opdracht.id, { status: "verstuurd", verstuurdOp: nu() });
  const startNaamBewerken = () => { setNaamConcept(opdracht.referentie); setNaamBewerken(true); };
  const slaNaamOp = () => { updateTauw(opdracht.id, { referentie: naamConcept.trim() }); setNaamBewerken(false); };

  const titel = opdracht.referentie || opdracht.regio || "TAUW-opdracht";
  const huidigIndex = TAUW_STATUS_VOLGORDE.indexOf(status);

  // Het adressen-werkblok wordt door beide weergaven (beheerder + werknemer) gebruikt.
  const adressenSectie = (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-900">Adressen <span className="font-normal text-ink-400">· {bevestigd}/{opdracht.adressen.length} {VERZAMEL_LABEL[opdracht.type]}</span></h3>
        {bewerkbaar && (
          <div className="flex flex-wrap items-center gap-2">
            {opdracht.adressen.length > 1 && (
              <button type="button" onClick={() => setAdressen(sorteerOpRoute(opdracht.adressen))} className={knopKlein} title="Adressen op looproute-volgorde zetten"><Footprints className="h-3.5 w-3.5" /> Sorteer op looproute</button>
            )}
            {isLeiding && (
              <button type="button" onClick={() => setImportOpen((v) => !v)} className={knopKlein}>
                <FileUp className="h-3.5 w-3.5" /> {importOpen ? "Import sluiten" : "Adressen inlezen"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* De import-wizard: kolommen zelf toewijzen, alles gecontroleerd, en pas dan in een keer erbij. */}
      {importOpen && isLeiding && (
        <BodemImport
          bestaand={opdracht.adressen}
          onAnnuleer={() => setImportOpen(false)}
          onKlaar={(nieuwe) => {
            // De bestaande lijst blijft heel; de nieuwe adressen komen erbij en alles gaat opnieuw
            // op looproute. Lege placeholder-regels vallen weg.
            setAdressen(sorteerRoute([...opdracht.adressen.filter(heeftInhoud), ...nieuwe]));
            setImportOpen(false);
          }}
        />
      )}

      {/* Zoeken binnen de map (snel naar een straat schakelen) */}
      {opdracht.adressen.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op straat, plaats of bewoner…" aria-label="Zoek adres" className="w-full rounded-lg border border-ink-200 py-2 pl-9 pr-9 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          {zoek && <button type="button" onClick={() => setZoek("")} aria-label="Zoekopdracht wissen" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100"><X className="h-4 w-4" /></button>}
        </div>
      )}

      {/* Selecteer welke adressen je wilt lopen → Maps-route op looproute-volgorde over de selectie */}
      {opdracht.adressen.length > 0 && (
        <div className="rounded-xl border border-ink-200 bg-ink-50 px-3 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
              <input type="checkbox" checked={allesGeselecteerd} ref={(el) => { if (el) el.indeterminate = !allesGeselecteerd && selectieAantal > 0; }} onChange={toggleAlles} className="h-4 w-4 accent-brand-600" aria-label="Alle adressen selecteren" />
              {selectieAantal > 0 ? `${selectieAantal} geselecteerd` : "Selecteer adressen om te lopen"}
            </label>
            <div className="ml-auto flex items-center gap-2">
              <a href={loopUrl ?? undefined} target="_blank" rel="noopener noreferrer" className={`${knopKlein} ${loopUrl ? "" : "pointer-events-none opacity-40"}`}><Footprints className="h-3.5 w-3.5" /> Looproute</a>
              <a href={rijUrl ?? undefined} target="_blank" rel="noopener noreferrer" className={`${knopKlein} ${rijUrl ? "" : "pointer-events-none opacity-40"}`}><Navigation className="h-3.5 w-3.5" /> Rijroute</a>
              {selectieAantal > 0 && <button type="button" onClick={() => setSelectie(new Set())} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-200" title="Selectie wissen"><X className="h-4 w-4" /></button>}
            </div>
          </div>
          {selectieAantal > 1 && <p className="mt-1.5 text-xs text-ink-500">De stops staan op postcode- en straatvolgorde (handig om te lopen); Google Maps herordent ze niet.</p>}
          {selectieStops > MAX_ROUTE_STOPS && <p className="mt-1 text-xs text-amber-600">Google Maps toont max. {MAX_ROUTE_STOPS} stops; selecteer er minder of plan de rest apart.</p>}
        </div>
      )}

      <AdresEditor adressen={opdracht.adressen} type={opdracht.type} vergrendeld={!bewerkbaar} magStructuur={magStructuur} selectie={selectie} zoek={zoek} onSelect={toggleSelect} onChange={setAdressen} />
      {bewerkbaar && <p className="text-xs text-ink-400">Wijzigingen worden automatisch opgeslagen.</p>}
      {!bewerkbaar && magWerken && status !== "verstuurd" && <p className="text-xs text-ink-400">{status === "ter_controle" ? "Vergrendeld zolang de map in controle is." : "Vergrendeld — de map is goedgekeurd en wacht op verzending."} {isLeiding ? "Gebruik “Terug naar werknemer” om te wijzigen." : ""}</p>}
    </Card>
  );

  // Bevestiging vóór "gereed melden" — waarschuwt als er nog adressen openstaan.
  const openA = totaal - bevestigd;
  const gereedDialog = (
    <Bevestig
      open={bevestigGereed}
      titel="Map gereed melden?"
      tekst={openA > 0
        ? `Er ${openA === 1 ? "staat" : "staan"} nog ${openA} adres${openA === 1 ? "" : "sen"} open (nog niet ${VERZAMEL_LABEL[opdracht.type]}). Weet je zeker dat de map gereed is? De beheerder controleert je werk en stuurt het door naar Stedin.`
        : `Alle ${totaal} adressen zijn ${VERZAMEL_LABEL[opdracht.type]}. Weet je zeker dat je de map gereed meldt voor controle? De beheerder controleert je werk en stuurt het door naar Stedin.`}
      bevestigLabel="Ja, gereed melden"
      bevestigTone="brand"
      onBevestig={() => { setBevestigGereed(false); naarControle(); }}
      onAnnuleer={() => setBevestigGereed(false)}
    />
  );

  // ── Gefocuste werkomgeving voor de werknemer: alleen de adressen invullen + gereed melden ──
  // De ronde langs de deuren vult het hele scherm: één adres tegelijk, knoppen onder je duim.
  if (rondeOpen && isBodem) {
    return (
      <DeurRonde
        opdracht={opdracht}
        adressen={eigenAdressen}
        onOpslaan={patchAdres}
        onTerug={() => setRondeOpen(false)}
      />
    );
  }

  // Startblok voor de ronde — verschijnt zodra er adressen aan deze medewerker zijn toegewezen.
  const rondeStart = isBodem && eigenAdressen.length > 0 && (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink-900">Langs de deuren</h3>
          <p className="text-sm text-ink-500">
            {bodemVoortgang.afgerond} van {bodemVoortgang.totaal} adressen gedaan
            {bodemVoortgang.ja > 0 && ` · ${bodemVoortgang.ja} willen erbij zijn`}
            {bodemVoortgang.geenGehoor > 0 && ` · ${bodemVoortgang.geenGehoor}× niemand thuis`}
          </p>
        </div>
        <button type="button" onClick={() => setRondeOpen(true)} className={knopPrimair}>
          <Footprints className="h-4 w-4" />
          {bodemVoortgang.afgerond === 0 ? "Ronde starten" : bodemVoortgang.afgerond >= bodemVoortgang.totaal ? "Ronde nalopen" : "Verder waar je was"}
        </button>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-ink-100">
        <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(bodemVoortgang.afgerond / Math.max(1, bodemVoortgang.totaal)) * 100}%` }} />
      </div>
      {!opdracht.venster?.start && (
        <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Er is nog geen afsprakenperiode ingesteld. Bewoners die erbij willen zijn, kun je nu nog geen moment geven.
        </div>
      )}
    </Card>
  );

  if (werknemerModus) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> Terug naar mijn werk
        </button>

        <Card className="space-y-4 p-5">
          <div className="flex items-start gap-3">
            <div className="rounded-xl bg-brand-50 p-3 text-brand-600"><FlaskConical className="h-6 w-6" /></div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-ink-900">{titel}</h2>
                <Badge tone={STATUS_TONE[status]}>{TAUW_STATUS_LABEL[status]}</Badge>
              </div>
              <p className="text-sm text-ink-500">{[opdracht.opdrachtgever ?? "TAUW", TAUW_TYPE_LABEL[opdracht.type], opdracht.regio, `${totaal} adressen`].filter(Boolean).join(" · ")}</p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs font-medium text-ink-500">
              <span>{bevestigd}/{totaal} {VERZAMEL_LABEL[opdracht.type]}</span>
              <span>{pct}%</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${pct}%` }} /></div>
          </div>

          {opdracht.deadline && (
            <div className="flex items-center gap-2 text-sm">
              <CalendarClock className="h-4 w-4 text-ink-400" />
              <span className="text-ink-600">Deadline: <span className={teLaat ? "font-bold text-red-600" : "font-semibold text-ink-800"}>{datumKort(opdracht.deadline)}{teLaat ? " · te laat" : ""}</span></span>
            </div>
          )}

          <div className="border-t border-ink-100 pt-3">
            {status === "toegewezen" ? (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => setBevestigGereed(true)} className={knopPrimair}><Check className="h-4 w-4" /> Map gereed → naar controle</button>
                <span className="text-sm text-ink-500">Vul per adres datum, tijd en gegevens in en meld de map daarna gereed.</span>
              </div>
            ) : status === "ter_controle" ? (
              <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-700">Ingeleverd voor controle — de beheerder controleert je werk en stuurt het door naar Stedin.</div>
            ) : status === "gecontroleerd" ? (
              <div className="rounded-lg bg-brand-50 px-3 py-2.5 text-sm font-medium text-brand-700">Goedgekeurd — wordt door de beheerder verstuurd naar Stedin.</div>
            ) : (
              <div className="rounded-lg bg-green-50 px-3 py-2.5 text-sm font-medium text-green-700">Verstuurd{opdracht.verstuurdOp ? ` op ${datumKort(opdracht.verstuurdOp)}` : ""} — afgerond. 🎉</div>
            )}
          </div>
        </Card>

        {rondeStart}
        {adressenSectie}
        {gereedDialog}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar TAUW
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {naamBewerken ? (
            <div className="flex flex-wrap items-center gap-2">
              <input value={naamConcept} autoFocus onChange={(e) => setNaamConcept(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") slaNaamOp(); if (e.key === "Escape") setNaamBewerken(false); }} placeholder="Naam van de map" aria-label="Mapnaam" className="w-72 max-w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-xl font-bold text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              <button type="button" onClick={slaNaamOp} className={knopKlein}><Check className="h-3.5 w-3.5" /> Opslaan</button>
              <button type="button" onClick={() => setNaamBewerken(false)} className="text-sm font-medium text-ink-500 hover:text-ink-800">Annuleer</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-ink-900">{titel}</h2>
              {isLeiding && <button type="button" onClick={startNaamBewerken} title="Naam aanpassen" aria-label="Naam aanpassen" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>}
              <Badge tone="slate">{TAUW_TYPE_LABEL[opdracht.type]}</Badge>
              <Badge tone={STATUS_TONE[status]}>{TAUW_STATUS_LABEL[status]}</Badge>
            </div>
          )}
          <p className="text-sm text-ink-500">{[opdracht.regio, `${opdracht.adressen.length} adres${opdracht.adressen.length === 1 ? "" : "sen"}`, monteur ? monteur.naam : ""].filter(Boolean).join(" · ")}</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setVerwijder(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Verwijderen</button>
        )}
      </div>

      {/* Levenscyclus + rol-acties */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {TAUW_STATUS_VOLGORDE.map((s, i) => {
            const gedaan = i < huidigIndex, isNu = i === huidigIndex;
            return (
              <Fragment key={s}>
                <span className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${isNu ? "bg-brand-600 text-white" : gedaan ? "bg-green-100 text-green-700" : "bg-ink-100 text-ink-400"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${isNu ? "bg-white/25 text-white" : gedaan ? "bg-green-500 text-white" : "bg-ink-300 text-white"}`}>{gedaan ? "✓" : i + 1}</span>
                  {TAUW_STATUS_LABEL[s]}
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
              <WerknemerKiezer value={opdracht.toegewezenAan ?? ""} onChange={toewijzen} users={users} leegLabel="Kies werknemer…" />
            </div>
          ) : <p className="text-sm text-ink-500">Nog niet vrijgegeven door de beheerder.</p>)}

          {status === "toegewezen" && (
            <div className="flex flex-wrap items-center gap-2">
              {magWerken ? (
                <button type="button" onClick={() => setBevestigGereed(true)} className={knopPrimair}><Check className="h-4 w-4" /> Map gereed → naar controle</button>
              ) : <p className="text-sm text-ink-500">Wordt afgewerkt door {monteur?.naam ?? "de werknemer"}.</p>}
              {isLeiding && (
                <WerknemerKiezer value={opdracht.toegewezenAan ?? ""} onChange={toewijzen} users={users} leegLabel="Niet toegewezen" />
              )}
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
              <button type="button" onClick={() => void exporteerTauwExcel(opdracht)} className={knopKlein}><FileDown className="h-3.5 w-3.5" /> Excel-planning</button>
              <a href={mailTauwNaarStedin(opdracht)} onClick={doorsturen} className={knopPrimair}><Mail className="h-4 w-4" /> Doorsturen per mail</a>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar werknemer</button>
            </div>
          ) : <p className="text-sm text-ink-500">Goedgekeurd{controleur ? ` door ${controleur.naam}` : ""} — wacht op doorsturen door de beheerder.</p>)}

          {status === "verstuurd" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700"><Check className="h-4 w-4" /> Verstuurd{opdracht.verstuurdOp ? ` op ${datumKort(opdracht.verstuurdOp)}` : ""}.</span>
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
              <div className="w-full sm:w-48"><DatumKiezer value={opdracht.deadline ?? ""} onChange={(iso) => updateTauw(opdracht.id, { deadline: iso || undefined })} placeholder="Geen deadline" /></div>
              {opdracht.deadline && <button type="button" onClick={() => updateTauw(opdracht.id, { deadline: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">wissen</button>}
            </>
          ) : (
            <span className="text-sm font-semibold text-ink-800">{opdracht.deadline ? datumKort(opdracht.deadline) : "nog niet gezet"}</span>
          )}
        </div>
      </Card>

      {/* Regio */}
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <span className="text-sm font-medium text-ink-600">Voor</span>
        <div className="flex gap-1.5">
          {TAUW_OPDRACHTGEVERS.map((og) => (
            <button
              key={og}
              type="button"
              disabled={!bewerkbaar || !isLeiding}
              onClick={() => updateTauw(opdracht.id, { opdrachtgever: og })}
              className={`rounded-lg border-2 px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                (opdracht.opdrachtgever ?? "TAUW") === og ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {og}
            </button>
          ))}
        </div>
        <span className="text-sm font-medium text-ink-600">Regio</span>
        <input value={opdracht.regio} disabled={!bewerkbaar} onChange={(e) => updateTauw(opdracht.id, { regio: e.target.value })} placeholder="Onbekend" className="w-full rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 disabled:bg-ink-50 disabled:text-ink-500 sm:w-40" />
        {bewerkbaar && <button type="button" onClick={() => updateTauw(opdracht.id, { regio: afleidRegio(eersteMetPostcode?.postcode ?? "", eersteMetPostcode?.plaats ?? "") })} className={knopKlein}><Wand2 className="h-3.5 w-3.5" /> Auto uit postcode</button>}
      </Card>

      {/* Bodemonderzoek: eerst de ronde voorbereiden (opdrachtgever, periode, team, verdeling), daarna
          de adressenlijst. Bij een bezoekronde blijft het scherm zoals het was. */}
      {isBodem && (
        <BodemPlanning
          opdracht={opdracht}
          users={users.filter((u) => u.rol === "monteur" || u.werknemer)}
          onWijzig={(patch) => updateTauw(opdracht.id, patch)}
        />
      )}
      {isBodem && (
        <BodemToewijzen
          adressen={opdracht.adressen}
          users={users}
          team={opdracht.team ?? []}
          onWijzig={(next) => updateTauw(opdracht.id, { adressen: next })}
        />
      )}
      {isBodem && <BodemOverzicht opdracht={opdracht} users={users} />}
      {isBodem && <BodemAfspraken opdracht={opdracht} users={users} />}
      {rondeStart}
      {adressenSectie}

      <Bevestig
        open={verwijder}
        titel="TAUW-opdracht verwijderen"
        tekst={`Weet je het zeker dat je "${titel}" wilt verwijderen?`}
        onBevestig={() => { deleteTauw(opdracht.id); setVerwijder(false); onTerug(); }}
        onAnnuleer={() => setVerwijder(false)}
      />
      {gereedDialog}
    </div>
  );
}

// ── Mappen groeperen per werkweek ──
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
// Peildatum voor sortering/groepering: deadline → vroegste adres-datum → aanmaakdatum.
function peildatum(o: TauwOpdracht): string {
  if (o.deadline) return o.deadline;
  const datums = o.adressen.map((a) => a.datum).filter(isISO).sort();
  return datums[0] ?? o.aangemaakt.slice(0, 10);
}
const openAdressen = (o: TauwOpdracht) => o.adressen.filter((a) => !a.bevestigd).length;
const isOpenMap = (o: TauwOpdracht) => o.status !== "verstuurd";

// ── Hoofdcomponent ──
export function Tauw({ initieelTauw }: { initieelTauw?: string }) {
  const { tauwOpdrachten, currentUser } = useApp();
  const [openId, setOpenId] = useState<string | null>(initieelTauw ?? null);
  const [nieuw, setNieuw] = useState(false);
  const [nieuwType] = useState<TauwType>("bodemonderzoek");
  const [ogFilter, setOgFilter] = useState<"alle" | TauwOpdrachtgever>("alle");
  // Importeren zit nu in het aanmaakscherm zelf: één knop "Nieuwe opdracht", en daarbinnen kies je of je
  // een bestand inleest of alles zelf invult.

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  // Een bodemonderzoek wordt over meerdere mensen verdeeld. Je ziet de map dus niet alleen als hij als
  // geheel aan jou is toegewezen, maar ook als je in het team zit of als er adressen op jouw naam staan —
  // anders werken je collega's in een map die jij niet eens ziet.
  const hoortBijMij = (o: TauwOpdracht) =>
    o.toegewezenAan === currentUser.id ||
    (o.team ?? []).includes(currentUser.id) ||
    o.adressen.some((a) => a.toegewezenAan === currentUser.id);
  const metRol = (isLeiding ? tauwOpdrachten : tauwOpdrachten.filter(hoortBijMij)).filter((o) => !o.gearchiveerd);
  const toonOgFilter = new Set(metRol.map((o) => o.opdrachtgever ?? "TAUW")).size > 1;
  const zichtbaar = ogFilter === "alle" ? metRol : metRol.filter((o) => (o.opdrachtgever ?? "TAUW") === ogFilter);

  if (nieuw) return <TauwIntake type={nieuwType} onKlaar={(id) => { setNieuw(false); if (id) setOpenId(id); }} />;

  const open = zichtbaar.find((o) => o.id === openId);
  if (open) return <TauwDetail opdracht={open} onTerug={() => setOpenId(null)} />;

  // Mappen sorteren op werkweek (peildatum) en groeperen, met open-tellingen voor één-oogopslag-overzicht.
  const vandaag = vandaagISO();
  const gesorteerd = [...zichtbaar].sort((a, b) => {
    const oa = isOpenMap(a) ? 0 : 1, ob = isOpenMap(b) ? 0 : 1;
    if (oa !== ob) return oa - ob; // open werk bovenaan
    const pa = peildatum(a), pb = peildatum(b);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return (a.referentie || "").localeCompare(b.referentie || "");
  });
  const weken: { key: string; label: string; maps: typeof zichtbaar }[] = [];
  for (const o of gesorteerd) {
    const wk = weekStartISO(peildatum(o)) || "zonder";
    let groep = weken.find((g) => g.key === wk);
    if (!groep) { groep = { key: wk, label: weekLabel(wk), maps: [] }; weken.push(groep); }
    groep.maps.push(o);
  }
  const totOpenMaps = zichtbaar.filter(isOpenMap).length;
  const totOpenAdr = zichtbaar.filter(isOpenMap).reduce((s, o) => s + openAdressen(o), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">TAUW of Van der Helm</h2>
          <p className="text-sm text-ink-500">Bodemonderzoek en bezoekrondes: adressen erin, langs de deuren, en terug naar de opdrachtgever.</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setNieuw(true)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe opdracht
          </button>
        )}
      </div>

      {/* Filter op opdrachtgever — zodat je in één oogopslag alleen het werk voor TAUW of voor
          Van der Helm ziet. Alleen tonen als er ook echt voor allebei werk ligt. */}
      {toonOgFilter && (
        <div className="flex flex-wrap gap-1.5">
          {(["alle", ...TAUW_OPDRACHTGEVERS] as const).map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => setOgFilter(o)}
              className={`rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${
                ogFilter === o ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
              }`}
            >
              {o === "alle" ? "Alles" : o}
              <span className={ogFilter === o ? "ml-1.5 text-white/80" : "ml-1.5 text-ink-400"}>
                {o === "alle" ? metRol.length : metRol.filter((x) => (x.opdrachtgever ?? "TAUW") === o).length}
              </span>
            </button>
          ))}
        </div>
      )}


      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <FlaskConical className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">
            {isLeiding ? "Nog geen opdrachten. Klik op " : "Geen opdrachten aan jou toegewezen."}
            {isLeiding && <span className="font-semibold">Nieuwe opdracht</span>}
            {isLeiding && "."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Eén-oogopslag-samenvatting van wat er openstaat */}
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{totOpenMaps}</div>
              <div className="text-xs text-ink-500">{totOpenMaps === 1 ? "map open" : "mappen open"}</div>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{totOpenAdr}</div>
              <div className="text-xs text-ink-500">adressen te doen</div>
            </div>
          </div>

          {weken.map((g) => {
            const openInWeek = g.maps.filter(isOpenMap).length;
            return (
              <div key={g.key}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-700">{g.label}</h3>
                  <span className="text-xs font-medium text-ink-500">{openInWeek} open · {g.maps.length} {g.maps.length === 1 ? "map" : "mappen"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {g.maps.map((o) => {
                    const totaalA = o.adressen.length;
                    const klaarA = o.adressen.filter((a) => a.bevestigd).length;
                    const openA = totaalA - klaarA;
                    const teLaat = !!o.deadline && o.deadline < vandaag && o.status !== "verstuurd";
                    const titel = o.referentie || o.regio || "Opdracht";
                    return (
                      <div key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-card transition-shadow hover:shadow-cardhover">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><FlaskConical className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-ink-900">{titel}</div>
                            <div className="truncate text-xs text-ink-500">{[o.opdrachtgever ?? "TAUW", TAUW_TYPE_LABEL[o.type], o.regio, `${o.adressen.length} adressen`].filter(Boolean).join(" · ")}</div>
                          </div>
                          <Badge tone={STATUS_TONE[o.status]}>{TAUW_STATUS_LABEL[o.status]}</Badge>
                          <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                          <span className="text-ink-500">{klaarA}/{totaalA} {VERZAMEL_LABEL[o.type]}{o.status !== "verstuurd" ? ` · ${openA} open` : ""}</span>
                          {o.deadline && <span className={`inline-flex items-center gap-1 font-semibold ${teLaat ? "text-red-600" : "text-ink-500"}`}><CalendarClock className="h-3.5 w-3.5" /> {teLaat ? "Te laat" : datumKort(o.deadline)}</span>}
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${totaalA ? Math.round((klaarA / totaalA) * 100) : 0}%` }} />
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

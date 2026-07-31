import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ArrowLeft, ListPlus, Users, StickyNote, FileCheck2,
  Loader2, AlertTriangle, CalendarCheck, ChevronRight, FileSpreadsheet, FileText, ShieldAlert, ClipboardList,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { SaneerWerklijst, WerklijstZeef, type Beeld } from "./SaneerWerklijst";
import { SaneerImport } from "./SaneerImport";
import { SaneerVerdelen, SaneerClusterWerk } from "./SaneerCluster";
import { haalDossier, STATUS_INFO, type Dossier, type DossierDetail } from "../lib/saneerflow";
import {
  haalFlowAdressen, haalTaken, vinkTaak, rondDossierAf,
  haalExport, type FlowAdres, type Taak,
} from "../lib/saneerflowWerk";
import { exporteerSaneerExcel, exporteerSaneerPdf } from "../lib/saneerflowExport";
import { maakChecklists } from "../lib/saneerChecklist";

// Saneren — één dossier, stap voor stap.
// ─────────────────────────────────────────────────────────────────────────────
// Dezelfde opbouw als bij bodemonderzoek: één ding per scherm, niets op slot. Maar de stappen zijn
// wezenlijk anders, want hier gaat het niet om losse afspraken maar om één datum die voor een hele
// groep moet gelden. Vandaar de stap "Bellen" (adressen waar al een nummer van bekend is hoeven niet
// langs) en de stap "Poster" (die moet binnen twee weken na de afspraak in het gebouw hangen).

// Wat er náást de werklijst nog te doen is. Dit zijn geen stappen meer maar zijpaden: dingen die
// je één keer per dossier doet, aan een bureau. Het werk zelf — de adressen — is de pagina.
//
// Er stond hier eerst een stappenbalk van zes blokken met een tabbalk erboven en een kop eronder.
// Vier regels beeldscherm voordat je één adres zag, en op een telefoon was dat de halve pagina. En
// erger: "Langs de deur" en "Bellen" waren aparte stappen, terwijl het hetzelfde adres is — vul je
// aan de deur een nummer in, dan schoof het onder je handen naar een andere pagina.
type StapKey = "inlezen" | "verdelen" | "poster" | "afronden" | "afboeken";

const EXTRAS: { key: StapKey; titel: string; Icon: typeof ListPlus }[] = [
  { key: "inlezen",  titel: "Inlezen",  Icon: ListPlus },
  { key: "verdelen", titel: "Verdelen", Icon: Users },
  { key: "poster",   titel: "Poster",   Icon: StickyNote },
  { key: "afronden", titel: "Afronden", Icon: FileCheck2 },
  { key: "afboeken", titel: "Afboeken", Icon: FileCheck2 },
];
const knop = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";
const knop2 = knop;
const KLEUR: Record<string, string> = {
  green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", slate: "bg-ink-100 text-ink-600", brand: "bg-brand-100 text-brand-800",
};
// Een lege stap: vertel wat er moet gebeuren en zet de knop ernaartoe klaar. Een grijze regel tekst
// laat iemand raden of er iets stuk is.
function Leeg({ Icon, titel, tekst, knop, onKlik }: {
  Icon: typeof ListPlus; titel: string; tekst: string; knop?: string; onKlik?: () => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-12 text-center">
      <span className="mx-auto inline-flex rounded-full bg-brand-50 p-4 text-brand-500"><Icon className="h-7 w-7" /></span>
      <h4 className="mt-3 text-base font-bold text-ink-900">{titel}</h4>
      <p className="mx-auto mt-1 max-w-md text-sm text-ink-500">{tekst}</p>
      {knop && onKlik && (
        <button type="button" onClick={onKlik} className={`${knop2} mt-4 bg-brand-600 text-white hover:bg-brand-700`}>
          {knop} <ChevronRight className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

const dagNL = (iso: string) => {
  if (!iso || iso === "—") return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};
const kortNL = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().map(Number).join("-") : "");

export function SaneerFlow({ pd, onTerug }: { pd: string; onTerug: () => void }) {
  const { users, currentUser } = useApp();
  const [detail, setDetail] = useState<DossierDetail | null>(null);
  const [adressen, setAdressen] = useState<FlowAdres[]>([]);
  const [taken, setTaken] = useState<Taak[]>([]);
  const [laden, setLaden] = useState(true);
  const [cluster, setCluster] = useState<string | null>(null);
  const [stap, setStap] = useState<StapKey | null>(null);
  // De zeef staat in de kop maar hoort bij de lijst, dus de stand ervan woont hier — dan blijft hij
  // ook staan als je even een zijpad in duikt en terugkomt.
  const [beeld, setBeeld] = useState<Beeld>("deur");
  const [zoek, setZoek] = useState("");

  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";
  const veldwerkers = useMemo(() => users.filter((u) => u.rol === "monteur" || u.werknemer), [users]);
  const naamVan = useCallback((id?: string | null) => users.find((u) => u.id === id)?.naam ?? "—", [users]);

  const laad = useCallback(async () => {
    const [d, a, t] = await Promise.all([haalDossier(pd), haalFlowAdressen(pd), haalTaken(pd)]);
    setDetail(d); setAdressen(a.adressen); setTaken(t);
    setLaden(false);
  }, [pd]);
  useEffect(() => { void laad(); }, [laad]);

  const clusters = detail?.clusters ?? [];
  const verdeeld = clusters.filter((k) => k.toegewezen_aan).length;
  const openTaken = taken.filter((t) => !t.afgevinkt_op).length;

  // Wanneer is een stap af? Puur informatief — je mag altijd overal heen.
  const af: Record<StapKey, boolean> = {
    inlezen: adressen.length > 0,
    verdelen: clusters.length > 0 && verdeeld === clusters.length,
    poster: taken.length > 0 && openTaken === 0,
    afronden: detail?.dossier.status === "afgerond" || detail?.dossier.status === "afgeboekt",
    afboeken: detail?.dossier.status === "afgeboekt",
  };

  // Geen stap is het gewone geval: dan zie je de werklijst. Een zijpad kies je bewust, en met de
  // kruisknop ben je zo weer terug bij de adressen.
  const actief = stap;


  if (laden) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Bezig met ophalen…</div>;
  if (!detail) return (
    <div className="space-y-3">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Terug</button>
      <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Dit dossier is niet (meer) beschikbaar.</p>
    </div>
  );

  const dossier = detail.dossier;

  // Een medewerker die geen leiding is, hoort niet in de beheerstappen maar meteen bij zijn groepen.
  if (!isLeiding) {
    const mijn = clusters.filter((k) => k.toegewezen_aan);
    if (cluster) return <SaneerClusterWerk clusterId={cluster} onTerug={() => { setCluster(null); void laad(); }} />;
    return (
      <div className="space-y-4">
        <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700"><ArrowLeft className="h-4 w-4" /> Alle dossiers</button>
        <div>
          <h2 className="text-xl font-bold text-ink-900">{dossier.pd_nummer}</h2>
          <p className="text-sm text-ink-500">{[dossier.opdrachtgever, dossier.gebouw].filter(Boolean).join(" · ")}</p>
        </div>
        {mijn.length === 0 ? (
          <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">Er is nog geen groep aan jou toegewezen.</p>
        ) : mijn.map((k) => (
          <button key={k.id} type="button" onClick={() => setCluster(k.id)}
            className="flex w-full items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-4 text-left hover:bg-ink-50">
            <span className="min-w-0">
              <span className="block truncate font-semibold text-ink-900">{k.naam || k.postcode}</span>
              <span className="block text-xs text-ink-500">{k.adressen} adressen{k.definitieve_datum ? ` · ${kortNL(k.definitieve_datum)}` : " · nog geen datum"}</span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-ink-400" />
          </button>
        ))}
      </div>
    );
  }

  // Staat er een groep open, dan is dat het scherm. Geen stappenbalk en geen dossierkop erboven: aan
  // de deur wil je het adres meteen zien, niet na 450 pixels scrollen.
  if (cluster) return <SaneerClusterWerk clusterId={cluster} onTerug={() => { setCluster(null); void laad(); }} />;

  return (
    // De scrollende kolom heeft zelf p-4 (md:p-6). Die trekken we hier één keer weg, zodat de kop
    // aan de bovenkant van die kolom begint en niets meer hoeft te compenseren. De inhoud eronder
    // krijgt de ruimte gewoon terug.
    //
    // Waarom niet met een negatieve marge óp de kop zelf, zoals eerst: een vastgezet element met een
    // negatieve marge in een scrollende kolom mét padding gaat op twee plekken tegelijk rekenen — in
    // rust staat hij ergens anders dan wanneer hij blijft plakken. Dat was het gat.
    <div className="-mx-4 -mt-4 md:-mx-6 md:-mt-6">
      {/* De kop blijft staan als je scrollt. Dit is een dossier waar je heen en weer in springt —
          van de bellijst naar een groep en terug — en dan wil je niet steeds omhoog moeten.

          Let op de maten: de pagina eromheen heeft p-4, en vanaf md p-6. De kop trekt zichzelf met
          negatieve marges precies zo ver op, anders blijft er een strook paginarand over waar de
          inhoud doorheen scrollt. Die stond op -mt-4 terwijl een laptop 24 px ruimte heeft; die
          8 px was het gat. De achtergrond is bovendien dekkend — met bg-white/95 en een waas zie je
          de kaarten er gewoon doorheen komen. */}
      {/* Kop en zeef zijn één blok dat blijft staan. Stonden ze los, dan schoof de zeef bij het
          scrollen onder de kop door en zag je hem half — dat was precies wat er niet klopte.

          De titel, de regel eronder en de zijpaden hangen alle drie aan hetzelfde raster: de
          terugpijl links, en daarnaast één kolom. Zo staat het PD-nummer altijd exact onder het
          gebouw, ook als de naam lang is of de knop van maat verandert. */}
      {/* De witte strook loopt door tot boven de kop. De pagina zit in een scrollende kolom met eigen
          padding, en hoe die padding en een vastgezette kop op elkaar uitkomen verschilt per browser
          — dat gaf een grijs randje tussen de Saneren-balk en deze kop. Dit dekt die strook af, in
          rust én tijdens het scrollen, zonder van die maten afhankelijk te zijn. */}
      <div className="sticky top-0 z-20 space-y-3 border-b border-ink-200 bg-white px-4 pb-3 pt-4 shadow-sm before:pointer-events-none before:absolute before:inset-x-0 before:bottom-full before:h-10 before:bg-white md:px-6 md:pt-6">
        <div className="flex items-start gap-2">
          <button type="button" onClick={onTerug} title="Terug naar alle saneringen" aria-label="Terug naar alle saneringen"
            className="-ml-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-ink-800">
            <ArrowLeft className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
              {/* De plek staat groot, het PD-nummer klein eronder. Je herkent een klus aan het
                  gebouw, niet aan elf cijfers — die heb je pas nodig als je gaat afboeken. */}
              <h2 className="min-w-0 truncate text-xl font-bold leading-7 text-ink-900">{dossier.gebouw || dossier.omschrijving || dossier.pd_nummer}</h2>
              <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold ${KLEUR[STATUS_INFO[dossier.status]?.kleur ?? "slate"]}`}>
                {STATUS_INFO[dossier.status]?.label}
              </span>
            </div>
            <p className="mt-0.5 truncate text-xs text-ink-500">
              <span className="font-mono">{dossier.pd_nummer}</span>
              {[dossier.opdrachtgever, dossier.regio].filter(Boolean).map((t) => ` · ${t}`).join("")}
              {dossier.uitvoering_van && ` · uitvoering ${kortNL(dossier.uitvoering_van)}`}
            </p>
          </div>

          {/* De zijpaden: klein en rechts, want je komt hier voor de adressen. */}
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            {EXTRAS.map((x) => (
              <button key={x.key} type="button" onClick={() => { setStap(actief === x.key ? null : x.key); setCluster(null); }}
                title={x.titel}
                className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                  actief === x.key ? "bg-brand-600 text-white" : "text-ink-500 hover:bg-ink-100 hover:text-ink-800"}`}>
                <x.Icon className="h-3.5 w-3.5" />
                <span className="hidden lg:inline">{x.titel}</span>
                {af[x.key] && actief !== x.key && <Check className="h-3 w-3 text-green-500" />}
              </button>
            ))}
          </div>
        </div>

        {/* De zeef hoort bij de kop: hij blijft staan terwijl je door 52 adressen scrollt. */}
        {!actief && adressen.length > 0 && (
          <WerklijstZeef adressen={adressen} beeld={beeld} setBeeld={setBeeld} zoek={zoek} setZoek={setZoek} />
        )}
      </div>

      {/* Wat lucht tussen de kop en het eerste adres. Zonder die ruimte plakt de eerste kaart tegen
          de balk aan en lijkt hij erbij te horen. */}
      <div className="space-y-4 p-4 pt-7 md:p-6 md:pt-9">
      {/* Zonder zijpad zie je waar je voor komt: de adressen. */}
      {!actief && (
        adressen.length === 0
          ? <Leeg Icon={ListPlus} titel="Nog geen adressen"
              tekst="Lees eerst het adressenbestand van de opdrachtgever in. De app haalt daar de adressen en de telefoonnummers uit, en zet de rest apart zodat je weet waar je langs moet."
              knop="Bestand inlezen" onKlik={() => setStap("inlezen")} />
          : <SaneerWerklijst adressen={adressen} clusters={clusters} naamVan={naamVan} onWijzig={() => void laad()} beeld={beeld} setBeeld={setBeeld} zoek={zoek} />
      )}

      {actief === "inlezen" && <SaneerImport dossier={dossier} aantalNu={adressen.length} onKlaar={() => void laad()} />}

      {actief === "verdelen" && (
        adressen.length === 0
          ? <Leeg Icon={ListPlus} titel="Nog geen adressen" tekst="Lees eerst het bestand van de opdrachtgever in bij stap 1. Daarna maakt de app hier vanzelf groepen op postcode." knop="Naar Inlezen" onKlik={() => setStap("inlezen")} />
          : <SaneerVerdelen dossier={dossier} adressen={adressen} clusters={clusters} veldwerkers={veldwerkers} naamVan={naamVan} onWijzig={() => void laad()} />
      )}

      {actief === "poster" && <Posters taken={taken} naamVan={naamVan} onWijzig={() => void laad()} />}
      {actief === "afronden" && <Afronden dossier={dossier} clusters={clusters} adressen={adressen} taken={taken} onWijzig={() => void laad()} />}

      {actief === "afboeken" && (
        dossier.status === "afgerond" || dossier.status === "afgeboekt"
          ? <Afboeken dossier={dossier} onWijzig={() => void laad()} />
          : <Leeg Icon={FileCheck2} titel="Het werk is nog niet afgerond"
              tekst="Afboeken kan pas als de afspraken staan en het dossier is afgerond. Dat doe je bij Afronden."
              knop="Naar Afronden" onKlik={() => setStap("afronden")} />
      )}
      </div>
    </div>
  );
}


// ── Poster ──
// De taak ontstaat vanzelf zodra een groep een datum heeft. Ophangen moet binnen twee weken ná die
// afspraak — en nooit later dan de dag vóór de uitvoering, want daarna kondigt hij niets meer aan.
// De herinnering hiervoor komt als pop-up over het scherm heen; zie PosterHerinnering.
function Posters({ taken, naamVan, onWijzig }: { taken: Taak[]; naamVan: (id?: string | null) => string; onWijzig: () => void }) {
  const [bezig, setBezig] = useState("");
  const vandaag = new Date().toISOString().slice(0, 10);

  if (taken.length === 0) return <Leeg Icon={StickyNote} titel="Nog geen poster nodig" tekst="Zodra met een groep een dag is afgesproken, verschijnt hier vanzelf de taak om de aankondiging op te hangen — met een herinnering die blijft komen tot hij hangt." />;

  return (
    <div className="space-y-2">
      {taken.map((t) => {
        const teLaat = !t.afgevinkt_op && t.deadline && t.deadline < vandaag;
        return (
          <div key={t.id} className={`rounded-2xl border p-4 ${teLaat ? "border-red-300 bg-red-50" : t.afgevinkt_op ? "border-green-200 bg-green-50" : "border-ink-200 bg-white"}`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-ink-900">{t.cluster_naam || "Groep"}</div>
                <div className="text-xs text-ink-500">
                  Uitvoering {kortNL(t.definitieve_datum ?? "")} · ophangen vóór {kortNL(t.deadline)}
                </div>
              </div>
              {teLaat && <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.red}`}><ShieldAlert className="h-3.5 w-3.5" /> te laat</span>}
            </div>
            {t.afgevinkt_op ? (
              <p className="mt-2 flex items-center gap-1.5 text-sm font-semibold text-green-800">
                <CalendarCheck className="h-4 w-4" /> Opgehangen op {kortNL(t.afgevinkt_op)} door {naamVan(t.afgevinkt_door) !== "—" ? naamVan(t.afgevinkt_door) : t.afgevinkt_door}
              </p>
            ) : (
              <button type="button" disabled={bezig === t.id}
                onClick={async () => { setBezig(t.id); await vinkTaak(t.id); setBezig(""); onWijzig(); }}
                className={`${knop} mt-3 bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-60`}>
                {bezig === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Poster opgehangen
              </button>
            )}
            {t.notitie && <p className="mt-2 text-xs text-ink-500">{t.notitie}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ── Afronden en afboeken ──
// De knop is geen meningsuiting: de server rekent na of alles echt klaar is en weigert anders. Wat er
// nog openstaat, staat er letterlijk bij.
// ── Afboeken — het sluitstuk aan het bureau ──
// Eén knop, en met opzet niet meer dan dat. Dit is het moment waarop het dossier van "ons werk"
// naar "klaar voor Stedin" gaat: daarna kan de facturatie erop en staat hij in het archief.
function Afboeken({ dossier, onWijzig }: { dossier: Dossier; onWijzig: () => void }) {
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  async function afboeken() {
    setBezig(true); setFout("");
    const r = await rondDossierAf(dossier.pd_nummer, { afboeken: true });
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Mislukt."); return; }
    onWijzig();
  }

  if (dossier.status === "afgeboekt") {
    return (
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green-50 text-green-600"><Check className="h-6 w-6" /></span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink-900">Afgeboekt op {dossier.pd_nummer}</h3>
            <p className="text-sm text-ink-500">
              Op {kortNL(dossier.afgeboekt_op)} afgeboekt. Het dossier staat in het archief en is alleen-lezen.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-ink-200 bg-white p-6">
        <h3 className="text-base font-bold text-ink-900">Klaar om af te boeken</h3>
        <p className="mt-1 text-sm text-ink-600">
          Het werk is afgerond, dus het dossier staat nu bij <span className="font-semibold text-ink-800">Klaar voor Stedin</span>.
          Boek het af op het PD-nummer zodra de facturatie eroverheen is; daarna is het afgehandeld en gaat het naar het archief.
        </p>
        <button type="button" onClick={() => void afboeken()} disabled={bezig}
          className={`${knop} mt-4 w-full bg-ink-800 py-3.5 text-base text-white hover:bg-ink-900 disabled:opacity-60 sm:w-auto`}>
          {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileCheck2 className="h-5 w-5" />} Afboeken op {dossier.pd_nummer}
        </button>
      </div>
      {fout && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fout}</p>}
    </div>
  );
}

function Afronden({ dossier, clusters, adressen, taken, onWijzig }: {
  dossier: Dossier;
  clusters: DossierDetail["clusters"];
  adressen: FlowAdres[];
  taken: Taak[];
  onWijzig: () => void;
}) {
  const [bezig, setBezig] = useState("");
  const [fout, setFout] = useState("");

  const zonderDatum = clusters.filter((k) => !k.definitieve_datum);
  const zonderNummer = adressen.filter((a) => !a.telefoon.trim() && a.belstatus !== "weigert");

  // Per uitvoeringsdag, want zo wordt het gereden. Zonder dag komt onderaan te staan.
  const datumVan = (a: FlowAdres) => clusters.find((k) => k.id === a.cluster_id)?.definitieve_datum || "—";
  const perDag = [...adressen.reduce((m, a) => {
    const d = datumVan(a);
    if (!m.has(d)) m.set(d, []);
    m.get(d)!.push(a);
    return m;
  }, new Map<string, FlowAdres[]>())].sort((x, y) => (x[0] === "—" ? 1 : y[0] === "—" ? -1 : x[0].localeCompare(y[0])));
  const openTaken = taken.filter((t) => !t.afgevinkt_op);
  const klaar = clusters.length > 0 && zonderDatum.length === 0 && openTaken.length === 0 && zonderNummer.length === 0;

  async function doe(soort: "afronden") {
    setBezig(soort); setFout("");
    const r = await rondDossierAf(dossier.pd_nummer, { afboeken: false });
    setBezig("");
    if (!r.ok) { setFout(r.fout ?? "Mislukt."); return; }
    onWijzig();
  }

  // De Checklist M&A Saneren: het papieren formulier dat de schouwer invult, met de adressen en
  // telefoonnummers er al in. Eén per groep, want een groep is één postcode en dus één gebouw.
  async function checklists() {
    setBezig("checklist"); setFout("");
    const groepen = clusters
      .map((k) => ({ cluster: k as unknown as Parameters<typeof maakChecklists>[1][number]["cluster"], adressen: adressen.filter((a) => a.cluster_id === k.id) }))
      .filter((g) => g.adressen.length > 0);
    const r = await maakChecklists(dossier, groepen);
    setBezig("");
    if (!r.ok) setFout(r.fout ?? "De checklists konden niet gemaakt worden.");
  }

  async function exporteer(soort: "xlsx" | "pdf") {
    setBezig(soort); setFout("");
    const data = await haalExport(dossier.pd_nummer);
    if (!data) { setBezig(""); setFout("Ophalen van de gegevens mislukte."); return; }
    if (soort === "xlsx") await exporteerSaneerExcel(data); else exporteerSaneerPdf(data);
    setBezig("");
  }

  return (
    <div className="space-y-4">
      <div className={`rounded-2xl border p-4 ${klaar ? "border-green-300 bg-green-50" : "border-amber-200 bg-amber-50"}`}>
        <div className="flex items-center gap-2 font-bold text-ink-900">
          {klaar ? <Check className="h-5 w-5 text-green-600" /> : <AlertTriangle className="h-5 w-5 text-amber-600" />}
          {klaar ? "Alles staat klaar" : "Er staat nog werk open"}
        </div>
        <ul className="mt-2 space-y-1 text-sm text-ink-700">
          <li>{clusters.length} groepen, {clusters.length - zonderDatum.length} met een definitieve datum</li>
          {zonderDatum.length > 0 && <li className="text-amber-800">{zonderDatum.map((k) => k.naam || k.postcode).join(", ")} — nog geen datum</li>}
          {openTaken.length > 0 && <li className="text-amber-800">{openTaken.length} poster(s) nog niet opgehangen</li>}
          {zonderNummer.length > 0 && (
            <li className="text-amber-800">
              Van {zonderNummer.length} {zonderNummer.length === 1 ? "adres" : "adressen"} is geen telefoonnummer bekend —
              daar is niemand te bereiken als de dag verschuift
            </li>
          )}
        </ul>
      </div>

      {/* ── De lijst waar het om draait ──
          Per adres: wie er woont, op welk nummer je hem bereikt en wanneer de werkzaamheden zijn.
          Dat is wat je aan de opdrachtgever laat zien en wat de ploeg meeneemt. Gegroepeerd per dag,
          want zo wordt het uitgevoerd — en een adres zonder nummer of zonder dag springt eruit. */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 px-4 py-3">
          <h4 className="text-sm font-bold text-ink-900">Alle adressen</h4>
          <span className="text-xs text-ink-500">{adressen.length} adressen · {adressen.filter((a) => a.telefoon.trim()).length} met nummer</span>
        </div>
        {perDag.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-ink-500">Nog geen adressen.</p>
        ) : perDag.map(([dag, lijst]) => (
          <div key={dag}>
            <div className="flex items-center justify-between gap-2 bg-ink-50/70 px-4 py-2">
              <span className="text-sm font-bold text-ink-800">
                {dag === "—" ? "Nog geen dag afgesproken" : `Uitvoering ${dagNL(dag)}`}
              </span>
              <span className="text-xs text-ink-500">{lijst.length} {lijst.length === 1 ? "adres" : "adressen"}</span>
            </div>
            <div className="divide-y divide-ink-50">
              {lijst.map((a) => (
                <div key={a.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">
                      {`${a.straat} ${a.huisnummer}${a.toevoeging}`.replace(/\s+/g, " ").trim()}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      {a.postcode} {a.plaats}{a.bewoner ? ` · ${a.bewoner}` : ""}
                    </span>
                  </span>
                  {a.telefoon.trim() ? (
                    <a href={`tel:${a.telefoon}`} className="shrink-0 font-mono text-sm font-semibold text-green-700">{a.telefoon}</a>
                  ) : (
                    <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">geen nummer</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void exporteer("xlsx")} disabled={!!bezig} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
          {bezig === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
        </button>
        <button type="button" onClick={() => void exporteer("pdf")} disabled={!!bezig} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
          {bezig === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} Uitvoeringslijst (PDF)
        </button>
        <button type="button" onClick={() => void checklists()} disabled={!!bezig || adressen.length === 0} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
          {bezig === "checklist" ? <Loader2 className="h-4 w-4 animate-spin" /> : <ClipboardList className="h-4 w-4" />} Checklists schouwer
        </button>
      </div>

      {fout && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fout}</p>}

      {/* Hier houdt het werk op. Het afboeken op het PD-nummer staat op de andere pagina, bij de
          afhandeling — dat is kantoorwerk en het is het moment waarop de facturatie erop kan. */}
      {dossier.status === "afgeboekt" ? (
        <p className="rounded-xl bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700">
          Dit dossier is afgeboekt op {kortNL(dossier.afgeboekt_op)}. Alleen-lezen.
        </p>
      ) : dossier.status === "afgerond" ? (
        <p className="rounded-xl bg-green-50 px-4 py-3 text-sm font-semibold text-green-800">
          Het werk is afgerond. Het kantoor boekt het dossier af op {dossier.pd_nummer} — dat staat bij Afhandeling.
        </p>
      ) : (
        <button type="button" onClick={() => void doe("afronden")} disabled={!!bezig} className={`${knop} w-full bg-brand-600 py-3.5 text-base text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto`}>
          {bezig === "afronden" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileCheck2 className="h-5 w-5" />} Dossier afronden
        </button>
      )}
    </div>
  );
}

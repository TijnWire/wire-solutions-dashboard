import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ArrowLeft, ListPlus, Users, Footprints, PhoneCall, StickyNote, FileCheck2,
  Loader2, AlertTriangle, CalendarCheck, ChevronRight, FileSpreadsheet, FileText, ShieldAlert, ClipboardList,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { SaneerImport } from "./SaneerImport";
import { SaneerVerdelen, SaneerClusterWerk } from "./SaneerCluster";
import { haalDossier, STATUS_INFO, type Dossier, type DossierDetail } from "../lib/saneerflow";
import {
  haalFlowAdressen, haalBellijst, haalTaken, vinkTaak, wijzigFlowAdres, rondDossierAf,
  haalExport, BELSTATUS_INFO, type FlowAdres, type Taak,
} from "../lib/saneerflowWerk";
import { exporteerSaneerExcel, exporteerSaneerPdf } from "../lib/saneerflowExport";
import { maakChecklists } from "../lib/saneerChecklist";

// Saneren — één dossier, stap voor stap.
// ─────────────────────────────────────────────────────────────────────────────
// Dezelfde opbouw als bij bodemonderzoek: één ding per scherm, niets op slot. Maar de stappen zijn
// wezenlijk anders, want hier gaat het niet om losse afspraken maar om één datum die voor een hele
// groep moet gelden. Vandaar de stap "Bellen" (adressen waar al een nummer van bekend is hoeven niet
// langs) en de stap "Poster" (die moet binnen twee weken na de afspraak in het gebouw hangen).

type StapKey = "inlezen" | "verdelen" | "afboeken" | "deur" | "bellen" | "poster" | "afronden";

// De stappen vallen in twee helften, en dat is precies hoe het werk ook loopt:
//
//   BEHEER      het bestand inlezen en het werk verdelen. Doe je één keer, achter een bureau.
//   UITVOERING  wat de medewerker de hele week doet. Twee lijsten die elkaar aanvullen:
//               zonder telefoonnummer moet je langs de deur; mét nummer kun je bellen.
//               Haal je aan de deur een nummer op, dan schuift dat adres vanzelf naar Bellen.
// De volgorde hieronder is de volgorde in de tijd. De nummers tellen per pagina, want elke pagina is
// een eigen rijtje van begin tot eind — "stap 5 van 6" zei niets meer zodra je maar de helft ziet.
const STAPPEN: { key: StapKey; nr: number; titel: string; uitleg: string; groep: "beheer" | "werk"; Icon: typeof ListPlus }[] = [
  { key: "inlezen",  nr: 1, titel: "Inlezen",       uitleg: "Adressenbestand van de opdrachtgever", groep: "beheer", Icon: ListPlus },
  { key: "verdelen", nr: 2, titel: "Verdelen",      uitleg: "Groepen op postcode, naar één medewerker", groep: "beheer", Icon: Users },
  { key: "deur",     nr: 1, titel: "Langs de deur", uitleg: "Geen telefoonnummer bekend — hier moet iemand naartoe", groep: "werk", Icon: Footprints },
  { key: "bellen",   nr: 2, titel: "Bellen",        uitleg: "Nummer bekend — hier maak je de afspraak", groep: "werk", Icon: PhoneCall },
  // Afronden komt direct na het bellen: zodra de afspraken staan wil je de lijst zien en controleren.
  // De poster volgt daarna — die hangt pas ná de afspraak, dus dat is ook in de tijd de laatste stap.
  { key: "afronden", nr: 3, titel: "Afronden",      uitleg: "De lijst met adressen, nummers en de dag", groep: "werk", Icon: FileCheck2 },
  { key: "poster",   nr: 4, titel: "Poster",        uitleg: "Binnen twee weken na de afspraak in het gebouw", groep: "werk", Icon: StickyNote },
  // Het sluitstuk, en het enige wat ná het werk nog aan een bureau gebeurt: afboeken op het
  // PD-nummer. Daarna staat het dossier bij Klaar voor Stedin en kan de facturatie erop.
  { key: "afboeken", nr: 3, titel: "Afboeken",      uitleg: "Op het PD-nummer — daarmee is het dossier afgehandeld", groep: "beheer", Icon: FileCheck2 },
];
const GROEP_LABEL: Record<"beheer" | "werk", string> = { beheer: "Afhandeling", werk: "Het werk" };
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
  // Twee soorten werk, en ze hoorden niet in één balk. Afhandeling is van het kantoor: het bestand
  // inlezen, het werk verdelen, en aan het eind afboeken op het PD-nummer. Het werk is van degene die
  // de wijk in gaat. Zes stappen door elkaar dwongen iedereen om eerst uit te zoeken welke van hem
  // waren. Nu kies je één keer je kant en zie je alleen nog jouw rijtje.
  const [deel, setDeel] = useState<"werk" | "afhandeling" | null>(null);

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
  // De twee lijsten van de uitvoering, en ze schuiven in elkaar over: zodra er bij een adres een
  // telefoonnummer staat, hoeft er niemand meer langs en kan het gebeld worden.
  const bellen = adressen.filter((a) => a.telefoon.trim());
  const langs = adressen.filter((a) => !a.telefoon.trim());

  // Wanneer is een stap af? Puur informatief — je mag altijd overal heen.
  const af: Record<StapKey, boolean> = {
    inlezen: adressen.length > 0,
    verdelen: clusters.length > 0 && verdeeld === clusters.length,
    // Pas af als er van elk adres een nummer is (of de bewoner werkt niet mee).
    deur: langs.every((a) => a.telefoon.trim() || a.belstatus === "weigert"),
    bellen: bellen.length === 0 || bellen.every((a) => a.belstatus === "akkoord"),
    poster: taken.length > 0 && openTaken === 0,
    afronden: detail?.dossier.status === "afgerond" || detail?.dossier.status === "afgeboekt",
    afboeken: detail?.dossier.status === "afgeboekt",
  };
  // Wat moet je op deze stap doen? Niet de naam van de stap, maar de eerstvolgende handeling, in de
  // woorden die je aan een nieuwe collega zou gebruiken. Dit staat groot bovenaan elke stap, want
  // "Bellen — geen" zegt iemand die hier net werkt helemaal niets.
  const watNu: Record<StapKey, string> = {
    inlezen: adressen.length === 0
      ? "Sleep het adressenbestand van de opdrachtgever in het vak hieronder."
      : `Er staan ${adressen.length} adressen klaar. Ga door naar Verdelen, of lees nog een bestand in.`,
    verdelen: clusters.length === 0
      ? "Klik op ‘Groepen maken’. De adressen worden dan per postcode bij elkaar gezet."
      : verdeeld < clusters.length
        ? "Kies hierboven wie dit project doet. Eén klik zet alle groepen op die naam."
        : "Alles is verdeeld. Ga door naar Langs de deur.",
    deur: langs.length === 0
      ? "Van elk adres is een telefoonnummer bekend. Hier hoef je niet meer heen."
      : `Bij ${langs.length} ${langs.length === 1 ? "adres" : "adressen"} is geen telefoonnummer bekend. Rijd erheen en vraag het aan de deur; is er niemand thuis, gooi dan een kaartje in de bus.`,
    bellen: bellen.length === 0
      ? "Er is nog van niemand een telefoonnummer. Haal die eerst op bij Langs de deur."
      : bellen.every((a) => a.belstatus === "akkoord")
        ? "Met iedereen is een afspraak gemaakt. Ga door naar Afronden."
        : `Bel de bewoners en spreek de dag af waarop iedereen thuis moet zijn. Nog ${bellen.filter((a) => a.belstatus !== "akkoord").length} te gaan.`,
    afronden: "Loop de lijst na: staat bij elk adres een telefoonnummer en een dag? Klopt het, dan kun je het dossier afronden.",
    afboeken: detail?.dossier.status === "afgeboekt"
      ? "Dit dossier is afgeboekt en staat in het archief. Je kunt hem nog inzien, niet meer wijzigen."
      : detail?.dossier.status === "afgerond"
        ? "Het werk is klaar en het dossier staat bij Klaar voor Stedin. Boek het af op het PD-nummer, dan is het afgehandeld en gaat het naar het archief."
        : "Het werk moet eerst afgerond worden. Dat gebeurt bij Het werk, op de laatste stap.",
    poster: taken.length === 0
      ? "Zodra met een groep een dag is afgesproken, komt hier vanzelf de taak om de aankondiging op te hangen."
      : openTaken > 0
        ? `Hang de aankondiging op in ${openTaken === 1 ? "het gebouw" : `${openTaken} gebouwen`} en vink hem hier af.`
        : "Alle posters hangen. Het dossier kan afgeboekt worden.",
  };

  // Een groen vinkje moet "dit is gedaan" betekenen. Bij een stap waar toevallig niets te doen is
  // — geen telefoonnummers, dus niets te bellen — leest dat als "klaar, goed bezig", en dat is
  // misleidend. Zo'n stap blijft grijs met de reden erbij.
  const nietsTeDoen: Partial<Record<StapKey, boolean>> = {
    deur: adressen.length > 0 && langs.length === 0,
    bellen: bellen.length === 0,
    poster: taken.length === 0,
    afboeken: detail?.dossier.status !== "afgerond" && detail?.dossier.status !== "afgeboekt",
  };
  // Welke kant sta je op? Zolang er niets is ingelezen of verdeeld valt er in het veld niets te doen,
  // dus begin je dan bij de afhandeling. Daarna opent hij altijd op het werk — dat is waar de dag
  // in zit.
  const deelActief = deel ?? (adressen.length === 0 || clusters.length === 0 ? "afhandeling" : "werk");
  const stappenNu = STAPPEN.filter((x) => x.groep === (deelActief === "werk" ? "werk" : "beheer"));
  // De eerste stap op deze pagina die nog niet af is. Wissel je van pagina, dan hoort de stap van de
  // andere kant er niet meer bij en springt hij vanzelf naar het eerstvolgende dat er wél toe doet.
  const eerste = stappenNu.find((x) => !af[x.key])?.key ?? stappenNu[stappenNu.length - 1].key;
  const actief = stap && stappenNu.some((x) => x.key === stap) ? stap : eerste;
  const huidig = stappenNu.find((x) => x.key === actief) ?? stappenNu[0];

  const samenvatting: Record<StapKey, string> = {
    inlezen: adressen.length ? `${adressen.length} adressen` : "nog geen bestand",
    verdelen: clusters.length ? `${verdeeld} van de ${clusters.length} groepen verdeeld` : "nog geen groepen",
    deur: langs.length ? `${langs.length} nog langs` : "alle nummers binnen",
    bellen: bellen.length ? `${bellen.filter((a) => a.belstatus === "akkoord").length} van de ${bellen.length} afgesproken` : "nog niemand",
    poster: taken.length ? `${taken.length - openTaken} van de ${taken.length} opgehangen` : "nog niet nodig",
    afronden: STATUS_INFO[detail?.dossier.status ?? "nieuw"]?.label ?? "nog niet",
    afboeken: detail?.dossier.status === "afgeboekt" ? "afgeboekt"
      : detail?.dossier.status === "afgerond" ? "klaar om af te boeken" : "nog niet aan toe",
  };

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
    <div className="space-y-4">
      {/* De kop blijft staan als je scrollt. Dit is een dossier waar je heen en weer in springt —
          van de bellijst naar een groep en terug — en dan wil je niet steeds omhoog moeten.

          Let op de maten: de pagina eromheen heeft p-4, en vanaf md p-6. De kop trekt zichzelf met
          negatieve marges precies zo ver op, anders blijft er een strook paginarand over waar de
          inhoud doorheen scrollt. Die stond op -mt-4 terwijl een laptop 24 px ruimte heeft; die
          8 px was het gat. De achtergrond is bovendien dekkend — met bg-white/95 en een waas zie je
          de kaarten er gewoon doorheen komen. */}
      <div className="sticky top-0 z-20 -mx-4 -mt-4 border-b border-ink-200 bg-white px-4 pb-3 pt-4 shadow-sm md:-mx-6 md:-mt-6 md:px-6 md:pt-6">
        <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Alle saneringen
        </button>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h2 className="font-mono text-xl font-bold tracking-wide text-ink-900">{dossier.pd_nummer}</h2>
            <p className="text-sm text-ink-500">
              {[dossier.opdrachtgever, dossier.gebouw, dossier.regio].filter(Boolean).join(" · ")}
              {dossier.uitvoering_van && ` · uitvoering ${kortNL(dossier.uitvoering_van)}`}
            </p>
          </div>
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR[STATUS_INFO[dossier.status]?.kleur ?? "slate"]}`}>
            {STATUS_INFO[dossier.status]?.label}
          </span>
        </div>

        {/* Eerst kiezen welke kant van het werk je doet, dan pas de stappen. Alle zes door elkaar in
            één balk betekende dat iedereen eerst moest uitzoeken welke stappen van hem waren. */}
        <div className="mt-2.5 flex gap-1 rounded-xl border border-ink-200 bg-ink-50 p-1">
          {(["werk", "afhandeling"] as const).map((k) => {
            const groep = k === "werk" ? "werk" : "beheer";
            const bij = k === "werk"
              ? (adressen.length === 0 ? "nog geen adressen" : `${bellen.filter((a) => a.belstatus === "akkoord").length} van de ${adressen.length} afgesproken`)
              : (STATUS_INFO[dossier.status]?.label ?? "");
            const isNu = deelActief === k;
            // Het bolletje telt hoeveel stappen op die kant nog te doen zijn. Zo zie je op de andere
            // pagina dat er iets ligt zonder erheen te hoeven.
            const teDoen = STAPPEN.filter((x) => x.groep === groep && !af[x.key] && !nietsTeDoen[x.key]).length;
            return (
              <button key={k} type="button" onClick={() => { setDeel(k); setStap(null); setCluster(null); }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
                  isNu ? "bg-white text-ink-900 shadow-sm ring-1 ring-ink-200" : "text-ink-500 hover:text-ink-800"}`}>
                {GROEP_LABEL[groep]}
                <span className={`text-xs font-medium ${isNu ? "text-ink-500" : "text-ink-400"}`}>· {bij}</span>
                {!isNu && teDoen > 0 && (
                  <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold text-white">{teDoen}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* De stappen van de kant die openstaat. Klikken kan overal naartoe — niets zit op slot, want
            ook halverwege moet je iets kunnen bijstellen. Op een telefoon schuift de balk zijwaarts;
            is er breedte, dan breekt hij netjes af in plaats van achter de rand door te lopen. */}
        <div className="-mx-4 mt-2.5 flex gap-2 overflow-x-auto px-4 pb-2 sm:-mx-6 sm:flex-wrap sm:overflow-visible sm:px-6">
          {stappenNu.map((x) => {
            const isNu = x.key === actief;
            return (
              <button key={x.key} type="button" onClick={() => { setStap(x.key); setCluster(null); }} aria-current={isNu ? "step" : undefined}
                className={`flex shrink-0 items-center gap-2.5 rounded-xl border-2 px-3.5 py-2 text-left transition-colors ${
                  isNu ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/50"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  af[x.key] && !nietsTeDoen[x.key] ? "bg-green-500 text-white"
                    : isNu ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-500"}`}>
                  {af[x.key] && !nietsTeDoen[x.key] ? <Check className="h-4 w-4" /> : x.nr}
                </span>
                <span className="min-w-0">
                  <span className={`block text-sm font-bold ${isNu ? "text-brand-800" : "text-ink-800"}`}>{x.titel}</span>
                  <span className="block text-[11px] text-ink-500">{samenvatting[x.key]}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* De titel van de stap hoort bij de kop, niet bij de inhoud eronder. Stond hij erbuiten, dan
            kreeg je twee blokken die net niet op elkaar aansloten: een balk over de volle breedte en
            daaronder inhoud met marges ernaast. Nu is het één kop die met één lijn afsluit. */}
        <div className="flex items-start gap-2.5 border-t border-ink-100 pt-3">
          <span className="mt-0.5 shrink-0 rounded-lg bg-brand-50 p-2 text-brand-600"><huidig.Icon className="h-5 w-5" /></span>
          <div className="min-w-0">
            <h3 className="text-base font-bold text-ink-900">Stap {huidig.nr} van {stappenNu.length} — {huidig.titel}</h3>
            {/* Wat er nú moet gebeuren, in gewone taal. Dit is voor iemand die hier net werkt het
                enige wat hij hoeft te lezen. */}
            <p className="text-sm text-ink-700">{watNu[actief]}</p>
          </div>
        </div>
      </div>

      {actief === "inlezen" && <SaneerImport dossier={dossier} aantalNu={adressen.length} onKlaar={() => void laad()} />}

      {actief === "verdelen" && (
        adressen.length === 0
          ? <Leeg Icon={ListPlus} titel="Nog geen adressen" tekst="Lees eerst het bestand van de opdrachtgever in bij stap 1. Daarna maakt de app hier vanzelf groepen op postcode." knop="Naar Inlezen" onKlik={() => setStap("inlezen")} />
          : <SaneerVerdelen dossier={dossier} adressen={adressen} clusters={clusters} veldwerkers={veldwerkers} naamVan={naamVan} onWijzig={() => void laad()} />
      )}

      {actief === "deur" && (
        clusters.length === 0
          ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Maak eerst groepen in stap 2.</p>
          : (
              <div className="space-y-2">
                {clusters.map((k) => {
                  // Per groep laten zien hoe ver het veldwerk staat. "Geen datum" zei niets over wat
                  // er nog te doen was; dít is waar je op stuurt: bij hoeveel deuren heb je een
                  // telefoonnummer, waar ligt een kaartje, en waar moet je nog heen.
                  const inGroep = adressen.filter((a) => a.cluster_id === k.id);
                  const nummer = inGroep.filter((a) => a.telefoon.trim()).length;
                  const kaartje = inGroep.filter((a) => !a.telefoon.trim() && a.kaartje_op).length;
                  const open = inGroep.length - nummer - kaartje;   // hier moet nog iemand naartoe
                  const pct = inGroep.length ? Math.round(((nummer + kaartje) / inGroep.length) * 100) : 0;
                  return (
                    <button key={k.id} type="button" onClick={() => setCluster(k.id)}
                      className="block w-full overflow-hidden rounded-2xl border border-ink-200 bg-white text-left transition-shadow hover:shadow-md">
                      <div className="flex items-center justify-between gap-3 px-4 pb-2.5 pt-3">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold text-ink-900">{k.naam || k.postcode}</span>
                          <span className="block text-xs text-ink-500">
                            {inGroep.length} deuren · {naamVan(k.toegewezen_aan)}
                            {k.definitieve_datum ? ` · uitvoering ${kortNL(k.definitieve_datum)}` : ""}
                          </span>
                        </span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {open === 0
                            ? <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.green}`}>gehad</span>
                            : <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.slate}`}>{open} nog langs</span>}
                          <ChevronRight className="h-5 w-5 text-ink-400" />
                        </span>
                      </div>
                      <div className="flex items-center gap-3 px-4 pb-3 text-xs">
                        {/* Het telefoonnummer is wat er per adres bij moet: zonder nummer kan niemand
                            deze bewoner bellen voor de afspraak, en ook niet waarschuwen als de dag
                            verschuift. Daarom staat de teller er als doel en niet als losse cijfer. */}
                        <span className={nummer === inGroep.length ? "font-semibold text-green-700" : "font-semibold text-amber-700"}>
                          {nummer} van de {inGroep.length} telefoonnummers
                        </span>
                        {kaartje > 0 && <span className="text-ink-500">{kaartje} kaartje</span>}
                        <span className="ml-auto font-semibold tabular-nums text-ink-400">{pct}%</span>
                      </div>
                      <div className="h-1.5 bg-ink-100">
                        <div className="h-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </div>
            )
      )}

      {actief === "bellen" && <Bellijst pd={pd} onWijzig={() => void laad()} />}
      {actief === "poster" && <Posters taken={taken} naamVan={naamVan} onWijzig={() => void laad()} />}
      {actief === "afronden" && <Afronden dossier={dossier} clusters={clusters} adressen={adressen} taken={taken} onWijzig={() => void laad()} />}

      {actief === "afboeken" && (
        dossier.status === "afgerond" || dossier.status === "afgeboekt"
          ? <Afboeken dossier={dossier} onWijzig={() => void laad()} />
          : <Leeg Icon={FileCheck2} titel="Het werk is nog niet afgerond"
              tekst="Afboeken kan pas als de afspraken staan en het dossier is afgerond. Dat gebeurt op de laatste stap van Het werk."
              knop="Naar Het werk" onKlik={() => { setDeel("werk"); setStap("afronden"); }} />
      )}
    </div>
  );
}

// ── Stap 4 — de bellijst ──
// Adressen waarvan de opdrachtgever al een nummer aanleverde. Terugbellen staat bovenaan: dat is een
// afspraak met een bewoner, geen wenslijst.
function Bellijst({ pd, onWijzig }: { pd: string; onWijzig: () => void }) {
  const [lijst, setLijst] = useState<FlowAdres[] | null>(null);
  const laad = useCallback(async () => setLijst(await haalBellijst(pd)), [pd]);
  useEffect(() => { void laad(); }, [laad]);

  async function zet(a: FlowAdres, belstatus: string) {
    await wijzigFlowAdres(a.id, { belstatus, belpogingen: (a.belpogingen ?? 0) + (belstatus === "geen_gehoor" ? 1 : 0) });
    void laad(); onWijzig();
  }

  if (!lijst) return <div className="flex items-center gap-2 py-10 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Bezig…</div>;
  if (lijst.length === 0) return <Leeg Icon={PhoneCall} titel="Nog niemand te bellen" tekst="Zodra er bij een adres een telefoonnummer bekend is — aangeleverd of aan de deur genoteerd — verschijnt het hier vanzelf." />;

  const terugbellen = lijst.filter((a) => a.belstatus === "terugbellen");

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
        Alle adressen waarvan het nummer bekend is. Wat aan de deur al is afgesproken staat groen —
        daar hoef je niet meer achteraan.
      </div>

      {terugbellen.length > 0 && (
        <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-800">
          <b>{terugbellen.length} bewoner(s)</b> wachten op een terugbelafspraak. Die staan hieronder bovenaan.
        </div>
      )}
      {lijst.map((a) => {
        const info = BELSTATUS_INFO[a.belstatus] ?? BELSTATUS_INFO[""];
        return (
          <div key={a.id} className="rounded-2xl border border-ink-200 bg-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-ink-900">{`${a.straat} ${a.huisnummer}${a.toevoeging}`.trim()}</div>
                <div className="text-xs text-ink-500">{a.bewoner || "naam onbekend"} · {a.cluster_naam || a.postcode}</div>
              </div>
              <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR[info.kleur]}`}>
                {info.label}{a.belpogingen > 0 ? ` (${a.belpogingen}×)` : ""}
              </span>
            </div>
            <a href={`tel:${a.telefoon}`} className={`${knop} mt-3 w-full bg-brand-600 text-white hover:bg-brand-700`}>
              <PhoneCall className="h-4 w-4" /> {a.telefoon}
            </a>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(["gebeld", "geen_gehoor", "terugbellen", "akkoord"] as const).map((s) => (
                <button key={s} type="button" onClick={() => void zet(a, s)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${a.belstatus === s ? KLEUR[BELSTATUS_INFO[s].kleur] : "bg-ink-50 text-ink-600 hover:bg-ink-100"}`}>
                  {BELSTATUS_INFO[s].label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
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

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ArrowLeft, ListPlus, Users, Footprints, PhoneCall, StickyNote, FileCheck2,
  Loader2, AlertTriangle, CalendarCheck, ChevronRight, FileSpreadsheet, FileText, ShieldAlert,
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

// Saneren — één dossier, stap voor stap.
// ─────────────────────────────────────────────────────────────────────────────
// Dezelfde opbouw als bij bodemonderzoek: één ding per scherm, niets op slot. Maar de stappen zijn
// wezenlijk anders, want hier gaat het niet om losse afspraken maar om één datum die voor een hele
// groep moet gelden. Vandaar de stap "Bellen" (adressen waar al een nummer van bekend is hoeven niet
// langs) en de stap "Poster" (die moet binnen twee weken na de afspraak in het gebouw hangen).

type StapKey = "inlezen" | "verdelen" | "onderweg" | "bellen" | "poster" | "afronden";

const STAPPEN: { key: StapKey; nr: number; titel: string; uitleg: string; Icon: typeof ListPlus }[] = [
  { key: "inlezen",  nr: 1, titel: "Inlezen",  uitleg: "Adressenbestand van de opdrachtgever", Icon: ListPlus },
  { key: "verdelen", nr: 2, titel: "Verdelen", uitleg: "Groepen op postcode, elk naar één medewerker", Icon: Users },
  { key: "onderweg", nr: 3, titel: "Onderweg", uitleg: "Langs de deuren tot iedereen akkoord is", Icon: Footprints },
  { key: "bellen",   nr: 4, titel: "Bellen",   uitleg: "Adressen waarvan het nummer al bekend is", Icon: PhoneCall },
  { key: "poster",   nr: 5, titel: "Poster",   uitleg: "Binnen twee weken na de afspraak in het gebouw", Icon: StickyNote },
  { key: "afronden", nr: 6, titel: "Afronden", uitleg: "Controle, export en afboeken", Icon: FileCheck2 },
];

const knop = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";
const KLEUR: Record<string, string> = {
  green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", slate: "bg-ink-100 text-ink-600", sky: "bg-sky-100 text-sky-800",
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
  const metDatum = clusters.filter((k) => k.definitieve_datum).length;
  const openTaken = taken.filter((t) => !t.afgevinkt_op).length;
  const bellen = adressen.filter((a) => a.telefoon_bij_import === 1);

  // Wanneer is een stap af? Puur informatief — je mag altijd overal heen.
  const af: Record<StapKey, boolean> = {
    inlezen: adressen.length > 0,
    verdelen: clusters.length > 0 && verdeeld === clusters.length,
    onderweg: clusters.length > 0 && metDatum === clusters.length,
    bellen: bellen.length === 0 || bellen.every((a) => a.belstatus === "akkoord"),
    poster: taken.length > 0 && openTaken === 0,
    afronden: detail?.dossier.status === "afgerond" || detail?.dossier.status === "afgeboekt",
  };
  const eerste = STAPPEN.find((s) => !af[s.key])?.key ?? "afronden";
  const actief = stap ?? eerste;
  const index = STAPPEN.findIndex((s) => s.key === actief);
  const huidig = STAPPEN[index];

  const samenvatting: Record<StapKey, string> = {
    inlezen: adressen.length ? `${adressen.length} adressen` : "nog leeg",
    verdelen: clusters.length ? `${verdeeld}/${clusters.length} verdeeld` : "geen groepen",
    onderweg: clusters.length ? `${metDatum}/${clusters.length} datum rond` : "—",
    bellen: bellen.length ? `${bellen.filter((a) => a.belstatus === "akkoord").length}/${bellen.length}` : "geen",
    poster: taken.length ? `${taken.length - openTaken}/${taken.length}` : "—",
    afronden: STATUS_INFO[detail?.dossier.status ?? "nieuw"]?.label ?? "—",
  };

  if (laden) return <div className="flex items-center justify-center gap-2 py-20 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Bezig met ophalen…</div>;
  if (!detail) return (
    <div className="space-y-3">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700"><ArrowLeft className="h-4 w-4" /> Terug</button>
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
        <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700"><ArrowLeft className="h-4 w-4" /> Alle dossiers</button>
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
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
        <ArrowLeft className="h-4 w-4" /> Alle dossiers
      </button>

      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{dossier.pd_nummer}</h2>
          <p className="text-sm text-ink-500">
            {[dossier.opdrachtgever, dossier.gebouw, dossier.regio].filter(Boolean).join(" · ")}
            {dossier.uitvoering_van && ` · uitvoering ${kortNL(dossier.uitvoering_van)}`}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR[STATUS_INFO[dossier.status]?.kleur ?? "slate"]}`}>
          {STATUS_INFO[dossier.status]?.label}
        </span>
      </div>

      {/* Stappenbalk */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STAPPEN.map((s) => {
          const isNu = s.key === actief;
          return (
            <button key={s.key} type="button" onClick={() => { setStap(s.key); setCluster(null); }} aria-current={isNu ? "step" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors ${
                isNu ? "border-sky-500 bg-sky-50" : "border-ink-200 bg-white hover:bg-ink-50"}`}>
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                af[s.key] ? "bg-green-500 text-white" : isNu ? "bg-sky-600 text-white" : "bg-ink-200 text-ink-500"}`}>
                {af[s.key] ? <Check className="h-4 w-4" /> : s.nr}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-bold ${isNu ? "text-sky-800" : "text-ink-800"}`}>{s.titel}</span>
                <span className="block text-[11px] text-ink-500">{samenvatting[s.key]}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2.5">
        <span className="rounded-lg bg-sky-50 p-2 text-sky-600"><huidig.Icon className="h-5 w-5" /></span>
        <div>
          <h3 className="text-base font-bold text-ink-900">Stap {huidig.nr} — {huidig.titel}</h3>
          <p className="text-sm text-ink-500">{huidig.uitleg}</p>
        </div>
      </div>

      {actief === "inlezen" && <SaneerImport dossier={dossier} aantalNu={adressen.length} onKlaar={() => void laad()} />}

      {actief === "verdelen" && (
        adressen.length === 0
          ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Er zijn nog geen adressen. Ga eerst terug naar stap 1.</p>
          : <SaneerVerdelen dossier={dossier} adressen={adressen} clusters={clusters} veldwerkers={veldwerkers} naamVan={naamVan} onWijzig={() => void laad()} />
      )}

      {actief === "onderweg" && (
        clusters.length === 0
          ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">Maak eerst groepen in stap 2.</p>
          : (
              <div className="space-y-1.5">
                {clusters.map((k) => (
                  <button key={k.id} type="button" onClick={() => setCluster(k.id)}
                    className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left hover:bg-ink-50">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink-900">{k.naam || k.postcode}</span>
                      <span className="block text-xs text-ink-500">{k.adressen} adressen · {naamVan(k.toegewezen_aan)}</span>
                    </span>
                    {k.definitieve_datum
                      ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.green}`}>{kortNL(k.definitieve_datum)}</span>
                      : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.slate}`}>geen datum</span>}
                  </button>
                ))}
              </div>
            )
      )}

      {actief === "bellen" && <Bellijst pd={pd} onWijzig={() => void laad()} />}
      {actief === "poster" && <Posters taken={taken} naamVan={naamVan} onWijzig={() => void laad()} />}
      {actief === "afronden" && <Afronden dossier={dossier} clusters={clusters} taken={taken} onWijzig={() => void laad()} />}
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
  if (lijst.length === 0) return <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">Van geen enkel adres is een telefoonnummer aangeleverd. Alles gaat via de deur.</p>;

  const terugbellen = lijst.filter((a) => a.belstatus === "terugbellen");

  return (
    <div className="space-y-3">
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
            <a href={`tel:${a.telefoon}`} className={`${knop} mt-3 w-full bg-sky-600 text-white hover:bg-sky-700`}>
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

// ── Stap 5 — de poster ──
// De taak ontstaat vanzelf zodra een groep een datum heeft. Ophangen moet binnen twee weken ná die
// afspraak — en nooit later dan de dag vóór de uitvoering, want daarna kondigt hij niets meer aan.
// De herinnering hiervoor komt als pop-up over het scherm heen; zie PosterHerinnering.
function Posters({ taken, naamVan, onWijzig }: { taken: Taak[]; naamVan: (id?: string | null) => string; onWijzig: () => void }) {
  const [bezig, setBezig] = useState("");
  const vandaag = new Date().toISOString().slice(0, 10);

  if (taken.length === 0) return <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">Zodra met een groep een datum is afgesproken, verschijnt hier vanzelf de postertaak — en krijg je er een herinnering over totdat hij hangt.</p>;

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
                className={`${knop} mt-3 bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60`}>
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

// ── Stap 6 — afronden en afboeken ──
// De knop is geen meningsuiting: de server rekent na of alles echt klaar is en weigert anders. Wat er
// nog openstaat, staat er letterlijk bij.
function Afronden({ dossier, clusters, taken, onWijzig }: {
  dossier: Dossier;
  clusters: DossierDetail["clusters"];
  taken: Taak[];
  onWijzig: () => void;
}) {
  const [bezig, setBezig] = useState("");
  const [fout, setFout] = useState("");

  const zonderDatum = clusters.filter((k) => !k.definitieve_datum);
  const openTaken = taken.filter((t) => !t.afgevinkt_op);
  const klaar = clusters.length > 0 && zonderDatum.length === 0 && openTaken.length === 0;

  async function doe(soort: "afronden" | "afboeken") {
    setBezig(soort); setFout("");
    const r = await rondDossierAf(dossier.pd_nummer, { afboeken: soort === "afboeken" });
    setBezig("");
    if (!r.ok) { setFout(r.fout ?? "Mislukt."); return; }
    onWijzig();
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
        </ul>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void exporteer("xlsx")} disabled={!!bezig} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
          {bezig === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />} Excel
        </button>
        <button type="button" onClick={() => void exporteer("pdf")} disabled={!!bezig} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
          {bezig === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />} PDF
        </button>
      </div>

      {fout && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fout}</p>}

      {dossier.status === "afgeboekt" ? (
        <p className="rounded-xl bg-ink-100 px-4 py-3 text-sm font-semibold text-ink-700">
          Dit dossier is afgeboekt op {kortNL(dossier.afgeboekt_op)}. Alleen-lezen.
        </p>
      ) : dossier.status === "afgerond" ? (
        <button type="button" onClick={() => void doe("afboeken")} disabled={!!bezig} className={`${knop} w-full bg-ink-800 py-3.5 text-base text-white hover:bg-ink-900 disabled:opacity-60 sm:w-auto`}>
          {bezig === "afboeken" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileCheck2 className="h-5 w-5" />} Afboeken op {dossier.pd_nummer}
        </button>
      ) : (
        <button type="button" onClick={() => void doe("afronden")} disabled={!!bezig} className={`${knop} w-full bg-sky-600 py-3.5 text-base text-white hover:bg-sky-700 disabled:opacity-60 sm:w-auto`}>
          {bezig === "afronden" ? <Loader2 className="h-5 w-5 animate-spin" /> : <FileCheck2 className="h-5 w-5" />} Dossier afronden
        </button>
      )}
    </div>
  );
}

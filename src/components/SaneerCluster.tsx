import { useEffect, useMemo, useState } from "react";
import {
  Users, AlertTriangle, Loader2, ArrowLeft, CheckCircle2, XCircle, DoorClosed, Ban,
  CalendarCheck, Scissors, WifiOff, Clock, RefreshCw, ShieldAlert, Phone,
} from "lucide-react";
import { DatumKiezer } from "./DatumKiezer";
import {
  maakClusters, wijzigCluster, splitsCluster, haalCluster, startRonde, zetDefinitieveDatum,
  legAntwoordVast, verwerkWachtrijFlow, aantalWachtendFlow, standVan, datumVoorstellen,
  ANTWOORD_INFO, type Antwoord, type ClusterDetail, type ClusterUitslag, type FlowAdres,
} from "../lib/saneerflowWerk";
import type { Dossier } from "../lib/saneerflow";
import type { User } from "../lib/types";

// Saneren — clusters verdelen (stap 3) en per cluster één datum rond krijgen (stap 4).
// ─────────────────────────────────────────────────────────────────────────────
// Waarom een cluster nooit gesplitst wordt over twee medewerkers: iedereen in het cluster moet op
// dezelfde dag thuis zijn. Zodra twee mensen aan dezelfde groep werken, hoort niemand meer het hele
// verhaal en spreekt de een een datum af die de ander al heeft zien sneuvelen.

const knop = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";
const KLEUR: Record<string, string> = {
  green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800",
  red: "bg-red-100 text-red-800", slate: "bg-ink-100 text-ink-600", sky: "bg-sky-100 text-sky-800",
};

const datumNL = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso}T12:00:00Z`);
  return d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
const adresTekst = (a: FlowAdres) => `${a.straat} ${a.huisnummer}${a.toevoeging}`.replace(/\s+/g, " ").trim();

// ═════════════════════════════════════════════════════════════════════════════
// STAP 3 — clusters maken en verdelen
// ═════════════════════════════════════════════════════════════════════════════

export function SaneerVerdelen({ dossier, adressen, clusters, veldwerkers, naamVan, onWijzig }: {
  dossier: Dossier;
  adressen: FlowAdres[];
  clusters: { id: string; naam: string; postcode: string; toegewezen_aan: string | null; definitieve_datum: string; adressen: number }[];
  veldwerkers: User[];
  naamVan: (id?: string | null) => string;
  onWijzig: () => void;
}) {
  const [bezig, setBezig] = useState(false);
  const [uitslag, setUitslag] = useState<ClusterUitslag | null>(null);
  const [fout, setFout] = useState("");
  const [splitsen, setSplitsen] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());

  async function cluster() {
    setBezig(true); setFout("");
    const r = await maakClusters(dossier.pd_nummer);
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Clusteren mislukt."); return; }
    setUitslag(r.uitslag ?? null);
    onWijzig();
  }

  async function wijs(id: string, userId: string) {
    await wijzigCluster(id, { toegewezen_aan: userId });
    onWijzig();
  }

  async function splitsNu() {
    if (gekozen.size === 0) return;
    setBezig(true);
    const r = await splitsCluster(dossier.pd_nummer, [...gekozen], "Afgesplitst");
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Splitsen mislukt."); return; }
    setSplitsen(null); setGekozen(new Set()); onWijzig();
  }

  const teGroot = uitslag?.teGroot ?? [];
  const onverdeeld = clusters.filter((k) => !k.toegewezen_aan).length;

  if (splitsen) {
    const inCluster = adressen.filter((a) => a.cluster_id === splitsen);
    return (
      <div className="space-y-3">
        <button type="button" onClick={() => { setSplitsen(null); setGekozen(new Set()); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
          <ArrowLeft className="h-4 w-4" /> Terug
        </button>
        <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Kies de adressen die een eigen groep worden. Handig bij een flat waar de begane grond op een
          andere dag kan dan de verdiepingen.
        </p>
        <div className="max-h-96 space-y-1 overflow-y-auto rounded-2xl border border-ink-200 bg-white p-2">
          {inCluster.map((a) => (
            <label key={a.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-ink-50">
              <input type="checkbox" checked={gekozen.has(a.id)}
                onChange={(e) => setGekozen((s) => { const n = new Set(s); if (e.target.checked) n.add(a.id); else n.delete(a.id); return n; })}
                className="h-4 w-4 rounded border-ink-300 text-sky-600" />
              <span className="text-sm text-ink-800">{adresTekst(a)} · {a.postcode}</span>
            </label>
          ))}
        </div>
        <button type="button" onClick={() => void splitsNu()} disabled={bezig || gekozen.size === 0}
          className={`${knop} bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60`}>
          {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Scissors className="h-4 w-4" />}
          {gekozen.size} adressen afsplitsen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {clusters.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-8 text-center">
          <Users className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-2 text-sm text-ink-600">
            De adressen worden gegroepeerd op volledige postcode. Elke groep krijgt straks één datum
            waarop iedereen thuis moet zijn.
          </p>
          <button type="button" onClick={() => void cluster()} disabled={bezig || adressen.length === 0}
            className={`${knop} mt-4 bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-60`}>
            {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Users className="h-4 w-4" />} Groepen maken
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-ink-600">
              {clusters.length} groepen · {onverdeeld > 0 ? <b className="text-amber-700">{onverdeeld} nog niet verdeeld</b> : "iedereen heeft werk"}
            </p>
            <button type="button" onClick={() => void cluster()} disabled={bezig} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
              {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Opnieuw groeperen
            </button>
          </div>

          {teGroot.length > 0 && (
            <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <div className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4" /> {teGroot.length} groep(en) groter dan {uitslag?.grens} adressen</div>
              <p className="mt-1 text-xs">
                Hoe groter de groep, hoe kleiner de kans dat iedereen op dezelfde dag kan. Overweeg te splitsen.
              </p>
            </div>
          )}

          <div className="grid gap-3 lg:grid-cols-2">
            {clusters.map((k) => (
              <div key={k.id} className="rounded-2xl border border-ink-200 bg-white p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-ink-900">{k.naam || k.postcode}</div>
                    <div className="text-xs text-ink-500">{k.postcode} · {k.adressen} adressen</div>
                  </div>
                  {k.definitieve_datum
                    ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.green}`}>{datumNL(k.definitieve_datum)}</span>
                    : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.slate}`}>geen datum</span>}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select value={k.toegewezen_aan ?? ""} onChange={(e) => void wijs(k.id, e.target.value)}
                    className="flex-1 rounded-lg border border-ink-200 px-2.5 py-2 text-sm outline-none focus:border-sky-400">
                    <option value="">— nog niemand —</option>
                    {veldwerkers.map((u) => <option key={u.id} value={u.id}>{u.naam}</option>)}
                  </select>
                  <button type="button" onClick={() => setSplitsen(k.id)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" title="Groep splitsen">
                    <Scissors className="h-4 w-4" />
                  </button>
                </div>
                {k.toegewezen_aan && <p className="mt-1.5 text-xs text-ink-500">Hele groep bij {naamVan(k.toegewezen_aan)} — nooit half.</p>}
              </div>
            ))}
          </div>
        </>
      )}
      {fout && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fout}</p>}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// STAP 4 — één cluster: de ronde, de deuren en de datum
// ═════════════════════════════════════════════════════════════════════════════

export function SaneerClusterWerk({ clusterId, onTerug }: { clusterId: string; onTerug: () => void }) {
  const [data, setData] = useState<ClusterDetail | null>(null);
  const [laden, setLaden] = useState(true);
  const [deur, setDeur] = useState<FlowAdres | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [online, setOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [wacht, setWacht] = useState(aantalWachtendFlow());

  const laad = async () => {
    setLaden(true);
    setData(await haalCluster(clusterId));
    setLaden(false);
  };
  useEffect(() => { void laad(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [clusterId]);

  // Zonder bereik blijven antwoorden op het apparaat staan. Zodra er weer verbinding is, gaan ze
  // vanzelf alsnog weg — daar hoeft niemand aan te denken.
  useEffect(() => {
    const aan = async () => {
      setOnline(true);
      const r = await verwerkWachtrijFlow();
      setWacht(aantalWachtendFlow());
      if (r.verstuurd > 0) void laad();
    };
    const uit = () => setOnline(false);
    window.addEventListener("online", aan);
    window.addEventListener("offline", uit);
    return () => { window.removeEventListener("online", aan); window.removeEventListener("offline", uit); };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [clusterId]);

  const stand = useMemo(() => standVan(data?.adressen ?? [], data?.responsen ?? []), [data]);
  const voorstellen = useMemo(
    () => datumVoorstellen(data?.adressen ?? [], data?.beschikbaarheid ?? [], data?.dossier?.uitvoering_van ?? "", data?.dossier?.uitvoering_tot ?? ""),
    [data],
  );
  const perAdres = useMemo(() => new Map((data?.responsen ?? []).map((r) => [r.adres_id, r])), [data]);

  if (laden) return <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400"><Loader2 className="h-4 w-4 animate-spin" /> Bezig met ophalen…</div>;
  if (!data) return <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">Deze groep is niet (meer) beschikbaar.</p>;

  const { cluster, dossier, ronde } = data;
  const rondeNr = ronde?.nummer ?? 0;
  const naarLeiding = rondeNr > Number(dossier.escalatie_ronden ?? 3);

  async function nieuweRonde(datum: string) {
    setBezig(true); setFout("");
    const r = await startRonde(clusterId, datum);
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Ronde starten mislukt."); return; }
    void laad();
  }

  async function legVast(datum: string) {
    setBezig(true); setFout("");
    const r = await zetDefinitieveDatum(clusterId, datum);
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Vastleggen mislukt."); return; }
    void laad();
  }

  if (deur && ronde) {
    return (
      <DeurFormulier
        adres={deur} rondeId={ronde.id} dossier={dossier}
        voorstel={ronde.voorgestelde_datum}
        bestaand={perAdres.get(deur.id)?.antwoord}
        onKlaar={(wachtte) => { setDeur(null); setWacht(aantalWachtendFlow()); if (!wachtte) void laad(); }}
        onTerug={() => setDeur(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
        <ArrowLeft className="h-4 w-4" /> Alle groepen
      </button>

      <div>
        <h3 className="text-lg font-bold text-ink-900">{cluster.naam || cluster.postcode}</h3>
        <p className="text-sm text-ink-500">
          {cluster.postcode} · {data.adressen.length} adressen · iedereen moet op dezelfde dag thuis zijn
          {` van ${cluster.starttijd || dossier.starttijd || "08:00"} tot 16:00`}
        </p>
      </div>

      {!online && (
        <div className="flex items-center gap-2 rounded-xl bg-ink-800 px-4 py-3 text-sm text-white">
          <WifiOff className="h-4 w-4 shrink-0" />
          Geen bereik. Je kunt gewoon doorwerken — antwoorden gaan weg zodra je weer verbinding hebt.
        </div>
      )}
      {wacht > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          <Clock className="h-4 w-4 shrink-0" /> {wacht} antwoord(en) wachten nog op verbinding.
        </div>
      )}

      {/* De stand — alles of niets */}
      {ronde ? (
        <div className={`rounded-2xl border p-4 ${stand.rond ? "border-green-300 bg-green-50" : "border-ink-200 bg-white"}`}>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-ink-700">Ronde {rondeNr}{ronde.voorgestelde_datum ? ` · voorstel ${datumNL(ronde.voorgestelde_datum)}` : ""}</span>
            {naarLeiding && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.red}`}>
                <ShieldAlert className="h-3.5 w-3.5" /> naar de leiding
              </span>
            )}
          </div>
          <div className="mt-2 text-2xl font-bold text-ink-900">
            {stand.akkoord} van de {stand.totaal} akkoord
          </div>
          <p className="mt-0.5 text-sm text-ink-600">
            {stand.rond
              ? "Iedereen is akkoord. De datum kan vast."
              : `${stand.tegen} kan niet · ${stand.nietThuis} niet thuis · ${stand.open} nog niet gesproken. Eén bewoner die niet kan, maakt de datum ongeldig.`}
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-6 text-center">
          <p className="text-sm text-ink-600">Er loopt nog geen ronde. Kies een datum om aan de bewoners voor te leggen.</p>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <DatumKiezer value="" onChange={(d) => void nieuweRonde(d)} placeholder="Datum voorstellen" />
          </div>
        </div>
      )}

      {/* Definitieve datum of een nieuwe ronde */}
      {cluster.definitieve_datum ? (
        <div className="flex items-center gap-2 rounded-2xl border border-green-300 bg-green-50 px-4 py-3 text-sm font-semibold text-green-900">
          <CalendarCheck className="h-5 w-5" /> Uitvoering op {datumNL(cluster.definitieve_datum)} — vastgelegd.
        </div>
      ) : ronde && (
        <div className="rounded-2xl border border-ink-200 bg-white p-4">
          <h4 className="text-sm font-bold text-ink-900">Welke dag is haalbaar?</h4>
          <p className="mt-0.5 text-xs text-ink-500">
            Op basis van wat bewoners hebben gezegd — ook in eerdere rondes. Een dag waarop iemand niet
            kan, staat onderaan en is grijs.
          </p>
          <div className="mt-3 space-y-1.5">
            {voorstellen.slice(0, 6).map((v) => (
              <div key={v.datum} className={`flex items-center justify-between gap-3 rounded-xl px-3 py-2 ${v.haalbaar ? "bg-sky-50" : "bg-ink-50"}`}>
                <div className="min-w-0">
                  <div className={`text-sm font-semibold ${v.haalbaar ? "text-sky-900" : "text-ink-500"}`}>{datumNL(v.datum)}</div>
                  <div className="text-xs text-ink-500">
                    {v.kan} kan · {v.kanNiet > 0 ? <b className="text-red-600">{v.kanNiet} kan niet</b> : "niemand tegen"} · {v.onbekend} onbekend
                  </div>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  {stand.rond && v.haalbaar && (
                    <button type="button" onClick={() => void legVast(v.datum)} disabled={bezig}
                      className={`${knop} bg-green-600 px-3 py-1.5 text-xs text-white hover:bg-green-700`}>
                      <CalendarCheck className="h-3.5 w-3.5" /> Vastleggen
                    </button>
                  )}
                  {!stand.rond && v.haalbaar && v.datum !== ronde.voorgestelde_datum && (
                    <button type="button" onClick={() => void nieuweRonde(v.datum)} disabled={bezig}
                      className={`${knop} bg-white px-3 py-1.5 text-xs text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
                      <RefreshCw className="h-3.5 w-3.5" /> Nieuwe ronde
                    </button>
                  )}
                </div>
              </div>
            ))}
            {voorstellen.length === 0 && <p className="text-sm text-ink-500">Stel eerst een uitvoeringsperiode in bij het dossier.</p>}
          </div>
        </div>
      )}

      {fout && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fout}</p>}

      {/* De adressen zelf */}
      <div className="space-y-1.5">
        {data.adressen.map((a) => {
          const r = perAdres.get(a.id);
          const info = r ? ANTWOORD_INFO[r.antwoord] : null;
          return (
            <button key={a.id} type="button" onClick={() => ronde && setDeur(a)} disabled={!ronde}
              className="flex w-full items-center justify-between gap-3 rounded-xl border border-ink-200 bg-white px-4 py-3 text-left transition-colors hover:bg-ink-50 disabled:opacity-60">
              <div className="min-w-0">
                <div className="truncate font-semibold text-ink-900">{adresTekst(a)}</div>
                <div className="truncate text-xs text-ink-500">
                  {a.bewoner || "naam onbekend"}
                  {a.telefoon && <span className="ml-2 inline-flex items-center gap-1"><Phone className="h-3 w-3" />{a.telefoon}</span>}
                </div>
              </div>
              {info
                ? <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR[info.kleur]}`}>{info.kort}</span>
                : <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${KLEUR.slate}`}>nog langs</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Het formulier aan de deur ──
// Eén vraag per keer, grote knoppen, werkt met één hand. Zegt iemand "niet op die dag", dan vragen we
// meteen wanneer het wél kan: zonder dat antwoord is de volgende ronde weer gokken.
function DeurFormulier({ adres, rondeId, dossier, voorstel, bestaand, onKlaar, onTerug }: {
  adres: FlowAdres;
  rondeId: string;
  dossier: Dossier;
  voorstel: string;
  bestaand?: Antwoord;
  onKlaar: (wachtte: boolean) => void;
  onTerug: () => void;
}) {
  const [antwoord, setAntwoord] = useState<Antwoord | "">(bestaand ?? "");
  const [bewoner, setBewoner] = useState(adres.bewoner);
  const [telefoon, setTelefoon] = useState(adres.telefoon);
  const [opmerking, setOpmerking] = useState("");
  const [kanWel, setKanWel] = useState<string[]>([]);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");

  const veld = "w-full rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

  async function bewaar() {
    if (!antwoord) return;
    setBezig(true); setFout("");
    const r = await legAntwoordVast({
      adres_id: adres.id, ronde_id: rondeId, antwoord, via: "deur",
      bewoner: bewoner.trim(), telefoon: telefoon.trim(), opmerking: opmerking.trim(),
      kan_wel: antwoord === "akkoord" && voorstel ? [voorstel, ...kanWel] : kanWel,
      kan_niet: antwoord === "niet_akkoord" && voorstel ? [voorstel] : [],
    });
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Opslaan mislukt."); return; }
    onKlaar(r.wacht);
  }

  const KEUZES: { key: Antwoord; Icon: typeof CheckCircle2; kleur: string }[] = [
    { key: "akkoord", Icon: CheckCircle2, kleur: "border-green-500 bg-green-50 text-green-800" },
    { key: "niet_akkoord", Icon: XCircle, kleur: "border-amber-500 bg-amber-50 text-amber-800" },
    { key: "niet_thuis", Icon: DoorClosed, kleur: "border-ink-400 bg-ink-50 text-ink-700" },
    { key: "weigert", Icon: Ban, kleur: "border-red-500 bg-red-50 text-red-800" },
  ];

  return (
    <div className="space-y-4">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-semibold text-sky-700">
        <ArrowLeft className="h-4 w-4" /> Terug naar de groep
      </button>

      <div>
        <h3 className="text-xl font-bold text-ink-900">{adresTekst(adres)}</h3>
        <p className="text-sm text-ink-500">{adres.postcode} {adres.plaats}</p>
      </div>

      <div className="rounded-2xl bg-sky-50 px-4 py-3">
        <span className="block text-[11px] font-semibold uppercase tracking-wide text-sky-700">Voorgestelde dag</span>
        <span className="block text-lg font-bold text-sky-900">{voorstel ? datumNL(voorstel) : "nog geen datum"}</span>
        <span className="block text-xs text-sky-800">Thuis van {dossier.starttijd || "08:00"} tot 16:00 · de hele straat tegelijk.</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {KEUZES.map(({ key, Icon, kleur }) => (
          <button key={key} type="button" onClick={() => setAntwoord(key)}
            className={`flex flex-col items-center gap-1.5 rounded-2xl border-2 px-3 py-4 text-sm font-bold transition-colors ${
              antwoord === key ? kleur : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"}`}>
            <Icon className="h-6 w-6" />
            {ANTWOORD_INFO[key].label}
          </button>
        ))}
      </div>

      {antwoord && antwoord !== "niet_thuis" && (
        <div className="space-y-3">
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink-700">Naam bewoner</span>
            <input value={bewoner} onChange={(e) => setBewoner(e.target.value)} className={veld} placeholder="Fam. Jansen" />
          </div>
          <div>
            <span className="mb-1.5 block text-sm font-semibold text-ink-700">Telefoonnummer</span>
            <input value={telefoon} onChange={(e) => setTelefoon(e.target.value)} inputMode="tel" className={veld} placeholder="06…" />
          </div>
        </div>
      )}

      {antwoord === "niet_akkoord" && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
          <span className="block text-sm font-semibold text-amber-900">Wanneer kan het wél?</span>
          <p className="mb-2 text-xs text-amber-800">
            Zonder dit antwoord is de volgende ronde weer gokken. Wat hier staat telt in élke volgende ronde mee.
          </p>
          <DatumKiezer value="" onChange={(d) => d && setKanWel((v) => (v.includes(d) ? v : [...v, d]))} placeholder="Dag toevoegen" />
          {kanWel.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {kanWel.map((d) => (
                <button key={d} type="button" onClick={() => setKanWel((v) => v.filter((x) => x !== d))}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 ring-1 ring-amber-200">
                  {datumNL(d)} <XCircle className="h-3.5 w-3.5" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {antwoord && (
        <div>
          <span className="mb-1.5 block text-sm font-semibold text-ink-700">Opmerking</span>
          <textarea value={opmerking} onChange={(e) => setOpmerking(e.target.value)} rows={2} className={veld} placeholder="Bijzonderheden…" />
        </div>
      )}

      {fout && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{fout}</p>}

      <button type="button" onClick={() => void bewaar()} disabled={!antwoord || bezig}
        className={`${knop} w-full bg-sky-600 py-4 text-base text-white hover:bg-sky-700 disabled:opacity-60`}>
        {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />} Vastleggen
      </button>
    </div>
  );
}

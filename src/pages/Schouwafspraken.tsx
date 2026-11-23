import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, CalendarX, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Settings2, User as UserIcon, Clock, Download, FolderOpen, FolderPlus, Pencil, Phone, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer, normaliseerTijd } from "../components/TijdKiezer";
import { Keuze } from "../components/Keuze";
import { SCHOUW_STATUSSEN, type SchouwStatus, type Schouwafspraak, type SchouwMap } from "../lib/types";
import { AfsprakenPeriode, TijdblokKeuze } from "../components/PlanningInstellen";
import { isISODatum, toISO, verschuifWeek, weekBereik, weekNummer, weekStartISO } from "../lib/week";
import {
  bouwWeek, dagenVanWeek, exportDagen, mapOverzicht, normPlaats, sorteerOpTijd, tijdLabel, tijdenVan, verwijderdeDagen, WEEKDAG_NAMEN, type MapOverzicht, tijdenVersie, heeftTweeBlokken, planningDagen
} from "../lib/schouw";
import { exporteerSchouwPlanning, exporteerBodemPlanning } from "../lib/schouwExcel";
import { isToegewezen, toegewezenIds, toewijzingPatch } from "../lib/toewijzing";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";
const knop = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50";

const statusTone: Record<SchouwStatus, "slate" | "amber" | "green" | "red"> = {
  "In te plannen": "slate",
  Ingepland: "amber",
  Uitgevoerd: "green",
  Geannuleerd: "red",
};

const dagKort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const vandaagISO = () => toISO(new Date());

// Dezelfde pagina doet ook de afspraken van Bodemonderzoeken: één systeem is makkelijker voor de
// medewerkers. Verschil: bij bodemonderzoek is de naam van de bewoner verplicht en gaat de planning in
// het sjabloon van de opdrachtgever (met een kolom voor de naam).
type Soort = "schouw" | "bodem";
const BODEM_TIJDEN = { van: "08:00", tot: "16:00", minuten: 60 };
const SoortCtx = createContext<Soort>("schouw");

// ───────────────────────── Overzicht: één map per stad / plaats ─────────────────────────
export function Schouwafspraken({ soort = "schouw", extra }: { soort?: Soort; extra?: React.ReactNode }) {
  const { schouwafspraken: alleAfspraken, schouwMappen: alleMappen, addSchouwMap, deleteSchouwMap, updateSchouwMap, currentUser } = useApp();
  const bodem = soort === "bodem";
  const schouwafspraken = useMemo(() => alleAfspraken.filter((a) => (a.soort === "bodem") === bodem), [alleAfspraken, bodem]);
  const schouwMappen = useMemo(() => alleMappen.filter((m) => (m.soort === "bodem") === bodem), [alleMappen, bodem]);
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState("");

  // Gearchiveerde afspraken (van vóór de mappen) horen niet meer in de weekplanning.
  const actief = useMemo(() => schouwafspraken.filter((s) => !s.gearchiveerd), [schouwafspraken]);
  const mappen = useMemo(() => mapOverzicht(schouwMappen, actief), [schouwMappen, actief]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  if (gekozen !== null) {
    const m = mappen.find((x) => x.sleutel === gekozen);
    if (m) return <SoortCtx.Provider value={soort}><MapDetail key={m.sleutel} overzicht={m} terug={() => setGekozen(null)} /></SoortCtx.Provider>;
  }

  const huidigeWeek = weekStartISO(vandaagISO());
  const vandaag = vandaagISO();

  // Een plaats afronden vanuit het overzicht: zonder PD-nummer wordt erom gevraagd. Daarna staat de plaats
  // bij de boekhouding (Roxanne) om te factureren; plaatsen met hetzelfde PD-nummer komen op één factuur.
  const rondAf = (m: SchouwMap) => {
    let pd = m.pdNummer;
    if (!pd) {
      const invoer = prompt(`PD-nummer voor bodemonderzoek ${m.naam} (alleen de cijfers):`, "");
      if (invoer === null) return;
      const cijfers = invoer.replace(/[^0-9]/g, "");
      if (!cijfers) { alert("Vul een PD-nummer in om het project af te ronden."); return; }
      pd = `PD${cijfers}`;
    }
    const zelfde = schouwMappen.filter((x) => x.id !== m.id && x.pdNummer === pd && x.boekhouding === "te_factureren").map((x) => x.naam);
    const extraTekst = zelfde.length ? `\n\nOp ${pd} staat ook al: ${zelfde.join(", ")}. Dit komt samen op één factuur.` : "";
    if (!confirm(`Bodemonderzoek ${m.naam} (${pd}) afronden? Het gaat dan naar de boekhouding om te factureren.${extraTekst}`)) return;
    updateSchouwMap(m.id, { pdNummer: pd, boekhouding: "te_factureren", afgerondOp: new Date().toISOString() });
  };

  const maakMap = () => {
    const naam = nieuw.trim().replace(/\s+/g, " ");
    if (!naam) return;
    if (!mappen.some((m) => m.sleutel === normPlaats(naam))) addSchouwMap(naam, bodem ? "bodem" : undefined);
    setNieuw("");
    setGekozen(normPlaats(naam));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">{bodem ? "Bodemonderzoeken" : "Schouwafspraken"}</h2>
        <p className="text-sm text-ink-500">Per stad of plaats een map. Open een map, kies de week en vul de afspraken in; de planning voor {bodem ? "de opdrachtgever" : "Stedin"} wordt geautomatiseerd verwerkt in Excel.</p>
      </div>
      {extra}

      <Card className="p-4">
        <label className={labelCls} htmlFor="nieuwe-map">Nieuwe map (stad / plaats)</label>
        <div className="flex flex-wrap gap-2">
          <input
            id="nieuwe-map"
            value={nieuw}
            onChange={(e) => setNieuw(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") maakMap(); }}
            placeholder="Bijvoorbeeld Rotterdam"
            className={veld + " min-w-0 flex-1"}
          />
          <button type="button" onClick={maakMap} disabled={!nieuw.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
            <FolderPlus className="h-4 w-4" /> Map aanmaken
          </button>
        </div>
      </Card>

      {mappen.length === 0 ? (
        <Card className="p-10 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Nog geen mappen. Maak hierboven een map voor de eerste stad of plaats.</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mappen.map((m) => {
            const dezeWeek = m.afspraken.filter((a) => a.datum && weekStartISO(a.datum) === huidigeWeek).length;
            const komend = m.afspraken.filter((a) => a.datum >= vandaag && a.status !== "Geannuleerd").length;
            const nogIn = m.afspraken.filter((a) => !a.datum).length;
            return (
              <Card key={m.sleutel} className="p-0">
                <button type="button" onClick={() => setGekozen(m.sleutel)} className="flex w-full items-start gap-3 rounded-2xl p-4 text-left hover:bg-ink-50">
                  <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><FolderOpen className="h-5 w-5" /></div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-bold text-ink-900">{m.naam}</span>
                      {bodem && m.record?.pdNummer && <span className="shrink-0 rounded-md bg-ink-900 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white">{m.record.pdNummer}</span>}
                    </div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {m.afspraken.length === 0 ? "Nog geen afspraken" : `${m.afspraken.length} ${m.afspraken.length === 1 ? "afspraak" : "afspraken"}`}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {dezeWeek > 0 && <Badge tone="amber">{dezeWeek} deze week</Badge>}
                      {komend > 0 && <Badge tone="slate">{komend} gepland</Badge>}
                      {nogIn > 0 && <Badge tone="red">{nogIn} zonder datum</Badge>}
                      {bodem && m.record?.boekhouding === "te_factureren" && <Badge tone="indigo">Afgerond · te factureren</Badge>}
                      {bodem && m.record?.boekhouding === "gefactureerd" && <Badge tone="green">Gefactureerd</Badge>}
                    </div>
                  </div>
                </button>
                {bodem && isLeiding && m.record && !m.record.boekhouding && (
                  <div className="border-t border-ink-100 px-4 py-2">
                    <button
                      type="button"
                      onClick={() => rondAf(m.record!)}
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-xs font-bold text-white hover:bg-green-700"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> {m.naam} afronden{m.record.pdNummer ? ` · ${m.record.pdNummer}` : ""}
                    </button>
                  </div>
                )}
                {isLeiding && m.record && m.afspraken.length === 0 && (
                  <div className="border-t border-ink-100 px-4 py-2 text-right">
                    <button
                      type="button"
                      onClick={() => { if (confirm(`Map "${m.naam}" verwijderen?`)) deleteSchouwMap(m.record!.id); }}
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Lege map verwijderen
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

// Weken (maandagen) van de hele bodemplanning: de dagen van de ingestelde periode plus de weken waar
// afspraken op staan. Zonder beide: alleen de getoonde week.
function wekenVanPlanning(map: SchouwMap | undefined, afspraken: Schouwafspraak[], terugval: string): string[] {
  const weken = new Set<string>();
  for (const d of planningDagen(map)) weken.add(weekStartISO(d));
  for (const a of afspraken) if (a.datum && isISODatum(a.datum) && a.status !== "Geannuleerd") weken.add(weekStartISO(a.datum));
  if (!weken.size) weken.add(terugval);
  return [...weken].sort();
}

// De week waarin de afspraken gemaakt moeten worden: de eerste (nog komende) dag van de planning, anders
// de eerste komende afspraak, anders de laatste week met afspraken; pas daarna de huidige week.
function startWeekBodem(map: SchouwMap | undefined, afspraken: Schouwafspraak[]): string {
  const vandaag = vandaagISO();
  const periode = planningDagen(map);
  if (periode.length) return weekStartISO(periode.find((d) => d >= vandaag) ?? periode[0]);
  const data = afspraken.map((a) => a.datum).filter((d): d is string => !!d && isISODatum(d)).sort();
  if (data.length) return weekStartISO(data.find((d) => d >= vandaag) ?? data[data.length - 1]);
  return weekStartISO(vandaag);
}

// ───────────────────────── Eén map: weekplanning ─────────────────────────
type FormState = { datum: string; tijd: string; straat: string; huisnummer: string; naam: string; telefoon: string; notitie: string; toegewezenAan: string[]; status: SchouwStatus; blok: 1 | 2 };

function MapDetail({ overzicht, terug }: { overzicht: MapOverzicht; terug: () => void }) {
  const bodem = useContext(SoortCtx) === "bodem";
  const soortVeld = bodem ? ("bodem" as const) : undefined;
  // De vaste tijdvakken van Den Haag en Rotterdam gelden alleen voor schouwafspraken.
  const plaatsTijden = bodem ? "" : overzicht.naam;
  const { users, currentUser, addSchouw, updateSchouw, deleteSchouw, addSchouwMap, updateSchouwMap } = useApp();
  const { record, afspraken } = overzicht;
  // Bodemonderzoek opent meteen op de week waarin de afspraken gemaakt moeten worden (de planning),
  // niet op de huidige week.
  const [maandag, setMaandag] = useState(() => (bodem ? startWeekBodem(record, afspraken) : weekStartISO(vandaagISO())));
  const [form, setForm] = useState<FormState | null>(null);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [tijdenDag, setTijdenDag] = useState<string | null>(null);
  const [planningOpen, setPlanningOpen] = useState(false);
  const [bezig, setBezig] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  // Bodemonderzoek werkt altijd met hele uren; zonder eigen keuze 08:00 tot 16:00 per uur.
  const tijdRecord = useMemo<SchouwMap | undefined>(() => {
    if (!bodem) return record;
    const basis = record ?? ({ id: "", naam: overzicht.naam, aangemaakt: "", bijgewerktOp: "" } as SchouwMap);
    return { ...basis, planning: { ...(basis.planning ?? {}), tijden: { ...BODEM_TIJDEN, ...(basis.planning?.tijden ?? {}), minuten: 60 } } };
  }, [bodem, record, overzicht.naam]);
  const week = useMemo(() => bouwWeek(tijdRecord, maandag, afspraken, plaatsTijden), [tijdRecord, maandag, afspraken, plaatsTijden]);
  const zonderDatum = useMemo(() => afspraken.filter((a) => !a.datum || !isISODatum(a.datum)), [afspraken]);
  const wekenMetWerk = useMemo(() => {
    const t = new Map<string, number>();
    for (const a of afspraken) {
      const w = a.datum && isISODatum(a.datum) ? weekStartISO(a.datum) : "";
      if (w) t.set(w, (t.get(w) ?? 0) + 1);
    }
    return [...t.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [afspraken]);

  // Eenmalig zodra een plaats nieuwe vaste tijdvakken krijgt (Den Haag, Rotterdam): eerder opgeslagen
  // tijdvakken van deze en latere weken vervallen, zodat de nieuwe indeling overal geldt. Afgelopen weken
  // en alle afspraken blijven gewoon staan.
  useEffect(() => {
    const vereist = record && !bodem ? tijdenVersie(record.naam) : 0;
    if (!record || (record.tijdenVersie ?? 0) >= vereist) return;
    const huidige = weekStartISO(vandaagISO());
    const weken = Object.fromEntries(Object.entries(record.weken ?? {}).filter(([ma]) => ma < huidige));
    updateSchouwMap(record.id, { weken, tijdenVersie: vereist });
  }, [record, updateSchouwMap, bodem]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";
  const magVerwijderen = (a: Schouwafspraak) => isLeiding || !a.toegewezenAan || isToegewezen(a, currentUser.id);
  const nr = weekNummer(maandag);
  const kanTijdenAanpassen = overzicht.sleutel !== ""; // "Zonder plaats" is geen echte map
  const twee = heeftTweeBlokken(plaatsTijden); // twee planningen per dag (Rotterdam)

  // Eigen planning (periode + tijdblokken). Nieuwe tijdblokken gelden vanaf deze week; eerder per dag
  // aangepaste tijdvakken vanaf nu vervallen dan, zodat overal hetzelfde staat.
  const zetPlanning = (patch: NonNullable<SchouwMap["planning"]>, nieuweTijden = false) => {
    const id = record?.id ?? addSchouwMap(overzicht.naam, soortVeld);
    const planning = { ...(record?.planning ?? {}), ...patch };
    const huidige = weekStartISO(vandaagISO());
    const weken = nieuweTijden ? Object.fromEntries(Object.entries(record?.weken ?? {}).filter(([ma]) => ma < huidige)) : record?.weken;
    updateSchouwMap(id, { planning, ...(nieuweTijden ? { weken } : {}) });
    // Naar de eerste week van de periode, zodat je meteen ziet wat je instelt.
    const eerste = planningDagen({ ...(record ?? { id, naam: overzicht.naam, aangemaakt: "", bijgewerktOp: "" }), planning })[0];
    if (eerste && !nieuweTijden) setMaandag(weekStartISO(eerste));
  };
  const periodeDagen = planningDagen(record);
  const pt = record?.planning?.tijden;
  const planningSamenvatting = [
    periodeDagen.length
      ? (record?.planning?.losseDagen ? `${periodeDagen.length} losse ${periodeDagen.length === 1 ? "dag" : "dagen"}` : `${dagKort(periodeDagen[0])} t/m ${dagKort(periodeDagen[periodeDagen.length - 1])}`)
      : "Geen vaste periode",
    pt ? `${pt.van}–${pt.tot}, ${pt.minuten === 60 ? "per uur" : `tijdvak ${pt.minuten} min`}` : bodem ? "08:00–16:00, per uur" : "vaste tijdvakken",
  ].join(" · ");

  // Tijdvakken van een willekeurige datum (voor de tijdknoppen in het formulier).
  const vakkenVoor = (iso: string): string[] => {
    if (!isISODatum(iso)) return [];
    const ma = weekStartISO(iso);
    const dagIndex = (new Date(iso + "T00:00:00").getDay() + 6) % 7;
    if (dagIndex >= 5 && !record?.weken?.[ma]?.[iso] && !planningDagen(record).includes(iso)) return [];
    return tijdenVan(tijdRecord, ma, iso, dagIndex, plaatsTijden);
  };

  const openNieuw = (datum = "", tijd = "", blok: 1 | 2 = 1) => {
    setBewerkId(null);
    setForm({ datum, tijd, straat: "", huisnummer: "", naam: "", telefoon: "", notitie: "", toegewezenAan: [currentUser.id], status: "In te plannen", blok });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const openBewerk = (a: Schouwafspraak) => {
    setBewerkId(a.id);
    setForm({ datum: a.datum, tijd: a.tijd, straat: a.straat, huisnummer: a.huisnummer, naam: a.contactNaam ?? "", telefoon: a.telefoon, notitie: a.notitie, toegewezenAan: toegewezenIds(a), status: a.status, blok: a.blok === 2 ? 2 : 1 });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const sluit = () => { setForm(null); setBewerkId(null); };
  const set = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  const opslaan = () => {
    if (!form || !form.straat.trim() || !form.huisnummer.trim() || (bodem && !form.naam.trim())) return;
    // Status volgt de datum: met datum = "Ingepland", zonder = "In te plannen" — tenzij de afspraak al
    // handmatig op Uitgevoerd of Geannuleerd is gezet.
    const handmatig = form.status === "Uitgevoerd" || form.status === "Geannuleerd";
    const status: SchouwStatus = handmatig ? form.status : form.datum ? "Ingepland" : "In te plannen";
    const data = {
      straat: form.straat.trim(), huisnummer: form.huisnummer.trim(), telefoon: form.telefoon.trim(), notitie: form.notitie.trim(),
      ...(bodem ? { contactNaam: form.naam.trim() } : {}),
      datum: form.datum, tijd: form.tijd, ...toewijzingPatch(form.toegewezenAan), status,
      blok: twee && form.blok === 2 ? (2 as const) : undefined,
    };
    if (bewerkId) updateSchouw(bewerkId, data);
    else addSchouw({ contactNaam: "", ...data, postcode: "", plaats: overzicht.sleutel ? overzicht.naam : "", ...(soortVeld ? { soort: soortVeld } : {}) });
    // De week volgt de gekozen datum, zodat je de afspraak meteen op de planning ziet staan.
    if (form.datum && isISODatum(form.datum)) setMaandag(weekStartISO(form.datum));
    sluit();
  };

  // Tijdvakken van één dag aanpassen. De eerste keer maken we (indien nodig) de map aan.
  const zetDagTijden = (iso: string, lijst: string[] | null) => {
    const id = record?.id ?? addSchouwMap(overzicht.naam, soortVeld);
    const weken = { ...(record?.weken ?? {}) };
    const w = { ...(weken[maandag] ?? {}) };
    if (lijst === null) delete w[iso];
    else w[iso] = [...new Set(lijst)].sort(sorteerOpTijd);
    if (Object.keys(w).length) weken[maandag] = w;
    else delete weken[maandag];
    updateSchouwMap(id, { weken });
  };

  // Een dag laten vervallen (bv. een feestdag): hij verdwijnt uit het raster én uit de Excel voor Stedin.
  // Staan er nog afspraken op, dan eerst die verplaatsen of verwijderen, zodat er niets zoekraakt.
  const zetVerwijderd = (iso: string, weg: boolean) => {
    const id = record?.id ?? addSchouwMap(overzicht.naam, soortVeld);
    const huidig = verwijderdeDagen(record, maandag);
    const nieuw = weg ? [...new Set([...huidig, iso])] : huidig.filter((d) => d !== iso);
    const alle = { ...(record?.verwijderdeDagen ?? {}) };
    if (nieuw.length) alle[maandag] = nieuw;
    else delete alle[maandag];
    updateSchouwMap(id, { verwijderdeDagen: alle });
  };
  const verwijderDag = (dag: { datum: string; naam: string; regels: { afspraken: Schouwafspraak[] }[] }) => {
    const n = dag.regels.reduce((m, r) => m + r.afspraken.length, 0);
    if (n > 0) {
      alert(`Op ${dag.naam.toLowerCase()} ${dagKort(dag.datum)} staan nog ${n} ${n === 1 ? "afspraak" : "afspraken"}. Verplaats of verwijder die eerst, dan kun je de dag verwijderen.`);
      return;
    }
    if (!confirm(`${dag.naam} ${dagKort(dag.datum)} verwijderen uit week ${nr}? De dag komt dan ook niet op de planning voor Stedin.`)) return;
    if (tijdenDag === dag.datum) setTijdenDag(null);
    zetVerwijderd(dag.datum, true);
  };

  const download = async () => {
    setBezig(true);
    try {
      if (bodem) {
        // Eén geheel: alle weken van de planning (en waar afspraken op staan) in één Excel.
        const weken = wekenVanPlanning(record, afspraken, maandag);
        const dagen = weken.flatMap((w) => exportDagen(bouwWeek(tijdRecord, w, afspraken, plaatsTijden)));
        await exporteerBodemPlanning({ plaats: overzicht.naam, maandag: weken[0], tot: weken[weken.length - 1], dagen, naamVan });
      }
      else await exporteerSchouwPlanning({ plaats: overzicht.naam, maandag, dagen: exportDagen(week) });
    } finally {
      setBezig(false);
    }
  };

  // Werkdagen van deze week die zijn verwijderd (en dus niet in het raster staan), om terug te kunnen zetten.
  const verwijderdeLijst = dagenVanWeek(maandag)
    .map((iso, i) => ({ iso, naam: WEEKDAG_NAMEN[i], i }))
    .filter((d) => d.i < 5 && verwijderdeDagen(record, maandag).includes(d.iso) && !week.some((w) => w.datum === d.iso));
  const inWeek = week.reduce((n, d) => n + d.regels.reduce((m, r) => m + r.afspraken.filter((a) => a.status !== "Geannuleerd").length, 0), 0);
  const formVakken = form ? vakkenVoor(form.datum) : [];
  const bezetOp = (iso: string, t: string, blok: 1 | 2 = 1) =>
    afspraken.some((a) => a.id !== bewerkId && a.datum === iso && a.tijd === t && a.status !== "Geannuleerd" && (!twee || (a.blok === 2 ? 2 : 1) === blok));

  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={terug} className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Alle mappen
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink-900">{overzicht.naam}</h2>
            <p className="text-sm text-ink-500">{bodem ? "Afspraken voor bodemonderzoek" : "Schouwafspraken"} per week. Het weeknummer volgt de gekozen datum.</p>
          </div>
          <button type="button" onClick={() => openNieuw()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> {bodem ? "Nieuwe afspraak" : "Nieuwe schouwafspraak"}
          </button>
        </div>
      </div>

      {/* Bodemonderzoek: PD-nummer en afronden → naar de boekhouding (Facturen) */}
      {bodem && kanTijdenAanpassen && isLeiding && (
        <Card className="p-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-ink-600">PD-nummer</span>
              <div className="flex items-stretch overflow-hidden rounded-lg border border-ink-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
                <span className="flex items-center bg-ink-50 px-2.5 text-sm font-bold text-ink-500">PD</span>
                <input
                  value={(record?.pdNummer ?? "").replace(/^PD/i, "")}
                  onChange={(e) => {
                    const cijfers = e.target.value.replace(/[^0-9]/g, "");
                    const id = record?.id ?? addSchouwMap(overzicht.naam, "bodem");
                    updateSchouwMap(id, { pdNummer: cijfers ? `PD${cijfers}` : undefined });
                  }}
                  inputMode="numeric"
                  placeholder="123456"
                  disabled={record?.boekhouding === "gefactureerd"}
                  className="w-36 px-3 py-2 text-sm outline-none disabled:bg-ink-50"
                />
              </div>
            </label>
            <div className="flex-1" />
            {!record?.boekhouding ? (
              <button
                type="button"
                disabled={!record?.pdNummer}
                title={record?.pdNummer ? undefined : "Vul eerst het PD-nummer in"}
                onClick={() => {
                  if (!record?.pdNummer) return;
                  if (!confirm(`Bodemonderzoek ${overzicht.naam} (${record.pdNummer}) als afgerond aanvinken? Het gaat dan naar de boekhouding om te factureren.`)) return;
                  const nu = new Date().toISOString();
                  updateSchouwMap(record.id, { boekhouding: "te_factureren", afgerondOp: nu });
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <CheckCircle2 className="h-4 w-4" /> Project afgerond
              </button>
            ) : record.boekhouding === "te_factureren" ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-700">
                  <CheckCircle2 className="h-4 w-4" /> Afgerond · bij de boekhouding om te factureren
                </span>
                <button type="button" onClick={() => updateSchouwMap(record.id, { boekhouding: undefined, afgerondOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">ongedaan maken</button>
              </div>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700">
                <CheckCircle2 className="h-4 w-4" /> Gefactureerd{record.gefactureerdOp ? ` op ${new Date(record.gefactureerdOp).toLocaleDateString("nl-NL")}` : ""}
              </span>
            )}
          </div>
          {!record?.pdNummer && !record?.boekhouding && <p className="mt-2 text-xs text-ink-500">Met het PD-nummer erbij kan de boekhouding meteen de factuur maken zodra het project is afgerond.</p>}
        </Card>
      )}

      {/* Planning instellen: dezelfde opzet als bij Bodemonderzoeken (periode + tijdblokken) */}
      {kanTijdenAanpassen && isLeiding && (
        <Card className="p-4">
          <button type="button" onClick={() => setPlanningOpen((o) => !o)} className="flex w-full items-center justify-between gap-3 text-left">
            <span>
              <span className="flex items-center gap-2 text-sm font-bold text-ink-900"><Settings2 className="h-4 w-4 text-ink-500" /> Planning instellen</span>
              <span className="mt-0.5 block text-xs text-ink-500">{planningSamenvatting}</span>
            </span>
            <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${planningOpen ? "rotate-180" : ""}`} />
          </button>
          {planningOpen && (
            <div className="mt-4 space-y-4 border-t border-ink-100 pt-4">
              <AfsprakenPeriode periode={record?.planning} onWijzig={(p) => zetPlanning(p)} />
              <TijdblokKeuze tijden={tijdRecord?.planning?.tijden} alleenUren={bodem} onWijzig={(t) => zetPlanning({ tijden: bodem ? { ...t, minuten: 60 } : t }, true)}>
                <div className="flex flex-wrap gap-1.5">
                  {tijdRecord?.planning?.tijden
                    ? tijdenVan(tijdRecord, "", "", 1, plaatsTijden).map((t) => <span key={t} className="rounded-md bg-ink-100 px-2 py-1 text-xs font-semibold text-ink-700">{tijdLabel(t)}</span>)
                    : <span className="text-xs text-ink-500">{bodem ? "Nog de standaard tijdvakken." : `Nog de vaste tijdvakken van ${overzicht.naam}.`} Kies van, tot en tijdvak om eigen tijdblokken te gebruiken.</span>}
                </div>
              </TijdblokKeuze>
              {record?.planning && (
                <button type="button" onClick={() => { if (record) updateSchouwMap(record.id, { planning: undefined }); }} className={knop}>
                  <RotateCcw className="h-3.5 w-3.5" /> {bodem ? "Terug naar de standaard tijdvakken" : "Terug naar de vaste tijdvakken"}
                </button>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Weekkiezer + download */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMaandag(verschuifWeek(maandag, -1))} className={knop} aria-label="Vorige week"><ChevronLeft className="h-4 w-4" /></button>
          <div className="w-64 max-w-full">
            <DatumKiezer value={maandag} onChange={(iso) => iso && setMaandag(weekStartISO(iso))} weergave={`Week ${nr} · ${weekBereik(maandag)}`} />
          </div>
          <button type="button" onClick={() => setMaandag(verschuifWeek(maandag, 1))} className={knop} aria-label="Volgende week"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={download} disabled={bezig || week.length === 0} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download className="h-4 w-4" /> {bezig ? "Bezig…" : (bodem ? "Volledige planning (Excel)" : `Planning week ${nr} voor Stedin (Excel)`)}
          </button>
        </div>
        {wekenMetWerk.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-ink-500">Weken met afspraken:</span>
            {wekenMetWerk.map(([ma, n]) => (
              <button
                key={ma}
                type="button"
                onClick={() => setMaandag(ma)}
                className={`rounded-full border px-2.5 py-1 font-semibold ${ma === maandag ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}
              >
                Week {weekNummer(ma)} ({n})
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Formulier */}
      {form && (
        <div ref={formRef}>
          <Card className="space-y-3 p-5 ring-2 ring-brand-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-900">{bewerkId ? (bodem ? "Afspraak bewerken" : "Schouwafspraak bewerken") : (bodem ? "Nieuwe afspraak" : "Nieuwe schouwafspraak")} · {overzicht.naam}</h3>
              <button type="button" onClick={sluit} className="text-ink-400 hover:text-ink-600" aria-label="Sluiten"><X className="h-5 w-5" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Datum {isISODatum(form.datum) && <span className="font-normal text-ink-400">· week {weekNummer(form.datum)}</span>}</label>
                <DatumKiezer value={form.datum} onChange={(iso) => set({ datum: iso })} placeholder="Nog in te plannen" />
              </div>
              <div>
                <label className={labelCls}>Tijd</label>
                <TijdKiezer value={form.tijd} onChange={(tijd) => set({ tijd })} />
              </div>
            </div>
            {formVakken.length > 0 && (
              <div>
                <div className={labelCls}>Tijdvakken van {dagKort(form.datum)}</div>
                {(twee ? ([1, 2] as const) : ([1] as const)).map((blok) => (
                  <div key={blok} className={twee ? "mb-1.5 flex flex-wrap items-center gap-1.5" : "flex flex-wrap gap-1.5"}>
                    {twee && <span className="w-20 text-xs font-semibold text-ink-500">Planning {blok}</span>}
                    {formVakken.map((t) => {
                      const bezet = bezetOp(form.datum, t, blok);
                      const gekozen = form.tijd === t && (!twee || form.blok === blok);
                      return (
                        <button
                          key={t}
                          type="button"
                          onClick={() => set({ tijd: t, blok })}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${gekozen ? "border-brand-600 bg-brand-600 text-white" : bezet ? "border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200 bg-white text-ink-700 hover:border-brand-400"}`}
                          title={bezet ? "Dit tijdvak is al gevuld" : undefined}
                        >
                          {tijdLabel(t)}{bezet && !gekozen ? " ·" : ""}
                        </button>
                      );
                    })}
                  </div>
                ))}
                <p className="mt-1 text-xs text-ink-400">Een punt achter de tijd betekent dat er al een afspraak in dat vak staat.</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2"><label className={labelCls}>Straatnaam</label><input value={form.straat} onChange={(e) => set({ straat: e.target.value })} placeholder="Straatnaam" className={veld} /></div>
              <div><label className={labelCls}>Huisnummer</label><input value={form.huisnummer} onChange={(e) => set({ huisnummer: e.target.value })} placeholder="12 of 12B" className={veld} /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {bodem && <div><label className={labelCls}>Naam bewoner <span className="text-red-600">*</span></label><input value={form.naam} onChange={(e) => set({ naam: e.target.value })} placeholder="Voor- en achternaam" className={veld} /></div>}
              <div><label className={labelCls}>Telefoonnummer</label><input value={form.telefoon} onChange={(e) => set({ telefoon: e.target.value })} inputMode="tel" placeholder="06 …" className={veld} /></div>
              {isLeiding && (
                <div>
                  <label className={labelCls}>Medewerker</label>
                  <WerknemerKiezer values={form.toegewezenAan} onChange={(ids) => set({ toegewezenAan: ids })} users={users} leegLabel="Niet toegewezen" />
                </div>
              )}
            </div>
            <div><label className={labelCls}>Opmerkingen (optioneel)</label><textarea value={form.notitie} onChange={(e) => set({ notitie: e.target.value })} rows={2} placeholder="Bijvoorbeeld: bel 15 min van tevoren" className={veld + " resize-none"} /></div>
            {bewerkId && (
              <div className="max-w-xs">
                <label className={labelCls}>Status</label>
                <Keuze value={form.status} onChange={(w) => set({ status: w as SchouwStatus })} opties={SCHOUW_STATUSSEN.map((st) => ({ waarde: st, label: st }))} title="Status" />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={opslaan} disabled={!form.straat.trim() || !form.huisnummer.trim() || (bodem && !form.naam.trim())} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                <Plus className="h-4 w-4" /> {bewerkId ? "Opslaan" : "Toevoegen"}
              </button>
              <button type="button" onClick={sluit} className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
            </div>
          </Card>
        </div>
      )}

      {/* Afspraken zonder datum */}
      {zonderDatum.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Nog niet ingepland ({zonderDatum.length})</h3>
          <div className="divide-y divide-ink-100">
            {zonderDatum.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-2 py-2 text-sm">
                <span className="font-semibold text-ink-900">{a.straat} {a.huisnummer}</span>
                {a.telefoon && <span className="text-ink-500">{a.telefoon}</span>}
                <Badge tone={statusTone[a.status]}>{a.status}</Badge>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" onClick={() => openBewerk(a)} className={knop}><Pencil className="h-3.5 w-3.5" /> Datum kiezen</button>
                  {magVerwijderen(a) && (
                    <button type="button" onClick={() => { if (confirm(`${bodem ? "Afspraak" : "Schouwafspraak"} ${a.straat} ${a.huisnummer} verwijderen?`)) deleteSchouw(a.id); }} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                  )}
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Weekraster */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-ink-900">Week {nr} · {weekBereik(maandag)}</h3>
        <span className="text-xs text-ink-500">{inWeek} {inWeek === 1 ? "afspraak" : "afspraken"} deze week</span>
      </div>

      {week.map((dag) => {
        const aangepast = !!record?.weken?.[maandag]?.[dag.datum];
        const open = tijdenDag === dag.datum;
        const vakken = [...new Set(dag.regels.filter((r) => r.eigenVak).map((r) => r.tijd))];
        return (
          <Card key={dag.datum} className="overflow-hidden p-0">
            <div className="flex flex-wrap items-center gap-2 bg-amber-100/70 px-4 py-2.5">
              <span className="text-sm font-bold text-ink-900">{dag.naam}</span>
              <span className="text-sm text-ink-600">{dagKort(dag.datum)}</span>
              {aangepast && <Badge tone="amber">Aangepaste tijdvakken</Badge>}
              {kanTijdenAanpassen && (
                <span className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => setTijdenDag(open ? null : dag.datum)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-white/70">
                    <Clock className="h-3.5 w-3.5" /> {open ? "Klaar" : "Tijdvakken aanpassen"}
                  </button>
                  <button type="button" onClick={() => verwijderDag(dag)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-red-600 hover:bg-white/70" title="Deze dag laten vervallen">
                    <CalendarX className="h-3.5 w-3.5" /> Dag verwijderen
                  </button>
                </span>
              )}
            </div>

            {open && (
              <div className="space-y-2 border-b border-ink-100 bg-ink-50/60 px-4 py-3">
                <div className="flex flex-wrap gap-1.5">
                  {vakken.length === 0 && <span className="text-xs text-ink-500">Geen tijdvakken op deze dag.</span>}
                  {vakken.map((t) => (
                    <span key={t} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white py-1 pl-3 pr-1.5 text-sm font-semibold text-ink-800">
                      {tijdLabel(t)}
                      <button type="button" onClick={() => zetDagTijden(dag.datum, vakken.filter((x) => x !== t))} className="rounded p-0.5 text-ink-400 hover:bg-red-50 hover:text-red-600" aria-label={`Tijdvak ${tijdLabel(t)} verwijderen`}><X className="h-3.5 w-3.5" /></button>
                    </span>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="w-52">
                    <TijdKiezer
                      value=""
                      placeholder="Tijdvak toevoegen…"
                      onChange={(t) => { const n = normaliseerTijd(t); if (n) zetDagTijden(dag.datum, [...vakken, n]); }}
                    />
                  </div>
                  {aangepast && (
                    <button type="button" onClick={() => zetDagTijden(dag.datum, null)} className={knop}><RotateCcw className="h-3.5 w-3.5" /> Standaard herstellen</button>
                  )}
                </div>
                <p className="text-xs text-ink-400">Geldt alleen voor deze dag in week {nr}. Afspraken die al in een verwijderd tijdvak staan blijven staan.</p>
              </div>
            )}

            <div className="divide-y divide-ink-100">
              {dag.regels.length === 0 && <div className="px-4 py-3 text-sm text-ink-400">Geen tijdvakken. Pas ze aan of voeg een afspraak toe.</div>}
              {dag.regels.map((r, ri) => [
                twee && r.blok === 2 && (ri === 0 || dag.regels[ri - 1].blok !== 2) ? (
                  <div key={`${dag.datum}-tussen`} className="h-2.5 bg-orange-400" aria-label="Tweede planning" title="Tweede planning" />
                ) : null,
                r.afspraken.length === 0 ? (
                  <div key={`${dag.datum}-${r.blok}-${r.tijd}`} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-14 text-sm font-semibold tabular-nums text-ink-700">{tijdLabel(r.tijd)}</span>
                    <span className="text-sm text-ink-400">Vrij</span>
                    <button type="button" onClick={() => openNieuw(dag.datum, r.tijd, r.blok)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                      <Plus className="h-3.5 w-3.5" /> Invullen
                    </button>
                  </div>
                ) : (
                  r.afspraken.map((a, i) => (
                    <div key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
                      <span className="w-14 text-sm font-semibold tabular-nums text-ink-700">{i === 0 ? (r.tijd ? tijdLabel(r.tijd) : "—") : ""}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-bold text-ink-900">{a.straat} {a.huisnummer}</span>
                          {bodem && (a.contactNaam
                            ? <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-sm font-semibold text-ink-800"><UserIcon className="h-3.5 w-3.5 text-ink-500" />{a.contactNaam}</span>
                            : <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">naam ontbreekt</span>)}
                          {a.status !== "Ingepland" && <Badge tone={statusTone[a.status]}>{a.status}</Badge>}
                          {!r.eigenVak && r.tijd && <span className="text-xs text-ink-400">buiten de tijdvakken</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-500">
                          {a.telefoon && <a href={`tel:${a.telefoon}`} className="inline-flex items-center gap-1 text-brand-600"><Phone className="h-3.5 w-3.5" />{a.telefoon}</a>}
                          {toegewezenIds(a).length > 0 && <span>{toegewezenIds(a).map(naamVan).filter(Boolean).join(", ")}</span>}
                        </div>
                        {a.notitie && <p className="mt-1 text-sm text-ink-600">{a.notitie}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openBewerk(a)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-50" title="Bewerken"><Pencil className="h-4 w-4" /></button>
                        {magVerwijderen(a) && (
                          <button type="button" onClick={() => { if (confirm(`${bodem ? "Afspraak" : "Schouwafspraak"} ${a.straat} ${a.huisnummer} verwijderen?`)) deleteSchouw(a.id); }} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  ))
                ),
              ])}
            </div>
          </Card>
        );
      })}

      {verwijderdeLijst.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Verwijderde dagen in week {nr}</h3>
          <div className="flex flex-wrap gap-2">
            {verwijderdeLijst.map((d) => (
              <span key={d.iso} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-ink-50 py-1 pl-3 pr-1.5 text-sm text-ink-700">
                {d.naam} {dagKort(d.iso)}
                <button type="button" onClick={() => zetVerwijderd(d.iso, false)} className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand-600 hover:bg-brand-50"><RotateCcw className="h-3 w-3" /> Terugzetten</button>
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-400">Deze dagen staan niet op de planning voor Stedin.</p>
        </Card>
      )}

      {week.length === 0 && verwijderdeLijst.length === 0 && (
        <Card className="p-10 text-center">
          <CalendarClock className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Er staat niets in deze week.</p>
        </Card>
      )}
    </div>
  );
}

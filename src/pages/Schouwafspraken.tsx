import { useMemo, useRef, useState } from "react";
import { ArrowLeft, CalendarClock, CalendarX, ChevronLeft, ChevronRight, Clock, Download, FolderOpen, FolderPlus, Pencil, Phone, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer, normaliseerTijd } from "../components/TijdKiezer";
import { Keuze } from "../components/Keuze";
import { SCHOUW_STATUSSEN, type SchouwStatus, type Schouwafspraak } from "../lib/types";
import { isISODatum, toISO, verschuifWeek, weekBereik, weekNummer, weekStartISO } from "../lib/week";
import {
  bouwWeek, dagenVanWeek, exportDagen, mapOverzicht, normPlaats, sorteerOpTijd, tijdLabel, tijdenVan, verwijderdeDagen, WEEKDAG_NAMEN, type MapOverzicht,
} from "../lib/schouw";
import { exporteerSchouwPlanning } from "../lib/schouwExcel";

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

// ───────────────────────── Overzicht: één map per stad / plaats ─────────────────────────
export function Schouwafspraken() {
  const { schouwafspraken, schouwMappen, addSchouwMap, deleteSchouwMap, currentUser } = useApp();
  const [gekozen, setGekozen] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState("");

  // Gearchiveerde afspraken (van vóór de mappen) horen niet meer in de weekplanning.
  const actief = useMemo(() => schouwafspraken.filter((s) => !s.gearchiveerd), [schouwafspraken]);
  const mappen = useMemo(() => mapOverzicht(schouwMappen, actief), [schouwMappen, actief]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  if (gekozen !== null) {
    const m = mappen.find((x) => x.sleutel === gekozen);
    if (m) return <MapDetail key={m.sleutel} overzicht={m} terug={() => setGekozen(null)} />;
  }

  const huidigeWeek = weekStartISO(vandaagISO());
  const vandaag = vandaagISO();

  const maakMap = () => {
    const naam = nieuw.trim().replace(/\s+/g, " ");
    if (!naam) return;
    if (!mappen.some((m) => m.sleutel === normPlaats(naam))) addSchouwMap(naam);
    setNieuw("");
    setGekozen(normPlaats(naam));
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Schouwafspraken</h2>
        <p className="text-sm text-ink-500">Per stad of plaats een map. Open een map, kies de week en vul de afspraken in; de planning voor Stedin wordt geautomatiseerd verwerkt in Excel.</p>
      </div>

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
                    <div className="truncate text-sm font-bold text-ink-900">{m.naam}</div>
                    <div className="mt-0.5 text-xs text-ink-500">
                      {m.afspraken.length === 0 ? "Nog geen afspraken" : `${m.afspraken.length} ${m.afspraken.length === 1 ? "afspraak" : "afspraken"}`}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {dezeWeek > 0 && <Badge tone="amber">{dezeWeek} deze week</Badge>}
                      {komend > 0 && <Badge tone="slate">{komend} gepland</Badge>}
                      {nogIn > 0 && <Badge tone="red">{nogIn} zonder datum</Badge>}
                    </div>
                  </div>
                </button>
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

// ───────────────────────── Eén map: weekplanning ─────────────────────────
type FormState = { datum: string; tijd: string; straat: string; huisnummer: string; telefoon: string; notitie: string; toegewezenAan: string; status: SchouwStatus };

function MapDetail({ overzicht, terug }: { overzicht: MapOverzicht; terug: () => void }) {
  const { users, currentUser, addSchouw, updateSchouw, deleteSchouw, addSchouwMap, updateSchouwMap } = useApp();
  const { record, afspraken } = overzicht;
  const [maandag, setMaandag] = useState(() => weekStartISO(vandaagISO()));
  const [form, setForm] = useState<FormState | null>(null);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [tijdenDag, setTijdenDag] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const week = useMemo(() => bouwWeek(record, maandag, afspraken, overzicht.naam), [record, maandag, afspraken, overzicht.naam]);
  const zonderDatum = useMemo(() => afspraken.filter((a) => !a.datum || !isISODatum(a.datum)), [afspraken]);
  const wekenMetWerk = useMemo(() => {
    const t = new Map<string, number>();
    for (const a of afspraken) {
      const w = a.datum && isISODatum(a.datum) ? weekStartISO(a.datum) : "";
      if (w) t.set(w, (t.get(w) ?? 0) + 1);
    }
    return [...t.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [afspraken]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";
  const magVerwijderen = (a: Schouwafspraak) => isLeiding || !a.toegewezenAan || a.toegewezenAan === currentUser.id;
  const nr = weekNummer(maandag);
  const kanTijdenAanpassen = overzicht.sleutel !== ""; // "Zonder plaats" is geen echte map

  // Tijdvakken van een willekeurige datum (voor de tijdknoppen in het formulier).
  const vakkenVoor = (iso: string): string[] => {
    if (!isISODatum(iso)) return [];
    const ma = weekStartISO(iso);
    const dagIndex = (new Date(iso + "T00:00:00").getDay() + 6) % 7;
    if (dagIndex >= 5 && !record?.weken?.[ma]?.[iso]) return [];
    return tijdenVan(record, ma, iso, dagIndex, overzicht.naam);
  };

  const openNieuw = (datum = "", tijd = "") => {
    setBewerkId(null);
    setForm({ datum, tijd, straat: "", huisnummer: "", telefoon: "", notitie: "", toegewezenAan: currentUser.id, status: "In te plannen" });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const openBewerk = (a: Schouwafspraak) => {
    setBewerkId(a.id);
    setForm({ datum: a.datum, tijd: a.tijd, straat: a.straat, huisnummer: a.huisnummer, telefoon: a.telefoon, notitie: a.notitie, toegewezenAan: a.toegewezenAan ?? "", status: a.status });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const sluit = () => { setForm(null); setBewerkId(null); };
  const set = (p: Partial<FormState>) => setForm((f) => (f ? { ...f, ...p } : f));

  const opslaan = () => {
    if (!form || !form.straat.trim() || !form.huisnummer.trim()) return;
    // Status volgt de datum: met datum = "Ingepland", zonder = "In te plannen" — tenzij de afspraak al
    // handmatig op Uitgevoerd of Geannuleerd is gezet.
    const handmatig = form.status === "Uitgevoerd" || form.status === "Geannuleerd";
    const status: SchouwStatus = handmatig ? form.status : form.datum ? "Ingepland" : "In te plannen";
    const data = {
      straat: form.straat.trim(), huisnummer: form.huisnummer.trim(), telefoon: form.telefoon.trim(), notitie: form.notitie.trim(),
      datum: form.datum, tijd: form.tijd, toegewezenAan: form.toegewezenAan || undefined, status,
    };
    if (bewerkId) updateSchouw(bewerkId, data);
    else addSchouw({ ...data, postcode: "", plaats: overzicht.sleutel ? overzicht.naam : "", contactNaam: "" });
    // De week volgt de gekozen datum, zodat je de afspraak meteen op de planning ziet staan.
    if (form.datum && isISODatum(form.datum)) setMaandag(weekStartISO(form.datum));
    sluit();
  };

  // Tijdvakken van één dag aanpassen. De eerste keer maken we (indien nodig) de map aan.
  const zetDagTijden = (iso: string, lijst: string[] | null) => {
    const id = record?.id ?? addSchouwMap(overzicht.naam);
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
    const id = record?.id ?? addSchouwMap(overzicht.naam);
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
      await exporteerSchouwPlanning({ plaats: overzicht.naam, maandag, dagen: exportDagen(week) });
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
  const bezetOp = (iso: string, t: string) => afspraken.some((a) => a.id !== bewerkId && a.datum === iso && a.tijd === t && a.status !== "Geannuleerd");

  return (
    <div className="space-y-5">
      <div>
        <button type="button" onClick={terug} className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Alle mappen
        </button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-ink-900">{overzicht.naam}</h2>
            <p className="text-sm text-ink-500">Schouwafspraken per week. Het weeknummer volgt de gekozen datum.</p>
          </div>
          <button type="button" onClick={() => openNieuw()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe schouwafspraak
          </button>
        </div>
      </div>

      {/* Weekkiezer + download */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMaandag(verschuifWeek(maandag, -1))} className={knop} aria-label="Vorige week"><ChevronLeft className="h-4 w-4" /></button>
          <div className="w-64 max-w-full">
            <DatumKiezer value={maandag} onChange={(iso) => iso && setMaandag(weekStartISO(iso))} weergave={`Week ${nr} · ${weekBereik(maandag)}`} />
          </div>
          <button type="button" onClick={() => setMaandag(verschuifWeek(maandag, 1))} className={knop} aria-label="Volgende week"><ChevronRight className="h-4 w-4" /></button>
          <button type="button" onClick={download} disabled={bezig || week.length === 0} className="ml-auto inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50">
            <Download className="h-4 w-4" /> {bezig ? "Bezig…" : `Planning week ${nr} voor Stedin (Excel)`}
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
              <h3 className="text-sm font-bold text-ink-900">{bewerkId ? "Schouwafspraak bewerken" : "Nieuwe schouwafspraak"} · {overzicht.naam}</h3>
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
                <div className="flex flex-wrap gap-1.5">
                  {formVakken.map((t) => {
                    const bezet = bezetOp(form.datum, t);
                    const gekozen = form.tijd === t;
                    return (
                      <button
                        key={t}
                        type="button"
                        onClick={() => set({ tijd: t })}
                        className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${gekozen ? "border-brand-600 bg-brand-600 text-white" : bezet ? "border-ink-200 bg-ink-50 text-ink-400" : "border-ink-200 bg-white text-ink-700 hover:border-brand-400"}`}
                        title={bezet ? "Dit tijdvak is al gevuld" : undefined}
                      >
                        {tijdLabel(t)}{bezet && !gekozen ? " ·" : ""}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-1 text-xs text-ink-400">Een punt achter de tijd betekent dat er al een afspraak in dat vak staat.</p>
              </div>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2"><label className={labelCls}>Straatnaam</label><input value={form.straat} onChange={(e) => set({ straat: e.target.value })} placeholder="Straatnaam" className={veld} /></div>
              <div><label className={labelCls}>Huisnummer</label><input value={form.huisnummer} onChange={(e) => set({ huisnummer: e.target.value })} placeholder="12 of 12B" className={veld} /></div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Telefoonnummer</label><input value={form.telefoon} onChange={(e) => set({ telefoon: e.target.value })} inputMode="tel" placeholder="06 …" className={veld} /></div>
              {isLeiding && (
                <div>
                  <label className={labelCls}>Werknemer</label>
                  <WerknemerKiezer value={form.toegewezenAan} onChange={(id) => set({ toegewezenAan: id })} users={users} leegLabel="Niet toegewezen" />
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
              <button type="button" onClick={opslaan} disabled={!form.straat.trim() || !form.huisnummer.trim()} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
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
                    <button type="button" onClick={() => { if (confirm(`Schouwafspraak ${a.straat} ${a.huisnummer} verwijderen?`)) deleteSchouw(a.id); }} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
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
        const vakken = dag.regels.filter((r) => r.eigenVak).map((r) => r.tijd);
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
              {dag.regels.map((r) =>
                r.afspraken.length === 0 ? (
                  <div key={`${dag.datum}-${r.tijd}`} className="flex items-center gap-3 px-4 py-2">
                    <span className="w-14 text-sm font-semibold tabular-nums text-ink-700">{tijdLabel(r.tijd)}</span>
                    <span className="text-sm text-ink-400">Vrij</span>
                    <button type="button" onClick={() => openNieuw(dag.datum, r.tijd)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
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
                          {a.status !== "Ingepland" && <Badge tone={statusTone[a.status]}>{a.status}</Badge>}
                          {!r.eigenVak && r.tijd && <span className="text-xs text-ink-400">buiten de tijdvakken</span>}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-500">
                          {a.telefoon && <a href={`tel:${a.telefoon}`} className="inline-flex items-center gap-1 text-brand-600"><Phone className="h-3.5 w-3.5" />{a.telefoon}</a>}
                          {naamVan(a.toegewezenAan) && <span>{naamVan(a.toegewezenAan)}</span>}
                        </div>
                        {a.notitie && <p className="mt-1 text-sm text-ink-600">{a.notitie}</p>}
                      </div>
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openBewerk(a)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-50" title="Bewerken"><Pencil className="h-4 w-4" /></button>
                        {magVerwijderen(a) && (
                          <button type="button" onClick={() => { if (confirm(`Schouwafspraak ${a.straat} ${a.huisnummer} verwijderen?`)) deleteSchouw(a.id); }} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                        )}
                      </div>
                    </div>
                  ))
                ),
              )}
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

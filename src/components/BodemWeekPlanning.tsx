// De afsprakenplanning van een bodemonderzoek, in precies dezelfde opzet als Schouwafspraken:
// week kiezen, per dag een gele balk, per tijdblok een regel met "Vrij" + "Invullen" of de afspraak.
// Eén systeem voor beide is makkelijker voor de medewerkers. Bij bodemonderzoek is de naam van de
// bewoner altijd verplicht en staat hij duidelijk in de planning.
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Pencil, Phone, Plus, Trash2, User as UserIcon, X } from "lucide-react";
import { Card } from "./ui";
import { DatumKiezer } from "./DatumKiezer";
import type { TauwAdres, TauwOpdracht, User } from "../lib/types";
import { blokkenVan, dagenVanVenster, slotActief } from "../lib/bodemonderzoek";
import { isISODatum, toISO, verschuifWeek, weekBereik, weekNummer, weekStartISO } from "../lib/week";

const WEEKDAG = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
const dagKort = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const tijdLabel = (t: string) => t.replace(/^0(\d)/, "$1").replace(":", ".");
const blokLabel = (s: string) => s.split("-").map(tijdLabel).join(" – ");
const knop = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50";
const veld = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";
const geplandOp = (a: TauwAdres) => a.aanwezig === "ja" && !!a.datum && isISODatum(a.datum) && !!a.tijdslot;

type Form = { datum: string; slot: string; adresId: string; naam: string; telefoon: string; notitie: string; bewerk: boolean };

export function BodemWeekPlanning({ opdracht, users, onAdres }: {
  opdracht: TauwOpdracht;
  users: User[];
  onAdres?: (adresId: string, patch: Partial<TauwAdres>) => void;
}) {
  const dagen = useMemo(() => dagenVanVenster(opdracht.venster), [opdracht.venster]);
  const blokken = useMemo(() => blokkenVan(opdracht.venster).filter((s) => slotActief(opdracht.venster?.sloten, s)), [opdracht.venster]);
  const gepland = useMemo(() => opdracht.adressen.filter(geplandOp), [opdracht.adressen]);
  const vandaag = toISO(new Date());
  const [maandag, setMaandag] = useState(() => {
    const eerste = dagen.find((d) => d >= vandaag) ?? dagen[0];
    return weekStartISO(eerste ?? vandaag);
  });
  const [form, setForm] = useState<Form | null>(null);
  const formRef = useRef<HTMLDivElement | null>(null);
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";

  // Weken met afspraken of planningsdagen, met het aantal afspraken erbij.
  const weken = useMemo(() => {
    const t = new Map<string, number>();
    for (const d of dagen) if (!t.has(weekStartISO(d))) t.set(weekStartISO(d), 0);
    for (const a of gepland) t.set(weekStartISO(a.datum), (t.get(weekStartISO(a.datum)) ?? 0) + 1);
    return [...t.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [dagen, gepland]);

  // De dagen van deze week: planningsdagen plus dagen waar toch een afspraak op staat.
  const week = useMemo(() => {
    const zon = new Date(maandag + "T00:00:00");
    const isos = Array.from({ length: 7 }, (_, i) => { const d = new Date(zon); d.setDate(zon.getDate() + i); return toISO(d); });
    return isos
      .filter((iso) => dagen.includes(iso) || gepland.some((a) => a.datum === iso))
      .map((iso) => {
        const opDag = gepland.filter((a) => a.datum === iso);
        const regels = [...new Set([...blokken, ...opDag.map((a) => a.tijdslot!)])].sort()
          .map((slot) => ({ slot, afspraken: opDag.filter((a) => a.tijdslot === slot) }));
        return { datum: iso, naam: WEEKDAG[new Date(iso + "T00:00:00").getDay()], regels };
      });
  }, [maandag, dagen, gepland, blokken]);
  const inWeek = week.reduce((n, d) => n + d.regels.reduce((m, r) => m + r.afspraken.length, 0), 0);

  const vrijeAdressen = opdracht.adressen.filter((a) => !geplandOp(a) && (a.straat || a.huisnummer));
  const openNieuw = (datum: string, slot: string) => {
    setForm({ datum, slot, adresId: "", naam: "", telefoon: "", notitie: "", bewerk: false });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const openBewerk = (a: TauwAdres) => {
    setForm({ datum: a.datum, slot: a.tijdslot ?? "", adresId: a.id, naam: a.bewoner, telefoon: a.telefoon, notitie: a.notitie, bewerk: true });
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 50);
  };
  const set = (p: Partial<Form>) => setForm((f) => (f ? { ...f, ...p } : f));
  const kiesAdres = (id: string) => {
    const a = opdracht.adressen.find((x) => x.id === id);
    set({ adresId: id, naam: a?.bewoner ?? "", telefoon: a?.telefoon ?? "" });
  };
  const kanOpslaan = !!form && !!form.adresId && !!form.naam.trim() && isISODatum(form.datum) && !!form.slot;
  const opslaan = () => {
    if (!form || !kanOpslaan || !onAdres) return;
    onAdres(form.adresId, {
      aanwezig: "ja", datum: form.datum, tijdslot: form.slot, tijd: form.slot.split("-")[0],
      bewoner: form.naam.trim(), telefoon: form.telefoon.trim(), notitie: form.notitie.trim(), bevestigd: true,
    });
    setMaandag(weekStartISO(form.datum));
    setForm(null);
  };
  const haalWeg = (a: TauwAdres) => {
    if (!onAdres || !confirm(`Afspraak ${a.straat} ${a.huisnummer} uit de planning halen?`)) return;
    onAdres(a.id, { aanwezig: "", datum: "", tijdslot: "", tijd: "", bevestigd: false });
  };
  const formBlokken = form ? [...new Set([...blokken, ...(form.slot ? [form.slot] : [])])].sort() : [];

  return (
    <div className="space-y-4">
      {/* Weekkiezer */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setMaandag(verschuifWeek(maandag, -1))} className={knop} aria-label="Vorige week"><ChevronLeft className="h-4 w-4" /></button>
          <div className="w-64 max-w-full">
            <DatumKiezer value={maandag} onChange={(iso) => iso && setMaandag(weekStartISO(iso))} weergave={`Week ${weekNummer(maandag)} · ${weekBereik(maandag)}`} />
          </div>
          <button type="button" onClick={() => setMaandag(verschuifWeek(maandag, 1))} className={knop} aria-label="Volgende week"><ChevronRight className="h-4 w-4" /></button>
        </div>
        {weken.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="font-semibold text-ink-500">Weken met afspraken:</span>
            {weken.map(([ma, n]) => (
              <button key={ma} type="button" onClick={() => setMaandag(ma)}
                className={`rounded-full border px-2.5 py-1 font-semibold ${ma === maandag ? "border-brand-500 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"}`}>
                Week {weekNummer(ma)} ({n})
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Afspraak invullen of wijzigen */}
      {form && (
        <div ref={formRef}>
          <Card className="space-y-3 border-2 border-brand-200 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-ink-900">{form.bewerk ? "Afspraak wijzigen" : "Afspraak invullen"}</h3>
              <button type="button" onClick={() => setForm(null)} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-50"><X className="h-4 w-4" /></button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Datum</label>
                <DatumKiezer value={form.datum} onChange={(iso) => set({ datum: iso })} />
              </div>
              <div>
                <label className={labelCls}>Adres <span className="text-red-600">*</span></label>
                {form.bewerk ? (
                  <div className="rounded-lg border border-ink-200 bg-ink-50 px-3 py-2 text-sm font-semibold text-ink-800">
                    {(() => { const a = opdracht.adressen.find((x) => x.id === form.adresId); return a ? `${a.straat} ${a.huisnummer}`.trim() : ""; })()}
                  </div>
                ) : (
                  <select value={form.adresId} onChange={(e) => kiesAdres(e.target.value)} className={veld}>
                    <option value="">Kies een adres…</option>
                    {vrijeAdressen.map((a) => <option key={a.id} value={a.id}>{`${a.straat} ${a.huisnummer}`.trim()}{a.plaats ? `, ${a.plaats}` : ""}</option>)}
                  </select>
                )}
              </div>
            </div>
            <div>
              <label className={labelCls}>Tijdblok</label>
              <div className="flex flex-wrap gap-1.5">
                {formBlokken.map((s) => (
                  <button key={s} type="button" onClick={() => set({ slot: s })}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${form.slot === s ? "border-brand-600 bg-brand-600 text-white" : "border-ink-200 bg-white text-ink-700 hover:border-brand-400"}`}>
                    {blokLabel(s)}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div><label className={labelCls}>Naam bewoner <span className="text-red-600">*</span></label><input value={form.naam} onChange={(e) => set({ naam: e.target.value })} placeholder="Voor- en achternaam" className={veld} /></div>
              <div><label className={labelCls}>Telefoonnummer</label><input value={form.telefoon} onChange={(e) => set({ telefoon: e.target.value })} inputMode="tel" placeholder="06 …" className={veld} /></div>
            </div>
            <div><label className={labelCls}>Opmerkingen (optioneel)</label><textarea value={form.notitie} onChange={(e) => set({ notitie: e.target.value })} rows={2} className={veld + " resize-none"} /></div>
            {!form.naam.trim() && form.adresId && <p className="text-xs font-semibold text-red-600">Vul de naam van de bewoner in — die is bij een bodemonderzoek altijd nodig.</p>}
            <div className="flex items-center gap-2">
              <button type="button" onClick={opslaan} disabled={!kanOpslaan || !onAdres}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">
                <Plus className="h-4 w-4" /> {form.bewerk ? "Opslaan" : "Toevoegen"}
              </button>
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
            </div>
          </Card>
        </div>
      )}

      {/* Weekraster */}
      <div className="flex items-center justify-between">
        <h3 className="text-base font-bold text-ink-900">Week {weekNummer(maandag)} · {weekBereik(maandag)}</h3>
        <span className="text-xs text-ink-500">{inWeek} {inWeek === 1 ? "afspraak" : "afspraken"} deze week</span>
      </div>

      {dagen.length === 0 && gepland.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-500">Stel eerst bij Instellen de afsprakenperiode en de tijdblokken in.</Card>
      ) : week.length === 0 ? (
        <Card className="p-6 text-center text-sm text-ink-500">In deze week staan geen planningsdagen.</Card>
      ) : week.map((dag) => (
        <Card key={dag.datum} className="overflow-hidden p-0">
          <div className="flex flex-wrap items-center gap-2 bg-amber-100/70 px-4 py-2.5">
            <span className="text-sm font-bold text-ink-900">{dag.naam}</span>
            <span className="text-sm text-ink-600">{dagKort(dag.datum)}</span>
          </div>
          <div className="divide-y divide-ink-100">
            {dag.regels.map((r) =>
              r.afspraken.length === 0 ? (
                <div key={r.slot} className="flex items-center gap-3 px-4 py-2">
                  <span className="w-28 text-sm font-semibold tabular-nums text-ink-700">{blokLabel(r.slot)}</span>
                  <span className="flex-1 text-sm text-ink-400">Vrij</span>
                  {onAdres && (
                    <button type="button" onClick={() => openNieuw(dag.datum, r.slot)} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-brand-600 hover:bg-brand-50">
                      <Plus className="h-3.5 w-3.5" /> Invullen
                    </button>
                  )}
                </div>
              ) : (
                r.afspraken.map((a, i) => (
                  <div key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-1 px-4 py-2.5">
                    <span className="w-28 text-sm font-semibold tabular-nums text-ink-700">{i === 0 ? blokLabel(r.slot) : ""}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-ink-900">{`${a.straat} ${a.huisnummer}`.trim()}</span>
                        {a.bewoner
                          ? <span className="inline-flex items-center gap-1 rounded-md bg-ink-100 px-2 py-0.5 text-sm font-semibold text-ink-800"><UserIcon className="h-3.5 w-3.5 text-ink-500" />{a.bewoner}</span>
                          : <span className="rounded-md bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600">naam ontbreekt</span>}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-500">
                        {a.telefoon && <a href={`tel:${a.telefoon}`} className="inline-flex items-center gap-1 text-brand-600"><Phone className="h-3.5 w-3.5" />{a.telefoon}</a>}
                        {a.toegewezenAan && <span>{naamVan(a.toegewezenAan)}</span>}
                      </div>
                      {a.notitie && <p className="mt-1 text-sm text-ink-600">{a.notitie}</p>}
                    </div>
                    {onAdres && (
                      <div className="flex items-center gap-1">
                        <button type="button" onClick={() => openBewerk(a)} className="rounded-lg p-2 text-ink-500 hover:bg-ink-50" title="Bewerken"><Pencil className="h-4 w-4" /></button>
                        <button type="button" onClick={() => haalWeg(a)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Uit de planning halen"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    )}
                  </div>
                ))
              ),
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}

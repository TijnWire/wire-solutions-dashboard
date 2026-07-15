import { useMemo, useState } from "react";
import { Plus, X, Trash2, MapPin, Phone, CalendarClock, Search, Pencil } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { DatumKiezer } from "../components/DatumKiezer";
import { TijdKiezer } from "../components/TijdKiezer";
import { Keuze } from "../components/Keuze";
import { SCHOUW_STATUSSEN, type SchouwStatus, type Schouwafspraak } from "../lib/types";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

const statusTone: Record<SchouwStatus, "slate" | "amber" | "green" | "red"> = {
  "In te plannen": "slate",
  Ingepland: "amber",
  Uitgevoerd: "green",
  Geannuleerd: "red",
};

const leegForm = {
  straat: "", huisnummer: "", postcode: "", plaats: "",
  contactNaam: "", telefoon: "", datum: "", tijd: "", toegewezenAan: "", notitie: "",
};

const datumLabel = (iso: string) => (iso ? new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short" }) : "");

export function Schouwafspraken() {
  const { schouwafspraken, users, currentUser, addSchouw, updateSchouw, deleteSchouw } = useApp();
  const [form, setForm] = useState<typeof leegForm | null>(null);
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [zoek, setZoek] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "Niet toegewezen";
  const set = (p: Partial<typeof leegForm>) => setForm((f) => ({ ...(f ?? leegForm), ...p }));

  // Werknemers zien alleen hun eigen toegewezen schouwafspraken; leiding ziet alles.
  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return schouwafspraken
      .filter((s) => isLeiding || s.toegewezenAan === currentUser.id)
      .filter((s) => !q || `${s.straat} ${s.huisnummer} ${s.postcode} ${s.plaats} ${s.contactNaam}`.toLowerCase().includes(q))
      .sort((a, b) => {
        // Ingeplande met datum vooraan (op datum/tijd), daarna de rest op aanmaakmoment.
        if (a.datum && b.datum) return (a.datum + a.tijd).localeCompare(b.datum + b.tijd);
        if (a.datum) return -1;
        if (b.datum) return 1;
        return b.aangemaakt.localeCompare(a.aangemaakt);
      });
  }, [schouwafspraken, isLeiding, currentUser.id, zoek]);

  const openNieuw = () => { setBewerkId(null); setForm({ ...leegForm }); };
  const openBewerk = (s: Schouwafspraak) => {
    setBewerkId(s.id);
    setForm({ straat: s.straat, huisnummer: s.huisnummer, postcode: s.postcode, plaats: s.plaats, contactNaam: s.contactNaam, telefoon: s.telefoon, datum: s.datum, tijd: s.tijd, toegewezenAan: s.toegewezenAan ?? "", notitie: s.notitie });
  };
  const sluit = () => { setForm(null); setBewerkId(null); };

  const opslaan = () => {
    if (!form || !form.straat.trim() || !form.huisnummer.trim()) return;
    // Status leiden we af: een datum betekent "Ingepland" (tenzij al uitgevoerd/geannuleerd bij bewerken).
    const bestaand = bewerkId ? schouwafspraken.find((s) => s.id === bewerkId) : undefined;
    const status: SchouwStatus =
      bestaand && (bestaand.status === "Uitgevoerd" || bestaand.status === "Geannuleerd")
        ? bestaand.status
        : form.datum ? "Ingepland" : "In te plannen";
    const data = {
      straat: form.straat.trim(), huisnummer: form.huisnummer.trim(), postcode: form.postcode.trim(), plaats: form.plaats.trim(),
      contactNaam: form.contactNaam.trim(), telefoon: form.telefoon.trim(),
      datum: form.datum, tijd: form.tijd, toegewezenAan: form.toegewezenAan || undefined, notitie: form.notitie.trim(), status,
    };
    if (bewerkId) updateSchouw(bewerkId, data);
    else addSchouw(data);
    sluit();
  };

  const telPer = (st: SchouwStatus) => schouwafspraken.filter((s) => (isLeiding || s.toegewezenAan === currentUser.id) && s.status === st).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Schouwafspraken</h2>
          <p className="text-sm text-ink-500">Plan de voorschouw-bezoeken: adres, moment en wie er langsgaat.</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={openNieuw} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe schouwafspraak
          </button>
        )}
      </div>

      {/* Telling per status */}
      <div className="flex flex-wrap gap-2">
        {SCHOUW_STATUSSEN.map((st) => (
          <span key={st} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs font-semibold text-ink-600">
            <Badge tone={statusTone[st]}>{telPer(st)}</Badge> {st}
          </span>
        ))}
      </div>

      {/* Formulier (leiding) */}
      {form && isLeiding && (
        <Card className="space-y-3 p-5 ring-2 ring-brand-200">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">{bewerkId ? "Schouwafspraak bewerken" : "Nieuwe schouwafspraak"}</h3>
            <button type="button" onClick={sluit} className="text-ink-400 hover:text-ink-600"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Straat</label><input value={form.straat} onChange={(e) => set({ straat: e.target.value })} placeholder="Straatnaam" className={veld} /></div>
            <div><label className={labelCls}>Huisnummer</label><input value={form.huisnummer} onChange={(e) => set({ huisnummer: e.target.value })} placeholder="12" className={veld} /></div>
            <div><label className={labelCls}>Postcode</label><input value={form.postcode} onChange={(e) => set({ postcode: e.target.value })} placeholder="1234 AB" className={veld} /></div>
            <div><label className={labelCls}>Plaats</label><input value={form.plaats} onChange={(e) => set({ plaats: e.target.value })} placeholder="Rotterdam" className={veld} /></div>
            <div><label className={labelCls}>Contactpersoon</label><input value={form.contactNaam} onChange={(e) => set({ contactNaam: e.target.value })} placeholder="Naam bewoner" className={veld} /></div>
            <div><label className={labelCls}>Telefoon</label><input value={form.telefoon} onChange={(e) => set({ telefoon: e.target.value })} placeholder="06 …" className={veld} /></div>
            <div><label className={labelCls}>Datum</label><DatumKiezer value={form.datum} onChange={(iso) => set({ datum: iso })} placeholder="Nog in te plannen" /></div>
            <div><label className={labelCls}>Tijd</label><TijdKiezer value={form.tijd} onChange={(tijd) => set({ tijd })} /></div>
          </div>
          <div>
            <label className={labelCls}>Wie gaat schouwen?</label>
            <WerknemerKiezer value={form.toegewezenAan} onChange={(id) => set({ toegewezenAan: id })} users={users} leegLabel="Niet toegewezen" />
          </div>
          <div><label className={labelCls}>Notitie</label><textarea value={form.notitie} onChange={(e) => set({ notitie: e.target.value })} rows={2} placeholder="Bijzonderheden, waar is de meterkast, toegang…" className={veld + " resize-none"} /></div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={opslaan} disabled={!form.straat.trim() || !form.huisnummer.trim()} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40"><Plus className="h-4 w-4" /> {bewerkId ? "Opslaan" : "Toevoegen"}</button>
            <button type="button" onClick={sluit} className="rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
          </div>
        </Card>
      )}

      {/* Zoeken */}
      {schouwafspraken.length > 0 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op adres, plaats of contact…" className="w-full rounded-2xl border border-ink-200 bg-white py-3 pl-12 pr-4 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </div>
      )}

      {/* Lijst */}
      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarClock className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">{schouwafspraken.length === 0 ? "Nog geen schouwafspraken." : "Geen resultaten."}</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {zichtbaar.map((s) => (
            <Card key={s.id} className="p-4">
              <div className="flex flex-wrap items-start gap-3">
                <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600"><MapPin className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-ink-900">{s.straat} {s.huisnummer}</span>
                    <Badge tone={statusTone[s.status]}>{s.status}</Badge>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-4 gap-y-0.5 text-xs text-ink-500">
                    {(s.postcode || s.plaats) && <span>{[s.postcode, s.plaats].filter(Boolean).join(" ")}</span>}
                    {s.datum && <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" />{datumLabel(s.datum)}{s.tijd ? ` · ${s.tijd}` : ""}</span>}
                    {s.contactNaam && <span>{s.contactNaam}</span>}
                    {s.telefoon && <a href={`tel:${s.telefoon}`} className="inline-flex items-center gap-1 text-brand-600"><Phone className="h-3.5 w-3.5" />{s.telefoon}</a>}
                    <span className="inline-flex items-center gap-1 text-ink-400">Schouwer: {naamVan(s.toegewezenAan)}</span>
                  </div>
                  {s.notitie && <p className="mt-1.5 text-sm text-ink-600">{s.notitie}</p>}

                  {/* Statusknoppen: iedereen die 'm ziet mag de status bijwerken (uitgevoerd melden). */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <div className="w-44">
                      <Keuze value={s.status} onChange={(w) => updateSchouw(s.id, { status: w as SchouwStatus })} opties={SCHOUW_STATUSSEN.map((st) => ({ waarde: st, label: st }))} title="Status" />
                    </div>
                    {isLeiding && (
                      <>
                        <WerknemerKiezer value={s.toegewezenAan ?? ""} onChange={(id) => updateSchouw(s.id, { toegewezenAan: id || undefined })} users={users} leegLabel="Niet toegewezen" />
                        <button type="button" onClick={() => openBewerk(s)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50"><Pencil className="h-3.5 w-3.5" /> Bewerken</button>
                        <button type="button" onClick={() => { if (confirm(`Schouwafspraak ${s.straat} ${s.huisnummer} verwijderen?`)) deleteSchouw(s.id); }} className="ml-auto rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

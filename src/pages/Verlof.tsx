import { useMemo, useState } from "react";
import { Plane, Plus, Check, X, Trash2, ShieldCheck, Lock, CalendarDays } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { VERLOF_TYPES, type VerlofType, type VerlofStatus, type Verlof as VerlofT } from "../lib/types";
import { magBoekhouding } from "../lib/rechten";
import { useVerlofBeslissingen, beslisVerlof } from "../lib/verlofBeslissingen";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";
const verlofKleur: Record<VerlofType, string> = { Vakantie: "bg-green-500", Verlof: "bg-indigo-500", Ziek: "bg-red-500" };
const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function Verlof() {
  const { verlof, users, currentUser, addVerlof, updateVerlof, deleteVerlof } = useApp();
  const { map: beslissingen, beschikbaar } = useVerlofBeslissingen();
  const vandaag = new Date();

  const [vMedewerker, setVMedewerker] = useState(currentUser?.id ?? "");
  const [vType, setVType] = useState<VerlofType>("Vakantie");
  const [vVan, setVVan] = useState(toISO(vandaag));
  const [vTot, setVTot] = useState(toISO(vandaag));
  const [vNotitie, setVNotitie] = useState("");
  const [fout, setFout] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const magBoek = magBoekhouding(currentUser);
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  // Effectieve status = de DB-beslissing (autoritair, RLS-afgedwongen) als die er is, anders de blob-status.
  const effStatus = (v: VerlofT): VerlofStatus => beslissingen[v.id]?.status ?? v.status;

  const mijn = isLeiding ? verlof : verlof.filter((v) => v.medewerkerId === currentUser.id);
  const gesorteerd = useMemo(() => [...mijn].sort((a, b) => a.van.localeCompare(b.van)), [mijn]);
  const teBeoordelen = useMemo(() => verlof.filter((v) => effStatus(v) === "Aangevraagd").sort((a, b) => a.van.localeCompare(b.van)), [verlof, beslissingen]);

  const opslaanVerlof = () => {
    if (!vVan || !vTot) return;
    addVerlof({
      medewerkerId: isLeiding ? vMedewerker || currentUser.id : currentUser.id,
      type: vType,
      van: vVan <= vTot ? vVan : vTot,
      tot: vTot >= vVan ? vTot : vVan,
      // Zelf inplannen door boekhouding = meteen goedgekeurd; anders een aanvraag.
      status: magBoek ? "Goedgekeurd" : "Aangevraagd",
      notitie: vNotitie.trim(),
    });
    setVNotitie("");
  };

  // Goedkeuren/afwijzen — alleen boekhouding. Schrijft naar de RLS-tabel (autoritair) en spiegelt naar
  // de blob zodat de Agenda/kalender overal dezelfde status toont. Vóór deploy: terugval op de blob.
  const beslis = async (v: VerlofT, status: VerlofStatus) => {
    setFout("");
    if (!magBoek) { setFout("Alleen de boekhouding mag verlof goedkeuren."); return; }
    if (beschikbaar) {
      const r = await beslisVerlof(v.id, status, currentUser.email, currentUser.naam);
      if (!r.ok) { setFout(`Kon de beslissing niet opslaan (${r.error}). Is de boekhouding-rol ingesteld?`); return; }
    }
    updateVerlof(v.id, { status });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Verlof</h2>
          <p className="text-sm text-ink-500">Verlof aanvragen en — door de boekhouding — goedkeuren.</p>
        </div>
        {magBoek ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 ring-1 ring-inset ring-green-200"><ShieldCheck className="h-3.5 w-3.5" /> Boekhouding — jij mag goedkeuren</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-ink-100 px-3 py-1 text-xs font-semibold text-ink-500"><Lock className="h-3.5 w-3.5" /> Goedkeuren doet de boekhouding</span>
        )}
      </div>

      {/* Aanvragen */}
      <Card className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Plane className="h-4 w-4 text-brand-600" /> {magBoek ? "Verlof inplannen / aanvragen" : "Verlof aanvragen"}</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Medewerker</label>
            <Keuze
              value={isLeiding ? vMedewerker : currentUser.id}
              onChange={isLeiding ? setVMedewerker : () => {}}
              opties={isLeiding ? users.map((u) => ({ waarde: u.id, label: u.naam })) : [{ waarde: currentUser.id, label: currentUser.naam }]}
              disabled={!isLeiding}
              title="Medewerker"
            />
          </div>
          <div>
            <label className={labelCls}>Soort</label>
            <Keuze value={vType} onChange={(w) => setVType(w as VerlofType)} opties={VERLOF_TYPES.map((t) => ({ waarde: t, label: t }))} title="Soort verlof" />
          </div>
          <div><label className={labelCls}>Van</label><DatumKiezer value={vVan} onChange={setVVan} /></div>
          <div><label className={labelCls}>Tot en met</label><DatumKiezer value={vTot} onChange={setVTot} /></div>
        </div>
        <div><label className={labelCls}>Notitie (optioneel)</label><input value={vNotitie} onChange={(e) => setVNotitie(e.target.value)} placeholder="Bijv. reden of bijzonderheid" className={veld} /></div>
        <button type="button" onClick={opslaanVerlof} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> {magBoek ? "Inplannen" : "Aanvragen"}</button>
      </Card>

      {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}

      {/* Te beoordelen — alleen zichtbaar/uitvoerbaar voor de boekhouding */}
      {magBoek && teBeoordelen.length > 0 && (
        <Card className="border-2 border-amber-200 bg-amber-50/50 p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900">
            <Plane className="h-4 w-4 text-amber-600" /> Te beoordelen verlofaanvragen
            <span className="rounded-full bg-amber-500 px-2 py-0.5 text-xs font-bold text-white">{teBeoordelen.length}</span>
          </h3>
          <div className="space-y-2">
            {teBeoordelen.map((v) => (
              <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-200 bg-white p-3">
                <span className={`h-3 w-3 shrink-0 rounded-full ${verlofKleur[v.type]}`} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink-900">{naamVan(v.medewerkerId)} · {v.type}</div>
                  <div className="text-xs text-ink-500">{fmt(v.van)} t/m {fmt(v.tot)}{v.notitie ? ` · ${v.notitie}` : ""}</div>
                </div>
                <button type="button" onClick={() => void beslis(v, "Goedgekeurd")} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"><Check className="h-4 w-4" /> Goedkeuren</button>
                <button type="button" onClick={() => void beslis(v, "Afgewezen")} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-sm font-semibold text-red-600 hover:bg-red-50"><X className="h-4 w-4" /> Afwijzen</button>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Overzicht */}
      <Card className="p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><CalendarDays className="h-4 w-4 text-ink-500" /> {isLeiding ? "Verlofoverzicht (HR)" : "Mijn verlof"}</h3>
        {gesorteerd.length === 0 ? (
          <p className="text-sm text-ink-400">Geen verlof ingepland.</p>
        ) : (
          <div className="space-y-2">
            {gesorteerd.map((v) => {
              const st = effStatus(v);
              const beslisser = beslissingen[v.id]?.beslist_door_naam;
              return (
                <div key={v.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-ink-200 p-3">
                  <span className={`h-3 w-3 shrink-0 rounded-full ${verlofKleur[v.type]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-ink-900">{naamVan(v.medewerkerId)} · {v.type}</div>
                    <div className="text-xs text-ink-500">{fmt(v.van)} t/m {fmt(v.tot)}{v.notitie ? ` · ${v.notitie}` : ""}{st !== "Aangevraagd" && beslisser ? ` · door ${beslisser}` : ""}</div>
                  </div>
                  <Badge tone={st === "Goedgekeurd" ? "green" : st === "Afgewezen" ? "red" : "amber"}>{st}</Badge>
                  {magBoek && st === "Aangevraagd" && (
                    <div className="flex items-center gap-1">
                      <button type="button" onClick={() => void beslis(v, "Goedgekeurd")} className="rounded-lg p-1.5 text-green-600 hover:bg-green-50" title="Goedkeuren"><Check className="h-4 w-4" /></button>
                      <button type="button" onClick={() => void beslis(v, "Afgewezen")} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" title="Afwijzen"><X className="h-4 w-4" /></button>
                    </div>
                  )}
                  {(isLeiding || (v.medewerkerId === currentUser.id && st === "Aangevraagd")) && (
                    <button type="button" onClick={() => deleteVerlof(v.id)} className="rounded-lg p-1.5 text-ink-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {!beschikbaar && magBoek && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">Let op: de database-afdwinging (tabel <code>verlof_beslissingen</code>) is nog niet actief. Draai <code>supabase/fase2.sql</code>. Tot die tijd wordt de goedkeuring alleen in de app afgeschermd.</p>
        )}
      </Card>
    </div>
  );
}

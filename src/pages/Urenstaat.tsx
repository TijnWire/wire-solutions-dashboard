import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Copy, Trash2, Wallet, FileSpreadsheet, SlidersHorizontal, Save, ArrowLeft, Clock } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card } from "../components/ui";
import { Keuze } from "../components/Keuze";
import { DatumKiezer } from "../components/DatumKiezer";
import { feestdagNaam } from "../lib/feestdagen";
import { exporteerUrenstaat } from "../lib/urenstaatExcel";
import { WERK_CATEGORIEEN, werkCategorieNaam } from "../lib/lopendWerk";
import type { Bedrijf, Urenregel, Uursoort } from "../lib/types";

const DAGNAAM = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const maandagVan = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const weekNr = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dag + 3);
  const eersteDonderdag = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fd = (eersteDonderdag.getUTCDay() + 6) % 7;
  eersteDonderdag.setUTCDate(eersteDonderdag.getUTCDate() - fd + 3);
  return 1 + Math.round((t.getTime() - eersteDonderdag.getTime()) / (7 * 24 * 3600 * 1000));
};
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString().replace(".", ","));
const klok = (n: number) => `${String(Math.floor(n)).padStart(2, "0")}:${String(Math.round((n % 1) * 60)).padStart(2, "0")}`;

// Totaal = eindtijd − begintijd − pauze. Loopt de eindtijd over middernacht, dan telt de nachtdienst door.
export function berekenUren(begin?: string, eind?: string, pauze?: number): number | null {
  if (!begin || !eind) return null;
  const [bh, bm] = begin.split(":").map(Number);
  const [eh, em] = eind.split(":").map(Number);
  if (![bh, bm, eh, em].every((n) => Number.isFinite(n))) return null;
  let min = eh * 60 + em - (bh * 60 + bm);
  if (min < 0) min += 24 * 60;
  min -= Math.max(0, pauze || 0);
  return Math.max(0, Math.round((min / 60) * 100) / 100);
};

const STANDAARD_UURSOORTEN: Uursoort[] = [
  { id: "regulier", code: "", label: "Regulier" },
  { id: "overwerk", code: "", label: "Overwerk" },
];

// Op welk onderdeel zijn de uren geboekt (of Algemeen).
const projectNaam = (id?: string) => werkCategorieNaam(id) ?? "Algemeen";
const uursoortenVan = (b: Bedrijf): Uursoort[] => (b.uursoorten?.length ? b.uursoorten : STANDAARD_UURSOORTEN);
const uursoortLabel = (u: Uursoort) => [u.code, u.label].filter(Boolean).join(" · ");

const veld = "w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const chip = (aan: boolean) =>
  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors " +
  (aan ? "bg-brand-600 text-white" : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50");

// ── Uursoorten beheren (zelf de lijst bepalen, net als de tarieven bij Facturen) ──
function UursoortBeheer({ bedrijf, updateBedrijf, onKlaar }: { bedrijf: Bedrijf; updateBedrijf: (p: Partial<Bedrijf>) => void; onKlaar: () => void }) {
  const [rijen, setRijen] = useState<Uursoort[]>(() => uursoortenVan(bedrijf).map((u) => ({ ...u })));
  const zet = (id: string, patch: Partial<Uursoort>) => setRijen((r) => r.map((x) => (x.id === id ? { ...x, ...patch } : x)));
  const voegToe = () => setRijen((r) => [...r, { id: `us-${Date.now()}-${r.length}`, code: "", label: "" }]);
  const opslaan = () => { updateBedrijf({ uursoorten: rijen.filter((x) => x.code.trim() || x.label.trim()) }); onKlaar(); };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar de urenstaat</button>
      <div>
        <h2 className="text-xl font-bold text-ink-900">Uursoorten</h2>
        <p className="text-sm text-ink-500">De soorten uren die je op een regel kunt kiezen (bijv. code UT35061 · UT Level II Engineer). Pas ze hier aan; ze verschijnen meteen in de keuzelijst.</p>
      </div>
      <Card className="space-y-3 p-4">
        <div className="hidden gap-2 px-1 text-xs font-semibold text-ink-500 sm:grid sm:grid-cols-[9rem_1fr_2rem]">
          <span>Code</span><span>Omschrijving</span><span />
        </div>
        {rijen.length === 0 ? (
          <p className="px-1 py-3 text-sm text-ink-400">Nog geen uursoorten. Voeg er een toe.</p>
        ) : rijen.map((u) => (
          <div key={u.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_2rem] sm:items-center">
            <input value={u.code} onChange={(e) => zet(u.id, { code: e.target.value })} placeholder="UT35061" className={veld} />
            <input value={u.label} onChange={(e) => zet(u.id, { label: e.target.value })} placeholder="UT Level II Engineer" className={veld} />
            <button type="button" onClick={() => setRijen((r) => r.filter((x) => x.id !== u.id))} className="justify-self-end rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Uursoort verwijderen"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={voegToe} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"><Plus className="h-4 w-4" /> Uursoort toevoegen</button>
      </Card>
      <div className="flex gap-2">
        <button type="button" onClick={opslaan} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700"><Save className="h-4 w-4" /> Opslaan</button>
        <button type="button" onClick={onKlaar} className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
      </div>
    </div>
  );
}

export function Urenstaat() {
  const { users, bedrijf, updateBedrijf, urenstaat, verlof, currentUser, addUren, updateUren, deleteUren } = useApp();
  const { navigeer } = useNav();
  const [weekISO, setWeekISO] = useState(() => toISO(maandagVan(new Date())));
  const [modus, setModus] = useState<"lijst" | "uursoorten">("lijst");
  const [filterPersoon, setFilterPersoon] = useState(() => [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"))[0]?.id ?? ""); // standaard één medewerker; "" = iedereen

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">De urenstaat is alleen voor de boekhouding/leiding.</Card>;
  if (modus === "uursoorten") return <UursoortBeheer bedrijf={bedrijf} updateBedrijf={updateBedrijf} onKlaar={() => setModus("lijst")} />;

  const weekDate = new Date(weekISO + "T00:00:00");
  const weekEinde = new Date(weekDate); weekEinde.setDate(weekEinde.getDate() + 6);
  const weekEindISO = toISO(weekEinde);
  const verschuif = (dagen: number) => { const d = new Date(weekDate); d.setDate(d.getDate() + dagen); setWeekISO(toISO(maandagVan(d))); };
  const dezeWeek = toISO(maandagVan(new Date())) === weekISO;
  const weekLabel = `${weekDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${weekEinde.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;

  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  const uursoorten = uursoortenVan(bedrijf);
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  // Regels van deze week (en eventueel van één medewerker), op datum en dan op begintijd.
  const weekRegels = useMemo(() => urenstaat.filter((r) => r.datum >= weekISO && r.datum <= weekEindISO), [urenstaat, weekISO, weekEindISO]);
  const urenVanPersoon = (id: string) => weekRegels.filter((r) => r.medewerkerId === id).reduce((s, r) => s + (Number(r.uren) || 0), 0);
  const rijen = useMemo(
    () =>
      weekRegels
        .filter((r) => !filterPersoon || r.medewerkerId === filterPersoon)
        .sort((a, b) => a.datum.localeCompare(b.datum) || (a.begin ?? "").localeCompare(b.begin ?? "") || naamVan(a.medewerkerId).localeCompare(naamVan(b.medewerkerId), "nl")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [weekRegels, filterPersoon]
  );
  const totaalUren = rijen.reduce((s, r) => s + (Number(r.uren) || 0), 0);
  const totaalReis = rijen.reduce((s, r) => s + (Number(r.reis) || 0), 0);

  // Tijden/pauze wijzigen → totaal automatisch herberekenen (handmatig overschrijven blijft mogelijk).
  const zet = (r: Urenregel, patch: Partial<Urenregel>) => {
    const n = { ...r, ...patch };
    if ("begin" in patch || "eind" in patch || "pauze" in patch) {
      const berekend = berekenUren(n.begin, n.eind, n.pauze);
      if (berekend !== null) patch = { ...patch, uren: berekend };
    }
    updateUren(r.id, patch);
  };
  const nieuweRegel = () => {
    const laatste = rijen[rijen.length - 1];
    addUren({
      medewerkerId: filterPersoon || laatste?.medewerkerId || medewerkers[0]?.id || "",
      datum: laatste?.datum ?? (dezeWeek ? toISO(new Date()) : weekISO),
      uursoortId: laatste?.uursoortId ?? uursoorten[0]?.id,
      projectId: laatste?.projectId,
      objectCode: laatste?.objectCode ?? "",
      begin: laatste?.begin ?? "07:00",
      eind: laatste?.eind ?? "16:00",
      pauze: laatste?.pauze ?? 30,
      uren: berekenUren(laatste?.begin ?? "07:00", laatste?.eind ?? "16:00", laatste?.pauze ?? 30) ?? 0,
      reis: 0,
      notitie: "",
    });
  };
  const dupliceer = (r: Urenregel) => { const { id: _id, ...rest } = r; void _id; addUren({ ...rest }); };

  const exporteerNaarExcel = () => {
    const personen = medewerkers
      .map((u) => ({ u, regels: rijen.filter((r) => r.medewerkerId === u.id) }))
      .filter((x) => x.regels.length > 0)
      .map(({ u, regels }) => ({
        naam: u.naam,
        functie: u.functie ?? "",
        persnr: "",
        regels: regels.map((r) => ({
          datum: r.datum,
          dag: DAGNAAM[new Date(r.datum + "T00:00:00").getDay()],
          uursoort: uursoorten.find((x) => x.id === r.uursoortId)?.label ?? "",
          project: projectNaam(r.projectId),
          objectCode: r.objectCode ?? "",
          begin: r.begin ?? "",
          eind: r.eind ?? "",
          pauze: r.pauze ?? 0,
          uren: Number(r.uren) || 0,
          reis: Number(r.reis) || 0,
          notitie: r.notitie ?? "",
          feestdag: feestdagNaam(r.datum) ?? "",
          verlof: verlof.find((v) => v.medewerkerId === u.id && v.status === "Goedgekeurd" && v.van <= r.datum && v.tot >= r.datum)?.type ?? "",
        })),
      }));
    exporteerUrenstaat({
      bedrijfsnaam: bedrijf.naam,
      weekNr: weekNr(weekDate),
      jaar: weekDate.getFullYear(),
      periodeLabel: weekLabel,
      opsteller: currentUser.naam,
      personen,
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-ink-900">Urenstaat</h2>
          <p className="text-sm text-ink-500">Eén regel per gewerkte periode: wie, welke uursoort, welke dag en van hoe laat tot hoe laat. Het totaal rekent zichzelf uit (eind − begin − pauze).</p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <button type="button" onClick={() => setModus("uursoorten")} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <SlidersHorizontal className="h-4 w-4 text-ink-500" /> Uursoorten
          </button>
          <button type="button" onClick={exporteerNaarExcel} disabled={rijen.length === 0} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-40">
            <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel-urenstaat
          </button>
          <button type="button" onClick={() => navigeer("loonstroken", { loonWeek: weekISO })} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Wallet className="h-4 w-4 text-ink-500" /> Loonstroken maken
          </button>
        </div>
      </div>

      {/* Week-navigatie + filter op medewerker */}
      <Card className="space-y-3 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => verschuif(-7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><ChevronLeft className="h-4 w-4" /> Vorige</button>
          <div className="flex min-w-0 flex-1 flex-col items-center px-2 text-center">
            <span className="text-sm font-bold text-ink-900">Week {weekNr(weekDate)} · {weekDate.getFullYear()}</span>
            <span className="text-xs text-ink-500">{weekLabel}</span>
          </div>
          <button type="button" onClick={() => verschuif(7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Volgende <ChevronRight className="h-4 w-4" /></button>
          {!dezeWeek && <button type="button" onClick={() => setWeekISO(toISO(maandagVan(new Date())))} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Deze week</button>}
        </div>
        <div className="space-y-2 border-t border-ink-100 pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink-600">Kies een medewerker:</span>
            <span className="ml-auto text-sm font-semibold text-ink-500">
              Totaal: <span className="text-ink-900">{uurTekst(totaalUren)} u</span>
              {totaalReis > 0 && <span className="ml-2 text-ink-400">· reis {uurTekst(totaalReis)} u</span>}
            </span>
          </div>
          {/* Klik iemand aan en vul alleen zijn uren in; "Iedereen" toont de hele week. */}
          <div className="flex flex-wrap gap-1.5">
            <button type="button" onClick={() => setFilterPersoon("")} className={chip(filterPersoon === "")}>Iedereen</button>
            {medewerkers.map((u) => {
              const n = urenVanPersoon(u.id);
              return (
                <button key={u.id} type="button" onClick={() => setFilterPersoon(u.id)} className={chip(filterPersoon === u.id)}>
                  {u.naam}
                  <span className={filterPersoon === u.id ? "text-white/70" : "text-ink-400"}>{n > 0 ? `${uurTekst(n)} u` : "—"}</span>
                </button>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Werk periodes */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3">
          <Clock className="h-4 w-4 text-brand-600" />
          <h3 className="text-sm font-bold text-ink-900">Werk periodes</h3>
          <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">{rijen.length}</span>
        </div>

        {rijen.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-ink-400">Nog geen uren in week {weekNr(weekDate)}. Voeg hieronder een regel toe.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1320px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/40 text-xs font-semibold text-ink-500">
                  <th className="px-3 py-2.5 text-left">Medewerker</th>
                  <th className="px-3 py-2.5 text-left">Uursoort</th>
                  <th className="px-3 py-2.5 text-left">Project</th>
                  <th className="px-3 py-2.5 text-left">Object code</th>
                  <th className="px-3 py-2.5 text-left">Datum</th>
                  <th className="px-3 py-2.5 text-left">Begintijd</th>
                  <th className="px-3 py-2.5 text-left">Eindtijd</th>
                  <th className="px-3 py-2.5 text-left">Pauze</th>
                  <th className="px-3 py-2.5 text-left">Totaal</th>
                  <th className="px-3 py-2.5 text-left">Reis</th>
                  <th className="px-3 py-2.5 text-left">Opmerking</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Acties</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-50">
                {rijen.map((r) => {
                  const fd = feestdagNaam(r.datum);
                  const vrij = verlof.find((v) => v.medewerkerId === r.medewerkerId && v.status === "Goedgekeurd" && v.van <= r.datum && v.tot >= r.datum);
                  return (
                    <tr key={r.id} className={`align-top hover:bg-ink-50/40 ${fd || vrij ? "bg-amber-50/40" : ""}`}>
                      <td className="px-3 py-2 w-44">
                        <Keuze value={r.medewerkerId} onChange={(w) => zet(r, { medewerkerId: w })} altijdZoeken size="sm" opties={medewerkers.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker" />
                      </td>
                      <td className="px-3 py-2 w-52">
                        <Keuze value={r.uursoortId ?? ""} onChange={(w) => zet(r, { uursoortId: w || undefined })} altijdZoeken size="sm" opties={[{ waarde: "", label: "—" }, ...uursoorten.map((u) => ({ waarde: u.id, label: uursoortLabel(u) }))]} title="Uursoort" />
                      </td>
                      <td className="px-3 py-2 w-44">
                        <Keuze value={r.projectId ?? ""} onChange={(w) => zet(r, { projectId: w || undefined })} altijdZoeken size="sm" opties={[{ waarde: "", label: "Algemeen" }, ...WERK_CATEGORIEEN.map((c) => ({ waarde: c.id, label: c.naam }))]} title="Project / onderdeel" />
                      </td>
                      <td className="px-3 py-2 w-36">
                        <input value={r.objectCode ?? ""} onChange={(e) => zet(r, { objectCode: e.target.value })} placeholder="Begin met typen…" className={veld} />
                      </td>
                      <td className="px-3 py-2 w-40">
                        <DatumKiezer value={r.datum} onChange={(iso) => zet(r, { datum: iso })} />
                        <span className="mt-0.5 block text-[11px] text-ink-400">{DAGNAAM[new Date(r.datum + "T00:00:00").getDay()]}{fd ? ` · ${fd}` : ""}{vrij ? ` · ${vrij.type}` : ""}</span>
                      </td>
                      <td className="px-3 py-2 w-28"><input type="time" value={r.begin ?? ""} onChange={(e) => zet(r, { begin: e.target.value })} className={veld} /></td>
                      <td className="px-3 py-2 w-28"><input type="time" value={r.eind ?? ""} onChange={(e) => zet(r, { eind: e.target.value })} className={veld} /></td>
                      <td className="px-3 py-2 w-24">
                        <input inputMode="numeric" value={r.pauze ?? 0} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); zet(r, { pauze: Number.isFinite(n) ? n : 0 }); }} aria-label="Pauze in minuten" className={veld} />
                        <span className="mt-0.5 block text-[11px] text-ink-400">min</span>
                      </td>
                      <td className="px-3 py-2 w-24">
                        <input
                          inputMode="decimal"
                          value={uurTekst(Number(r.uren) || 0)}
                          onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); updateUren(r.id, { uren: Number.isFinite(n) && n >= 0 ? n : 0 }); }}
                          aria-label="Totaal uren"
                          className={veld + " bg-ink-50 font-semibold"}
                        />
                        <span className="mt-0.5 block text-[11px] text-ink-400">{klok(Number(r.uren) || 0)}</span>
                      </td>
                      <td className="px-3 py-2 w-20">
                        <input inputMode="decimal" value={r.reis ? uurTekst(r.reis) : ""} onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); zet(r, { reis: Number.isFinite(n) && n >= 0 ? n : 0 }); }} placeholder="0" aria-label="Reisuren" className={veld} />
                      </td>
                      <td className="px-3 py-2 min-w-[12rem]">
                        <input value={r.notitie ?? ""} onChange={(e) => zet(r, { notitie: e.target.value })} placeholder="Opmerking…" className={veld} />
                      </td>
                      <td className="px-2 py-2">
                        <div className="flex items-center gap-1">
                          <button type="button" onClick={() => dupliceer(r)} title="Regel dupliceren" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600"><Copy className="h-4 w-4" /></button>
                          <button type="button" onClick={() => deleteUren(r.id)} title="Regel verwijderen" className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-200 bg-ink-50/60 text-sm">
                  <td className="px-3 py-2.5 font-bold text-ink-900" colSpan={8}>Totaal week {weekNr(weekDate)}</td>
                  <td className="px-3 py-2.5 font-bold text-ink-900">{uurTekst(totaalUren)} u</td>
                  <td className="px-3 py-2.5 font-semibold text-ink-600">{totaalReis ? `${uurTekst(totaalReis)} u` : "—"}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 px-5 py-3">
          <button type="button" onClick={nieuweRegel} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-bold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Toevoegen</button>
          <span className="text-xs text-ink-400">Wijzigingen worden meteen opgeslagen en gedeeld met het team.</span>
        </div>
      </Card>

      <p className="text-xs text-ink-400">Het totaal wordt berekend uit begintijd − eindtijd − pauze; je kunt het altijd handmatig overschrijven. Feestdagen en goedgekeurd verlof worden bij de datum getoond. Vrije dagen beheer je op de pagina <span className="font-semibold text-ink-500">Vrije dagen</span>.</p>
    </div>
  );
}

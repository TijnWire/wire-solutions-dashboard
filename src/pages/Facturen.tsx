import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Download, Pencil, Trash2, Receipt, X, FileSpreadsheet, Check, Users } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { downloadFactuurPdf, factuurTotalen, euro } from "../lib/factuurPdf";
import { exporteerExcel } from "../lib/excel";
import type { Factuur, FactuurRegel, FactuurStatus, Project, Opdrachtgever } from "../lib/types";

const statusTone: Record<FactuurStatus, string> = {
  Concept: "amber",
  Verstuurd: "indigo",
  Betaald: "green",
};
const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };

const FACTUUR_STATUSSEN: FactuurStatus[] = ["Concept", "Verstuurd", "Betaald"];

const veld =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

// ── Factuur aanmaken / bewerken ──
function FactuurForm({ bestaande, initieel, onKlaar }: { bestaande?: Factuur; initieel?: Omit<Factuur, "id">; onKlaar: () => void }) {
  const { bedrijf, facturen, addFactuur, updateFactuur, opdrachtgevers } = useApp();
  const volgnr = String(facturen.length + 1).padStart(4, "0");
  const [f, setF] = useState<Omit<Factuur, "id">>(
    bestaande ?? initieel ?? {
      nummer: `${new Date().getFullYear()}-${volgnr}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: "",
      klantAdres: "",
      klantPostcodePlaats: "",
      tav: "",
      relatienummer: "",
      email: "",
      pdNummer: "",
      betaaltermijn: 14,
      regels: [{ omschrijving: "", aantal: 1, prijs: 0 }],
      btwPercentage: 21,
      status: "Concept",
      notitie: "",
    }
  );
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const setRegel = (i: number, patch: Partial<FactuurRegel>) =>
    set({ regels: f.regels.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRegel = (regel: FactuurRegel) => set({ regels: [...f.regels, regel] });
  const delRegel = (i: number) => set({ regels: f.regels.filter((_, idx) => idx !== i) });
  // Klantvelden in één keer invullen vanuit een opgeslagen opdrachtgever.
  const kiesOpdrachtgever = (id: string) => {
    const o = opdrachtgevers.find((x) => x.id === id);
    if (o) set({ klantNaam: o.naam, tav: o.tav ?? "", klantAdres: o.adres, klantPostcodePlaats: o.postcodePlaats, relatienummer: o.relatienummer, email: o.email });
  };

  const totalen = factuurTotalen({ ...f, id: "x" });

  const opslaan = () => {
    if (!f.klantNaam.trim()) return;
    if (bestaande) updateFactuur(bestaande.id, f);
    else addFactuur(f);
    onKlaar();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">{bestaande ? "Factuur bewerken" : "Nieuwe factuur"}</h2>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Factuurnummer</label>
            <input value={f.nummer} onChange={(e) => set({ nummer: e.target.value })} className={veld} />
          </div>
          <div>
            <label className={labelCls}>Datum</label>
            <DatumKiezer value={f.datum} onChange={(iso) => set({ datum: iso })} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <Keuze value={f.status} onChange={(w) => set({ status: w as FactuurStatus })} opties={FACTUUR_STATUSSEN.map((s) => ({ waarde: s, label: s }))} title="Status" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Relatienummer</label>
            <input value={f.relatienummer ?? ""} onChange={(e) => set({ relatienummer: e.target.value })} placeholder="20200015" className={veld} />
          </div>
          <div>
            <label className={labelCls}>PD-nummer</label>
            <input value={f.pdNummer ?? ""} onChange={(e) => set({ pdNummer: e.target.value })} placeholder="PD153335" className={veld} />
          </div>
          <div>
            <label className={labelCls}>Betaaltermijn (dagen)</label>
            <input type="number" value={f.betaaltermijn ?? 14} onChange={(e) => set({ betaaltermijn: Number(e.target.value) })} placeholder="14" className={veld} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <span className="text-xs font-semibold text-ink-500">Opdrachtgever</span>
          <div className="w-full sm:w-64">
            <Keuze value="" onChange={kiesOpdrachtgever} opties={[{ waarde: "", label: opdrachtgevers.length ? "Kies opdrachtgever…" : "Nog geen opdrachtgevers" }, ...opdrachtgevers.map((o) => ({ waarde: o.id, label: o.naam }))]} title="Opdrachtgever kiezen" />
          </div>
          <span className="text-xs text-ink-400">vult de klantgegevens automatisch in</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Klantnaam</label>
            <input value={f.klantNaam} onChange={(e) => set({ klantNaam: e.target.value })} placeholder="Stedin Netbeheer B.V." className={veld} />
          </div>
          <div>
            <label className={labelCls}>T.a.v.</label>
            <input value={f.tav ?? ""} onChange={(e) => set({ tav: e.target.value })} placeholder="Contactpersoon" className={veld} />
          </div>
          <div>
            <label className={labelCls}>Adres klant</label>
            <input value={f.klantAdres} onChange={(e) => set({ klantAdres: e.target.value })} placeholder="Nijverheidsweg 15" className={veld} />
          </div>
          <div>
            <label className={labelCls}>Postcode + plaats</label>
            <input value={f.klantPostcodePlaats} onChange={(e) => set({ klantPostcodePlaats: e.target.value })} placeholder="3534 AM Utrecht" className={veld} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>E-mail (waar de factuur naartoe moet)</label>
            <input type="email" value={f.email ?? ""} onChange={(e) => set({ email: e.target.value })} placeholder="facturen@opdrachtgever.nl" className={veld} />
          </div>
        </div>
      </Card>

      {/* Regels */}
      <Card className="space-y-2 p-4">
        <div className="hidden gap-2 px-1 text-xs font-semibold text-ink-500 sm:grid sm:grid-cols-[1fr_5rem_6rem_6rem_2rem]">
          <span>Omschrijving</span>
          <span className="text-right">Aantal</span>
          <span className="text-right">Prijs</span>
          <span className="text-right">Totaal</span>
          <span />
        </div>
        {f.regels.map((r, i) => (
          <div key={i} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_5rem_6rem_6rem_2rem] sm:items-center">
            <input value={r.omschrijving} onChange={(e) => setRegel(i, { omschrijving: e.target.value })} placeholder="Omschrijving" className={veld} />
            <input type="number" value={r.aantal} onChange={(e) => setRegel(i, { aantal: Number(e.target.value) })} className={veld + " sm:text-right"} />
            <input type="number" step="0.01" value={r.prijs} onChange={(e) => setRegel(i, { prijs: Number(e.target.value) })} className={veld + " sm:text-right"} />
            <div className="px-1 text-right text-sm font-semibold text-ink-800">{euro(r.aantal * r.prijs)}</div>
            <button type="button" onClick={() => delRegel(i)} className="justify-self-end rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Regel verwijderen">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => addRegel({ omschrijving: "Brieven", aantal: 1, prijs: 2.2 })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
            <Plus className="h-4 w-4" /> Brieven (€2,20)
          </button>
          <button type="button" onClick={() => addRegel({ omschrijving: "Uren", aantal: 1, prijs: 42.35 })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
            <Plus className="h-4 w-4" /> Uren (€42,35)
          </button>
          <button type="button" onClick={() => addRegel({ omschrijving: "", aantal: 1, prijs: 0 })} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50">
            <Plus className="h-4 w-4" /> Lege regel
          </button>
        </div>

        <div className="mt-2 flex justify-end border-t border-ink-100 pt-3">
          <div className="w-56 space-y-1 text-sm">
            <div className="flex justify-between text-ink-500"><span>Subtotaal</span><span className="text-ink-800">{euro(totalen.subtotaal)}</span></div>
            <div className="flex items-center justify-between text-ink-500">
              <span className="flex items-center gap-1">BTW
                <input type="number" value={f.btwPercentage} onChange={(e) => set({ btwPercentage: Number(e.target.value) })} className="w-14 rounded border border-ink-200 px-1.5 py-0.5 text-xs" />%
              </span>
              <span className="text-ink-800">{euro(totalen.btw)}</span>
            </div>
            <div className="flex justify-between border-t border-ink-100 pt-1 text-base font-bold text-brand-700"><span>Totaal</span><span>{euro(totalen.totaal)}</span></div>
          </div>
        </div>
      </Card>

      <Card className="p-4">
        <label className={labelCls}>Notitie / betaalvoorwaarden</label>
        <textarea value={f.notitie} onChange={(e) => set({ notitie: e.target.value })} rows={2} className={veld + " resize-none"} />
      </Card>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={opslaan} disabled={!f.klantNaam.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
          <Plus className="h-4 w-4" /> Opslaan
        </button>
        <button type="button" onClick={() => void downloadFactuurPdf({ ...f, id: bestaande?.id ?? "x" }, bedrijf)} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">
          <Download className="h-4 w-4" /> Download PDF
        </button>
      </div>
    </div>
  );
}

// ── Opdrachtgevers beheren (vaste klantgegevens) ──
function OpdrachtgeverBeheer({ onKlaar }: { onKlaar: () => void }) {
  const { opdrachtgevers, addOpdrachtgever, updateOpdrachtgever, deleteOpdrachtgever } = useApp();
  const leeg = { naam: "", relatienummer: "", adres: "", postcodePlaats: "", email: "", tav: "" };
  const [bewerkId, setBewerkId] = useState<string | null>(null); // null = dicht, "nieuw" = nieuw, id = bewerken
  const [d, setD] = useState(leeg);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const start = (o?: Opdrachtgever) => {
    if (o) { setBewerkId(o.id); setD({ naam: o.naam, relatienummer: o.relatienummer, adres: o.adres, postcodePlaats: o.postcodePlaats, email: o.email, tav: o.tav ?? "" }); }
    else { setBewerkId("nieuw"); setD(leeg); }
  };
  const sluit = () => { setBewerkId(null); setD(leeg); };
  const opslaan = () => {
    if (!d.naam.trim()) return;
    if (bewerkId && bewerkId !== "nieuw") updateOpdrachtgever(bewerkId, d);
    else addOpdrachtgever(d);
    sluit();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar facturen</button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Opdrachtgevers</h2>
          <p className="text-sm text-ink-500">Vaste klantgegevens om snel op een factuur te kiezen.</p>
        </div>
        {bewerkId === null && <button type="button" onClick={() => start()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Nieuwe opdrachtgever</button>}
      </div>

      {bewerkId !== null && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">{bewerkId === "nieuw" ? "Nieuwe opdrachtgever" : "Opdrachtgever bewerken"}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><label className={labelCls}>Naam</label><input value={d.naam} onChange={(e) => set({ naam: e.target.value })} placeholder="Stedin Netbeheer B.V." className={veld} /></div>
            <div><label className={labelCls}>Relatienummer</label><input value={d.relatienummer} onChange={(e) => set({ relatienummer: e.target.value })} placeholder="20200015" className={veld} /></div>
            <div><label className={labelCls}>T.a.v.</label><input value={d.tav} onChange={(e) => set({ tav: e.target.value })} placeholder="Contactpersoon" className={veld} /></div>
            <div><label className={labelCls}>E-mail (waar de factuur heen moet)</label><input type="email" value={d.email} onChange={(e) => set({ email: e.target.value })} placeholder="facturen@opdrachtgever.nl" className={veld} /></div>
            <div><label className={labelCls}>Adres</label><input value={d.adres} onChange={(e) => set({ adres: e.target.value })} placeholder="Nijverheidsweg 15" className={veld} /></div>
            <div><label className={labelCls}>Postcode + plaats</label><input value={d.postcodePlaats} onChange={(e) => set({ postcodePlaats: e.target.value })} placeholder="3534 AM Utrecht" className={veld} /></div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={opslaan} disabled={!d.naam.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Opslaan</button>
            <button type="button" onClick={sluit} className="rounded-lg px-3 py-2 text-sm text-ink-500 hover:bg-ink-50">Annuleer</button>
          </div>
        </Card>
      )}

      {opdrachtgevers.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">Nog geen opdrachtgevers.</Card>
      ) : (
        <div className="space-y-2">
          {opdrachtgevers.map((o) => (
            <Card key={o.id} className="flex flex-wrap items-center gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{o.naam}</span>
                  {o.relatienummer && <Badge tone="slate">{o.relatienummer}</Badge>}
                </div>
                <div className="truncate text-xs text-ink-500">{[o.tav ? `t.a.v. ${o.tav}` : "", o.adres, o.postcodePlaats, o.email].filter(Boolean).join(" · ")}</div>
              </div>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => start(o)} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600" title="Bewerken"><Pencil className="h-4 w-4" /></button>
                <button type="button" onClick={() => deleteOpdrachtgever(o.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Hoofdcomponent ──
export function Facturen({ initieelFactuur }: { initieelFactuur?: string }) {
  const { facturen, bedrijf, deleteFactuur, projects, updateProject, opdrachtgevers } = useApp();
  const teFactureren = projects.filter((p) => p.boekhouding === "te_factureren");
  const [modus, setModus] = useState<"lijst" | "formulier" | "opdrachtgevers">("lijst");
  const [bewerk, setBewerk] = useState<Factuur | undefined>(undefined);
  const [nieuwVan, setNieuwVan] = useState<Omit<Factuur, "id"> | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<Factuur | null>(null);

  // Maakt automatisch een concept-factuur op basis van een doorgeschakeld project:
  // klantgegevens van de Stedin-opdrachtgever + PD-nummer + wijk als regel. Aantal/tarief vul je nog in.
  const maakConcept = (p: Project): Omit<Factuur, "id"> => {
    const og = opdrachtgevers.find((o) => o.id === "og-stedin") ?? opdrachtgevers[0];
    return {
      nummer: `${new Date().getFullYear()}-${String(facturen.length + 1).padStart(4, "0")}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: og?.naam ?? "Stedin Netbeheer B.V.",
      tav: og?.tav ?? "",
      klantAdres: og?.adres ?? "",
      klantPostcodePlaats: og?.postcodePlaats ?? "",
      relatienummer: og?.relatienummer ?? "",
      email: og?.email ?? "",
      pdNummer: p.pdNummer ?? "",
      betaaltermijn: 14,
      regels: [{ omschrijving: p.wijk, aantal: 1, prijs: 0 }],
      btwPercentage: 21,
      status: "Concept",
      notitie: "",
    };
  };
  const nieuweLege = () => { setBewerk(undefined); setNieuwVan(undefined); setModus("formulier"); };
  const nieuweVanProject = (p: Project) => { setBewerk(undefined); setNieuwVan(maakConcept(p)); setModus("formulier"); };

  // Deep-link: open meteen de factuur die vanuit een andere flow is aangemaakt.
  useEffect(() => {
    if (!initieelFactuur) return;
    const f = facturen.find((x) => x.id === initieelFactuur);
    if (f) {
      setBewerk(f);
      setModus("formulier");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initieelFactuur]);

  // Exporteer alle facturen naar Excel (verplaatst vanuit Documenten — hoort bij de boekhouding).
  const exporteerNaarExcel = () => {
    if (facturen.length === 0) return;
    const rijen = facturen.map((f) => {
      const t = factuurTotalen(f);
      return { Nummer: f.nummer, Datum: f.datum, Klant: f.klantNaam, Subtotaal: t.subtotaal, BTW: t.btw, Totaal: t.totaal, Status: f.status };
    });
    exporteerExcel(rijen, "Facturen", "Facturen");
  };

  if (modus === "formulier") {
    return <FactuurForm bestaande={bewerk} initieel={nieuwVan} onKlaar={() => setModus("lijst")} />;
  }
  if (modus === "opdrachtgevers") {
    return <OpdrachtgeverBeheer onKlaar={() => setModus("lijst")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Facturen</h2>
          <p className="text-sm text-ink-500">Maak facturen met jullie logo, download als PDF of exporteer alles naar Excel.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setModus("opdrachtgevers")} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Users className="h-4 w-4 text-ink-500" /> Opdrachtgevers
          </button>
          {facturen.length > 0 && (
            <button type="button" onClick={exporteerNaarExcel} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel
            </button>
          )}
          <button type="button" onClick={nieuweLege} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe factuur
          </button>
        </div>
      </div>

      {/* Te factureren: afgeronde projecten die de leiding heeft doorgeschakeld */}
      {teFactureren.length > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-amber-50/60 px-5 py-3">
            <Receipt className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-ink-900">Te factureren</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{teFactureren.length}</span>
            <span className="ml-1 hidden text-xs text-ink-400 sm:inline">Afgeronde projecten, doorgeschakeld door de leiding</span>
          </div>
          <div className="divide-y divide-ink-100">
            {teFactureren.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.pdNummer && <span className="rounded-md bg-ink-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">{p.pdNummer}</span>}
                    <span className="truncate text-sm font-semibold text-ink-900">{p.naam}</span>
                  </div>
                  <div className="text-xs text-ink-500">{[p.wijk, p.doorgestuurdOp ? `doorgeschakeld ${datumKort(p.doorgestuurdOp)}` : ""].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex w-full items-center gap-2 sm:w-auto">
                  <button type="button" onClick={() => nieuweVanProject(p)} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 sm:flex-none"><Plus className="h-4 w-4" /> Factuur maken</button>
                  <button type="button" onClick={() => updateProject(p.id, { boekhouding: "gefactureerd", gefactureerdOp: new Date().toISOString() })} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-100 sm:flex-none"><Check className="h-4 w-4" /> Gefactureerd</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {facturen.length === 0 ? (
        <Card className="p-10 text-center">
          <Receipt className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Nog geen facturen. Klik op <span className="font-semibold">Nieuwe factuur</span>.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {facturen.map((f) => {
            const t = factuurTotalen(f);
            return (
              <Card key={f.id} className="flex flex-wrap items-center gap-4 p-4">
                <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                  <Receipt className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink-900">{f.nummer}</span>
                    <Badge tone={statusTone[f.status]}>{f.status}</Badge>
                  </div>
                  <div className="truncate text-xs text-ink-500">
                    {f.klantNaam} · {new Date(f.datum + "T00:00:00").toLocaleDateString("nl-NL")}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-ink-900">{euro(t.totaal)}</div>
                  <div className="text-xs text-ink-400">incl. btw</div>
                </div>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => void downloadFactuurPdf(f, bedrijf)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                  <button type="button" onClick={() => { setBewerk(f); setModus("formulier"); }} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Bewerken">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setVerwijder(f)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Bevestig
        open={!!verwijder}
        titel="Factuur verwijderen"
        tekst={`Weet je het zeker dat je factuur ${verwijder?.nummer} wilt verwijderen?`}
        onBevestig={() => {
          if (verwijder) deleteFactuur(verwijder.id);
          setVerwijder(null);
        }}
        onAnnuleer={() => setVerwijder(null)}
      />
    </div>
  );
}

import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Download, Pencil, Trash2, Receipt, X, FileSpreadsheet, Users, Search, Mail, Clock, ArrowDownToLine, SlidersHorizontal, Save, Eye, Undo2 } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { downloadFactuurPdf, mailFactuur, factuurTotalen, euro } from "../lib/factuurPdf";
import { exporteerExcel } from "../lib/excel";
import { weekStartISO, weekLabel, isISODatum } from "../lib/week";
import { PeriodeNavigator, periodeRange, type Periode } from "../components/PeriodeNavigator";
import type { Factuur, FactuurRegel, FactuurStatus, Project, Opdrachtgever, Buurtaanpak, Brievenronde, Bedrijf, FactuurPreset } from "../lib/types";

// Concept = blauw, Verstuurd = oranje/geel, Betaald = groen — zo zie je de status in één oogopslag.
const statusTone: Record<FactuurStatus, string> = {
  Concept: "blue",
  Verstuurd: "amber",
  Betaald: "emerald",
};
const statusKleur: Record<FactuurStatus, string> = {
  Concept: "bg-blue-500",
  Verstuurd: "bg-amber-500",
  Betaald: "bg-emerald-500",
};
const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };

const FACTUUR_STATUSSEN: FactuurStatus[] = ["Concept", "Verstuurd", "Betaald"];

const veld =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

// Standaard factuurregels als terugval wanneer er nog niets is ingesteld bij Facturen → Tarieven.
const STANDAARD_PRESETS: FactuurPreset[] = [
  { id: "brieven", label: "Brieven", prijs: 2.2 },
  { id: "uren", label: "Uren", prijs: 42.35 },
];
const presetsVan = (b: Bedrijf): FactuurPreset[] => (b.factuurPresets?.length ? b.factuurPresets : STANDAARD_PRESETS);

// ── Factuur aanmaken / bewerken ──
function FactuurForm({ bestaande, initieel, onKlaar, onOpgeslagen }: { bestaande?: Factuur; initieel?: Omit<Factuur, "id">; onKlaar: () => void; onOpgeslagen?: () => void }) {
  const { bedrijf, facturen, addFactuur, updateFactuur, opdrachtgevers } = useApp();
  const volgnr = String(facturen.length + 1).padStart(4, "0");
  const [f, setF] = useState<Omit<Factuur, "id">>(
    bestaande ?? initieel ?? {
      nummer: `${new Date().getFullYear()}-${volgnr}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: "",
      afdeling: "",
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
  // Bij Brieven/Uren: nog lege omschrijving-regels vervallen, zodat alleen de toegevoegde regel blijft.
  // Een regel met al een omschrijving (bijv. "Auto") blijft gewoon staan.
  const addPreset = (regel: FactuurRegel) => set({ regels: [...f.regels.filter((r) => r.omschrijving.trim() !== ""), regel] });
  const delRegel = (i: number) => set({ regels: f.regels.filter((_, idx) => idx !== i) });
  // Klantvelden in één keer invullen vanuit een opgeslagen opdrachtgever.
  const kiesOpdrachtgever = (id: string) => {
    const o = opdrachtgevers.find((x) => x.id === id);
    if (o) set({ klantNaam: o.naam, afdeling: o.afdeling ?? "", tav: o.tav ?? "", klantAdres: o.adres, klantPostcodePlaats: o.postcodePlaats, relatienummer: o.relatienummer, email: o.email });
  };

  const totalen = factuurTotalen({ ...f, id: "x" });

  const opslaan = () => {
    if (!f.klantNaam.trim()) return;
    if (bestaande) updateFactuur(bestaande.id, f);
    else { addFactuur(f); onOpgeslagen?.(); }
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
            <Keuze value={f.status} onChange={(w) => set({ status: w as FactuurStatus })} opties={FACTUUR_STATUSSEN.map((s) => ({ waarde: s, label: s, kleur: statusKleur[s] }))} title="Status" />
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
            <Keuze value="" onChange={kiesOpdrachtgever} altijdZoeken opties={[{ waarde: "", label: opdrachtgevers.length ? "Kies opdrachtgever…" : "Nog geen opdrachtgevers" }, ...opdrachtgevers.map((o) => ({ waarde: o.id, label: o.afdeling ? `${o.naam} — ${o.afdeling}` : o.naam }))]} title="Opdrachtgever kiezen" />
          </div>
          <span className="text-xs text-ink-400">vult de klantgegevens automatisch in</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Klantnaam</label>
            <input value={f.klantNaam} onChange={(e) => set({ klantNaam: e.target.value })} placeholder="Stedin Netbeheer B.V." className={veld} />
          </div>
          <div>
            <label className={labelCls}>Afdeling</label>
            <input value={f.afdeling ?? ""} onChange={(e) => set({ afdeling: e.target.value })} placeholder="bijv. Aansluitingen" className={veld} />
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
            {/* Aantal + prijs naast elkaar op mobiel (met label), platgeslagen in de desktop-grid via sm:contents */}
            <div className="grid grid-cols-2 gap-2 sm:contents">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-500 sm:hidden">Aantal</span>
                <input type="number" inputMode="numeric" value={r.aantal} onChange={(e) => setRegel(i, { aantal: Number(e.target.value) })} className={veld + " sm:text-right"} />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-500 sm:hidden">Prijs (€)</span>
                <input type="number" inputMode="decimal" step="0.01" value={r.prijs} onChange={(e) => setRegel(i, { prijs: Number(e.target.value) })} className={veld + " sm:text-right"} />
              </label>
            </div>
            <div className="flex items-center justify-between border-t border-ink-100 px-1 pt-2 text-sm sm:block sm:border-0 sm:pt-0 sm:text-right">
              <span className="text-xs text-ink-500 sm:hidden">Totaal</span>
              <span className="font-semibold text-ink-800">{euro(r.aantal * r.prijs)}</span>
            </div>
            <button type="button" onClick={() => delRegel(i)} className="justify-self-end rounded-lg p-2.5 text-red-400 hover:bg-red-50 hover:text-red-600 sm:p-1.5" title="Regel verwijderen">
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-2">
          {presetsVan(bedrijf).map((p) => (
            <button key={p.id} type="button" onClick={() => addPreset({ omschrijving: p.label, aantal: 1, prijs: p.prijs })} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
            <Plus className="h-4 w-4" /> {p.label} ({euro(p.prijs)})
          </button>
          ))}
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
  const leeg = { naam: "", afdeling: "", relatienummer: "", adres: "", postcodePlaats: "", email: "", tav: "", personen: [] as { userId: string; uurtarief: number }[] };
  const [bewerkId, setBewerkId] = useState<string | null>(null); // null = dicht, "nieuw" = nieuw, id = bewerken
  const [d, setD] = useState(leeg);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const start = (o?: Opdrachtgever) => {
    if (o) { setBewerkId(o.id); setD({ naam: o.naam, afdeling: o.afdeling ?? "", relatienummer: o.relatienummer, adres: o.adres, postcodePlaats: o.postcodePlaats, email: o.email, tav: o.tav ?? "", personen: o.personen ?? [] }); }
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
            <div><label className={labelCls}>Afdeling <span className="font-normal text-ink-400">(optioneel)</span></label><input value={d.afdeling} onChange={(e) => set({ afdeling: e.target.value })} placeholder="bijv. Aansluitingen / Sanering" className={veld} /></div>
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
                  {o.afdeling && <Badge tone="indigo">{o.afdeling}</Badge>}
                  {o.relatienummer && <Badge tone="slate">{o.relatienummer}</Badge>}
                </div>
                <div className="truncate text-xs text-ink-500">{[o.afdeling, o.tav ? `t.a.v. ${o.tav}` : "", o.adres, o.postcodePlaats, o.email].filter(Boolean).join(" · ")}</div>
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

// ── Automatisch een factuur op basis van de gewerkte uren (Urenstaat) per opdrachtgever ──
function UrenFactuur({ facturenCount, opdrachtgevers, users, urenstaat, onGenereer, onNaarOpdrachtgevers, onKlaar }: {
  facturenCount: number;
  opdrachtgevers: Opdrachtgever[];
  users: { id: string; naam: string }[];
  urenstaat: { medewerkerId: string; datum: string; uren: number }[];
  onGenereer: (concept: Omit<Factuur, "id">) => void;
  onNaarOpdrachtgevers: () => void;
  onKlaar: () => void;
}) {
  const nu = new Date();
  const y = nu.getFullYear(), mth = nu.getMonth();
  const eersteVanMaand = `${y}-${String(mth + 1).padStart(2, "0")}-01`;
  const laatsteDagNr = new Date(y, mth + 1, 0).getDate();
  const laatsteVanMaand = `${y}-${String(mth + 1).padStart(2, "0")}-${String(laatsteDagNr).padStart(2, "0")}`;

  const [ogId, setOgId] = useState(opdrachtgevers[0]?.id ?? "");
  const [van, setVan] = useState(eersteVanMaand);
  const [tot, setTot] = useState(laatsteVanMaand);

  const og = opdrachtgevers.find((o) => o.id === ogId);
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Medewerker";
  const uurNet = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace(".", ","));
  const urenVanPersoon = (userId: string) => urenstaat.filter((x) => x.medewerkerId === userId && x.datum >= van && x.datum <= tot).reduce((s, x) => s + (Number(x.uren) || 0), 0);
  const fmt = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

  const regels = (og?.personen ?? []).map((p) => ({ naam: naamVan(p.userId), uren: urenVanPersoon(p.userId), tarief: p.uurtarief }));
  const metUren = regels.filter((r) => r.uren > 0);
  const subtotaal = metUren.reduce((s, r) => s + r.uren * r.tarief, 0);

  const genereer = () => {
    if (!og || metUren.length === 0) return;
    const concept: Omit<Factuur, "id"> = {
      nummer: `${new Date().getFullYear()}-${String(facturenCount + 1).padStart(4, "0")}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: og.naam, afdeling: og.afdeling ?? "", tav: og.tav ?? "", klantAdres: og.adres, klantPostcodePlaats: og.postcodePlaats,
      relatienummer: og.relatienummer, email: og.email, betaaltermijn: 14,
      regels: metUren.map((r) => ({ omschrijving: `Gewerkte uren ${r.naam} (${fmt(van)} – ${fmt(tot)})`, aantal: Math.round(r.uren * 100) / 100, prijs: r.tarief })),
      btwPercentage: 21, status: "Concept", notitie: "",
    };
    onGenereer(concept);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar facturen</button>
      <div>
        <h2 className="text-xl font-bold text-ink-900">Factuur op uren</h2>
        <p className="text-sm text-ink-500">Kies een opdrachtgever en een periode. De app telt de gewerkte uren per gekoppelde medewerker (uit de Urenstaat) en zet ze automatisch op een concept-factuur die je nog kunt nakijken en mailen.</p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={labelCls}>Opdrachtgever</label>
            <Keuze value={ogId} onChange={setOgId} altijdZoeken opties={opdrachtgevers.length ? opdrachtgevers.map((o) => ({ waarde: o.id, label: o.afdeling ? `${o.naam} — ${o.afdeling}` : o.naam })) : [{ waarde: "", label: "Nog geen opdrachtgevers" }]} title="Opdrachtgever" />
          </div>
          <div><label className={labelCls}>Van</label><DatumKiezer value={van} onChange={setVan} /></div>
          <div><label className={labelCls}>Tot en met</label><DatumKiezer value={tot} onChange={setTot} /></div>
        </div>

        {!og ? (
          <p className="rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-500">Kies een opdrachtgever om te beginnen.</p>
        ) : (og.personen ?? []).length === 0 ? (
          <div className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-700">
            Er zijn nog geen medewerkers aan {og.naam} gekoppeld. <button type="button" onClick={onNaarOpdrachtgevers} className="font-semibold underline">Koppel medewerkers &amp; uurtarief</button> bij Opdrachtgevers.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink-200">
            <table className="w-full min-w-[420px] text-sm">
              <thead>
                <tr className="bg-ink-50/60 text-xs text-ink-500">
                  <th className="px-3 py-2 text-left font-semibold">Medewerker</th>
                  <th className="px-3 py-2 text-right font-semibold">Uren</th>
                  <th className="px-3 py-2 text-right font-semibold">Tarief</th>
                  <th className="px-3 py-2 text-right font-semibold">Bedrag</th>
                </tr>
              </thead>
              <tbody>
                {regels.map((r, i) => (
                  <tr key={i} className={`border-t border-ink-100 ${r.uren === 0 ? "text-ink-300" : ""}`}>
                    <td className="px-3 py-2">{r.naam}</td>
                    <td className="px-3 py-2 text-right">{r.uren ? `${uurNet(r.uren)} u` : "0 u"}</td>
                    <td className="px-3 py-2 text-right">{euro(r.tarief)}</td>
                    <td className="px-3 py-2 text-right font-semibold text-ink-900">{r.uren ? euro(r.uren * r.tarief) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-ink-200 bg-ink-50/60">
                  <td className="px-3 py-2 font-bold text-ink-900" colSpan={3}>Subtotaal (excl. btw)</td>
                  <td className="px-3 py-2 text-right font-bold text-ink-900">{euro(subtotaal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={genereer} disabled={!og || metUren.length === 0} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"><Receipt className="h-4 w-4" /> Factuur genereren</button>
          {og && metUren.length === 0 && (og.personen ?? []).length > 0 && <span className="text-xs text-ink-400">Geen uren in deze periode voor de gekoppelde medewerkers.</span>}
        </div>
      </Card>
    </div>
  );
}

// ── Hoofdcomponent ──
// ── Standaardtarieven beheren (Brieven, Uren en eigen regels) — prijzen op één plek aanpassen ──
function TarievenBeheer({ bedrijf, updateBedrijf, onKlaar }: { bedrijf: Bedrijf; updateBedrijf: (patch: Partial<Bedrijf>) => void; onKlaar: () => void }) {
  const [rijen, setRijen] = useState<FactuurPreset[]>(() => presetsVan(bedrijf).map((p) => ({ ...p })));
  const setPrijs = (id: string, prijs: number) => setRijen((r) => r.map((x) => (x.id === id ? { ...x, prijs } : x)));
  const setLabel = (id: string, label: string) => setRijen((r) => r.map((x) => (x.id === id ? { ...x, label } : x)));
  const verwijder = (id: string) => setRijen((r) => r.filter((x) => x.id !== id));
  const voegToe = () => setRijen((r) => [...r, { id: `preset-${Date.now()}-${r.length}`, label: "", prijs: 0 }]);
  const opslaan = () => { updateBedrijf({ factuurPresets: rijen.filter((x) => x.label.trim()) }); onKlaar(); };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar facturen</button>
      <div>
        <h2 className="text-xl font-bold text-ink-900">Tarieven</h2>
        <p className="text-sm text-ink-500">De standaard factuurregels (Brieven, Uren, …) met hun prijs. Ze verschijnen als snelknoppen bij het maken van een factuur — pas hier de prijs aan als er iets verandert.</p>
      </div>

      <Card className="space-y-3 p-4">
        <div className="hidden gap-2 px-1 text-xs font-semibold text-ink-500 sm:grid sm:grid-cols-[1fr_9rem_2rem]">
          <span>Omschrijving</span><span className="text-right">Prijs (€ excl. btw)</span><span />
        </div>
        {rijen.length === 0 ? (
          <p className="px-1 py-3 text-sm text-ink-400">Nog geen tarieven. Voeg er een toe.</p>
        ) : rijen.map((p) => (
          <div key={p.id} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem_2rem] sm:items-center">
            <input value={p.label} onChange={(e) => setLabel(p.id, e.target.value)} placeholder="Bijv. Brieven, Uren, Voorrijkosten" className={veld} />
            <div className="flex items-center gap-1">
              <span className="text-sm text-ink-400">€</span>
              <input inputMode="decimal" value={p.prijs ? String(p.prijs).replace(".", ",") : ""} onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); setPrijs(p.id, Number.isFinite(n) && n >= 0 ? n : 0); }} placeholder="0,00" aria-label={`Prijs ${p.label}`} className={veld + " text-right"} />
            </div>
            <button type="button" onClick={() => verwijder(p.id)} className="justify-self-end rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Tarief verwijderen"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
        <button type="button" onClick={voegToe} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50"><Plus className="h-4 w-4" /> Tarief toevoegen</button>
      </Card>

      <div className="flex gap-2">
        <button type="button" onClick={opslaan} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700"><Save className="h-4 w-4" /> Opslaan</button>
        <button type="button" onClick={onKlaar} className="rounded-xl border border-ink-200 bg-white px-5 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
      </div>
      <p className="text-xs text-ink-400">De regel "Brieven" wordt ook gebruikt om automatisch een brieven-factuur per map voor te vullen.</p>
    </div>
  );
}

export function Facturen({ initieelFactuur, nieuwFactuurProject }: { initieelFactuur?: string; nieuwFactuurProject?: string }) {
  const { facturen, bedrijf, updateBedrijf, deleteFactuur, projects, updateProject, opdrachtgevers, buurtaanpak, updateBuurtaanpak, rondes, updateRonde, users, urenstaat, currentUser, addMededeling } = useApp();
  const { navigeer } = useNav();
  const teFactureren = projects.filter((p) => p.boekhouding === "te_factureren");
  const teFacturerenBuurt = buurtaanpak.filter((b) => b.boekhouding === "te_factureren");
  const teFacturerenRondes = rondes.filter((r) => r.boekhouding === "te_factureren");
  // Brievenrondes groeperen per map (mapNaam) → in "Te factureren" één regel per map, niet per straat.
  const teFacturerenMappen = (() => {
    const groepen = new Map<string, Brievenronde[]>();
    for (const r of teFacturerenRondes) {
      const key = r.mapNaam || `ronde-${r.id}`;
      const arr = groepen.get(key) ?? [];
      arr.push(r);
      groepen.set(key, arr);
    }
    return [...groepen.values()].map((rs) => ({
      key: rs[0].mapNaam || rs[0].id,
      naam: rs[0].mapNaam || rs[0].straat,
      plaats: rs[0].plaats,
      rondes: rs,
      gegooid: rs.reduce((s, r) => s + r.adressen.filter((a) => !a.ontbreekt && a.status === "Gegooid").length, 0),
      pd: rs.find((r) => r.pdNummer)?.pdNummer,
      doorgestuurd: rs.map((r) => r.doorgestuurdOp).filter(Boolean).sort()[0],
    }));
  })();
  const inkomendAantal = teFactureren.length + teFacturerenBuurt.length + teFacturerenMappen.length;
  const [tab, setTab] = useState<"facturen" | "inkomend">("facturen");
  const [bron, setBron] = useState<null | (() => void)>(null); // markeert de bron als gefactureerd zodra de factuur is opgeslagen
  const [modus, setModus] = useState<"lijst" | "formulier" | "opdrachtgevers" | "uren" | "tarieven">("lijst");
  const [bewerk, setBewerk] = useState<Factuur | undefined>(undefined);
  const [nieuwVan, setNieuwVan] = useState<Omit<Factuur, "id"> | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<Factuur | null>(null);
  // Filters: zoektekst (klant/naam/factuurnummer) + periode (week/maand/kwartaal) + status.
  const [zoek, setZoek] = useState("");
  const [periode, setPeriode] = useState<Periode>("week");
  const [anker, setAnker] = useState(() => new Date().toISOString().slice(0, 10));
  const [statusFilter, setStatusFilter] = useState<"" | FactuurStatus>("");
  // Boekhouder-actie op inkomend werk: terugsturen naar het veld en/of een melding plaatsen.
  const [issue, setIssue] = useState<null | { naam: string; projectId?: string; reopen: () => void }>(null);
  const [reden, setReden] = useState("");

  // Maakt automatisch een concept-factuur op basis van een doorgeschakeld project:
  // klantgegevens van de Stedin-opdrachtgever + PD-nummer + wijk als regel. Aantal/tarief vul je nog in.
  const maakConceptVan = (pdNummer: string, omschrijving: string, aantal = 1, prijs = 0): Omit<Factuur, "id"> => {
    const og = opdrachtgevers.find((o) => o.id === "og-stedin") ?? opdrachtgevers[0];
    return {
      nummer: `${new Date().getFullYear()}-${String(facturen.length + 1).padStart(4, "0")}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: og?.naam ?? "Stedin Netbeheer B.V.",
      afdeling: og?.afdeling ?? "",
      tav: og?.tav ?? "",
      klantAdres: og?.adres ?? "",
      klantPostcodePlaats: og?.postcodePlaats ?? "",
      relatienummer: og?.relatienummer ?? "",
      email: og?.email ?? "",
      pdNummer: pdNummer || "",
      betaaltermijn: 14,
      regels: [{ omschrijving, aantal, prijs }],
      btwPercentage: 21,
      status: "Concept",
      notitie: "",
    };
  };
  // Concept vanuit een project: gebruik de eigen opdrachtgever + uurtarief van het project (val terug op Stedin).
  const maakConceptVanProject = (p: Project): Omit<Factuur, "id"> => {
    const eigen = p.opdrachtgeverId ? opdrachtgevers.find((o) => o.id === p.opdrachtgeverId) : undefined;
    const og = eigen ?? opdrachtgevers.find((o) => o.id === "og-stedin") ?? opdrachtgevers[0];
    return {
      nummer: `${new Date().getFullYear()}-${String(facturen.length + 1).padStart(4, "0")}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: og?.naam ?? "Stedin Netbeheer B.V.",
      afdeling: og?.afdeling ?? "",
      tav: og?.tav ?? "",
      klantAdres: og?.adres ?? "",
      klantPostcodePlaats: og?.postcodePlaats ?? "",
      relatienummer: og?.relatienummer ?? "",
      email: og?.email ?? "",
      pdNummer: p.pdNummer ?? "",
      betaaltermijn: 14,
      regels: [{ omschrijving: [p.naam, p.wijk && p.wijk !== "—" ? p.wijk : ""].filter(Boolean).join(" — "), aantal: 1, prijs: p.uurtarief ?? 0 }],
      btwPercentage: 21,
      status: "Concept",
      notitie: "",
    };
  };
  const nu = () => new Date().toISOString();
  const nieuweLege = () => { setBewerk(undefined); setNieuwVan(undefined); setBron(null); setModus("formulier"); };
  const nieuweVanUren = (concept: Omit<Factuur, "id">) => { setBewerk(undefined); setNieuwVan(concept); setBron(null); setModus("formulier"); };
  const nieuweVanProject = (p: Project) => { setBewerk(undefined); setNieuwVan(maakConceptVanProject(p)); setBron(() => () => updateProject(p.id, { boekhouding: "gefactureerd", gefactureerdOp: nu() })); setModus("formulier"); };
  const nieuweVanBuurt = (b: Buurtaanpak) => { setBewerk(undefined); setNieuwVan(maakConceptVan(b.pdNummer ?? "", b.naam)); setBron(() => () => updateBuurtaanpak(b.id, { boekhouding: "gefactureerd", gefactureerdOp: nu() })); setModus("formulier"); };
  // Eén factuur voor de héle map (alle te-factureren rondes van die map worden op 'gefactureerd' gezet).
  const brievenTarief = presetsVan(bedrijf).find((p) => p.id === "brieven" || p.label.toLowerCase() === "brieven")?.prijs ?? 2.2;
  const nieuweVanMap = (groep: { naam: string; gegooid: number; pd?: string; rondes: Brievenronde[] }) => {
    setBewerk(undefined);
    setNieuwVan(maakConceptVan(groep.pd ?? "", `Brieven & route — ${groep.naam}`, groep.gegooid || 1, brievenTarief));
    setBron(() => () => groep.rondes.forEach((r) => updateRonde(r.id, { boekhouding: "gefactureerd", gefactureerdOp: nu() })));
    setModus("formulier");
  };

  // Bekijken: spring naar het volledige werk om het te bekijken of aan te passen.
  const openProject = (id: string) => navigeer("projecten", { project: id });
  const openBuurt = (id: string) => navigeer("buurtaanpak", { buurtaanpakId: id });
  const openMap = (rs: Brievenronde[]) => navigeer("brieven", { ronde: rs[0]?.id });

  // Terugsturen/melding: open de modal; bij terugsturen zet reopen() het werk terug in het veld.
  const startIssue = (naam: string, reopen: () => void, projectId?: string) => { setReden(""); setIssue({ naam, reopen, projectId }); };
  const verwerkIssue = (terugsturen: boolean) => {
    if (!issue) return;
    const r = reden.trim();
    if (currentUser && (r || terugsturen)) {
      const prefix = terugsturen ? "⚠️ Teruggestuurd door de boekhouding" : "📌 Opmerking van de boekhouding";
      addMededeling({ auteurId: currentUser.id, tekst: `${prefix} — ${issue.naam}${r ? `: ${r}` : ""}`, belangrijk: true, projectId: issue.projectId });
    }
    if (terugsturen) issue.reopen();
    setIssue(null); setReden("");
  };

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

  // Deep-link vanuit Projectbeheer: open meteen een nieuwe, voorgevulde factuur voor dit project.
  useEffect(() => {
    if (!nieuwFactuurProject) return;
    const p = projects.find((x) => x.id === nieuwFactuurProject);
    if (p) nieuweVanProject(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nieuwFactuurProject]);

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
    return <FactuurForm bestaande={bewerk} initieel={nieuwVan} onKlaar={() => setModus("lijst")} onOpgeslagen={() => { bron?.(); setBron(null); }} />;
  }
  if (modus === "opdrachtgevers") {
    return <OpdrachtgeverBeheer onKlaar={() => setModus("lijst")} />;
  }
  if (modus === "uren") {
    return <UrenFactuur facturenCount={facturen.length} opdrachtgevers={opdrachtgevers} users={users} urenstaat={urenstaat} onGenereer={nieuweVanUren} onNaarOpdrachtgevers={() => setModus("opdrachtgevers")} onKlaar={() => setModus("lijst")} />;
  }
  if (modus === "tarieven") {
    return <TarievenBeheer bedrijf={bedrijf} updateBedrijf={updateBedrijf} onKlaar={() => setModus("lijst")} />;
  }

  // ── Filteren (zoektekst + periode + status) en groeperen per week ──
  const range = periodeRange(periode, anker);
  const inPeriode = (d: string) => !range || (isISODatum(d) && d >= range.start && d <= range.eind);
  const q = zoek.trim().toLowerCase();
  const gefilterd = facturen.filter((f) => {
    if (statusFilter && f.status !== statusFilter) return false;
    if (!inPeriode(f.datum)) return false;
    if (q) {
      const hooi = `${f.nummer} ${f.klantNaam} ${f.tav ?? ""} ${f.relatienummer ?? ""} ${f.email ?? ""}`.toLowerCase();
      if (!hooi.includes(q)) return false;
    }
    return true;
  });
  // Nieuwste eerst op datum, daarna gegroepeerd per week (nieuwste week bovenaan).
  const gesorteerd = [...gefilterd].sort((a, b) => (b.datum || "").localeCompare(a.datum || "") || b.nummer.localeCompare(a.nummer, "nl", { numeric: true }));
  const weken: { key: string; label: string; facturen: Factuur[] }[] = [];
  for (const f of gesorteerd) {
    const wk = weekStartISO(f.datum) || "zonder";
    let w = weken.find((x) => x.key === wk);
    if (!w) { w = { key: wk, label: wk === "zonder" ? "Zonder datum" : weekLabel(wk), facturen: [] }; weken.push(w); }
    w.facturen.push(f);
  }
  const totaalPeriode = gefilterd.reduce((s, f) => s + factuurTotalen(f).totaal, 0);

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
          <button type="button" onClick={() => setModus("uren")} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Clock className="h-4 w-4 text-ink-500" /> Factuur op uren
          </button>
          <button type="button" onClick={() => setModus("tarieven")} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <SlidersHorizontal className="h-4 w-4 text-ink-500" /> Tarieven
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

      {/* Tabs: facturen vs. inkomende afgeronde projecten */}
      <div className="flex flex-wrap gap-2 border-b border-ink-200">
        <button type="button" onClick={() => setTab("facturen")} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === "facturen" ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
          <Receipt className="h-4 w-4" /> Facturen
        </button>
        <button type="button" onClick={() => setTab("inkomend")} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === "inkomend" ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
          <ArrowDownToLine className="h-4 w-4" /> Te factureren
          {inkomendAantal > 0 && <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">{inkomendAantal}</span>}
        </button>
      </div>

      {tab === "inkomend" && inkomendAantal === 0 && (
        <Card className="p-10 text-center">
          <Receipt className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Geen afgerond werk dat nog gefactureerd moet worden. Zodra de leiding een project of map naar de boekhouding stuurt, verschijnt het hier.</p>
        </Card>
      )}

      {tab === "inkomend" && inkomendAantal > 0 && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-amber-50/60 px-5 py-3">
            <Receipt className="h-4 w-4 text-amber-600" />
            <h3 className="text-sm font-bold text-ink-900">Afgeronde projecten — te factureren</h3>
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{inkomendAantal}</span>
            <span className="ml-1 hidden text-xs text-ink-400 sm:inline">Doorgeschakeld door de leiding · maak per project/map één factuur</span>
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
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <button type="button" onClick={() => openProject(p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Eye className="h-4 w-4" /> Bekijken</button>
                  <button type="button" onClick={() => startIssue([p.pdNummer, p.naam].filter(Boolean).join(" · "), () => updateProject(p.id, { boekhouding: undefined, doorgestuurdOp: undefined, afgerondOp: undefined }), p.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"><Undo2 className="h-4 w-4" /> Terugsturen</button>
                  <button type="button" onClick={() => nieuweVanProject(p)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Factuur maken</button>
                </div>
              </div>
            ))}
            {teFacturerenBuurt.map((b) => (
              <div key={b.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {b.pdNummer && <span className="rounded-md bg-ink-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">{b.pdNummer}</span>}
                    <span className="truncate text-sm font-semibold text-ink-900">{b.naam}</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Buurtaanpak</span>
                  </div>
                  <div className="text-xs text-ink-500">{[b.regio, b.doorgestuurdOp ? `doorgeschakeld ${datumKort(b.doorgestuurdOp)}` : ""].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <button type="button" onClick={() => openBuurt(b.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Eye className="h-4 w-4" /> Bekijken</button>
                  <button type="button" onClick={() => startIssue([b.pdNummer, b.naam].filter(Boolean).join(" · "), () => updateBuurtaanpak(b.id, { boekhouding: undefined, doorgestuurdOp: undefined }))} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"><Undo2 className="h-4 w-4" /> Terugsturen</button>
                  <button type="button" onClick={() => nieuweVanBuurt(b)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Factuur maken</button>
                </div>
              </div>
            ))}
            {teFacturerenMappen.map((m) => (
              <div key={m.key} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {m.pd && <span className="rounded-md bg-ink-900 px-2 py-0.5 text-xs font-bold tracking-wide text-white">{m.pd}</span>}
                    <span className="truncate text-sm font-semibold text-ink-900">{m.naam}</span>
                    <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[11px] font-semibold text-brand-700">Brieven &amp; route</span>
                  </div>
                  <div className="text-xs text-ink-500">{[m.plaats, `${m.rondes.length} ${m.rondes.length === 1 ? "straat" : "straten"}`, `${m.gegooid} gegooid`, m.doorgestuurd ? `afgerond ${datumKort(m.doorgestuurd)}` : ""].filter(Boolean).join(" · ")}</div>
                </div>
                <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                  <button type="button" onClick={() => openMap(m.rondes)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Eye className="h-4 w-4" /> Bekijken</button>
                  <button type="button" onClick={() => startIssue([m.pd, m.naam].filter(Boolean).join(" · "), () => m.rondes.forEach((r) => updateRonde(r.id, { boekhouding: undefined, doorgestuurdOp: undefined, status: "toegewezen", verstuurdOp: undefined })))} className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700 hover:bg-amber-100"><Undo2 className="h-4 w-4" /> Terugsturen</button>
                  <button type="button" onClick={() => nieuweVanMap(m)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Factuur maken</button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {tab === "facturen" && (facturen.length === 0 ? (
        <Card className="p-10 text-center">
          <Receipt className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Nog geen facturen. Klik op <span className="font-semibold">Nieuwe factuur</span>.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Periode-navigator (week/maand/kwartaal) + zoeken + gekleurde status */}
          <div className="space-y-3">
            <PeriodeNavigator
              periode={periode}
              setPeriode={setPeriode}
              anker={anker}
              setAnker={setAnker}
              rechts={<span className="text-sm font-bold text-ink-900">{euro(totaalPeriode)} <span className="font-medium text-ink-400">gefactureerd · {gefilterd.length} {gefilterd.length === 1 ? "factuur" : "facturen"}</span></span>}
            />
            <Card className="flex flex-wrap items-end gap-3 p-3">
              <div className="relative min-w-0 flex-1">
                <label className={labelCls}>Zoeken</label>
                <Search className="pointer-events-none absolute left-3 top-[34px] h-4 w-4 text-ink-400" />
                <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Klant, naam of factuurnummer…" className={veld + " pl-9"} />
                {zoek && <button type="button" onClick={() => setZoek("")} className="absolute right-2 top-[30px] rounded p-1 text-ink-400 hover:bg-ink-100" title="Wissen"><X className="h-4 w-4" /></button>}
              </div>
              <div className="w-40"><label className={labelCls}>Status</label><Keuze value={statusFilter} onChange={(w) => setStatusFilter(w as "" | FactuurStatus)} opties={[{ waarde: "", label: "Alle" }, ...FACTUUR_STATUSSEN.map((s) => ({ waarde: s, label: s, kleur: statusKleur[s] }))]} title="Status" /></div>
            </Card>
          </div>

          {gesorteerd.length === 0 ? (
            <Card className="p-8 text-center text-sm text-ink-500">Geen facturen gevonden met deze filters.</Card>
          ) : (
            <div className="space-y-5">
              {weken.map((wg) => (
                <div key={wg.key}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-bold text-ink-700">{wg.label}</h3>
                    <span className="text-xs font-medium text-ink-500">{wg.facturen.length} {wg.facturen.length === 1 ? "factuur" : "facturen"}</span>
                  </div>
                  <div className="space-y-3">
                    {wg.facturen.map((f) => {
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
                              {f.klantNaam}{f.tav ? ` · t.a.v. ${f.tav}` : ""} · {new Date(f.datum + "T00:00:00").toLocaleDateString("nl-NL")}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bold text-ink-900">{euro(t.totaal)}</div>
                            <div className="text-xs text-ink-400">incl. btw</div>
                          </div>
                          <div className="flex w-full items-center justify-end gap-1 sm:w-auto">
                            <button type="button" onClick={() => void downloadFactuurPdf(f, bedrijf)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 sm:py-1.5">
                              <Download className="h-3.5 w-3.5" /> PDF
                            </button>
                            <button type="button" onClick={() => void mailFactuur(f)} disabled={!f.email} title={f.email ? `Mailen naar ${f.email}` : "Geen e-mailadres bij deze factuur"} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-xs font-medium text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 sm:py-1.5">
                              <Mail className="h-3.5 w-3.5" /> Mailen
                            </button>
                            <button type="button" onClick={() => { setBewerk(f); setModus("formulier"); }} className="rounded-lg p-2.5 text-ink-400 hover:bg-ink-100 hover:text-ink-700 sm:p-2" title="Bewerken">
                              <Pencil className="h-4 w-4" />
                            </button>
                            <button type="button" onClick={() => setVerwijder(f)} className="rounded-lg p-2.5 text-red-400 hover:bg-red-50 hover:text-red-600 sm:p-2" title="Verwijderen">
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

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

      {issue && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setIssue(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-cardhover" onClick={(e) => e.stopPropagation()}>
            <div className="mb-1 flex items-center gap-2">
              <Undo2 className="h-5 w-5 text-amber-600" />
              <h3 className="text-base font-bold text-ink-900">Terugsturen of melding maken</h3>
            </div>
            <p className="text-sm text-ink-500">{issue.naam}</p>
            <textarea value={reden} onChange={(e) => setReden(e.target.value)} rows={4} autoFocus placeholder="Wat is er aan de hand / wat moet er gebeuren? (bijv. adressen ontbreken, verkeerd PD-nummer, uren kloppen niet…)" className="mt-3 w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            <div className="mt-4 flex flex-wrap gap-2">
              <button type="button" onClick={() => verwerkIssue(true)} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-amber-700"><Undo2 className="h-4 w-4" /> Terugsturen naar het veld</button>
              <button type="button" onClick={() => verwerkIssue(false)} disabled={!reden.trim()} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"><Receipt className="h-4 w-4" /> Alleen melding plaatsen</button>
              <button type="button" onClick={() => setIssue(null)} className="rounded-lg px-3 py-2.5 text-sm text-ink-500 hover:bg-ink-50">Annuleren</button>
            </div>
            <p className="mt-2 text-xs text-ink-400">Terugsturen haalt het werk uit de boekhouding en zet het terug in het veld. Beide opties plaatsen een belangrijke mededeling voor het team.</p>
          </div>
        </div>
      )}
    </div>
  );
}

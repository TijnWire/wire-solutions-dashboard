import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Download, Pencil, Trash2, Receipt, X, FileSpreadsheet } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { downloadFactuurPdf, factuurTotalen, euro } from "../lib/factuurPdf";
import { exporteerExcel } from "../lib/excel";
import type { Factuur, FactuurRegel, FactuurStatus } from "../lib/types";

const statusTone: Record<FactuurStatus, string> = {
  Concept: "amber",
  Verstuurd: "indigo",
  Betaald: "green",
};
const FACTUUR_STATUSSEN: FactuurStatus[] = ["Concept", "Verstuurd", "Betaald"];

const veld =
  "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

// ── Factuur aanmaken / bewerken ──
function FactuurForm({ bestaande, onKlaar }: { bestaande?: Factuur; onKlaar: () => void }) {
  const { bedrijf, facturen, addFactuur, updateFactuur } = useApp();
  const volgnr = String(facturen.length + 1).padStart(4, "0");
  const [f, setF] = useState<Omit<Factuur, "id">>(
    bestaande ?? {
      nummer: `${new Date().getFullYear()}-${volgnr}`,
      datum: new Date().toISOString().slice(0, 10),
      klantNaam: "",
      klantAdres: "",
      klantPostcodePlaats: "",
      regels: [{ omschrijving: "", aantal: 1, prijs: 0 }],
      btwPercentage: 21,
      status: "Concept",
      notitie: "Betaling binnen 14 dagen o.v.v. het factuurnummer.",
    }
  );
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));
  const setRegel = (i: number, patch: Partial<FactuurRegel>) =>
    set({ regels: f.regels.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRegel = () => set({ regels: [...f.regels, { omschrijving: "", aantal: 1, prijs: 0 }] });
  const delRegel = (i: number) => set({ regels: f.regels.filter((_, idx) => idx !== i) });

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
            <label className={labelCls}>Klantnaam</label>
            <input value={f.klantNaam} onChange={(e) => set({ klantNaam: e.target.value })} placeholder="Stedin Netbeheer B.V." className={veld} />
          </div>
          <div>
            <label className={labelCls}>Adres klant</label>
            <input value={f.klantAdres} onChange={(e) => set({ klantAdres: e.target.value })} placeholder="Straat 1" className={veld} />
          </div>
          <div>
            <label className={labelCls}>Postcode + plaats</label>
            <input value={f.klantPostcodePlaats} onChange={(e) => set({ klantPostcodePlaats: e.target.value })} placeholder="1234 AB Rotterdam" className={veld} />
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
        <button type="button" onClick={addRegel} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50">
          <Plus className="h-4 w-4" /> Regel toevoegen
        </button>

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

// ── Hoofdcomponent ──
export function Facturen({ initieelFactuur }: { initieelFactuur?: string }) {
  const { facturen, bedrijf, deleteFactuur } = useApp();
  const [modus, setModus] = useState<"lijst" | "formulier">("lijst");
  const [bewerk, setBewerk] = useState<Factuur | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<Factuur | null>(null);

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
    return <FactuurForm bestaande={bewerk} onKlaar={() => setModus("lijst")} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Facturen</h2>
          <p className="text-sm text-ink-500">Maak facturen met jullie logo, download als PDF of exporteer alles naar Excel.</p>
        </div>
        <div className="flex items-center gap-2">
          {facturen.length > 0 && (
            <button type="button" onClick={exporteerNaarExcel} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              <FileSpreadsheet className="h-4 w-4 text-green-600" /> Excel
            </button>
          )}
          <button type="button" onClick={() => { setBewerk(undefined); setModus("formulier"); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe factuur
          </button>
        </div>
      </div>

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

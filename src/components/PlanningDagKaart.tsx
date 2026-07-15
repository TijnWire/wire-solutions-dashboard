import { useState } from "react";
import { Keuze } from "./Keuze";
import { Trash2, Eraser, RotateCcw } from "lucide-react";
import { dagnaam, datumKort } from "../lib/planning";
import { STRAATWERK_OPTIES, type JaNee, type PlanningDag, type PlanningSlot, type Straatwerk, type User } from "../lib/types";

const inp = "w-full min-w-0 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const straatwerkLabel = (s: Straatwerk) => (s === "" ? "—" : s.charAt(0).toUpperCase() + s.slice(1));

// Monteur kiezen: dropdown uit het projectteam, of "Anders…" → vrije tekst.
function MonteurCel({ slot, monteurs, onChange }: { slot: PlanningSlot; monteurs: User[]; onChange: (patch: Partial<PlanningSlot>) => void }) {
  const [vrij, setVrij] = useState(!!slot.monteurVrij);
  if (vrij) {
    return (
      <div className="flex items-center gap-1">
        <input value={slot.monteurVrij} onChange={(e) => onChange({ monteurVrij: e.target.value, monteurId: "" })} placeholder="Naam werknemer" className={inp} />
        <button type="button" onClick={() => { setVrij(false); onChange({ monteurVrij: "" }); }} className="shrink-0 rounded-md p-1.5 text-ink-400 hover:bg-ink-100" title="Kies uit lijst">
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }
  return (
    <Keuze
      value={slot.monteurId}
      onChange={(v) => { if (v === "__vrij") { setVrij(true); onChange({ monteurId: "", monteurVrij: "" }); } else onChange({ monteurId: v, monteurVrij: "" }); }}
      altijdZoeken
      opties={[{ waarde: "", label: "—" }, ...monteurs.map((u) => ({ waarde: u.id, label: u.naam })), { waarde: "__vrij", label: "Anders…" }]}
      size="sm"
      title="Werknemer"
    />
  );
}

export function PlanningDagKaart({
  dag,
  monteurs,
  onDna,
  onSlot,
  onSlotLeeg,
  onVerwijder,
}: {
  dag: PlanningDag;
  monteurs: User[];
  onDna: (dna: JaNee) => void;
  onSlot: (slotId: string, patch: Partial<PlanningSlot>) => void;
  onSlotLeeg: (slotId: string) => void;
  onVerwijder: () => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
      {/* Gele dag-balk (zoals in de template) */}
      <div className="flex flex-wrap items-center gap-3 bg-amber-200 px-4 py-2.5">
        <span className="text-sm font-bold text-ink-900">{datumKort(dag.datum)}</span>
        <span className="text-sm font-semibold text-ink-700">{dagnaam(dag.datum)}</span>
        <label className="ml-auto flex items-center gap-1.5 text-xs font-medium text-ink-700">
          Werkzaamheden DNA
          <div className="w-24"><Keuze value={dag.dna} onChange={(w) => onDna(w as JaNee)} opties={[{ waarde: "", label: "—" }, { waarde: "JA", label: "Ja" }, { waarde: "NEE", label: "Nee" }]} size="sm" title="Werkzaamheden DNA" /></div>
        </label>
        <button type="button" onClick={onVerwijder} className="shrink-0 rounded-md p-1.5 text-ink-500 hover:bg-amber-300/60 hover:text-red-600" title="Dag verwijderen">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Desktop: tabel */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-ink-100 bg-ink-50 text-left text-xs font-semibold text-ink-500">
              <th className="px-2 py-2">Tijd</th>
              <th className="px-2 py-2">Bijzonderheden</th>
              <th className="px-2 py-2">Adres</th>
              <th className="px-2 py-2">Nr</th>
              <th className="px-2 py-2">Tel nr</th>
              <th className="px-2 py-2">Werknemer</th>
              <th className="px-2 py-2">Straatwerk</th>
              <th className="px-2 py-2">m²</th>
              <th className="px-2 py-2" />
            </tr>
          </thead>
          <tbody>
            {dag.slots.map((s) => (
              <tr key={s.id} className="border-b border-ink-50 last:border-0">
                <td className="px-2 py-1.5 align-middle text-sm font-semibold text-ink-700">{s.tijd}</td>
                <td className="px-2 py-1.5"><input value={s.bijzonderheden} onChange={(e) => onSlot(s.id, { bijzonderheden: e.target.value })} className={inp} /></td>
                <td className="px-2 py-1.5"><input value={s.adres} onChange={(e) => onSlot(s.id, { adres: e.target.value })} placeholder="Straat" className={inp} /></td>
                <td className="w-16 px-2 py-1.5"><input value={s.huisnummer} onChange={(e) => onSlot(s.id, { huisnummer: e.target.value })} className={inp} /></td>
                <td className="px-2 py-1.5"><input value={s.telefoon} onChange={(e) => onSlot(s.id, { telefoon: e.target.value })} inputMode="tel" className={inp} /></td>
                <td className="min-w-[9rem] px-2 py-1.5"><MonteurCel slot={s} monteurs={monteurs} onChange={(patch) => onSlot(s.id, patch)} /></td>
                <td className="px-2 py-1.5">
                  <Keuze value={s.straatwerk} onChange={(w) => onSlot(s.id, { straatwerk: w as Straatwerk })} opties={STRAATWERK_OPTIES.map((o) => ({ waarde: o, label: straatwerkLabel(o) }))} size="sm" title="Straatwerk" />
                </td>
                <td className="w-16 px-2 py-1.5"><input value={s.m2} onChange={(e) => onSlot(s.id, { m2: e.target.value })} inputMode="numeric" className={inp} /></td>
                <td className="px-2 py-1.5">
                  <button type="button" onClick={() => onSlotLeeg(s.id)} className="rounded-md p-1.5 text-ink-300 hover:bg-ink-100 hover:text-ink-600" title="Rij leegmaken">
                    <Eraser className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobiel: gestapelde kaartjes per tijdslot */}
      <div className="space-y-3 p-3 md:hidden">
        {dag.slots.map((s) => (
          <div key={s.id} className="rounded-xl border border-ink-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-bold text-ink-800">{s.tijd}</span>
              <button type="button" onClick={() => onSlotLeeg(s.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-400 hover:bg-ink-100 hover:text-ink-600">
                <Eraser className="h-3.5 w-3.5" /> Leeg
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input value={s.adres} onChange={(e) => onSlot(s.id, { adres: e.target.value })} placeholder="Adres / straat" className={`${inp} col-span-2`} />
              <input value={s.huisnummer} onChange={(e) => onSlot(s.id, { huisnummer: e.target.value })} placeholder="Huisnr" className={inp} />
              <input value={s.telefoon} onChange={(e) => onSlot(s.id, { telefoon: e.target.value })} placeholder="Tel nr" inputMode="tel" className={inp} />
              <div className="col-span-2"><MonteurCel slot={s} monteurs={monteurs} onChange={(patch) => onSlot(s.id, patch)} /></div>
              <Keuze value={s.straatwerk} onChange={(w) => onSlot(s.id, { straatwerk: w as Straatwerk })} opties={STRAATWERK_OPTIES.map((o) => ({ waarde: o, label: straatwerkLabel(o) === "—" ? "Straatwerk" : straatwerkLabel(o) }))} size="sm" title="Straatwerk" />
              <input value={s.m2} onChange={(e) => onSlot(s.id, { m2: e.target.value })} placeholder="m²" inputMode="numeric" className={inp} />
              <input value={s.bijzonderheden} onChange={(e) => onSlot(s.id, { bijzonderheden: e.target.value })} placeholder="Bijzonderheden" className={`${inp} col-span-2`} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

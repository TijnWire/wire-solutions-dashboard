// De balk die boven elke projectpagina staat: Overzicht · Klaar voor Stedin · Archief.
// ─────────────────────────────────────────────────────────────────────────────
// Drie beelden op dezelfde gegevens, en overal dezelfde plek en dezelfde woorden. Dat is het hele
// punt: iemand die van Brieven naar Saneren naar TAUW loopt, hoort niet per pagina opnieuw te moeten
// leren waar hij moet klikken.
//
// Het is bewust géén apart vinkje in de database. "Klaar voor Stedin" en "Archief" volgen uit de
// stand die de knoppen al zetten — anders houd je twee dingen bij die vroeg of laat uit de pas gaan
// lopen, en dan staat er werk in twee lijstjes tegelijk of in geen enkel.

export type WerkTab = "overzicht" | "stedin" | "archief";

export function WerkTabs({ tab, setTab, klaar, archief }: {
  tab: WerkTab;
  setTab: (t: WerkTab) => void;
  klaar: number;
  archief: number;
}) {
  const knop = (k: WerkTab, label: string, n?: number) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      aria-pressed={tab === k}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${
        tab === k ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}
    >
      {label}{n ? ` (${n})` : ""}
    </button>
  );
  return (
    <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-card">
      {knop("overzicht", "Overzicht")}
      {knop("stedin", "Klaar voor Stedin", klaar)}
      {knop("archief", "Archief", archief)}
    </div>
  );
}

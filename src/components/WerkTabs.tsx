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
  // Op mobiel kort ("Stedin"), vanaf sm de volledige tekst ("Klaar voor Stedin") — scheelt hoogte en
  // voorkomt dat het label over twee regels breekt.
  const knop = (k: WerkTab, kort: string, lang: string, n?: number) => (
    <button
      type="button"
      onClick={() => setTab(k)}
      aria-pressed={tab === k}
      className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-semibold transition-colors sm:px-3 sm:py-2 sm:text-sm ${
        tab === k ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}
    >
      <span className="sm:hidden">{kort}{n ? ` (${n})` : ""}</span>
      <span className="hidden sm:inline">{lang}{n ? ` (${n})` : ""}</span>
    </button>
  );
  return (
    <div className="flex gap-0.5 rounded-lg border border-ink-200 bg-white p-0.5 shadow-card sm:gap-1 sm:rounded-xl sm:p-1">
      {knop("overzicht", "Overzicht", "Overzicht")}
      {knop("stedin", "Stedin", "Klaar voor Stedin", klaar)}
      {knop("archief", "Archief", "Archief", archief)}
    </div>
  );
}

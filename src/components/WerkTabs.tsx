import { LayoutGrid, Send, Archive } from "lucide-react";

// De balk die boven elke projectpagina staat: Overzicht · Klaar voor Stedin · Archief.
// ─────────────────────────────────────────────────────────────────────────────
// Drie beelden op dezelfde gegevens, en overal dezelfde plek en dezelfde woorden. Dat is het hele
// punt: iemand die van Brieven naar Saneren naar TAUW loopt, hoort niet per pagina opnieuw te moeten
// leren waar hij moet klikken.
//
// Het is bewust géén apart vinkje in de database. "Klaar voor Stedin" en "Archief" volgen uit de
// stand die de knoppen al zetten — anders houd je twee dingen bij die vroeg of laat uit de pas gaan
// lopen, en dan staat er werk in twee lijstjes tegelijk of in geen enkel.
//
// ── WAAROM ONDERSTREEPT EN NIET DRIE KNOPPEN ──
// Het waren drie even brede blokken over de volle breedte, waarvan één fel oranje. Dat leest als
// "hier moet je op drukken" terwijl het alleen maar zegt wáár je staat. Nu is het één rij tabbladen
// met een streep onder het actieve — dezelfde vorm als de tabbladen in Instellingen, dus weer één
// patroon minder om te leren.

export type WerkTab = "overzicht" | "stedin" | "archief";

const TABS = [
  { key: "overzicht" as const, label: "Overzicht", Icon: LayoutGrid },
  { key: "stedin" as const, label: "Klaar voor Stedin", Icon: Send },
  { key: "archief" as const, label: "Archief", Icon: Archive },
];

export function WerkTabs({ tab, setTab, klaar, archief }: {
  tab: WerkTab;
  setTab: (t: WerkTab) => void;
  klaar: number;
  archief: number;
}) {
  const aantal: Record<WerkTab, number> = { overzicht: 0, stedin: klaar, archief };
  return (
    // Op een telefoon schuift de rij zijwaarts. Laten afbreken zou de streep over twee regels
    // trekken, en dan zie je niet meer welke erbij hoort.
    <div className="flex gap-1 overflow-x-auto border-b border-ink-200">
      {TABS.map(({ key, label, Icon }) => {
        const isNu = tab === key;
        const n = aantal[key];
        return (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            aria-current={isNu ? "page" : undefined}
            className={`-mb-px inline-flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
              isNu ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:border-ink-200 hover:text-ink-800"}`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {n > 0 && (
              <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold ${
                isNu ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-500"}`}>{n}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

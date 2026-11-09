import { TEKSTGROOTTES, useTekstgrootte, zetTekstgrootte } from "../lib/tekstgrootte";

// Drie grote knoppen: A A A, steeds groter, met de naam eronder. De "A" is zelf al in de maat
// die hij oplevert, zodat je niet hoeft te raden wat "Extra groot" betekent.
const A_MAAT = ["text-base", "text-xl", "text-3xl"];

export function TekstGrootteKeuze({ compact = false }: { compact?: boolean }) {
  const huidig = useTekstgrootte();
  return (
    <div role="group" aria-label="Tekstgrootte" className="grid grid-cols-3 gap-2">
      {TEKSTGROOTTES.map((t, i) => {
        const actief = huidig === t.key;
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => zetTekstgrootte(t.key)}
            aria-pressed={actief}
            aria-label={t.label}
            className={`flex flex-col items-center justify-center rounded-xl border-2 ${compact ? "py-1.5" : "py-2.5"} font-semibold transition-colors ${
              actief ? "border-brand-600 bg-brand-50 text-brand-700" : "border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
            }`}
          >
            <span className={`${A_MAAT[i]} leading-none`} aria-hidden="true">A</span>
            <span className="mt-1 whitespace-nowrap text-xs">{compact ? t.kort : t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

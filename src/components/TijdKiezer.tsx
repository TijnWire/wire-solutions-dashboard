import { Keuze } from "./Keuze";

// Tijden in nette kwartierstappen (06:00–22:00) — zelfde afgeronde stijl + dropdown als de
// datumkiezer en de andere keuzevelden, in plaats van de kale native tijd-spinner.
const TIJD_OPTIES = (() => {
  const out: { waarde: string; label: string }[] = [];
  for (let m = 6 * 60; m <= 22 * 60; m += 15) {
    const t = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    out.push({ waarde: t, label: t });
  }
  return out;
})();

export function TijdKiezer({ value, onChange, placeholder = "Kies tijd…", disabled = false, size = "md" }: {
  value: string;
  onChange: (waarde: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  // Een al ingevulde tijd die niet op een kwartier valt toch tonen.
  const opties = value && !TIJD_OPTIES.some((o) => o.waarde === value) ? [{ waarde: value, label: value }, ...TIJD_OPTIES] : TIJD_OPTIES;
  return <Keuze value={value} onChange={onChange} opties={opties} placeholder={placeholder} disabled={disabled} size={size} title="Tijd" />;
}

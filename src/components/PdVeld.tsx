import { netPd } from "../lib/saneerflow";

// Optioneel PD-nummer-veld met vaste "PD"-prefix (zoals bij Saneren). Je vult alleen de cijfers in;
// plak je een heel nummer ("PD123456") dan halen we de letters er zelf af. Leeg laten mag altijd —
// het PD-nummer is niet verplicht. Bij het opslaan gebruik je `pdWaarde(cijfers)` voor de nette vorm.
export function PdVeld({
  cijfers,
  onChange,
  label = "PD-nummer",
  hint = "Optioneel — koppelt dit project meteen aan de boekhouding.",
}: {
  cijfers: string;
  onChange: (cijfersAlleen: string) => void;
  label?: string;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">
        {label} <span className="font-normal text-ink-400">(niet verplicht)</span>
      </span>
      <div className="flex items-stretch overflow-hidden rounded-lg border border-ink-200 focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100">
        <span className="flex select-none items-center bg-ink-50 px-4 font-mono text-base font-bold tracking-wide text-ink-500">PD</span>
        <input
          value={cijfers}
          onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 12))}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="off"
          className="w-full px-4 py-2.5 font-mono text-base tracking-wide outline-none"
        />
      </div>
      <span className="mt-1 block text-xs text-ink-400">
        {cijfers ? <>Wordt opgeslagen als <span className="font-mono font-semibold text-ink-500">{netPd("PD" + cijfers)}</span></> : hint}
      </span>
    </label>
  );
}

// Nette opslagwaarde: leeg → undefined (niets bewaren), anders "PD" + cijfers.
export function pdWaarde(cijfers: string): string | undefined {
  const c = cijfers.replace(/\D/g, "");
  return c ? netPd("PD" + c) : undefined;
}

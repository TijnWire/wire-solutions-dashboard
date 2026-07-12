import type { ReactNode } from "react";

// Markeert een "Let op: …"-waarschuwing in een bevestigingstekst oranje + vetgedrukt,
// zodat in elke pop-up direct opvalt wat er mist of misgaat.
function metWaarschuwing(tekst: string): ReactNode {
  const m = tekst.match(/Let op:[^.!?]*[.!?]?/);
  if (!m || m.index === undefined) return tekst;
  const eind = m.index + m[0].length;
  return (
    <>
      {tekst.slice(0, m.index)}
      <span className="font-bold text-brand-600">{m[0].trim()}</span>
      {tekst.slice(eind)}
    </>
  );
}

export function Bevestig({
  open,
  titel,
  tekst,
  bevestigLabel = "Verwijderen",
  bevestigTone = "rood",
  onBevestig,
  onAnnuleer,
}: {
  open: boolean;
  titel: string;
  tekst: string;
  bevestigLabel?: string;
  bevestigTone?: "rood" | "brand";
  onBevestig: () => void;
  onAnnuleer: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onAnnuleer} />
      <div className="relative w-full max-w-none rounded-t-2xl bg-white px-6 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-2xl sm:max-w-sm sm:rounded-2xl sm:pt-6 sm:pb-6">
        {/* Greep-balkje — laat op mobiel zien dat dit een onderpaneel is */}
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-200 sm:hidden" />
        <h3 className="text-lg font-bold text-ink-900">{titel}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-600">{metWaarschuwing(tekst)}</p>
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onAnnuleer}
            className="w-full rounded-xl border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 sm:w-auto"
          >
            Annuleren
          </button>
          <button
            type="button"
            onClick={onBevestig}
            className={`w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-white sm:w-auto ${bevestigTone === "brand" ? "bg-brand-600 hover:bg-brand-700" : "bg-red-600 hover:bg-red-700"}`}
          >
            {bevestigLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Card({
  children,
  className = "",
  id,
}: {
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <div
      id={id}
      className={`rounded-2xl border border-ink-200 bg-white shadow-card transition-shadow hover:shadow-cardhover ${className}`}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-100 px-5 py-4">
      <div>
        <h3 className="text-sm font-semibold text-ink-900">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-ink-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

const toneMap: Record<string, string> = {
  green: "bg-brand-50 text-brand-700 ring-brand-200",
  amber: "bg-amber-50 text-amber-700 ring-amber-200",
  red: "bg-red-50 text-red-700 ring-red-200",
  indigo: "bg-indigo-50 text-indigo-700 ring-indigo-200",
  blue: "bg-blue-50 text-blue-700 ring-blue-200",
  emerald: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  slate: "bg-ink-100 text-ink-600 ring-ink-200",
};

export function Badge({
  children,
  tone = "slate",
}: {
  children: ReactNode;
  tone?: keyof typeof toneMap | string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${
        toneMap[tone] ?? toneMap.slate
      }`}
    >
      {children}
    </span>
  );
}

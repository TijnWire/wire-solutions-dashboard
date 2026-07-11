import { useEffect, useRef, useState } from "react";
import { Clock, ChevronDown } from "lucide-react";

// Snelle, rustige tijd-kiezer: kies eerst het UUR in een compact rooster, daarna de MINUTEN als
// vier grote knoppen (00/15/30/45). Twee tikken, geen lange scroll. Zelfde afgeronde stijl als de
// rest van de app. De API is gelijk gebleven (value/onChange/placeholder/disabled/size).
const UREN = Array.from({ length: 17 }, (_, i) => i + 6); // 06 t/m 22
const MINUTEN = ["00", "15", "30", "45"];
const pad = (n: number) => String(n).padStart(2, "0");

export function TijdKiezer({ value, onChange, placeholder = "Kies tijd…", disabled = false, size = "md" }: {
  value: string;
  onChange: (waarde: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const buitenklik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", buitenklik);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", buitenklik); document.removeEventListener("keydown", esc); };
  }, [open]);

  const [uStr, mStr] = /^\d{1,2}:\d{2}$/.test(value) ? value.split(":") : ["", ""];
  const uur = uStr === "" ? null : Number(uStr);
  const minuut = mStr;

  const kiesUur = (u: number) => onChange(`${pad(u)}:${minuut || "00"}`); // houdt gekozen minuut, anders :00
  const kiesMinuut = (m: string) => { onChange(`${pad(uur ?? 6)}:${m}`); setOpen(false); };

  const hoogte = size === "sm" ? "py-2" : "py-2.5";

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        className={`flex w-full items-center gap-2 rounded-xl border border-ink-200 bg-white px-3.5 ${hoogte} text-sm outline-none transition-colors hover:border-brand-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:opacity-70`}
      >
        <Clock className="h-4 w-4 shrink-0 text-ink-400" />
        <span className={`flex-1 text-left font-semibold ${value ? "text-ink-800" : "font-normal text-ink-400"}`}>{value || placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div role="dialog" aria-label="Kies een tijd" className="absolute left-0 top-full z-30 mt-1.5 w-72 max-w-[calc(100vw-2rem)] rounded-2xl border border-ink-200 bg-white p-3 shadow-cardhover">
          {/* Live voorbeeld van de gekozen tijd */}
          <div className="mb-2.5 flex items-center justify-between px-0.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-ink-400">Uur</span>
            <span className="rounded-lg bg-ink-100 px-2.5 py-0.5 text-sm font-bold tabular-nums text-ink-800">{uur === null ? "--" : pad(uur)}:{minuut || "--"}</span>
          </div>

          {/* Uur-rooster */}
          <div className="grid grid-cols-6 gap-1.5">
            {UREN.map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => kiesUur(u)}
                className={`rounded-lg py-2 text-sm font-semibold tabular-nums transition-colors ${uur === u ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
              >
                {pad(u)}
              </button>
            ))}
          </div>

          {/* Minuten */}
          <div className="mt-3 mb-1 px-0.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Minuten</div>
          <div className="grid grid-cols-4 gap-1.5">
            {MINUTEN.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => kiesMinuut(m)}
                className={`rounded-lg py-2.5 text-sm font-bold tabular-nums transition-colors ${minuut === m ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
              >
                :{m}
              </button>
            ))}
          </div>

          {value && (
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="mt-2.5 w-full rounded-lg py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-600">Tijd wissen</button>
          )}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check } from "lucide-react";

// Toewijs-dropdown met een afgeronde uitklaplijst — een native <select> opent een vierkant
// OS-menu dat je niet kunt afronden. Wordt gebruikt op de TAUW- en Afspraken-pagina.
export function WerknemerKiezer({ value, onChange, users, leegLabel }: {
  value: string;
  onChange: (id: string) => void;
  users: { id: string; naam: string }[];
  leegLabel: string;
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
  const huidig = users.find((u) => u.id === value);
  const opties = [{ id: "", naam: leegLabel }, ...users];
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className="flex items-center gap-2 rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-700 outline-none hover:bg-ink-50 focus:border-brand-400">
        <span className={huidig ? "" : "text-ink-400"}>{huidig?.naam ?? leegLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div aria-label="Kies werknemer" className="absolute left-0 top-full z-20 mt-1.5 max-h-72 w-60 overflow-auto rounded-xl border border-ink-200 bg-white p-1 shadow-cardhover">
          {opties.map((u) => {
            const actief = u.id === value;
            return (
              <button
                key={u.id || "leeg"}
                type="button"
                onClick={() => { onChange(u.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"} ${u.id === "" ? "text-ink-500" : ""}`}
              >
                <span className="flex-1 truncate">{u.naam}</span>
                {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

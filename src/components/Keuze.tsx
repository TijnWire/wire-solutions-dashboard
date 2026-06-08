import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check } from "lucide-react";

export type KeuzeOptie = { waarde: string; label: string };

// Afgeronde keuzelijst die de native <select> vervangt. Het menu wordt via een portal getoond
// (position: fixed) zodat het nooit wordt afgeknipt door een overflow-hidden kaart, en het is
// even breed als de knop — net als een gewone select, maar met afgeronde hoeken.
export function Keuze({ value, onChange, opties, placeholder = "Kies…", disabled = false, className = "", title, size = "md" }: {
  value: string;
  onChange: (waarde: string) => void;
  opties: KeuzeOptie[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const hoogte = 288; // px (max-h-72) — voor plaatsing boven/onder

  const openen = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      let top = r.bottom + 4;
      if (top + hoogte > window.innerHeight - 8) top = Math.max(8, r.top - hoogte - 4);
      setPos({ top, left: r.left, width: r.width });
    }
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const buiten = (e: MouseEvent) => { if (btnRef.current?.contains(e.target as Node) || popRef.current?.contains(e.target as Node)) return; setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const dicht = () => setOpen(false); // bij scrollen/resizen sluiten zodat de positie klopt
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", dicht, true);
    window.addEventListener("resize", dicht);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", dicht, true);
      window.removeEventListener("resize", dicht);
    };
  }, [open]);

  const huidig = opties.find((o) => o.waarde === value);
  const kies = (w: string) => { onChange(w); setOpen(false); };
  const maat = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const basis = `flex w-full items-center justify-between gap-1.5 rounded-lg border border-ink-200 bg-white ${maat} text-ink-800 outline-none transition-colors hover:border-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400`;

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : openen())} className={`${basis} ${className}`}>
        <span className={`truncate ${huidig ? "" : "text-ink-400"}`}>{huidig ? huidig.label : placeholder}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }} className="z-[60] max-h-72 overflow-auto rounded-xl border border-ink-200 bg-white p-1 shadow-cardhover">
          {opties.map((o) => {
            const actief = o.waarde === value;
            return (
              <button
                key={o.waarde || "__leeg"}
                type="button"
                onClick={() => kies(o.waarde)}
                className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}
              >
                <span className="flex-1 truncate">{o.label}</span>
                {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </>
  );
}

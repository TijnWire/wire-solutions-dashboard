import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, Search } from "lucide-react";

export type KeuzeOptie = { waarde: string; label: string; kleur?: string };

// Afgeronde keuzelijst die de native <select> vervangt. Het menu wordt via een portal getoond
// (position: fixed) zodat het nooit wordt afgeknipt door een overflow-hidden kaart, en het is
// even breed als de knop. Bij veel opties verschijnt bovenaan automatisch een zoekveld.
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
  const [zoek, setZoek] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const zoekRef = useRef<HTMLInputElement | null>(null);
  // Zoekveld verschijnt automatisch zodra de lijst lang wordt.
  const zoekbaar = opties.length > 7;
  const hoogte = zoekbaar ? 332 : 288; // px — voor plaatsing boven/onder

  const openen = () => {
    setZoek("");
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
    if (zoekbaar) setTimeout(() => zoekRef.current?.focus(), 0); // direct kunnen typen
    const buiten = (e: MouseEvent) => { if (btnRef.current?.contains(e.target as Node) || popRef.current?.contains(e.target as Node)) return; setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Sluiten bij scrollen van de achtergrond (anders staat het menu op de verkeerde plek),
    // maar NIET als je in de lijst zelf naar beneden scrollt.
    const bijScroll = (e: Event) => { if (popRef.current?.contains(e.target as Node)) return; setOpen(false); };
    const bijResize = () => setOpen(false);
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", bijScroll, true);
    window.addEventListener("resize", bijResize);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", bijScroll, true);
      window.removeEventListener("resize", bijResize);
    };
  }, [open, zoekbaar]);

  const huidig = opties.find((o) => o.waarde === value);
  const kies = (w: string) => { onChange(w); setOpen(false); };
  const gefilterd = zoekbaar && zoek.trim()
    ? opties.filter((o) => o.label.toLowerCase().includes(zoek.trim().toLowerCase()))
    : opties;
  const maat = size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-2 text-sm";
  const basis = `flex w-full items-center justify-between gap-1.5 rounded-lg border border-ink-200 bg-white ${maat} text-ink-800 outline-none transition-colors hover:border-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400`;

  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} title={title} aria-haspopup="listbox" aria-expanded={open} onClick={() => (open ? setOpen(false) : openen())} className={`${basis} ${className}`}>
        <span className={`flex min-w-0 flex-1 items-center gap-2 truncate ${huidig ? "" : "text-ink-400"}`}>
          {huidig?.kleur && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${huidig.kleur}`} />}
          <span className="truncate">{huidig ? huidig.label : placeholder}</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }} className="z-[60] overflow-hidden rounded-xl border border-ink-200 bg-white shadow-cardhover">
          {zoekbaar && (
            <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                ref={zoekRef}
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && gefilterd[0]) { e.preventDefault(); kies(gefilterd[0].waarde); } }}
                placeholder="Zoeken…"
                className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
              />
            </div>
          )}
          <div className="max-h-72 overflow-auto p-1">
            {gefilterd.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-ink-400">Niets gevonden</div>
            ) : (
              gefilterd.map((o) => {
                const actief = o.waarde === value;
                return (
                  <button
                    key={o.waarde || "__leeg"}
                    type="button"
                    onClick={() => kies(o.waarde)}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}
                  >
                    {o.kleur && <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${o.kleur}`} />}
                    <span className="flex-1 truncate">{o.label}</span>
                    {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

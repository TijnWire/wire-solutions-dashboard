import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";

// Toewijs-dropdown met een afgeronde uitklaplijst — een native <select> opent een vierkant
// OS-menu dat je niet kunt afronden. Wordt gebruikt op de TAUW-, Afspraken-, Brieven-,
// Saneren- en Schouwafspraken-pagina. Bij een langere lijst verschijnt bovenaan een zoekveld
// zodat je een medewerker snel kunt vinden door te typen.
export function WerknemerKiezer({ value, onChange, users, leegLabel }: {
  value: string;
  onChange: (id: string) => void;
  users: { id: string; naam: string }[];
  leegLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  const zoekRef = useRef<HTMLInputElement | null>(null);
  const zoekbaar = users.length > 4; // pas bij een echt team een zoekveld tonen
  useEffect(() => {
    if (!open) return;
    if (zoekbaar) setTimeout(() => zoekRef.current?.focus(), 0); // direct kunnen typen
    const buitenklik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", buitenklik);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", buitenklik); document.removeEventListener("keydown", esc); };
  }, [open, zoekbaar]);

  const huidig = users.find((u) => u.id === value);
  const q = zoek.trim().toLowerCase();
  const gefilterd = q ? users.filter((u) => u.naam.toLowerCase().includes(q)) : users;
  const openen = () => { setZoek(""); setOpen(true); };

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => (open ? setOpen(false) : openen())} aria-haspopup="listbox" aria-expanded={open} className="flex items-center gap-2 rounded-lg border border-ink-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-700 outline-none hover:bg-ink-50 focus:border-brand-400">
        <span className={huidig ? "" : "text-ink-400"}>{huidig?.naam ?? leegLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div aria-label="Kies werknemer" className="absolute left-0 top-full z-20 mt-1.5 w-60 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-cardhover">
          {zoekbaar && (
            <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                ref={zoekRef}
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && gefilterd[0]) { e.preventDefault(); onChange(gefilterd[0].id); setOpen(false); } }}
                placeholder="Zoeken…"
                className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
              />
            </div>
          )}
          <div className="max-h-72 overflow-auto p-1">
            {/* Leeg-optie (bijv. "Niemand" / "Niet toegewezen") staat altijd bovenaan. */}
            <button
              type="button"
              onClick={() => { onChange(""); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-500 outline-none transition-colors focus-visible:bg-ink-50 hover:bg-ink-50 ${value === "" ? "bg-brand-50 font-semibold text-brand-700" : ""}`}
            >
              <span className="flex-1 truncate">{leegLabel}</span>
              {value === "" && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
            </button>
            {q && gefilterd.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-ink-400">Geen medewerker gevonden</div>
            ) : gefilterd.map((u) => {
              const actief = u.id === value;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { onChange(u.id); setOpen(false); }}
                  className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}
                >
                  <span className="flex-1 truncate">{u.naam}</span>
                  {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

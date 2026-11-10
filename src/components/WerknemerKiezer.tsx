import { useEffect, useRef, useState } from "react";
import { ChevronDown, Check, Search } from "lucide-react";
import { toegewezenLabel } from "../lib/toewijzing";

// Toewijs-dropdown met een afgeronde uitklaplijst en vinkjes: je kunt één of meerdere medewerkers
// aanvinken. De eerste die je aanvinkt is de hoofdverantwoordelijke (zie lib/toewijzing.ts).
// Wordt gebruikt op o.a. Brieven, Bodemonderzoeken, Saneren, Afspraken, Buurtaanpak, Voorschouwen,
// Schouwafspraken en bij taken. Bij een langere lijst verschijnt bovenaan een zoekveld.
export function WerknemerKiezer({ values, onChange, users, leegLabel, size = "md" }: {
  values: string[];
  onChange: (ids: string[]) => void;
  users: { id: string; naam: string }[];
  leegLabel: string;
  size?: "sm" | "md";
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

  const gekozen = values.filter(Boolean);
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "";
  const q = zoek.trim().toLowerCase();
  const gefilterd = q ? users.filter((u) => u.naam.toLowerCase().includes(q)) : users;
  const openen = () => { setZoek(""); setOpen(true); };
  const wissel = (id: string) => onChange(gekozen.includes(id) ? gekozen.filter((x) => x !== id) : [...gekozen, id]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openen())}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={gekozen.length > 1 ? gekozen.map(naamVan).join(", ") : undefined}
        className={`flex max-w-full items-center gap-2 rounded-lg border border-ink-300 bg-white font-semibold text-ink-700 outline-none hover:bg-ink-50 focus:border-brand-400 ${size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2.5 text-sm"}`}
      >
        <span className={`truncate ${gekozen.length ? "" : "text-ink-400"}`}>{toegewezenLabel(gekozen, naamVan, leegLabel)}</span>
        {gekozen.length > 1 && <span className="shrink-0 rounded-full bg-brand-100 px-1.5 text-[11px] font-bold text-brand-700">{gekozen.length}</span>}
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div aria-label="Kies medewerkers" className="absolute left-0 top-full z-20 mt-1.5 w-64 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-cardhover">
          {zoekbaar && (
            <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                ref={zoekRef}
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && gefilterd[0]) { e.preventDefault(); wissel(gefilterd[0].id); setZoek(""); } }}
                placeholder="Zoeken…"
                className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
              />
            </div>
          )}
          <div className="max-h-72 overflow-auto p-1" role="listbox" aria-multiselectable="true">
            {/* Leeg-optie (bijv. "Niemand" / "Niet toegewezen") haalt iedereen weg. */}
            <button
              type="button"
              onClick={() => { onChange([]); setOpen(false); }}
              className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink-500 outline-none transition-colors focus-visible:bg-ink-50 hover:bg-ink-50 ${gekozen.length === 0 ? "bg-brand-50 font-semibold text-brand-700" : ""}`}
            >
              <span className="flex-1 truncate">{leegLabel}</span>
              {gekozen.length === 0 && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
            </button>
            {q && gefilterd.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-ink-400">Geen medewerker gevonden</div>
            ) : gefilterd.map((u) => {
              const actief = gekozen.includes(u.id);
              return (
                <button
                  key={u.id}
                  type="button"
                  role="option"
                  aria-selected={actief}
                  onClick={() => wissel(u.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}
                >
                  <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${actief ? "border-brand-600 bg-brand-600 text-white" : "border-ink-300 bg-white"}`}>
                    {actief && <Check className="h-3 w-3" strokeWidth={3} />}
                  </span>
                  <span className="flex-1 truncate">{u.naam}</span>
                  {actief && gekozen[0] === u.id && gekozen.length > 1 && <span className="text-[10px] font-semibold uppercase text-brand-500">hoofd</span>}
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between border-t border-ink-100 px-3 py-2 text-xs text-ink-500">
            <span>{gekozen.length ? `${gekozen.length} gekozen` : "Vink één of meer aan"}</span>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-brand-600 px-2.5 py-1 font-semibold text-white hover:bg-brand-700">Klaar</button>
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
const DAGEN = ["ma", "di", "wo", "do", "vr", "za", "zo"];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Afgeronde, ruime datumkiezer (vervangt de native date-picker). Het kalender-venster wordt via een
// portal getoond zodat het nooit wordt afgeknipt door een overflow-hidden kaart.
export function DatumKiezer({
  value,
  onChange,
  placeholder = "Kies datum",
  disabled = false,
}: {
  value: string;
  onChange: (iso: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);
  const basis = value ? new Date(value + "T00:00:00") : new Date();
  const [jaar, setJaar] = useState(basis.getFullYear());
  const [maand, setMaand] = useState(basis.getMonth());

  const breedte = 348; // px
  const hoogte = 372; // px (schatting voor plaatsing boven/onder)

  const openen = () => {
    const b = value ? new Date(value + "T00:00:00") : new Date();
    setJaar(b.getFullYear());
    setMaand(b.getMonth());
    const r = btnRef.current?.getBoundingClientRect();
    if (r) {
      const left = Math.min(Math.max(8, r.left), window.innerWidth - breedte - 8);
      let top = r.bottom + 6;
      if (top + hoogte > window.innerHeight - 8) top = Math.max(8, r.top - hoogte - 6);
      setPos({ top, left });
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

  // Houd de getoonde maand gelijk aan de gekozen datum als die extern wijzigt terwijl het venster open is.
  useEffect(() => {
    if (!open || !value) return;
    const b = new Date(value + "T00:00:00");
    if (isNaN(b.getTime())) return;
    setJaar(b.getFullYear());
    setMaand(b.getMonth());
  }, [value, open]);

  const eerste = new Date(jaar, maand, 1);
  const start = (eerste.getDay() + 6) % 7;
  const cellen: Date[] = [];
  for (let i = 0; i < 42; i++) cellen.push(new Date(jaar, maand, 1 - start + i));

  const vorige = () => { if (maand === 0) { setMaand(11); setJaar((j) => j - 1); } else setMaand((m) => m - 1); };
  const volgende = () => { if (maand === 11) { setMaand(0); setJaar((j) => j + 1); } else setMaand((m) => m + 1); };

  const vandaagISO = toISO(new Date());
  const label = value
    ? new Date(value + "T00:00:00").toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", year: "numeric" })
    : placeholder;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        onClick={() => (open ? setOpen(false) : openen())}
        className="flex w-full items-center justify-between gap-2 rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm text-ink-800 outline-none hover:border-ink-300 focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:text-ink-400"
      >
        <span className={value ? "" : "text-ink-400"}>{label}</span>
        <Calendar className="h-4 w-4 shrink-0 text-ink-400" />
      </button>

      {open && pos && createPortal(
        <div ref={popRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: breedte }} className="z-[60] rounded-2xl border border-ink-200 bg-white p-4 shadow-2xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-base font-bold text-ink-900">{MAANDEN[maand]} {jaar}</span>
            <div className="flex items-center gap-1">
              <button type="button" onClick={vorige} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" title="Vorige maand" aria-label="Vorige maand"><ChevronLeft className="h-5 w-5" /></button>
              <button type="button" onClick={volgende} className="rounded-lg p-2 text-ink-500 hover:bg-ink-100" title="Volgende maand" aria-label="Volgende maand"><ChevronRight className="h-5 w-5" /></button>
            </div>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {DAGEN.map((d) => (<div key={d} className="pb-1 text-center text-xs font-semibold uppercase text-ink-400">{d}</div>))}
            {cellen.map((d) => {
              const iso = toISO(d);
              const inMaand = d.getMonth() === maand;
              const gekozen = iso === value;
              const isVandaag = iso === vandaagISO;
              return (
                <button
                  key={iso}
                  type="button"
                  onClick={() => { onChange(iso); setOpen(false); }}
                  className={`flex h-10 w-10 items-center justify-center rounded-full text-sm transition-colors ${
                    gekozen ? "bg-brand-600 font-bold text-white" : isVandaag ? "bg-brand-50 font-semibold text-brand-700" : inMaand ? "text-ink-700 hover:bg-ink-100" : "text-ink-300 hover:bg-ink-50"
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-3 flex justify-between border-t border-ink-100 pt-3 text-sm">
            <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="font-medium text-ink-500 hover:text-ink-700">Wissen</button>
            <button type="button" onClick={() => { onChange(vandaagISO); setOpen(false); }} className="font-semibold text-brand-600 hover:underline">Vandaag</button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

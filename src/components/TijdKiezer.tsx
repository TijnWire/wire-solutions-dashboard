import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, ChevronDown } from "lucide-react";

// Snelle, rustige tijd-kiezer: kies eerst het UUR in een compact rooster, daarna de MINUTEN als
// vier grote knoppen (00/15/30/45). Twee tikken, geen lange scroll. Zelfde afgeronde stijl als de
// rest van de app. Wijkt een tijd af van een kwartier (bijv. 08:05), dan typ je 'm in het veld
// onderaan — anders zou dit component minder kunnen dan de native <input type="time">.
//
// Het venster hangt via een portal aan het scherm (position: fixed), net als bij DatumKiezer/Keuze,
// zodat het nooit wordt afgeknipt door een kaart met overflow-hidden of een tabel die scrolt.
const UREN = Array.from({ length: 24 }, (_, i) => i); // 00 t/m 23 — ook avond-/nachtdiensten
const MINUTEN = ["00", "15", "30", "45"];
const pad = (n: number) => String(n).padStart(2, "0");
const BREEDTE = 288; // px (w-72)
const HOOGTE = 380; // px, schatting voor plaatsing boven/onder

// Maakt van vrije invoer een geldige "hh:mm" (of null). "9" → 09:00, "930"/"9:30" → 09:30.
export function normaliseerTijd(tekst: string): string | null {
  const s = tekst.trim();
  if (!s) return null;
  let u: number, m: number;
  const delen = s.split(/[:.\-\s]/).filter(Boolean);
  if (delen.length >= 2) {
    u = parseInt(delen[0], 10);
    m = parseInt(delen[1], 10);
  } else {
    const c = s.replace(/\D/g, "");
    if (!c || c.length > 4) return null;
    if (c.length <= 2) { u = parseInt(c, 10); m = 0; }                       // "9" → 09:00, "17" → 17:00
    else if (c.length === 3) { u = +c[0]; m = parseInt(c.slice(1), 10); }    // "930" → 09:30
    else { u = parseInt(c.slice(0, 2), 10); m = parseInt(c.slice(2), 10); }  // "1730" → 17:30
  }
  if (!Number.isFinite(u) || !Number.isFinite(m) || u < 0 || u > 23 || m < 0 || m > 59) return null;
  return `${pad(u)}:${pad(m)}`;
}

export function TijdKiezer({ value, onChange, placeholder = "Kies tijd…", disabled = false, size = "md", title }: {
  value: string;
  onChange: (waarde: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: "sm" | "md" | "rij"; // "rij" = compact, exact even hoog als de velden in een tabelrij (34px)
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; breedte: number } | null>(null);
  const [getypt, setGetypt] = useState("");
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  // Meet waar de knop stáát en zet het venster daaronder (of erboven, als er onder geen ruimte is).
  const meten = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const breedte = Math.min(BREEDTE, window.innerWidth - 16); // past ook op een smal telefoonscherm
    const left = Math.min(Math.max(8, r.left), window.innerWidth - breedte - 8);
    let top = r.bottom + 6;
    if (top + HOOGTE > window.innerHeight - 8) top = Math.max(8, r.top - HOOGTE - 6);
    setPos({ top, left, breedte });
  };

  // Opnieuw meten zodra het venster opengaat én na elke waardewijziging: een uur kiezen laat de
  // urenstaat-rij hersorteren, waardoor de knop verspringt. Zonder hermeting bleef het venster
  // (position: fixed) bij de oude rij zweven. useLayoutEffect = vóór het schilderen, dus geen flikker.
  useLayoutEffect(() => { if (open) meten(); }, [open, value]);

  useEffect(() => {
    if (!open) return;
    setGetypt("");
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

  const [uStr, mStr] = /^\d{1,2}:\d{2}$/.test(value) ? value.split(":") : ["", ""];
  const uur = uStr === "" ? null : Number(uStr);
  const minuut = mStr;

  const kiesUur = (u: number) => onChange(`${pad(u)}:${minuut || "00"}`); // houdt gekozen minuut, anders :00
  const kiesMinuut = (m: string) => { onChange(`${pad(uur ?? UREN[0])}:${m}`); setOpen(false); };
  const bevestigTypen = () => { const t = normaliseerTijd(getypt); if (t) { onChange(t); setOpen(false); } };

  // "rij" = in een tabelcel: compact, alleen de tijd + een klokje rechts.
  // "sm"/"md" = in een formulier: ruimer, klok links en een chevron rechts (ongewijzigd gedrag).
  const inRij = size === "rij";
  const trigger = inRij
    ? `flex w-full items-center justify-between gap-1 rounded-lg border bg-white px-2.5 py-1.5 text-sm tabular-nums outline-none transition-colors hover:border-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:opacity-70 ${open ? "border-brand-400 ring-2 ring-brand-100" : "border-ink-200"}`
    : `flex w-full items-center gap-2 rounded-xl border bg-white px-3.5 ${size === "sm" ? "py-2" : "py-2.5"} text-sm outline-none transition-colors hover:border-brand-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100 disabled:cursor-not-allowed disabled:bg-ink-50 disabled:opacity-70 ${open ? "border-brand-400 ring-2 ring-brand-100" : "border-ink-200"}`;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        title={title}
        aria-haspopup="dialog"
        aria-expanded={open ? "true" : "false"}
        className={trigger}
      >
        {!inRij && <Clock className="h-4 w-4 shrink-0 text-ink-400" />}
        <span className={`flex-1 truncate text-left font-semibold ${value ? "text-ink-800" : "font-normal text-ink-400"}`}>{value || placeholder}</span>
        {inRij
          ? <Clock className="h-3.5 w-3.5 shrink-0 text-ink-400" />
          : <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />}
      </button>

      {open && pos && createPortal(
        <div ref={popRef} role="dialog" aria-label="Kies een tijd" style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.breedte }} className="z-[60] rounded-2xl border border-ink-200 bg-white p-3 shadow-cardhover">
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
          <div className="mb-1 mt-3 px-0.5 text-xs font-semibold uppercase tracking-wide text-ink-400">Minuten</div>
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

          {/* Afwijkende tijd? Gewoon typen — "8:05", "805" en "8.05" worden allemaal 08:05. */}
          <div className="mt-3 flex items-center gap-2 border-t border-ink-100 pt-2.5">
            <span className="shrink-0 text-xs font-semibold text-ink-400">Of typ</span>
            <input
              value={getypt}
              onChange={(e) => setGetypt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); bevestigTypen(); } }}
              inputMode="numeric"
              placeholder="08:05"
              aria-label="Tijd typen"
              className="w-20 rounded-lg border border-ink-200 px-2 py-1 text-sm tabular-nums text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <button
              type="button"
              onClick={bevestigTypen}
              disabled={!normaliseerTijd(getypt)}
              className="rounded-lg bg-ink-100 px-2.5 py-1 text-xs font-bold text-ink-700 transition-colors hover:bg-ink-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Zet
            </button>
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); }} className="ml-auto shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-ink-400 hover:bg-ink-50 hover:text-ink-600">Wissen</button>
            )}
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

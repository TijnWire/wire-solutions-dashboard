import { useEffect, useState } from "react";
import { FileSearch, Columns3, Route, CheckCircle2, Loader2 } from "lucide-react";

// De animatie tijdens het inlezen van een bestand.
// ─────────────────────────────────────────────────────────────────────────────
// Het uitlezen zelf duurt vaak nog geen halve seconde. Zonder iets in beeld voelt dat als "er gebeurt
// niets", en bij een groot bestand juist als "hij is vastgelopen". Deze stappen lopen mee met wat er
// echt gebeurt: lezen, kolommen herkennen, op looproute zetten. De laatste stap blijft staan tot het
// werk klaar is, dus de balk loopt nooit vooruit op de werkelijkheid.

export type ScanStap = "lezen" | "herkennen" | "sorteren" | "klaar";

const STAPPEN: { key: ScanStap; label: string; Icon: typeof FileSearch }[] = [
  { key: "lezen", label: "Bestand uitlezen", Icon: FileSearch },
  { key: "herkennen", label: "Kolommen herkennen", Icon: Columns3 },
  { key: "sorteren", label: "Adressen op looproute zetten", Icon: Route },
  { key: "klaar", label: "Klaar", Icon: CheckCircle2 },
];

export function ImportScan({ stap, aantal, bestandsnaam }: { stap: ScanStap; aantal: number; bestandsnaam: string }) {
  const huidig = STAPPEN.findIndex((s) => s.key === stap);
  // Het getal laten oplopen in plaats van er ineens staan — dan zie je dat er echt iets is ingelezen.
  const [geteld, setGeteld] = useState(0);
  useEffect(() => {
    if (stap !== "klaar" || aantal === 0) { setGeteld(0); return; }
    let n = 0;
    const stapGrootte = Math.max(1, Math.round(aantal / 24));
    const iv = setInterval(() => {
      n = Math.min(aantal, n + stapGrootte);
      setGeteld(n);
      if (n >= aantal) clearInterval(iv);
    }, 28);
    return () => clearInterval(iv);
  }, [stap, aantal]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-1 truncate text-center text-sm font-semibold text-ink-500">{bestandsnaam}</div>
        <div className="mb-5 text-center text-2xl font-bold tabular-nums text-ink-900">
          {stap === "klaar" ? `${geteld} adressen` : "Even geduld…"}
        </div>

        <div className="space-y-2.5">
          {STAPPEN.map((s, i) => {
            const gedaan = i < huidig;
            const bezig = i === huidig && stap !== "klaar";
            const laatste = s.key === "klaar" && stap === "klaar";
            return (
              <div key={s.key} className={`flex items-center gap-3 rounded-xl px-3 py-2 transition-colors ${
                bezig || laatste ? "bg-brand-50" : gedaan ? "bg-green-50" : "bg-ink-50"
              }`}>
                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  gedaan || laatste ? "bg-green-500 text-white" : bezig ? "bg-brand-500 text-white" : "bg-ink-200 text-ink-400"
                }`}>
                  {bezig ? <Loader2 className="h-4 w-4 animate-spin" />
                    : gedaan || laatste ? <CheckCircle2 className="h-4 w-4" />
                    : <s.Icon className="h-4 w-4" />}
                </span>
                <span className={`text-sm font-semibold ${
                  gedaan || bezig || laatste ? "text-ink-900" : "text-ink-400"
                }`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// Kaart van onze werkgebieden: Zuid-Holland en Utrecht, met Regio Rotterdam, Den Haag en Utrecht.
// ─────────────────────────────────────────────────────────────────────────────
// In de stijl van het logo: de provincies als oranje "draadmodel" met een paar gestapelde lagen voor
// diepte, de drie steden als knooppunten (zoals de cirkel in het logo) en verbindingsdraden waar
// lichtpulsjes overheen lopen. Hoe meer mensen er in een regio actief zijn, hoe sterker die pulseert.
import { useMemo, useState } from "react";
import { MapPin, Users } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "./ui";
import {
  KAART_HOOGTE, PAD_GRENS, PAD_UTRECHT, PAD_ZUID_HOLLAND, REGIO_VOLGORDE, STAD, proj, werkgebiedStand,
  type RegioKey,
} from "../lib/werkgebieden";

const ORANJE = "#e08a33";
const BRUIN = "#4f2a08";
const KORT: Record<RegioKey, string> = { rotterdam: "Rotterdam", denhaag: "Den Haag", utrecht: "Utrecht" };

// Waar het naamlabel naast het knooppunt staat (in kaarteenheden), zodat niets over de kust valt.
const LABEL: Record<RegioKey, { dx: number; dy: number; anker: "start" | "middle" | "end" }> = {
  denhaag: { dx: -30, dy: -52, anker: "end" },
  rotterdam: { dx: 34, dy: 58, anker: "start" },
  utrecht: { dx: 0, dy: 70, anker: "middle" },
};

const vandaagISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const rustig = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function WerkgebiedKaart() {
  const { rondes, saneringen, tauwOpdrachten, buurtaanpak, schouwafspraken, users, currentUser } = useApp();
  const [focus, setFocus] = useState<RegioKey | null>(null);
  const beweging = !rustig();

  const stand = useMemo(
    () => werkgebiedStand({ rondes, saneringen, tauwOpdrachten, buurtaanpak, schouwafspraken }, vandaagISO()),
    [rondes, saneringen, tauwOpdrachten, buurtaanpak, schouwafspraken],
  );
  const initialen = (id: string) => users.find((u) => u.id === id)?.initialen ?? "?";
  const naam = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  const punt = (k: RegioKey) => proj(STAD[k]);
  const draden: [RegioKey, RegioKey][] = [["denhaag", "rotterdam"], ["rotterdam", "utrecht"], ["denhaag", "utrecht"]];
  const totaalActief = new Set(REGIO_VOLGORDE.flatMap((k) => stand[k].medewerkers)).size;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-3 border-b border-ink-100 px-4 py-3.5 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><MapPin className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-ink-900">Onze werkgebieden</h3>
          <p className="text-xs text-ink-500">Zuid-Holland & Utrecht · waar het team nu aan het werk is</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-ink-100 px-2.5 py-1 text-xs font-semibold text-ink-600" title="Medewerkers met lopend werk">
          <Users className="h-3.5 w-3.5" /> {totaalActief} actief
        </span>
      </div>

      {/* De kaart */}
      <div className="relative bg-[radial-gradient(circle_at_1px_1px,rgba(224,138,51,0.16)_1px,transparent_0)] [background-size:18px_18px]">
        <svg viewBox={`0 0 1000 ${KAART_HOOGTE}`} className="block h-auto w-full select-none" role="img" aria-label="Kaart van Zuid-Holland en Utrecht met de werkgebieden Rotterdam, Den Haag en Utrecht">
          <defs>
            <linearGradient id="wk-vlak" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff7ee" />
              <stop offset="1" stopColor="#fde7cf" />
            </linearGradient>
            <radialGradient id="wk-gloed">
              <stop offset="0" stopColor={ORANJE} stopOpacity="0.45" />
              <stop offset="1" stopColor={ORANJE} stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Noordzee */}
          <g fill="none" stroke="#93c5fd" strokeOpacity="0.55" strokeWidth="2.5" strokeLinecap="round">
            {[0, 1].map((i) => (
              <path key={i} d={`M${44 + i * 26} ${84 + i * 22} q 18 -12 36 0 t 36 0 t 36 0`} />
            ))}
          </g>
          <text x="44" y="58" fontSize="24" fontStyle="italic" letterSpacing="5" fill="#60a5fa" fillOpacity="0.85">Noordzee</text>

          {/* Diepte: een paar lagen onder de provincies, net als het 3D-logo */}
          {[4, 3, 2, 1].map((n) => (
            <g key={n} transform={`translate(${n * 2.5} ${n * 5})`} fill="none" stroke={ORANJE} strokeOpacity={0.09 + (4 - n) * 0.05} strokeWidth="3" strokeLinejoin="round">
              <path d={PAD_ZUID_HOLLAND} />
              <path d={PAD_UTRECHT} />
            </g>
          ))}

          {/* Provincies */}
          <path d={PAD_ZUID_HOLLAND} fill="url(#wk-vlak)" stroke={ORANJE} strokeWidth="4" strokeLinejoin="round" />
          <path d={PAD_UTRECHT} fill="url(#wk-vlak)" stroke={ORANJE} strokeWidth="4" strokeLinejoin="round" />
          <path d={PAD_GRENS} fill="none" stroke={ORANJE} strokeWidth="2" strokeDasharray="2 10" strokeLinecap="round" strokeOpacity="0.9" />

          <text x="120" y="500" fontSize="22" fontWeight="700" letterSpacing="7" fill={BRUIN} fillOpacity="0.38">ZUID-HOLLAND</text>
          <text x="905" y="135" fontSize="22" fontWeight="700" letterSpacing="7" fill={BRUIN} fillOpacity="0.38" textAnchor="end">UTRECHT</text>

          {/* Verbindingsdraden tussen de regio's, met lichtpulsjes */}
          {draden.map(([a, b], i) => {
            const [x1, y1] = punt(a), [x2, y2] = punt(b);
            const d = `M${x1} ${y1} L${x2} ${y2}`;
            return (
              <g key={a + b}>
                <path d={d} stroke={ORANJE} strokeWidth="2.5" strokeOpacity="0.55" strokeDasharray="10 9" fill="none" />
                {beweging && (
                  <circle r="6" fill="#fff3e0" stroke={ORANJE} strokeWidth="2.5">
                    <animateMotion dur={`${3.2 + i * 0.7}s`} repeatCount="indefinite" path={d} keyPoints={i === 1 ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Knooppunten per regio */}
          {REGIO_VOLGORDE.map((k) => {
            const [x, y] = punt(k);
            const s = stand[k];
            const n = s.medewerkers.length;
            const gedimd = focus && focus !== k;
            const l = LABEL[k];
            const lx = x + l.dx, ly = y + l.dy;
            const jij = !!currentUser && s.medewerkers.includes(currentUser.id);
            return (
              <g key={k} opacity={gedimd ? 0.35 : 1} style={{ transition: "opacity .25s" }} onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)}>
                <circle cx={x} cy={y} r={70 + Math.min(n, 6) * 8} fill="url(#wk-gloed)" />
                {beweging && n > 0 && (
                  <circle cx={x} cy={y} r="18" fill="none" stroke={ORANJE} strokeWidth="3">
                    <animate attributeName="r" values="18;54" dur={`${Math.max(1.4, 2.6 - n * 0.2)}s`} repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.8;0" dur={`${Math.max(1.4, 2.6 - n * 0.2)}s`} repeatCount="indefinite" />
                  </circle>
                )}
                <circle cx={x} cy={y} r="19" fill="#fff" stroke={ORANJE} strokeWidth="5" />
                <circle cx={x} cy={y} r="8" fill={n > 0 ? ORANJE : "#f3c08b"} />

                {/* Naam + aantal */}
                <text x={lx} y={ly} textAnchor={l.anker} fontSize="38" fontWeight="800" fill={BRUIN} letterSpacing="1">{KORT[k]}</text>
                <text x={lx} y={ly + 34} textAnchor={l.anker} fontSize="28" fontWeight="700" fill={ORANJE}>
                  {n === 0 ? "niemand actief" : `${n} actief`}{jij ? " · jij" : ""}
                </text>

                {/* Gezichtjes (initialen) van wie er actief is */}
                {s.medewerkers.slice(0, 4).map((id, i) => {
                  const startX = l.anker === "end" ? lx - 20 - i * 34 : l.anker === "middle" ? lx - (Math.min(n, 4) - 1) * 17 + i * 34 : lx + 20 + i * 34;
                  return (
                    <g key={id}>
                      <title>{naam(id)}</title>
                      <circle cx={startX} cy={ly + 70} r="19" fill={id === currentUser?.id ? ORANJE : BRUIN} stroke="#fff" strokeWidth="3" />
                      <text x={startX} y={ly + 77} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff">{initialen(id).slice(0, 2)}</text>
                    </g>
                  );
                })}
                {n > 4 && (
                  <text x={l.anker === "end" ? lx - 20 - 4 * 34 : lx + 20 + 4 * 34} y={ly + 77} textAnchor="middle" fontSize="16" fontWeight="700" fill={BRUIN}>+{n - 4}</text>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Per regio in cijfers */}
      <div className="grid grid-cols-3 divide-x divide-ink-100 border-t border-ink-100">
        {REGIO_VOLGORDE.map((k) => {
          const s = stand[k];
          const jij = !!currentUser && s.medewerkers.includes(currentUser.id);
          return (
            <button
              key={k}
              type="button"
              onMouseEnter={() => setFocus(k)}
              onMouseLeave={() => setFocus(null)}
              onClick={() => setFocus((f) => (f === k ? null : k))}
              aria-pressed={focus === k}
              className={`px-2 py-3 text-center transition-colors sm:px-4 ${focus === k ? "bg-brand-50" : "hover:bg-ink-50"}`}
            >
              <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-ink-400 sm:text-xs"><span className="hidden sm:inline">Regio </span>{KORT[k]}</div>
              <div className="mt-0.5 text-xl font-bold text-ink-900">{s.medewerkers.length}</div>
              <div className="text-[11px] text-ink-500">actief<span className="hidden sm:inline"> · {s.lopend} lopend</span></div>
              {jij && <div className="mt-1 inline-block rounded-full bg-brand-600 px-2 py-0.5 text-[10px] font-bold text-white">Jij</div>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

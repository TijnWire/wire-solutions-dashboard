// Kaart van onze werkgebieden: Zuid-Holland en Utrecht, met Regio Rotterdam, Den Haag en Utrecht.
// ─────────────────────────────────────────────────────────────────────────────
// In de stijl van het logo: de provincies als oranje "draadmodel" met een paar gestapelde lagen voor
// diepte, de drie steden als knooppunten (zoals de cirkel in het logo) en verbindingsdraden waar
// lichtpulsjes overheen lopen. Hoe meer mensen er in een regio actief zijn, hoe sterker die pulseert.
import { useEffect, useMemo, useState } from "react";
import { MapPin } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "./ui";
import {
  KAART_HOOGTE, PAD_GRENS, PAD_UTRECHT, PAD_ZUID_HOLLAND, REGIO_VOLGORDE, STAD, proj, werkgebiedStand,
  type DossierMedewerkers, type RegioKey,
} from "../lib/werkgebieden";
import { haalDossier, haalDossiers } from "../lib/saneerflow";
import { supabaseAan } from "../lib/supabase";

const ORANJE = "#e08a33";
const KORT: Record<RegioKey, string> = { rotterdam: "Rotterdam", denhaag: "Den Haag", utrecht: "Utrecht" };

// Waar het naamkaartje ten opzichte van het knooppunt staat, zodat niets over elkaar valt.
const PLEK: Record<RegioKey, "links" | "rechts" | "onder"> = { denhaag: "links", rotterdam: "onder", utrecht: "rechts" };

const vandaagISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const rustig = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function WerkgebiedKaart() {
  const { saneringen, tauwOpdrachten, buurtaanpak, schouwafspraken, users, currentUser } = useApp();
  // Saneerdossiers staan op de server: haal de lopende op, met wie er per groep aan werkt.
  const [dossiers, setDossiers] = useState<DossierMedewerkers[]>([]);
  useEffect(() => {
    if (!supabaseAan) return;
    let actief = true;
    void (async () => {
      const lijst = (await haalDossiers()).filter((d) => d.status !== "afgerond" && d.status !== "afgeboekt");
      const details = await Promise.all(lijst.map((d) => haalDossier(d.pd_nummer).catch(() => null)));
      if (!actief) return;
      setDossiers(lijst.map((d, i) => ({
        regio: d.regio, gebouw: d.gebouw, status: d.status,
        medewerkers: [...new Set((details[i]?.clusters ?? []).map((k) => k.toegewezen_aan).filter((x): x is string => !!x))],
      })));
    })();
    return () => { actief = false; };
  }, []);
  const [focus, setFocus] = useState<RegioKey | null>(null);
  const beweging = !rustig();

  const stand = useMemo(
    () => werkgebiedStand({ saneringen, tauwOpdrachten, buurtaanpak, schouwafspraken, dossiers }, vandaagISO()),
    [saneringen, tauwOpdrachten, buurtaanpak, schouwafspraken, dossiers],
  );
  const initialen = (id: string) => users.find((u) => u.id === id)?.initialen ?? "?";
  const naam = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  const punt = (k: RegioKey) => proj(STAD[k]);
  const draden: [RegioKey, RegioKey][] = [["denhaag", "rotterdam"], ["rotterdam", "utrecht"], ["denhaag", "utrecht"]];
  const totaalActief = new Set(REGIO_VOLGORDE.flatMap((k) => stand[k].medewerkers)).size;

  // Naamkaartje per stad: waar het staat ten opzichte van het knooppunt.
  const kaartje = (k: RegioKey) => {
    const [x, y] = punt(k);
    const n = stand[k].medewerkers.length;
    const jij = !!currentUser && stand[k].medewerkers.includes(currentUser.id);
    const status = `${n} actief${jij ? " · jij" : ""}`;
    const b = Math.round(Math.max(KORT[k].length * 18.5, status.length * 11.5 + 24) + 36 + Math.max(0, Math.min(n, 4) - 1) * 14);
    const h = 84;
    const pos = PLEK[k];
    const kx = pos === "links" ? x - 42 - b : pos === "rechts" ? x + 34 : x - b / 2;
    const ky = pos === "onder" ? y + 42 : y - h / 2 - (pos === "links" ? 46 : 0);
    // Korte draad van het knooppunt naar het kaartje.
    const naar: [number, number] = pos === "links" ? [kx + b, ky + h - 14] : pos === "rechts" ? [kx, ky + h / 2] : [x, ky];
    return { x, y, n, jij, status, b, h, kx, ky, naar };
  };

  return (
    <Card className="mw-paneel overflow-hidden !border-white/10 !bg-transparent text-white">
      <div className="flex items-center gap-3 px-4 pb-3 pt-4 sm:px-5">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-orange-300/30 bg-gradient-to-br from-orange-400/25 to-orange-400/5 text-orange-200"><MapPin className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold leading-tight tracking-tight text-white">Werkgebieden</h3>
          <p className="text-xs text-orange-50/60">Waar het team nu aan het werk is</p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-orange-50/90" title="Medewerkers met lopend werk">
          <span className="relative flex h-2 w-2">
            {totaalActief > 0 && beweging && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
            <span className={`relative inline-flex h-2 w-2 rounded-full ${totaalActief > 0 ? "bg-emerald-400" : "bg-white/30"}`} />
          </span>
          {totaalActief} actief
        </span>
      </div>

      {/* De kaart */}
      <div className="relative mx-3 overflow-hidden rounded-2xl border border-white/[0.07] bg-black/25 sm:mx-4">
        <svg viewBox={`0 0 1000 ${KAART_HOOGTE}`} className="block h-auto w-full select-none" role="img" aria-label="Kaart van Zuid-Holland en Utrecht met de werkgebieden Rotterdam, Den Haag en Utrecht">
          <defs>
            <linearGradient id="wk-vlak" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#6b3a10" stopOpacity="0.95" />
              <stop offset="1" stopColor="#371b06" stopOpacity="0.95" />
            </linearGradient>
            <linearGradient id="wk-rand" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#ffc27a" />
              <stop offset="1" stopColor="#d9771c" />
            </linearGradient>
            <radialGradient id="wk-gloed">
              <stop offset="0" stopColor="#ffb04d" stopOpacity="0.5" />
              <stop offset="1" stopColor="#ffb04d" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="wk-licht" cx="0.36" cy="0.5" r="0.75">
              <stop offset="0" stopColor="#f08a24" stopOpacity="0.16" />
              <stop offset="1" stopColor="#f08a24" stopOpacity="0" />
            </radialGradient>
            <pattern id="wk-raster" width="50" height="50" patternUnits="userSpaceOnUse">
              <path d="M50 0H0V50" fill="none" stroke="#fff" strokeOpacity="0.045" strokeWidth="1" />
            </pattern>
            <filter id="wk-neon" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="7" />
            </filter>
          </defs>

          {/* Ondergrond: fijn raster met een warme gloed */}
          <rect width="1000" height={KAART_HOOGTE} fill="url(#wk-raster)" />
          <rect width="1000" height={KAART_HOOGTE} fill="url(#wk-licht)" />

          {/* Noordzee */}
          <text x="40" y="52" fontSize="17" fontWeight="600" letterSpacing="7" fill="#93c5fd" fillOpacity="0.6">NOORDZEE</text>
          <g fill="none" stroke="#93c5fd" strokeOpacity="0.35" strokeWidth="2" strokeLinecap="round">
            {[0, 1].map((i) => (
              <path key={i} d={`M${40 + i * 22} ${70 + i * 15} q 14 -9 28 0 t 28 0 t 28 0`}>
                {beweging && <animateTransform attributeName="transform" type="translate" values="0 0; 8 0; 0 0" dur={`${5 + i}s`} repeatCount="indefinite" />}
              </path>
            ))}
          </g>

          {/* Diepte: de provincies als een plaat met dikte, net als het 3D-logo */}
          {[5, 4, 3, 2, 1].map((n) => (
            <g key={n} transform={`translate(${n * 2} ${n * 4})`} fill="#1a0c02" stroke="#b9661c" strokeOpacity={0.12 + (5 - n) * 0.07} strokeWidth="2.5" strokeLinejoin="round">
              <path d={PAD_ZUID_HOLLAND} />
              <path d={PAD_UTRECHT} />
            </g>
          ))}

          {/* Neon-gloed onder de rand */}
          <g fill="none" stroke="#f08a24" strokeWidth="9" strokeOpacity="0.55" strokeLinejoin="round" filter="url(#wk-neon)">
            <path d={PAD_ZUID_HOLLAND} />
            <path d={PAD_UTRECHT} />
          </g>

          {/* Provincies */}
          <path d={PAD_ZUID_HOLLAND} fill="url(#wk-vlak)" stroke="url(#wk-rand)" strokeWidth="3.5" strokeLinejoin="round" />
          <path d={PAD_UTRECHT} fill="url(#wk-vlak)" stroke="url(#wk-rand)" strokeWidth="3.5" strokeLinejoin="round" />
          <path d={PAD_GRENS} fill="none" stroke="#ffc27a" strokeWidth="2" strokeDasharray="2 9" strokeLinecap="round" strokeOpacity="0.8" />
          <text x="118" y="338" fontSize="15" fontWeight="700" letterSpacing="6" fill="#fff4e6" fillOpacity="0.22">ZUID-HOLLAND</text>
          <text x="842" y="280" textAnchor="middle" fontSize="15" fontWeight="700" letterSpacing="6" fill="#fff4e6" fillOpacity="0.22">UTRECHT</text>

          {/* Verbindingsdraden tussen de regio's: licht gebogen, met lichtpulsjes */}
          {draden.map(([a, b], i) => {
            const [x1, y1] = punt(a), [x2, y2] = punt(b);
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
            const len = Math.hypot(x2 - x1, y2 - y1) || 1;
            const buig = i === 2 ? -0.14 : 0.16; // hoe ver de draad doorbuigt
            const cx = mx - ((y2 - y1) / len) * len * buig, cy = my + ((x2 - x1) / len) * len * buig;
            const d = `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
            return (
              <g key={a + b}>
                <path d={d} stroke="#ffb866" strokeWidth="5" strokeOpacity="0.12" fill="none" />
                <path d={d} stroke="#ffc27a" strokeWidth="1.8" strokeOpacity="0.75" strokeDasharray="3 8" strokeLinecap="round" fill="none" />
                {beweging && (
                  <circle r="5" fill="#fff3e0" style={{ filter: "drop-shadow(0 0 6px #ffb04d)" }}>
                    <animateMotion dur={`${3.4 + i * 0.8}s`} repeatCount="indefinite" path={d} keyPoints={i === 1 ? "1;0" : "0;1"} keyTimes="0;1" calcMode="linear" />
                  </circle>
                )}
              </g>
            );
          })}

          {/* Knooppunten per regio, met een naamkaartje */}
          {REGIO_VOLGORDE.map((k) => {
            const c = kaartje(k);
            const s = stand[k];
            const gedimd = focus && focus !== k;
            const gekozen = focus === k;
            return (
              <g key={k} opacity={gedimd ? 0.35 : 1} style={{ transition: "opacity .25s", cursor: "pointer" }} onMouseEnter={() => setFocus(k)} onMouseLeave={() => setFocus(null)} onClick={() => setFocus((f) => (f === k ? null : k))}>
                <circle cx={c.x} cy={c.y} r={64 + Math.min(c.n, 6) * 8} fill="url(#wk-gloed)" opacity={c.n > 0 ? 1 : 0.45} />
                {beweging && c.n > 0 && (
                  <circle cx={c.x} cy={c.y} r="16" fill="none" stroke="#ffb04d" strokeWidth="2.5">
                    <animate attributeName="r" values="16;50" dur={`${Math.max(1.4, 2.6 - c.n * 0.2)}s`} repeatCount="indefinite" />
                    <animate attributeName="stroke-opacity" values="0.8;0" dur={`${Math.max(1.4, 2.6 - c.n * 0.2)}s`} repeatCount="indefinite" />
                  </circle>
                )}
                <path d={`M${c.x} ${c.y} L${c.naar[0]} ${c.naar[1]}`} stroke="#ffc27a" strokeOpacity="0.7" strokeWidth="1.8" />
                <circle cx={c.x} cy={c.y} r="16" fill="#1f0f03" stroke="url(#wk-rand)" strokeWidth="4" />
                <circle cx={c.x} cy={c.y} r="6.5" fill={c.n > 0 ? "#ffc27a" : "#8a5a2c"} />

                {/* Naamkaartje */}
                <rect x={c.kx} y={c.ky} width={c.b} height={c.h} rx="16" fill="#190b02" fillOpacity="0.88" stroke={gekozen ? "#ffb04d" : "#ffffff"} strokeOpacity={gekozen ? 0.9 : 0.16} strokeWidth="1.5" />
                <rect x={c.kx + 14} y={c.ky} width="34" height="3" rx="1.5" fill={c.n > 0 ? "#ffb04d" : "#8a5a2c"} />
                <text x={c.kx + 20} y={c.ky + 40} fontSize="30" fontWeight="800" fill="#fff4e6" letterSpacing="0.3">{KORT[k]}</text>
                <circle cx={c.kx + 26} cy={c.ky + 61} r="5" fill={c.n > 0 ? "#34d399" : "#ffffff"} fillOpacity={c.n > 0 ? 1 : 0.28} />
                <text x={c.kx + 40} y={c.ky + 68} fontSize="20" fontWeight="600" fill={c.n > 0 ? "#fdba74" : "#fff4e6"} fillOpacity={c.n > 0 ? 1 : 0.5}>{c.status}</text>

                {/* Initialen van wie er actief is: op de onderrand van het kaartje */}
                {s.medewerkers.slice(0, 4).map((id, i) => {
                  const ax = c.kx + c.b - 22 - i * 26;
                  return (
                    <g key={id}>
                      <title>{naam(id)}</title>
                      <circle cx={ax} cy={c.ky + c.h} r="15" fill={id === currentUser?.id ? ORANJE : "#7a4514"} stroke="#190b02" strokeWidth="3" />
                      <text x={ax} y={c.ky + c.h + 5} textAnchor="middle" fontSize="13" fontWeight="700" fill="#fff">{initialen(id).slice(0, 2)}</text>
                    </g>
                  );
                })}
                {c.n > 4 && <text x={c.kx + c.b - 22 - 4 * 26 - 4} y={c.ky + c.h + 5} textAnchor="end" fontSize="13" fontWeight="700" fill="#fff4e6">+{c.n - 4}</text>}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="px-4 pb-3 pt-2.5 text-center text-[9px] font-medium uppercase tracking-wide text-orange-50/40 sm:text-[10px] sm:tracking-[0.16em]">Buurtaanpak · Bodemonderzoeken · Saneren · Schouwafspraken</p>

      {/* Per regio in cijfers */}
      <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-white/[0.04]">
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
              className={`flex flex-col items-center justify-start px-2 py-3 text-center transition-colors sm:px-4 ${focus === k ? "bg-orange-400/15" : "hover:bg-white/5"}`}
            >
              <div className="truncate text-[11px] font-semibold uppercase tracking-wide text-orange-200/70 sm:text-xs"><span className="hidden sm:inline">Regio </span>{KORT[k]}</div>
              <div className="mt-0.5 text-xl font-bold text-white">{s.medewerkers.length}</div>
              <div className="text-[11px] text-orange-50/65">actief<span className="hidden sm:inline"> · {s.lopend} lopend</span></div>
              {jij && <div className="mt-1 rounded-full bg-orange-500 px-2 py-0.5 text-[10px] font-bold text-white">Jij</div>}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

import { useMemo, useRef, useState, type PointerEvent } from "react";

// Bovenaan Mijn werk: het Wire Solutions-logo als bewegend 3D-model.
// ─────────────────────────────────────────────────────────────────────────────
// Het logo is een draad-model (alleen lijnen). We "extruderen" het door dezelfde lijntekening in 13 lagen
// achter elkaar te stapelen op verschillende diepte (translateZ). Zo krijgt het echte diepte zonder een
// 3D-bibliotheek: puur CSS 3D + SVG, dus licht en vloeiend ook op een oudere telefoon.
//   • het model zwaait rustig heen en weer, en kantelt mee met je vinger of muis;
//   • er lopen lichtpulsen langs de draden (het is tenslotte Wire Solutions) en de knoop in het midden gloeit;
//   • tik of klik op het logo en het draait één keer helemaal rond.
// Met "beweging verminderen" aan staat het model stil.

const LAGEN = 13;
const DIEPTE = 54; // px totale diepte
// De lijntekening van het logo (viewBox 320 110 575 370): twee vleugels, de V eronder en de knoop in het midden.
const LIJNEN = [
  "M337 125 L501 231 L510 461 L415 413 Z",
  "M877 125 L712 231 L703 461 L797 413 Z",
  "M415 413 L588 278",
  "M797 413 L625 278",
  "M510 461 L606 383 L703 461",
  "M606 383 L606 290",
];
const ROUTE = "M337 125 L415 413 L510 461 L606 383 L606 290 M606 383 L703 461 L797 413 L877 125";

function Laag({ i, voorste }: { i: number; voorste: boolean }) {
  const t = i / (LAGEN - 1); // 0 = achterste laag, 1 = voorste
  const dikte = voorste ? 9 : 7;
  // Achter donkerder en doorschijnender, voor helder oranje (het logo-oranje is #e08a33).
  const kleur = voorste ? "#ffb04d" : `hsl(28 ${60 + t * 30}% ${24 + t * 30}%)`;
  return (
    <svg
      viewBox="320 110 575 370"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full overflow-visible"
      style={{ transform: `translateZ(${(t - 0.5) * DIEPTE}px)`, opacity: voorste ? 1 : 0.18 + t * 0.4, filter: voorste ? "drop-shadow(0 0 7px rgba(255,160,60,.75))" : undefined }}
    >
      <g fill="none" stroke={kleur} strokeWidth={dikte} strokeLinejoin="round" strokeLinecap="round">
        {LIJNEN.map((d) => <path key={d} d={d} />)}
        <circle cx="606" cy="264" r="23" />
      </g>
      {voorste && (
        <g>
          {/* Lichtpulsen die langs de draden lopen */}
          {[0, 3].map((begin) => (
            <circle key={begin} r="9" fill="#fff6e5" style={{ filter: "drop-shadow(0 0 6px #ffd08a)" }}>
              <animateMotion dur="6s" begin={`${begin}s`} repeatCount="indefinite" path={ROUTE} />
            </circle>
          ))}
          {/* Gloeiende knoop in het midden */}
          <circle cx="606" cy="264" r="12" fill="#ffd9a0" opacity="0.95">
            <animate attributeName="r" values="9;15;9" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.95;0.45;0.95" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  );
}

export function LogoHero({ voornaam, samenvatting }: { voornaam: string; samenvatting: string }) {
  const [kanteling, setKanteling] = useState({ x: 0, y: 0 });
  const [draai, setDraai] = useState(0);
  const vak = useRef<HTMLDivElement | null>(null);

  const lagen = useMemo(() => Array.from({ length: LAGEN }, (_, i) => <Laag key={i} i={i} voorste={i === LAGEN - 1} />), []);

  const beweeg = (e: PointerEvent<HTMLDivElement>) => {
    const r = vak.current?.getBoundingClientRect();
    if (!r) return;
    const px = (e.clientX - r.left) / r.width - 0.5; // -0.5 … 0.5
    const py = (e.clientY - r.top) / r.height - 0.5;
    setKanteling({ x: -py * 22, y: px * 34 });
  };
  const dagdeel = (() => { const u = new Date().getHours(); return u < 6 ? "Goedenacht" : u < 12 ? "Goedemorgen" : u < 18 ? "Goedemiddag" : "Goedenavond"; })();
  const datum = new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });

  return (
    <section
      className="relative overflow-hidden rounded-3xl border border-black/10 bg-gradient-to-br from-[#2b1709] via-[#3b200d] to-[#1b0e05] text-white shadow-lg"
      aria-label="Welkom bij Wire Solutions"
    >
      {/* Blauwdruk-raster en gloed */}
      <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: "linear-gradient(rgba(255,170,80,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,170,80,.6) 1px, transparent 1px)", backgroundSize: "34px 34px" }} />
      <div className="lh-glans pointer-events-none absolute -right-10 top-1/2 h-72 w-72 -translate-y-1/2 rounded-full bg-orange-500/30 blur-3xl sm:right-10" />
      {/* Zwevende vonkjes */}
      {[8, 22, 37, 55, 71, 86].map((l, i) => (
        <span key={l} className="lh-deeltje pointer-events-none absolute bottom-3 h-1.5 w-1.5 rounded-full bg-orange-300" style={{ left: `${l}%`, animationDelay: `${i * 0.9}s` }} />
      ))}

      <div className="relative grid grid-cols-1 items-center gap-2 px-6 pb-6 pt-7 sm:grid-cols-[1.1fr_1fr] sm:px-10 sm:py-8">
        <div className="order-2 text-center sm:order-1 sm:text-left">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-300/80">{datum}</p>
          <h2 className="mt-1 text-2xl font-extrabold tracking-tight sm:text-3xl">{dagdeel}, {voornaam} <span aria-hidden="true">👋</span></h2>
          <p className="mx-auto mt-2 max-w-md text-sm text-orange-50/75 sm:mx-0">{samenvatting}</p>
        </div>

        <div className="order-1 flex flex-col items-center sm:order-2">
          <div
            ref={vak}
            onPointerMove={beweeg}
            onPointerLeave={() => setKanteling({ x: 0, y: 0 })}
            onClick={() => setDraai((d) => d + 1)}
            role="img"
            aria-label="Wire Solutions logo — tik om het te laten draaien"
            className="relative h-44 w-full max-w-[17rem] cursor-pointer select-none sm:h-52"
            style={{ perspective: "900px", touchAction: "pan-y" }}
          >
            {/* Buitenste laag: volgt je vinger/muis */}
            <div className="absolute inset-0 transition-transform duration-200 ease-out" style={{ transformStyle: "preserve-3d", transform: `rotateX(${kanteling.x}deg) rotateY(${kanteling.y}deg)` }}>
              {/* Draai bij een tik */}
              <div key={draai} className="absolute inset-0" style={{ transformStyle: "preserve-3d", animation: draai > 0 ? "lh-flip 1.1s cubic-bezier(.45,.05,.2,1)" : undefined }}>
                <div className="lh-zweef absolute inset-0">
                  <div className="lh-sway absolute inset-0">{lagen}</div>
                </div>
              </div>
            </div>
          </div>
          {/* Woordmerk */}
          <div className="-mt-1 text-center leading-none">
            <div className="text-lg font-extrabold uppercase tracking-[0.28em] text-orange-50 sm:text-xl">Wire Solutions</div>
            <div className="mt-1.5 text-[11px] font-medium tracking-[0.3em] text-orange-300">Detachering &amp; Payrolling</div>
          </div>
        </div>
      </div>
    </section>
  );
}

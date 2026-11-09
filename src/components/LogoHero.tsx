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
  const kleur = voorste ? "#f08a24" : `hsl(28 ${55 + t * 35}% ${62 - t * 14}%)`;
  return (
    <svg
      viewBox="320 110 575 370"
      aria-hidden="true"
      className="absolute inset-0 h-full w-full overflow-visible"
      style={{ transform: `translateZ(${(t - 0.5) * DIEPTE}px)`, opacity: voorste ? 1 : 0.22 + t * 0.4, filter: voorste ? "drop-shadow(0 2px 6px rgba(224,138,51,.55))" : undefined }}
    >
      <g fill="none" stroke={kleur} strokeWidth={dikte} strokeLinejoin="round" strokeLinecap="round">
        {LIJNEN.map((d) => <path key={d} d={d} />)}
        <circle cx="606" cy="264" r="23" />
      </g>
      {voorste && (
        <g>
          {/* Lichtpulsen die langs de draden lopen */}
          {[0, 3].map((begin) => (
            <circle key={begin} r="9" fill="#fff3e0" stroke="#e08a33" strokeWidth="3" style={{ filter: "drop-shadow(0 0 6px #e08a33)" }}>
              <animateMotion dur="6s" begin={`${begin}s`} repeatCount="indefinite" path={ROUTE} />
            </circle>
          ))}
          {/* Gloeiende knoop in het midden */}
          <circle cx="606" cy="264" r="12" fill="#ffb04d" opacity="0.95">
            <animate attributeName="r" values="9;15;9" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.95;0.45;0.95" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </g>
      )}
    </svg>
  );
}

export function LogoHero() {
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

  return (
    <section className="flex flex-col items-center pb-2 pt-4" aria-label="Wire Solutions">
      <div
        ref={vak}
        onPointerMove={beweeg}
        onPointerLeave={() => setKanteling({ x: 0, y: 0 })}
        onClick={() => setDraai((d) => d + 1)}
        role="img"
        aria-label="Wire Solutions logo — tik om het te laten draaien"
        className="relative w-full max-w-[19rem] cursor-pointer select-none sm:max-w-[22rem]"
        style={{ perspective: "900px", touchAction: "pan-y" }}
      >
        {/* Houdt de verhouding van het logo vast (575 × 370). Bewust met padding i.p.v. CSS aspect-ratio:
            op oudere iPhones kende Safari dat niet, waardoor het vak 0 hoog werd en het logo verdween. */}
        <div aria-hidden="true" style={{ paddingBottom: "64.35%" }} />
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
      {/* Woordmerk: exact het lettertype uit het logo (als vector uit het originele logo overgenomen) */}
      <img src="/wire-woordmerk.svg" alt="Wire Solutions — Detachering &amp; Payrolling" className="relative z-10 mt-3 w-full max-w-[19rem] select-none sm:max-w-[22rem]" draggable={false} />
    </section>
  );
}

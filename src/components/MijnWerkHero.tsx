// De kop van Mijn werk: een donker "schakelpaneel" in de kleuren van het logo. Links de begroeting,
// rechts het bewegende 3D-logo, en onderin de drie tellers als knooppunten aan één draad
// (Te doen → Mee bezig → Klaar) — het is tenslotte WIRE Solutions.
import type { LucideIcon } from "lucide-react";
import { LogoHero } from "./LogoHero";

export type HeroStat = { label: string; value: number; icon: LucideIcon; kleur: "rood" | "oranje" | "groen" };

const KNOOP: Record<HeroStat["kleur"], string> = {
  rood: "border-red-300/50 bg-red-400/15 text-red-200",
  oranje: "border-orange-300/60 bg-orange-400/20 text-orange-200",
  groen: "border-emerald-300/50 bg-emerald-400/15 text-emerald-200",
};

function groet(uur: number): string {
  if (uur < 6) return "Goedenacht";
  if (uur < 12) return "Goedemorgen";
  if (uur < 18) return "Goedemiddag";
  return "Goedenavond";
}
function weekNr(d: Date): number {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const j = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  j.setUTCDate(j.getUTCDate() - ((j.getUTCDay() + 6) % 7) + 3);
  return 1 + Math.round((t.getTime() - j.getTime()) / 604800000);
}

export function MijnWerkHero({ voornaam, stats }: { voornaam: string; stats: HeroStat[] }) {
  const nu = new Date();
  const datum = nu.toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long" });
  const totaal = stats.reduce((n, s) => n + s.value, 0);
  const klaar = stats.find((s) => s.kleur === "groen")?.value ?? 0;
  const pct = totaal ? Math.round((klaar / totaal) * 100) : 0;

  return (
    <section className="mw-hero relative isolate overflow-hidden rounded-3xl text-white shadow-[0_24px_60px_-28px_rgba(79,42,8,0.75)]">
      {/* Achtergrond: warme gloed achter het logo en een fijn dradenpatroon */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,#3b1e07_0%,#28130400_55%),linear-gradient(180deg,#2a1505,#190b02)]" />
        <div className="mw-gloed absolute -top-24 left-1/2 h-[26rem] w-[26rem] -translate-x-1/2 rounded-full bg-[radial-gradient(closest-side,rgba(240,138,36,0.42),transparent)] lg:left-auto lg:right-[-4rem] lg:top-[-6rem] lg:h-[34rem] lg:w-[34rem] lg:translate-x-0" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.16]" preserveAspectRatio="xMidYMid slice" viewBox="0 0 800 500" fill="none" stroke="#f0a35a" strokeWidth="1.2">
          <path d="M-20 90 H150 L190 130 H330 L360 100 H520" />
          <path d="M-20 300 H90 L130 260 H260 L300 300 H420 L450 330 H820" />
          <path d="M-20 430 H210 L250 390 H470 L510 430 H820" />
          <path d="M620 -20 V70 L660 110 V220 L700 260 H820" />
          <path d="M560 520 V450 L600 410 H720 L760 370 V300" />
          {[[150, 90], [330, 130], [520, 100], [130, 260], [420, 300], [250, 390], [660, 110], [600, 410], [760, 300]].map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="4" fill="#f0a35a" stroke="none" />
          ))}
        </svg>
      </div>

      <div className="grid items-center gap-6 px-5 pt-9 sm:px-8 sm:pt-8 lg:grid-cols-[1.15fr_1fr] lg:gap-8 lg:px-10 lg:pt-10">
        {/* Logo: op de telefoon bovenaan, op een breed scherm rechts */}
        <div className="mx-auto w-full max-w-[15rem] sm:max-w-[18rem] lg:order-2 lg:max-w-[22rem]">
          <LogoHero donker compact />
        </div>

        <div className="mw-op lg:order-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-orange-200/80">
            {datum} <span className="mx-1.5 text-orange-200/40">/</span> week {weekNr(nu)}
          </p>
          <h2 className="mt-2 text-[1.9rem] font-bold leading-[1.1] tracking-tight sm:text-4xl lg:text-[2.75rem]">
            {groet(nu.getHours())},<br className="hidden lg:block" /> <span className="text-orange-300">{voornaam}</span>
          </h2>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-orange-50/75">
            Dit staat er voor jou klaar vandaag. Werk je taken bij zodra je verder bent.
          </p>
        </div>
      </div>

      {/* De drie tellers als knooppunten aan één draad */}
      <div className="mw-op mw-op-2 mt-6 border-t border-white/10 bg-white/[0.04] px-5 py-5 backdrop-blur-[2px] sm:px-8 lg:mt-8 lg:px-10">
        <div className="grid grid-cols-[1fr_1fr_auto]">
          {stats.map((s, i) => {
            const Icon = s.icon;
            return (
              <div key={s.label} className={`min-w-0 ${i === stats.length - 1 ? "pr-1 sm:pr-6" : ""}`}>
                <div className="flex items-center">
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border ${KNOOP[s.kleur]}`}>
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  {i < stats.length - 1 && <span aria-hidden="true" className="mw-draad mx-2 h-px flex-1 sm:mx-3" />}
                </div>
                <div className="mt-2.5 text-3xl font-bold tabular-nums leading-none sm:text-4xl">{s.value}</div>
                <div className="mt-1 text-xs font-medium text-orange-50/70 sm:text-sm">{s.label}</div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Aandeel klaar">
            <div className="h-full rounded-full bg-gradient-to-r from-orange-400 to-emerald-400 transition-[width] duration-700" style={{ width: `${pct}%` }} />
          </div>
          <span className="shrink-0 text-xs font-semibold text-orange-50/70">{totaal ? `${pct}% klaar` : "Niets open"}</span>
        </div>
      </div>
    </section>
  );
}

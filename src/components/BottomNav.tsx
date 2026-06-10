import { memo, useMemo, type ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { NAV, magZien } from "../lib/nav";
import type { User } from "../lib/types";

// Volgorde van voorkeur voor de mobiele onderbalk; de eerste 4 zichtbare items komen erin.
const PRIMAIR = ["overzicht", "mijnwerk", "team", "projecten", "afspraken", "brieven", "tauw", "saneren", "klanten", "facturen", "agenda"];
// Korte labels die passen in een smalle tab.
const KORT: Record<string, string> = {
  overzicht: "Start", mijnwerk: "Werk", team: "Team", projecten: "Projecten", afspraken: "Afspraken",
  brieven: "Brieven", tauw: "TAUW", saneren: "Saneren", klanten: "Klanten",
  facturen: "Facturen", agenda: "Agenda",
};

// App-achtige onderbalk op mobiel: de belangrijkste bestemmingen + "Meer" (opent het volledige menu).
export const BottomNav = memo(function BottomNav({ active, onSelect, onMeer, currentUser }: { active: string; onSelect: (key: string) => void; onMeer: () => void; currentUser: User | null }) {
  const zichtbaar = useMemo(() => (currentUser ? NAV.filter((n) => magZien(currentUser, n)) : []), [currentUser]);
  const primair = useMemo(() => PRIMAIR.map((k) => zichtbaar.find((n) => n.key === k)).filter(Boolean).slice(0, 4) as typeof NAV, [zichtbaar]);
  if (!currentUser) return null;

  const inPrimair = primair.some((p) => p.key === active);

  const Tab = ({ label, isActive, onClick, children }: { label: string; isActive: boolean; onClick: () => void; children: ReactNode }) => (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-1 flex-col items-center gap-0.5 py-1.5 text-[10px] font-semibold transition-colors ${isActive ? "text-brand-600" : "text-ink-400 hover:text-ink-600"}`}
    >
      <span className={`flex h-7 w-12 items-center justify-center rounded-full transition-colors ${isActive ? "bg-brand-50" : ""}`}>{children}</span>
      <span className="max-w-full truncate px-1">{label}</span>
    </button>
  );

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-ink-200 bg-white/95 pb-[calc(env(safe-area-inset-bottom)*0.34)] backdrop-blur md:hidden">
      {primair.map((item) => {
        const Icon = item.icon;
        return (
          <Tab key={item.key} label={KORT[item.key] ?? item.label} isActive={active === item.key} onClick={() => onSelect(item.key)}>
            <Icon className="h-[18px] w-[18px]" />
          </Tab>
        );
      })}
      <Tab label="Meer" isActive={!inPrimair} onClick={onMeer}>
        <MoreHorizontal className="h-[18px] w-[18px]" />
      </Tab>
    </nav>
  );
});

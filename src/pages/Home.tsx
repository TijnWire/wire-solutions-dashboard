import { useState } from "react";
import { Briefcase, FolderKanban, Wrench, Wallet, HelpCircle, Settings, ArrowLeft, type LucideIcon } from "lucide-react";
import { NAV, GROUPS, magZien, type NavGroup } from "../lib/nav";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";

// Icoon per kopje (het "vak" waar je eerst op klikt).
const GROEP_ICON: Record<NavGroup, LucideIcon> = {
  Werk: Briefcase,
  Projecten: FolderKanban,
  Operatie: Wrench,
  Boekhouding: Wallet,
  Vragen: HelpCircle,
  Systeem: Settings,
};

// Startscherm ná het inloggen. Eerst grote vakken per kopje (Werk, Projecten, …); klik op een vak
// en je ziet de pagina's daarbinnen als tegels. Klik op een pagina → je gaat erheen. Icoontjes oranje.
export function Home() {
  const app = useApp();
  const { currentUser } = app;
  const { navigeer } = useNav();
  const [groep, setGroep] = useState<NavGroup | null>(null);
  if (!currentUser) return null;

  const items = NAV.filter((n) => magZien(currentUser, n));
  const groups = GROUPS.filter((g) => items.some((i) => i.group === g));

  // Lichte tellingen per pagina — een rood badge-getal alleen als er iets openstaat.
  const tel: Record<string, number> = {
    mijnwerk: app.taken.filter((t) => (t.toegewezenAan === currentUser.id || t.toegewezenAan === "") && t.status !== "Klaar").length,
    verlof: app.verlof.filter((v) => v.status === "Aangevraagd").length,
    facturen: app.facturen.filter((f) => f.status === "Verstuurd").length,
    afspraken: app.afspraken.filter((a) => a.status === "Open").length,
    schouwafspraken: app.schouwafspraken.filter((s) => s.status === "In te plannen").length,
    mededelingen: app.mededelingen.filter((m) => !m.gezienDoor.includes(currentUser.id) && m.auteurId !== currentUser.id && (!m.gerichtAan || m.gerichtAan === currentUser.id)).length,
  };

  const paginasVan = (g: NavGroup) => items.filter((n) => n.group === g);
  const groepTelling = (g: NavGroup) => paginasVan(g).reduce((s, n) => s + (tel[n.key] ?? 0), 0);

  const tegel = (key: string, label: string, Icon: LucideIcon, badge: number, onClick: () => void, sub?: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-cardhover"
    >
      {badge > 0 && <span className="absolute right-2.5 top-2.5 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{badge}</span>}
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100"><Icon className="h-9 w-9" /></span>
      <span className="text-sm font-semibold text-ink-800">{label}</span>
      {sub && <span className="text-xs text-ink-400">{sub}</span>}
    </button>
  );

  // ── Niveau 2: pagina's binnen het gekozen kopje ──
  if (groep) {
    const paginas = paginasVan(groep);
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setGroep(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar overzicht</button>
        <h2 className="text-2xl font-bold text-ink-900">{groep}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {paginas.map((n) => tegel(n.key, n.label, n.icon, tel[n.key] ?? 0, () => navigeer(n.key)))}
        </div>
      </div>
    );
  }

  // ── Niveau 1: de kopjes als grote vakken ──
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ink-900">Hoi {currentUser.naam.split(" ")[0]} 👋</h2>
        <p className="text-sm text-ink-500">Kies waar je heen wilt.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
        {groups.map((g) => {
          const aantal = paginasVan(g).length;
          return tegel(g, g, GROEP_ICON[g] ?? FolderKanban, groepTelling(g), () => setGroep(g), `${aantal} ${aantal === 1 ? "onderdeel" : "onderdelen"}`);
        })}
      </div>
    </div>
  );
}

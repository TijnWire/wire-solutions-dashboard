import { NAV, GROUPS, magZien } from "../lib/nav";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";

// Startscherm ná het inloggen: grote tegels (vakjes) met oranje icoontjes, gegroepeerd per kopje.
// Klik op een tegel → je gaat naar die pagina.
export function Home() {
  const app = useApp();
  const { currentUser } = app;
  const { navigeer } = useNav();
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

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-ink-900">Hoi {currentUser.naam.split(" ")[0]} 👋</h2>
        <p className="text-sm text-ink-500">Kies waar je heen wilt.</p>
      </div>

      {groups.map((group) => (
        <div key={group}>
          <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-ink-400">{group}</h3>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
            {items.filter((n) => n.group === group).map((item) => {
              const Icon = item.icon;
              const n = tel[item.key] ?? 0;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => navigeer(item.key)}
                  className="group relative flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-center shadow-card transition-all hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-cardhover"
                >
                  {n > 0 && (
                    <span className="absolute right-2.5 top-2.5 inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{n}</span>
                  )}
                  <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 transition-colors group-hover:bg-brand-100">
                    <Icon className="h-9 w-9" />
                  </span>
                  <span className="text-sm font-semibold text-ink-800">{item.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

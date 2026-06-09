import { Users2 } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import { MededelingenBord } from "../components/MededelingenBord";
import { ROL_LABEL } from "../lib/types";

export function Team() {
  const { users, projects, taken } = useApp();

  return (
    <div className="space-y-6">
      {/* Mededelingen / prikbord — beheerder plaatst, team leest */}
      <MededelingenBord compose />

      {/* Teamoverzicht */}
      <Card>
        <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <Users2 className="h-5 w-5 text-ink-500" />
            <h3 className="text-sm font-semibold text-ink-900">Team</h3>
          </div>
          <span className="text-xs text-ink-400">{users.length} medewerkers</span>
        </div>
        <div className="grid grid-cols-1 divide-y divide-ink-100 sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-3">
          {users.map((u) => {
            const ut = taken.filter((t) => t.toegewezenAan === u.id || t.toegewezenAan === ""); // "" = hele team telt voor iedereen
            const open = ut.filter((t) => t.status !== "Klaar").length;
            const projectenVan = projects.filter((p) => p.toegewezenAan.includes(u.id) || ut.some((t) => t.projectId === p.id)).length;
            return (
              <div key={u.id} className="flex items-center gap-3 px-5 py-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">
                  {u.initialen}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{u.naam}</div>
                  <div className="truncate text-xs text-ink-500">
                    {ROL_LABEL[u.rol]} · {u.functie}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-4 text-right">
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{projectenVan}</div>
                    <div className="text-[11px] text-ink-400">project{projectenVan === 1 ? "" : "en"}</div>
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink-900">{open}</div>
                    <div className="text-[11px] text-ink-400">open</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

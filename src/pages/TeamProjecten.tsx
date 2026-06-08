import { useEffect, useRef, useState } from "react";
import { Plus, FolderKanban, Users2, X, FileScan, CalendarRange } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card } from "../components/ui";
import { TaakKaart } from "../components/TaakKaart";
import { ProjectBord } from "../components/ProjectBord";
import { BestandScanModal } from "../components/BestandScanModal";
import { MededelingenBord } from "../components/MededelingenBord";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { ROL_LABEL } from "../lib/types";

const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };

export function TeamProjecten({ initieelProject }: { initieelProject?: string }) {
  const { users, projects, taken, addTaak, addProject } = useApp();
  const { navigeer } = useNav();
  const doelRef = useRef<HTMLDivElement | null>(null);
  const [scan, setScan] = useState<{ id: string; naam: string } | null>(null);

  // Scroll naar het project waar een melding naartoe linkt.
  useEffect(() => {
    if (initieelProject) doelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [initieelProject]);

  const [taakBijProject, setTaakBijProject] = useState<string | null>(null);
  const [taakTitel, setTaakTitel] = useState("");
  const [taakNotitie, setTaakNotitie] = useState("");
  const [taakDeadline, setTaakDeadline] = useState("");
  const [taakPersoon, setTaakPersoon] = useState(""); // "" = hele team

  const [nieuwProject, setNieuwProject] = useState(false);
  const [projNaam, setProjNaam] = useState("");
  const [projWijk, setProjWijk] = useState("");

  const voegTaakToe = (projectId: string) => {
    if (!taakTitel.trim()) return;
    addTaak({
      projectId,
      titel: taakTitel.trim(),
      toegewezenAan: taakPersoon, // "" = hele team
      deadline: taakDeadline ? datumKort(taakDeadline) : "Nog te plannen",
      status: "Te doen",
      notitie: taakNotitie.trim(),
    });
    setTaakTitel(""); setTaakNotitie(""); setTaakDeadline(""); setTaakBijProject(null);
  };

  const voegProjectToe = () => {
    if (!projNaam.trim()) return;
    addProject({ naam: projNaam.trim(), wijk: projWijk.trim() || "—", toegewezenAan: [] });
    setProjNaam("");
    setProjWijk("");
    setNieuwProject(false);
  };

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

      {/* Projecten header + nieuw project */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink-700">Alle projecten</h3>
        {!nieuwProject && (
          <button
            onClick={() => setNieuwProject(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Nieuw project
          </button>
        )}
      </div>

      {nieuwProject && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-ink-900">Nieuw project</h4>
            <button onClick={() => setNieuwProject(false)} className="text-ink-400 hover:text-ink-600">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              autoFocus
              value={projNaam}
              onChange={(e) => setProjNaam(e.target.value)}
              placeholder="Projectnaam (bijv. Stedin-batch Delft)"
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <input
              value={projWijk}
              onChange={(e) => setProjWijk(e.target.value)}
              placeholder="Wijk / locatie"
              className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            onClick={voegProjectToe}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Project aanmaken
          </button>
        </Card>
      )}

      {/* Projectkaarten */}
      {projects.map((project) => {
        const projectTaken = taken.filter((t) => t.projectId === project.id);
        return (
          <div key={project.id} ref={project.id === initieelProject ? doelRef : undefined}>
          <Card className="overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-100 px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-brand-50 p-2 text-brand-600">
                  <FolderKanban className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink-900">{project.naam}</h3>
                  <p className="text-xs text-ink-500">{project.wijk}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigeer("planning", { project: project.id })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  title="Stedin-weekplanning openen en invullen"
                >
                  <CalendarRange className="h-4 w-4" /> Planning
                </button>
                <button
                  type="button"
                  onClick={() => setScan({ id: project.id, naam: project.naam })}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700"
                  title="Bestand (PDF/Excel) scannen en adressen importeren"
                >
                  <FileScan className="h-4 w-4" /> Scan
                </button>
                <span className="hidden text-xs text-ink-400 sm:inline">
                  {projectTaken.filter((t) => t.status === "Klaar").length}/{projectTaken.length} klaar
                </span>
              </div>
            </div>

            <div className="space-y-2.5 p-4">
              {projectTaken.length === 0 && (
                <p className="px-1 text-sm text-ink-400">Nog geen taken in dit project.</p>
              )}
              {projectTaken.map((t) => (
                <TaakKaart key={t.id} taak={t} toonToewijzing />
              ))}

              {taakBijProject === project.id ? (
                <div className="space-y-2 rounded-xl border border-ink-200 bg-ink-50/50 p-3">
                  <input
                    autoFocus
                    value={taakTitel}
                    onChange={(e) => setTaakTitel(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && voegTaakToe(project.id)}
                    placeholder="Wat moet er gebeuren?"
                    className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <textarea
                    value={taakNotitie}
                    onChange={(e) => setTaakNotitie(e.target.value)}
                    rows={2}
                    placeholder="Notitie / extra uitleg — waar moet de werknemer op letten? (optioneel)"
                    className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                  />
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="block">
                      <span className="mb-1 block text-[11px] font-semibold text-ink-500">Voor wie?</span>
                      <Keuze value={taakPersoon} onChange={setTaakPersoon} opties={[{ waarde: "", label: "Hele team" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} />
                    </label>
                    <label className="block w-48">
                      <span className="mb-1 block text-[11px] font-semibold text-ink-500">Deadline (optioneel)</span>
                      <DatumKiezer value={taakDeadline} onChange={setTaakDeadline} placeholder="Geen deadline" />
                    </label>
                    <button type="button" onClick={() => voegTaakToe(project.id)} disabled={!taakTitel.trim()} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
                      Taak toevoegen
                    </button>
                    <button type="button" onClick={() => setTaakBijProject(null)} className="rounded-lg px-2 py-2 text-sm text-ink-500 hover:bg-ink-50">Annuleer</button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTaakBijProject(project.id);
                    setTaakTitel(""); setTaakNotitie(""); setTaakDeadline(""); setTaakPersoon("");
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-ink-500 hover:bg-ink-50 hover:text-ink-700"
                >
                  <Plus className="h-4 w-4" />
                  Taak toevoegen
                </button>
              )}
            </div>

            <ProjectBord projectId={project.id} defaultOpen={project.id === initieelProject} />
          </Card>
          </div>
        );
      })}

      <BestandScanModal open={!!scan} projectId={scan?.id ?? ""} projectNaam={scan?.naam ?? ""} onSluit={() => setScan(null)} />
    </div>
  );
}

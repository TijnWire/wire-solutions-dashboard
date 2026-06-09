import { useEffect, useRef, useState } from "react";
import { Plus, FolderKanban, X, FileScan, CalendarRange, Send } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Badge } from "../components/ui";
import { TaakKaart } from "../components/TaakKaart";
import { ProjectBord } from "../components/ProjectBord";
import { BestandScanModal } from "../components/BestandScanModal";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";

const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };

export function Projecten({ initieelProject }: { initieelProject?: string }) {
  const { users, projects, taken, addTaak, addProject, updateProject } = useApp();
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
  const [projPd, setProjPd] = useState("");

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
    addProject({ naam: projNaam.trim(), wijk: projWijk.trim() || "—", toegewezenAan: [], pdNummer: projPd.trim() || undefined });
    setProjNaam("");
    setProjWijk("");
    setProjPd("");
    setNieuwProject(false);
  };

  return (
    <div className="space-y-6">
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
          <div className="space-y-3">
            <input
              autoFocus
              value={projNaam}
              onChange={(e) => setProjNaam(e.target.value)}
              placeholder="Projectnaam (bijv. Stedin-batch Delft)"
              className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <input
                value={projWijk}
                onChange={(e) => setProjWijk(e.target.value)}
                placeholder="Wijk / locatie"
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <input
                value={projPd}
                onChange={(e) => setProjPd(e.target.value)}
                placeholder="PD-nummer (bijv. PD153335)"
                className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
            </div>
          </div>
          <button
            onClick={voegProjectToe}
            className="mt-3 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
          >
            Project aanmaken
          </button>
        </Card>
      )}

      {projects.length === 0 && !nieuwProject && (
        <Card className="p-10 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Nog geen projecten. Klik op <span className="font-medium">Nieuw project</span> om te beginnen.</p>
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

            {/* PD-nummer + doorschakelen naar de boekhouding */}
            <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 bg-ink-50/40 px-5 py-2.5">
              <span className="text-xs font-semibold text-ink-500">PD-nummer</span>
              <input
                value={project.pdNummer ?? ""}
                onChange={(e) => updateProject(project.id, { pdNummer: e.target.value })}
                placeholder="bijv. PD153335"
                className="w-40 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-medium text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <div className="ml-auto flex items-center gap-2">
                {project.boekhouding === "gefactureerd" ? (
                  <Badge tone="green">Gefactureerd</Badge>
                ) : project.boekhouding === "te_factureren" ? (
                  <>
                    <Badge tone="indigo">Bij boekhouding</Badge>
                    <button type="button" onClick={() => updateProject(project.id, { boekhouding: undefined, doorgestuurdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">terughalen</button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => updateProject(project.id, { boekhouding: "te_factureren", doorgestuurdOp: new Date().toISOString() })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"
                    title="Dit afgeronde project doorschakelen naar de boekhouding"
                  >
                    <Send className="h-3.5 w-3.5" /> Naar boekhouding
                  </button>
                )}
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

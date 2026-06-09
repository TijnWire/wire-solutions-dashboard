import { useEffect, useState } from "react";
import { ArrowLeft, Plus, FileSpreadsheet, CalendarRange } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Bevestig } from "../components/ui";
import { PlanningDagKaart } from "../components/PlanningDagKaart";
import { exporteerPlanningExcel } from "../lib/planningExcel";
import { datumKort, dagnaam, volgendeWerkdag } from "../lib/planning";
import type { Weekplanning } from "../lib/types";

export function Planning({ projectId }: { projectId?: string }) {
  const { currentUser, projects, users, planningen, ensurePlanning, updatePlanning, addPlanningDag, deletePlanningDag, updatePlanningDag, updatePlanningSlot, leegPlanningSlot } = useApp();
  const { navigeer } = useNav();
  const [dagWeg, setDagWeg] = useState<{ id: string; label: string } | null>(null);

  // Maak (indien nodig) een lege planning aan voor dit project.
  useEffect(() => {
    if (projectId) ensurePlanning(projectId);
  }, [projectId]);

  if (!currentUser) return null;

  const project = projects.find((p) => p.id === projectId);
  if (!projectId || !project) {
    return (
      <div className="space-y-5">
        <button type="button" onClick={() => navigeer("projecten")} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> Terug naar Projecten
        </button>
        <Card className="p-10 text-center text-sm text-ink-500">Geen project gekozen. Open een planning via een projectkaart.</Card>
      </div>
    );
  }

  const planning = planningen.find((p) => p.projectId === projectId);
  const dagen = planning?.dagen ?? [];
  const jaar = planning?.jaar ?? new Date().getFullYear();

  const teamIds = project.toegewezenAan ?? [];
  const teamMonteurs = users.filter((u) => teamIds.includes(u.id));
  const monteurs = teamMonteurs.length ? teamMonteurs : users;

  const exportPlanning: Weekplanning = planning ?? { id: "", projectId, jaar, aangemaakt: "", bijgewerkt: "", dagen: [] };

  const dagToevoegen = () => {
    const laatste = dagen.length ? dagen[dagen.length - 1].datum : undefined;
    addPlanningDag(projectId, volgendeWerkdag(laatste));
  };

  return (
    <div className="space-y-5">
      <button type="button" onClick={() => navigeer("team")} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar Team &amp; Projecten
      </button>

      {/* Kop */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
            <CalendarRange className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink-900">Weekplanning</h2>
            <p className="text-sm text-ink-500">{project.naam} · {project.wijk}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-sm text-ink-600">
            Jaar
            <input
              type="number"
              value={jaar}
              onChange={(e) => updatePlanning(projectId, { jaar: Number(e.target.value) || jaar })}
              className="w-24 rounded-lg border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              title="Jaar"
            />
          </label>
          <button type="button" onClick={dagToevoegen} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <Plus className="h-4 w-4" /> Dag toevoegen
          </button>
          <button
            type="button"
            onClick={() => exporteerPlanningExcel(exportPlanning, project, users)}
            disabled={dagen.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileSpreadsheet className="h-4 w-4" /> Exporteer Excel
          </button>
        </div>
      </div>

      {/* Dagen */}
      {dagen.length === 0 ? (
        <Card className="p-10 text-center">
          <CalendarRange className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Nog geen dagen ingepland. Klik op <span className="font-semibold">Dag toevoegen</span> om te beginnen.</p>
        </Card>
      ) : (
        <div className="space-y-4">
          {dagen.map((dag) => (
            <PlanningDagKaart
              key={dag.id}
              dag={dag}
              monteurs={monteurs}
              onDna={(dna) => updatePlanningDag(projectId, dag.id, { dna })}
              onSlot={(slotId, patch) => updatePlanningSlot(projectId, dag.id, slotId, patch)}
              onSlotLeeg={(slotId) => leegPlanningSlot(projectId, dag.id, slotId)}
              onVerwijder={() => setDagWeg({ id: dag.id, label: `${datumKort(dag.datum)} (${dagnaam(dag.datum)})` })}
            />
          ))}
        </div>
      )}

      <Bevestig
        open={!!dagWeg}
        titel="Dag verwijderen"
        tekst={`Weet je het zeker dat je ${dagWeg?.label ?? "deze dag"} en alle ingevulde adressen wilt verwijderen?`}
        onBevestig={() => {
          if (dagWeg) deletePlanningDag(projectId, dagWeg.id);
          setDagWeg(null);
        }}
        onAnnuleer={() => setDagWeg(null)}
      />
    </div>
  );
}

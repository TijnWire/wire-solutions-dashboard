import { useState } from "react";
import { Clock, MessageSquare, Trash2, ChevronDown, Users2 } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Keuze } from "./Keuze";
import { TAAK_STATUSSEN, type Taak, type TaakStatus } from "../lib/types";

const statusStyle: Record<TaakStatus, { actief: string; rand: string }> = {
  "Te doen": { actief: "bg-red-500 text-white", rand: "text-red-600" },
  "Mee bezig": { actief: "bg-orange-500 text-white", rand: "text-orange-600" },
  Klaar: { actief: "bg-green-600 text-white", rand: "text-green-600" },
};

export function TaakKaart({
  taak,
  toonToewijzing = false,
}: {
  taak: Taak;
  toonToewijzing?: boolean;
}) {
  const { updateTaak, deleteTaak, users, currentUser } = useApp();
  const [open, setOpen] = useState(false);
  const isAdmin = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";
  const toegewezen = users.find((u) => u.id === taak.toegewezenAan);

  return (
    <div className="rounded-xl border border-ink-200 bg-white p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div
            className={`text-sm font-medium ${
              taak.status === "Klaar" ? "text-ink-400 line-through" : "text-ink-900"
            }`}
          >
            {taak.titel}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {taak.deadline}
            </span>
            {toonToewijzing && (toegewezen ? (
              <span className="inline-flex items-center gap-1">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ink-800 text-[8px] font-semibold text-white">
                  {toegewezen.initialen}
                </span>
                {toegewezen.naam.split(" ")[0]}
              </span>
            ) : taak.toegewezenAan === "" ? (
              <span className="inline-flex items-center gap-1 font-medium text-brand-600">
                <Users2 className="h-3.5 w-3.5" /> Hele team
              </span>
            ) : null)}
            <button
              onClick={() => setOpen((o) => !o)}
              className={`inline-flex items-center gap-1 hover:text-ink-700 ${
                taak.notitie ? "text-brand-600" : ""
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              {taak.notitie ? "Notitie" : "Notitie toevoegen"}
              <ChevronDown className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`} />
            </button>
          </div>
        </div>

        {/* Status-schakelaar */}
        <div className="flex shrink-0 overflow-hidden rounded-lg border border-ink-200">
          {TAAK_STATUSSEN.map((s) => {
            const actief = taak.status === s;
            return (
              <button
                key={s}
                onClick={() => updateTaak(taak.id, { status: s })}
                className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                  actief ? statusStyle[s].actief : "bg-white text-ink-400 hover:bg-ink-50"
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>
      </div>

      {open && (
        <div className="mt-3 space-y-2 border-t border-ink-100 pt-3">
          <textarea
            value={taak.notitie}
            onChange={(e) => updateTaak(taak.id, { notitie: e.target.value })}
            placeholder="Voeg een notitie of update toe…"
            rows={2}
            className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
          />
          {isAdmin && (
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-ink-500">
                Toegewezen aan:
                <div className="w-40"><Keuze value={taak.toegewezenAan} onChange={(w) => updateTaak(taak.id, { toegewezenAan: w })} opties={[{ waarde: "", label: "Hele team" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} size="sm" /></div>
              </label>
              <button
                onClick={() => deleteTaak(taak.id)}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Verwijderen
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

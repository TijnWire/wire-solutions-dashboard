// Bodemonderzoeken: dezelfde opzet als Schouwafspraken (map per plaats → week → tijdvakken invullen),
// met de naam van de bewoner verplicht en de planning in het sjabloon van de opdrachtgever.
// Opdrachten uit de vorige opzet (met de ronde langs de deuren) blijven bereikbaar onder één knop.
import { useState } from "react";
import { ArrowLeft, Archive } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Schouwafspraken } from "./Schouwafspraken";
import { Tauw } from "./Tauw";

export function Bodemonderzoeken({ tauwId }: { tauwId?: string }) {
  const { tauwOpdrachten } = useApp();
  const [oud, setOud] = useState(!!tauwId);
  if (oud) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setOud(false)} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-600 hover:text-brand-700">
          <ArrowLeft className="h-4 w-4" /> Terug naar de planning
        </button>
        <Tauw initieelTauw={tauwId} />
      </div>
    );
  }
  return (
    <Schouwafspraken
      soort="bodem"
      extra={tauwOpdrachten.length > 0 ? (
        <button type="button" onClick={() => setOud(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">
          <Archive className="h-3.5 w-3.5" /> Eerdere opdrachten ({tauwOpdrachten.length})
        </button>
      ) : null}
    />
  );
}

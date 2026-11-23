// Alle adressen uit Saneren (centrale database), vooraf opgehaald zodat de zoekbalk bovenin ze direct
// kan vinden — met bewoner en telefoonnummer. Wordt elk kwartier ververst. De server geeft medewerkers
// alleen hun eigen adressen terug.
import { useEffect, useState } from "react";
import { haalDossiers } from "./saneerflow";
import { haalFlowAdressen, type FlowAdres } from "./saneerflowWerk";

export function useSaneerAdressen(actief: boolean): FlowAdres[] {
  const [adressen, setAdressen] = useState<FlowAdres[]>([]);
  useEffect(() => {
    if (!actief) { setAdressen([]); return; }
    let weg = false;
    const laad = async () => {
      try {
        const dossiers = await haalDossiers();
        const uit: FlowAdres[] = [];
        // Een paar tegelijk, zodat het de rest van de app niet ophoudt.
        for (let i = 0; i < dossiers.length; i += 4) {
          const delen = await Promise.all(dossiers.slice(i, i + 4).map((d) => haalFlowAdressen(d.pd_nummer).then((r) => r.adressen).catch(() => [] as FlowAdres[])));
          for (const d of delen) uit.push(...d);
          if (weg) return;
        }
        if (!weg) setAdressen(uit);
      } catch { /* zoeken werkt dan gewoon zonder Saneren */ }
    };
    const start = setTimeout(() => void laad(), 2500);
    const elk = setInterval(() => void laad(), 15 * 60 * 1000);
    return () => { weg = true; clearTimeout(start); clearInterval(elk); };
  }, [actief]);
  return adressen;
}

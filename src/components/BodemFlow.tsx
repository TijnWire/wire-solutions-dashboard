import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Check, ChevronRight, ArrowLeft, Settings2, ListPlus, Users, Footprints, ClipboardCheck } from "lucide-react";
import { BodemPlanning, BodemAfspraken } from "./BodemPlanning";
import { BodemToewijzen } from "./BodemToewijzen";
import { BodemOverzicht } from "./BodemOverzicht";
import { BodemBewaartermijnKaart } from "./BodemBewaartermijn";
import { dagenVanVenster, voortgangVan } from "../lib/bodemonderzoek";
import type { TauwAdres, TauwOpdracht, User } from "../lib/types";

// De beheerderskant van een bodemonderzoek, als stappen in plaats van één lange pagina.
// ─────────────────────────────────────────────────────────────────────────────
// Eerst stond alles onder elkaar: instellen, adressen, verdelen, voortgang en uitkomst. Dat werd een
// muur waarin je niet meer zag wat er nog moest gebeuren. Nu is het één ding per scherm, met bovenaan
// waar je bent en wat er al af is. Je kunt vrij heen en weer springen — niets zit op slot, want een
// beheerder moet ook halverwege iets kunnen bijstellen.

export type StapKey = "instellen" | "adressen" | "verdelen" | "onderweg" | "resultaat";

const STAPPEN: { key: StapKey; nr: number; titel: string; uitleg: string; Icon: typeof Settings2 }[] = [
  { key: "instellen", nr: 1, titel: "Instellen", uitleg: "Periode, werkdagen en tijdblokken", Icon: Settings2 },
  { key: "adressen", nr: 2, titel: "Adressen", uitleg: "Inlezen of zelf toevoegen", Icon: ListPlus },
  { key: "verdelen", nr: 3, titel: "Verdelen", uitleg: "Wie loopt welke adressen", Icon: Users },
  { key: "onderweg", nr: 4, titel: "Onderweg", uitleg: "De ronde langs de deuren", Icon: Footprints },
  { key: "resultaat", nr: 5, titel: "Resultaat", uitleg: "Afspraken en export", Icon: ClipboardCheck },
];

export function BodemFlow({ opdracht, users, veldwerkers, magWissen, onWijzig, onAdressen, adressenSectie, rondeStart }: {
  opdracht: TauwOpdracht;
  users: User[];
  veldwerkers: User[];
  magWissen: boolean; // alleen de eigenaar en HR mogen persoonsgegevens wissen
  onWijzig: (patch: Partial<TauwOpdracht>) => void;
  onAdressen: (next: TauwAdres[]) => void;
  adressenSectie: ReactNode;   // de bestaande adreslijst met import-knop
  rondeStart: ReactNode;       // het blok "Langs de deuren" voor wie zelf meeloopt
}) {
  const v = voortgangVan(opdracht.adressen);
  const dagen = useMemo(() => dagenVanVenster(opdracht.venster), [opdracht.venster]);
  const team = opdracht.team ?? [];
  const verdeeld = opdracht.adressen.filter((a) => a.toegewezenAan).length;

  // Wanneer is een stap af? Puur informatief — je mag altijd overal heen.
  const af: Record<StapKey, boolean> = {
    instellen: dagen.length > 0,
    adressen: opdracht.adressen.length > 0,
    verdelen: team.length > 0 && verdeeld > 0,
    onderweg: v.totaal > 0 && v.behandeld >= v.totaal,
    resultaat: false,
  };
  // Waar hoort iemand te beginnen: de eerste stap die nog niet af is.
  const eerste = STAPPEN.find((s) => !af[s.key])?.key ?? "resultaat";
  const [stap, setStap] = useState<StapKey>(eerste);
  // Bij het openen van een andere map opnieuw bepalen waar je hoort te zijn.
  useEffect(() => { setStap(eerste); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [opdracht.id]);

  const index = STAPPEN.findIndex((s) => s.key === stap);
  const huidig = STAPPEN[index];
  const volgende = STAPPEN[index + 1];
  const vorige = STAPPEN[index - 1];

  // Korte samenvatting per stap, zodat je in de balk ziet wat er staat zonder erheen te gaan.
  const samenvatting: Record<StapKey, string> = {
    instellen: dagen.length ? `${dagen.length} dagen` : "nog niet ingesteld",
    adressen: opdracht.adressen.length ? `${opdracht.adressen.length}` : "geen",
    verdelen: team.length ? `${verdeeld}/${opdracht.adressen.length}` : "nog niemand",
    onderweg: v.totaal ? `${v.behandeld}/${v.totaal}` : "—",
    resultaat: v.ja ? `${v.ja} afspraken` : "—",
  };

  return (
    <div className="space-y-4">
      {/* Stappenbalk — waar ben je, wat is af */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STAPPEN.map((s) => {
          const actief = s.key === stap;
          const gedaan = af[s.key];
          return (
            <button
              key={s.key}
              type="button"
              onClick={() => setStap(s.key)}
              aria-current={actief ? "step" : undefined}
              className={`flex shrink-0 items-center gap-2.5 rounded-xl border-2 px-3.5 py-2.5 text-left transition-colors ${
                actief ? "border-brand-500 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"
              }`}
            >
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                gedaan ? "bg-green-500 text-white" : actief ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-500"
              }`}>
                {gedaan ? <Check className="h-4 w-4" /> : s.nr}
              </span>
              <span className="min-w-0">
                <span className={`block text-sm font-bold ${actief ? "text-brand-800" : "text-ink-800"}`}>{s.titel}</span>
                <span className="block text-[11px] text-ink-500">{samenvatting[s.key]}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Kop van de huidige stap */}
      <div className="flex items-center gap-2.5">
        <span className="rounded-lg bg-brand-50 p-2 text-brand-600"><huidig.Icon className="h-5 w-5" /></span>
        <div>
          <h3 className="text-base font-bold text-ink-900">Stap {huidig.nr} — {huidig.titel}</h3>
          <p className="text-sm text-ink-500">{huidig.uitleg}</p>
        </div>
      </div>

      {/* Inhoud van de stap: precies één ding tegelijk */}
      {stap === "instellen" && (
        <>
          <BodemPlanning opdracht={opdracht} users={veldwerkers} onWijzig={onWijzig} deel="instellen" />
          {!af.instellen && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Kies eerst een startdag. Zonder periode kan er aan de deur geen afspraak worden gemaakt.
            </p>
          )}
        </>
      )}

      {stap === "adressen" && adressenSectie}

      {stap === "verdelen" && (
        <>
          {opdracht.adressen.length === 0 ? (
            <p className="rounded-lg bg-amber-50 px-3 py-3 text-sm text-amber-800">
              Er zijn nog geen adressen. Ga eerst terug naar stap 2.
            </p>
          ) : (
            <>
              <BodemPlanning opdracht={opdracht} users={veldwerkers} onWijzig={onWijzig} deel="verdelen" />
              <BodemToewijzen adressen={opdracht.adressen} users={users} team={team} onWijzig={onAdressen} />
            </>
          )}
        </>
      )}

      {stap === "onderweg" && (
        <>
          {rondeStart}
          <BodemOverzicht opdracht={opdracht} users={users} />
        </>
      )}

      {stap === "resultaat" && (
        <>
          <BodemAfspraken opdracht={opdracht} users={users} />
          <BodemOverzicht opdracht={opdracht} users={users} />
          <BodemBewaartermijnKaart
            projectId={opdracht.id}
            magWissen={magWissen}
            aantalMetGegevens={opdracht.adressen.filter((a) => a.bewoner || a.telefoon || a.email).length}
          />
        </>
      )}

      {/* Doorlopen */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
        {vorige ? (
          <button type="button" onClick={() => setStap(vorige.key)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <ArrowLeft className="h-4 w-4" /> {vorige.titel}
          </button>
        ) : <span />}
        {volgende && (
          <button type="button" onClick={() => setStap(volgende.key)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
            Verder naar {volgende.titel} <ChevronRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

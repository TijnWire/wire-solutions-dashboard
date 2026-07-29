import { useMemo, useState } from "react";
import { CircleDot, Layers } from "lucide-react";
import { PeriodeNavigator, periodeRange, type Periode } from "./PeriodeNavigator";

// Dezelfde filterbalk boven elk projectoverzicht.
// ─────────────────────────────────────────────────────────────────────────────
// Elke projectpagina had zijn eigen manier van sorteren en filteren, of helemaal geen. Dan moet je per
// pagina opnieuw uitzoeken waar je moet klikken om te zien wat er loopt. Dit is één balk die overal
// hetzelfde werkt: periode kiezen, of alleen wat nog openstaat.
//
// Drie keuzes die bewust zo staan:
//  • Standaard "Alles". Een projectenlijst die stilletjes op deze week staat, verbergt werk dat vorige
//    maand is begonnen en nog loopt — en dat is precies het werk waar je achteraan moet.
//  • Nieuwste bovenaan. Wat je net hebt aangemaakt wil je meteen zien, niet onderaan een lange lijst.
//  • "Alleen open" is een knop met het aantal erin. Dan zie je in één oogopslag hoeveel er nog loopt,
//    ook als je er niet op klikt.

export type { Periode };

export function useProjectFilter<T>(items: T[], opties: {
  datum: (x: T) => string | undefined;   // waarop de periode wordt bepaald (ISO)
  isOpen: (x: T) => boolean;             // telt dit nog als lopend werk?
  // Sommige pagina's hebben zelf al een open/dicht-knop (Voorschouwen: "zonder foto"). Twee knoppen
  // die bijna hetzelfde doen is verwarrender dan geen, dus die kun je hier uitzetten.
  toonOpenKnop?: boolean;
}) {
  const [periode, setPeriode] = useState<Periode>("alles");
  const [anker, setAnker] = useState(() => new Date().toISOString().slice(0, 10));
  const [alleenOpen, setAlleenOpen] = useState(false);

  const aantalOpen = useMemo(() => items.filter(opties.isOpen).length, [items, opties]);

  const zichtbaar = useMemo(() => {
    const bereik = periodeRange(periode, anker);
    const uit = items.filter((x) => {
      if (alleenOpen && !opties.isOpen(x)) return false;
      if (!bereik) return true;
      const d = (opties.datum(x) ?? "").slice(0, 10);
      // Zonder datum valt een project nergens in; dan hoort het bij "alles" thuis en niet in een week.
      if (!d) return false;
      return d >= bereik.start && d <= bereik.eind;
    });
    // Nieuwste bovenaan; wat geen datum heeft komt onderaan in plaats van bovenaan te blijven plakken.
    return uit.sort((a, b) => {
      const da = (opties.datum(a) ?? "").slice(0, 10);
      const db = (opties.datum(b) ?? "").slice(0, 10);
      if (!da && !db) return 0;
      if (!da) return 1;
      if (!db) return -1;
      return db.localeCompare(da);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [items, periode, anker, alleenOpen]);

  const balk = (
    <ProjectFilterBalk
      periode={periode} setPeriode={setPeriode}
      anker={anker} setAnker={setAnker}
      alleenOpen={alleenOpen} setAlleenOpen={setAlleenOpen}
      aantalOpen={aantalOpen} aantalTotaal={items.length} aantalZichtbaar={zichtbaar.length}
      toonOpenKnop={opties.toonOpenKnop !== false}
    />
  );

  return { periode, anker, alleenOpen, zichtbaar, aantalOpen, balk };
}

function ProjectFilterBalk({ periode, setPeriode, anker, setAnker, alleenOpen, setAlleenOpen, aantalOpen, aantalTotaal, aantalZichtbaar, toonOpenKnop }: {
  periode: Periode; setPeriode: (p: Periode) => void;
  anker: string; setAnker: (s: string) => void;
  alleenOpen: boolean; setAlleenOpen: (b: boolean) => void;
  aantalOpen: number; aantalTotaal: number; aantalZichtbaar: number;
  toonOpenKnop: boolean;
}) {
  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap items-center gap-2 ${toonOpenKnop ? "" : "hidden"}`}>
        <button
          type="button"
          onClick={() => setAlleenOpen(!alleenOpen)}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors ${
            alleenOpen ? "bg-brand-600 text-white" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"}`}
        >
          {alleenOpen ? <CircleDot className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
          {alleenOpen ? `Alleen open (${aantalOpen})` : `Nog open: ${aantalOpen}`}
        </button>
        <span className="text-xs text-ink-500">
          {aantalZichtbaar === aantalTotaal
            ? `${aantalTotaal} in beeld`
            : `${aantalZichtbaar} van de ${aantalTotaal} in beeld`}
          {" · nieuwste bovenaan"}
        </span>
      </div>
      <PeriodeNavigator periode={periode} setPeriode={setPeriode} anker={anker} setAnker={setAnker} />
    </div>
  );
}

import { useCallback, useEffect, useState } from "react";
import { StickyNote, Check, Clock, X, Loader2, AlertTriangle } from "lucide-react";
import { useApp } from "../store/AppContext";
import { haalTaken, vinkTaak, type Taak } from "../lib/saneerflowWerk";

// De herinnering om de poster op te hangen.
// ─────────────────────────────────────────────────────────────────────────────
// Zodra er met een gebouw een uitvoeringsdatum is afgesproken, moet er binnen twee weken een
// aankondiging in dat gebouw hangen. Dat is precies zo'n taak die je in de drukte vergeet en waar je
// pas achter komt als het te laat is — dus hij komt vanzelf in beeld in plaats van dat je ernaar moet
// zoeken. Vandaar een pop-up over het scherm heen, niet een balkje ergens op een pagina.
//
// Twee dingen die hier bewust zijn afgewogen:
//  • "Later" laat hem tot morgen met rust. Een melding die bij élke klik terugkomt, leren mensen
//    wegklikken zonder te lezen — en dan werkt hij niet meer als het écht moet.
//  • Is de datum verstreken, dan werkt "later" niet meer. Te laat blijft te laat.
// Afgevinkt is afgevinkt: dan komt hij nooit meer terug voor dat gebouw.

const SLUIMER = "wire.poster.sluimer";   // datum tot wanneer we niets laten zien

const vandaag = () => new Date().toISOString().slice(0, 10);
const kortNL = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().map(Number).join("-") : "");

const dagenTot = (iso: string) => {
  if (!iso) return 99;
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`).getTime();
  const nu = new Date(`${vandaag()}T12:00:00Z`).getTime();
  return Math.round((d - nu) / 86_400_000);
};

export function PosterHerinnering() {
  const { currentUser } = useApp();
  const [taken, setTaken] = useState<Taak[]>([]);
  const [dicht, setDicht] = useState(false);
  const [bezig, setBezig] = useState("");

  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";

  const laad = useCallback(async () => {
    if (!currentUser) return;
    const alle = await haalTaken();
    // Een medewerker ziet alleen de posters van de gebouwen die aan hem zijn toegewezen; de leiding
    // ziet alles, want die moet erop kunnen sturen.
    setTaken(isLeiding ? alle : alle.filter((t) => t.toegewezen_aan === currentUser.id));
  }, [currentUser, isLeiding]);

  useEffect(() => {
    void laad();
    // Ook opnieuw kijken als het scherm weer op de voorgrond komt: dan is er vaak net iets afgesproken.
    const bij = () => { if (document.visibilityState === "visible") void laad(); };
    document.addEventListener("visibilitychange", bij);
    return () => document.removeEventListener("visibilitychange", bij);
  }, [laad]);

  if (!currentUser || taken.length === 0 || dicht) return null;

  const teLaat = taken.filter((t) => dagenTot(t.deadline) < 0);
  const sluimertTot = (() => { try { return localStorage.getItem(SLUIMER) ?? ""; } catch { return ""; } })();
  // Te laat = altijd tonen. De rest mag een dag met rust gelaten worden.
  if (teLaat.length === 0 && sluimertTot > vandaag()) return null;

  const later = () => {
    const morgen = new Date();
    morgen.setDate(morgen.getDate() + 1);
    try { localStorage.setItem(SLUIMER, morgen.toISOString().slice(0, 10)); } catch { /* opslag geblokkeerd */ }
    setDicht(true);
  };

  const afvinken = async (t: Taak) => {
    setBezig(t.id);
    await vinkTaak(t.id, { notitie: "Opgehangen in het gebouw" });
    setBezig("");
    const over = taken.filter((x) => x.id !== t.id);
    setTaken(over);
    if (over.length === 0) setDicht(true);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className={`flex items-start gap-3 px-5 py-4 text-white ${teLaat.length ? "bg-red-600" : "bg-amber-500"}`}>
          <span className="mt-0.5 shrink-0">{teLaat.length ? <AlertTriangle className="h-6 w-6" /> : <StickyNote className="h-6 w-6" />}</span>
          <div className="min-w-0">
            <h2 className="text-base font-bold">
              {teLaat.length
                ? `${teLaat.length} poster${teLaat.length === 1 ? "" : "s"} hangt te laat`
                : `Poster ophangen in ${taken.length === 1 ? "het gebouw" : `${taken.length} gebouwen`}`}
            </h2>
            <p className="text-sm opacity-90">
              De bewoners zijn akkoord met de datum. De aankondiging moet in het gebouw hangen vóór de
              dag die hieronder staat.
            </p>
          </div>
        </div>

        <div className="max-h-[50vh] space-y-2 overflow-y-auto p-4">
          {taken.map((t) => {
            const dagen = dagenTot(t.deadline);
            return (
              <div key={t.id} className={`rounded-xl border p-3 ${dagen < 0 ? "border-red-300 bg-red-50" : dagen <= 3 ? "border-amber-300 bg-amber-50" : "border-ink-200 bg-white"}`}>
                <div className="font-semibold text-ink-900">{t.gebouw || t.cluster_naam || t.pd_nummer}</div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-600">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    ophangen vóór {kortNL(t.deadline)}
                    {dagen < 0 ? <b className="text-red-700"> ({-dagen} dagen te laat)</b>
                      : dagen === 0 ? <b className="text-red-700"> (vandaag)</b>
                      : <span> (nog {dagen} {dagen === 1 ? "dag" : "dagen"})</span>}
                  </span>
                  {t.definitieve_datum && <span>uitvoering {kortNL(t.definitieve_datum)}</span>}
                </div>
                <button type="button" onClick={() => void afvinken(t)} disabled={bezig === t.id}
                  className="mt-2.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-60">
                  {bezig === t.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  Poster hangt — niet meer waarschuwen
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex justify-end border-t border-ink-100 px-4 py-3">
          {teLaat.length > 0 ? (
            <button type="button" onClick={() => setDicht(true)} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-ink-500 hover:bg-ink-50">
              <X className="h-4 w-4" /> Sluiten (komt terug)
            </button>
          ) : (
            <button type="button" onClick={later} className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-ink-500 hover:bg-ink-50">
              <Clock className="h-4 w-4" /> Later vandaag niet meer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

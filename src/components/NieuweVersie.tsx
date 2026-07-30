import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { APP_VERSIE } from "../lib/versie";

// "Er staat een nieuwe versie klaar" — buiten de service worker om.
// ─────────────────────────────────────────────────────────────────────────────
// De service worker regelt het bijwerken normaal gesproken zelf. Op iOS gaat dat mis: een app op het
// beginscherm wordt bevroren in plaats van afgesloten, en de controle op een nieuwe versie loopt dan
// soms nooit. Het team moest daarom de app van het beginscherm gooien en opnieuw installeren — en
// juist dát gaat weleens fout, want dan raak je ook je inlog kwijt.
//
// Dit is de ontsnappingsroute: we vragen zelf een piepklein bestandje op, zonder cache, en vergelijken
// het versienummer met wat er draait. Staat er iets nieuws klaar, dan zie je onderin een balkje.
// Eén tik en hij herlaadt — geen verwijderen, geen opnieuw inloggen.
//
// Bewust géén automatische herlaad: dat kan midden in het invullen van een formulier gebeuren.
// Jij bepaalt wanneer het uitkomt.

const HOE_VAAK = 10 * 60 * 1000;   // elke tien minuten, en telkens als de app op de voorgrond komt

export function NieuweVersie() {
  const [nieuw, setNieuw] = useState<string | null>(null);
  const [weg, setWeg] = useState(false);

  useEffect(() => {
    let actief = true;
    const kijk = async () => {
      try {
        // no-store: anders krijgen we precies de oude kopie te zien waar het ons om te doen is.
        const r = await fetch(`/versie.json?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!r.ok || !actief) return;
        const uit = (await r.json()) as { versie?: string };
        if (uit.versie && uit.versie !== APP_VERSIE) setNieuw(uit.versie);
      } catch { /* geen bereik of het bestand staat er (nog) niet — later opnieuw */ }
    };
    void kijk();
    const iv = setInterval(kijk, HOE_VAAK);
    const bij = () => { if (document.visibilityState === "visible") void kijk(); };
    document.addEventListener("visibilitychange", bij);
    window.addEventListener("focus", bij);
    return () => {
      actief = false;
      clearInterval(iv);
      document.removeEventListener("visibilitychange", bij);
      window.removeEventListener("focus", bij);
    };
  }, []);

  if (!nieuw || weg) return null;

  const nu = async () => {
    // Ook de service worker en zijn caches opruimen, zodat er niets ouds kan blijven hangen.
    try {
      const regs = await navigator.serviceWorker?.getRegistrations?.();
      await Promise.all((regs ?? []).map((r) => r.update().catch(() => undefined)));
      const namen = await caches?.keys?.();
      await Promise.all((namen ?? []).map((n) => caches.delete(n)));
    } catch { /* niet kritisch — herladen doet het meeste werk al */ }
    window.location.reload();
  };

  return (
    <div className="fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full max-w-md items-center gap-3 rounded-2xl bg-ink-900 px-4 py-3 text-white shadow-2xl">
        <RefreshCw className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 text-sm">
          <span className="block font-bold">Nieuwe versie klaar (V{nieuw})</span>
          <span className="block text-xs text-white/70">Je hoeft de app niet opnieuw te installeren.</span>
        </span>
        <button type="button" onClick={() => void nu()}
          className="shrink-0 rounded-xl bg-white px-3.5 py-2 text-sm font-bold text-ink-900 hover:bg-white/90">
          Vernieuwen
        </button>
        <button type="button" onClick={() => setWeg(true)} aria-label="Later"
          className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

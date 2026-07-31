import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { APP_VERSIE } from "../lib/versie";
import { aantalWachtend } from "../lib/bodemAdressen";
import { aantalWachtendFlow } from "../lib/saneerflowWerk";

// De app werkt zichzelf bij.
// ─────────────────────────────────────────────────────────────────────────────
// Op iOS wordt een app op het beginscherm bevroren in plaats van afgesloten, waardoor de service
// worker zich soms nooit vernieuwt. Vroeger was verwijderen en opnieuw installeren de enige uitweg —
// en dan raak je ook je inlog kwijt.
//
// Daarom kijkt de app zelf: elke tien minuten en telkens als hij op de voorgrond komt haalt hij een
// klein bestandje op (zonder cache) met het versienummer dat op de server staat. Wijkt dat af van wat
// er draait, dan werkt hij zichzelf bij. Niemand hoeft ergens op te klikken.
//
// ── HET ENIGE WAT HIJ NIET DOET ──
// Herladen terwijl iemand aan het typen is, of terwijl er nog werk in de wachtrij staat dat naar de
// server moet. Dat zou invoer kosten aan een deur waar je net stond, en dat is erger dan een dag op
// een oude versie draaien. Hij wacht dan op een rustig moment: zodra het veld uit beeld is, de app
// even op de achtergrond gaat, of er een minuut niets gebeurt.

const HOE_VAAK = 10 * 60 * 1000;   // hoe vaak we kijken of er iets nieuws klaarstaat
const RUST = 45 * 1000;            // zo lang niets doen telt als "nu komt het uit"
const GEDULD = 4 * 60 * 1000;      // zo lang wachten we op een wachtrij die niet leegloopt

// Staat iemand te typen? Dan is dit geen moment om de pagina onder hem vandaan te trekken.
function ietsInGebruik(): boolean {
  const el = document.activeElement as HTMLElement | null;
  if (!el) return false;
  const naam = el.tagName;
  if (naam === "INPUT" || naam === "TEXTAREA" || naam === "SELECT") return true;
  if (el.isContentEditable) return true;
  // Een open venster of keuzelijst telt ook: daar zit iemand middenin iets.
  return !!document.querySelector('[role="dialog"], [aria-modal="true"]');
}

export function NieuweVersie() {
  const [nieuw, setNieuw] = useState<string | null>(null);
  const laatsteActie = useRef(Date.now());
  const bezig = useRef(false);

  // ── Kijken of er iets klaarstaat ──
  useEffect(() => {
    let actief = true;
    const kijk = async () => {
      try {
        const r = await fetch(`/versie.json?t=${Date.now()}`, { cache: "no-store", signal: AbortSignal.timeout(10000) });
        if (!r.ok || !actief) return;
        const uit = (await r.json()) as { versie?: string };
        if (uit.versie && uit.versie !== APP_VERSIE) setNieuw(uit.versie);
      } catch { /* geen bereik — later opnieuw */ }
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

  // ── Bijhouden wanneer er voor het laatst iets gebeurde ──
  useEffect(() => {
    const stip = () => { laatsteActie.current = Date.now(); };
    for (const e of ["pointerdown", "keydown", "touchstart", "wheel"] as const) {
      window.addEventListener(e, stip, { passive: true });
    }
    return () => { for (const e of ["pointerdown", "keydown", "touchstart", "wheel"] as const) window.removeEventListener(e, stip); };
  }, []);

  // ── Zelf bijwerken zodra het uitkomt ──
  useEffect(() => {
    if (!nieuw) return;

    const werkBij = async () => {
      if (bezig.current) return;
      bezig.current = true;
      try {
        // Ook de service worker en zijn caches opruimen: anders kan de oude app blijven hangen,
        // en dat is precies waarvoor dit hele mechanisme bestaat.
        const regs = await navigator.serviceWorker?.getRegistrations?.();
        await Promise.all((regs ?? []).map((r) => r.update().catch(() => undefined)));
        const namen = await caches?.keys?.();
        await Promise.all((namen ?? []).map((n) => caches.delete(n)));
      } catch { /* niet kritisch; herladen doet het meeste werk */ }
      window.location.reload();
    };

    // Staat er nog werk in de wachtrij dat naar de server moet? Dan eerst dat, anders zou een
    // herlaad het weg kunnen gooien. We houden de stand bij in plaats van hem in de afweging op te
    // vragen, want dat is een asynchrone vraag.
    let inDeWacht = 0;
    const meetWachtrij = () => { void aantalWachtend().then((n) => { inDeWacht = n + aantalWachtendFlow(); }).catch(() => undefined); };
    meetWachtrij();
    const wachtIv = setInterval(meetWachtrij, 5000);

    // Wachten op een lege wachtrij mag nooit voor altijd zijn. De wachtrij staat in IndexedDB en
    // overleeft een herlaad gewoon — er gaat dus niets verloren. Blijft hij hangen omdat de server
    // onbereikbaar is of omdat er één regel is die het niet doet, dan zou de app nóóit meer bijwerken
    // en zit iemand weken op een oude versie te kijken. Precies dat is op 31-07-2026 gebeurd.
    // Dus: eerst een paar minuten netjes proberen te legen, en daarna toch bijwerken.
    const gezienOp = Date.now();
    const magNu = () => !ietsInGebruik() && (inDeWacht === 0 || Date.now() - gezienOp > GEDULD);

    // Meteen proberen; lukt het niet, dan blijft hij het elke vijf seconden opnieuw afwegen, en
    // grijpt hij het eerste rustige moment. Ook als de app naar de achtergrond gaat is het veilig:
    // dan is er zeker niemand aan het typen.
    const probeer = () => {
      if (!magNu()) return;
      if (document.visibilityState === "hidden" || Date.now() - laatsteActie.current > RUST) void werkBij();
    };
    probeer();
    const iv = setInterval(probeer, 5000);
    const bijVerbergen = () => { if (document.visibilityState === "hidden" && magNu()) void werkBij(); };
    document.addEventListener("visibilitychange", bijVerbergen);
    return () => { clearInterval(iv); clearInterval(wachtIv); document.removeEventListener("visibilitychange", bijVerbergen); };
  }, [nieuw]);

  if (!nieuw) return null;

  // Alleen een mededeling: er is niets te kiezen. Hij verdwijnt vanzelf zodra hij herlaadt.
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex justify-center p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2.5 rounded-full bg-ink-900/90 px-4 py-2 text-sm text-white shadow-xl backdrop-blur">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Nieuwe versie (V{nieuw}) wordt geladen…</span>
      </div>
    </div>
  );
}

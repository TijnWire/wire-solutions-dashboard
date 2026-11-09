// Tekstgrootte — door de gebruiker zelf te kiezen, per apparaat.
// ─────────────────────────────────────────────────────────────────────────────
// Alle maten in de app (tekst, knoppen, afstanden) staan in rem. Door het lettertype van <html> te
// vergroten wordt dus de HELE app proportioneel groter, zonder dat een scherm iets hoeft te weten.
// Normaal laten we de browser zijn eigen standaard (meestal 16px) — en dus ook de systeeminstelling
// "grotere tekst" van de telefoon — ongemoeid. Groot en Extra groot zijn percentages daarvan.

import { useSyncExternalStore } from "react";

export type Tekstgrootte = "normaal" | "groot" | "extra";

export const TEKSTGROOTTES: { key: Tekstgrootte; label: string; kort: string; pct: string }[] = [
  { key: "normaal", label: "Normaal", kort: "Normaal", pct: "" },
  { key: "groot", label: "Groot", kort: "Groot", pct: "112.5%" }, // 18px bij een standaard van 16px
  { key: "extra", label: "Extra groot", kort: "Extra", pct: "125%" }, // 20px
];

const KEY = "wire.tekstgrootte";
const EVENT = "wire-tekstgrootte";

export function leesTekstgrootte(): Tekstgrootte {
  try {
    const v = localStorage.getItem(KEY);
    if (v === "groot" || v === "extra") return v;
  } catch { /* opslag niet beschikbaar (bv. privémodus): dan gewoon normaal */ }
  return "normaal";
}

export function pasTekstgrootteToe(t: Tekstgrootte = leesTekstgrootte()): void {
  const pct = TEKSTGROOTTES.find((x) => x.key === t)?.pct ?? "";
  document.documentElement.style.fontSize = pct;
}

export function zetTekstgrootte(t: Tekstgrootte): void {
  try { localStorage.setItem(KEY, t); } catch { /* niets aan te doen; geldt dan alleen voor deze sessie */ }
  pasTekstgrootteToe(t);
  window.dispatchEvent(new Event(EVENT));
}

function abonneer(cb: () => void): () => void {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

// Houdt meerdere keuzeknoppen op dezelfde pagina (menu én instellingen) automatisch gelijk.
export function useTekstgrootte(): Tekstgrootte {
  return useSyncExternalStore(abonneer, leesTekstgrootte, () => "normaal" as Tekstgrootte);
}

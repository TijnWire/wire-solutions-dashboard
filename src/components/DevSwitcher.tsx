import { useState } from "react";
import { UserCog, ChevronUp, X, Check } from "lucide-react";
import { useApp } from "../store/AppContext";
import type { Role } from "../lib/types";

// Alleen in ontwikkeling / op localhost zichtbaar — niet in productie.
const isDev =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.DEV) ||
  (typeof window !== "undefined" && /^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/.test(window.location.hostname));

const ROL_LABEL: Record<Role, string> = { eigenaar: "Eigenaar", beheer: "Beheer", monteur: "Werknemer" };
const initialen = (naam: string) => naam.split(" ").map((d) => d[0]).slice(0, 2).join("").toUpperCase();

export function DevSwitcher() {
  const { users, currentUser, wisselGebruiker } = useApp();
  const [open, setOpen] = useState(false);
  if (!isDev) return null;

  const beheerders = users.filter((u) => u.rol === "eigenaar" || u.rol === "beheer");
  const werknemers = users.filter((u) => u.rol === "monteur");

  const Rij = ({ id, naam, rol }: { id: string; naam: string; rol: Role }) => {
    const actief = currentUser?.id === id;
    return (
      <button
        type="button"
        onClick={() => { wisselGebruiker(id); setOpen(false); }}
        className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${actief ? "bg-brand-50 ring-1 ring-brand-200" : "hover:bg-ink-50"}`}
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${actief ? "bg-brand-500 text-white" : "bg-ink-200 text-ink-600"}`}>{initialen(naam)}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-ink-900">{naam}</span>
          <span className="block text-xs text-ink-500">{ROL_LABEL[rol]}</span>
        </span>
        {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
      </button>
    );
  };

  const Groep = ({ titel, lijst }: { titel: string; lijst: typeof users }) =>
    lijst.length === 0 ? null : (
      <div className="space-y-0.5">
        <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{titel}</div>
        {lijst.map((u) => <Rij key={u.id} id={u.id} naam={u.naam} rol={u.rol} />)}
      </div>
    );

  return (
    <div className="fixed bottom-4 right-4 z-40 print:hidden">
      {open && (
        <div className="mb-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-ink-100 bg-ink-50 px-4 py-2.5">
            <span className="text-sm font-bold text-ink-900">Account wisselen <span className="text-xs font-normal text-ink-400">· demo</span></span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Sluiten" className="rounded p-1 text-ink-400 hover:bg-ink-100"><X className="h-4 w-4" /></button>
          </div>
          <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
            <Groep titel="Beheerders" lijst={beheerders} />
            <Groep titel="Werknemers" lijst={werknemers} />
          </div>
          <p className="border-t border-ink-100 px-4 py-2 text-[11px] leading-snug text-ink-400">
            Alle accounts delen dezelfde gegevens. Wijs als beheerder iets toe en wissel om het als werknemer te zien.
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full bg-ink-900 px-4 py-2.5 text-sm font-semibold text-white shadow-2xl ring-1 ring-black/10 hover:bg-ink-800"
        title="Wissel tussen beheerder- en werknemer-account (alleen in ontwikkeling)"
      >
        <UserCog className="h-4 w-4 text-brand-400" />
        <span className="max-w-[10rem] truncate">{currentUser ? `${currentUser.naam.split(" ")[0]} · ${ROL_LABEL[currentUser.rol]}` : "Kies account"}</span>
        <ChevronUp className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
    </div>
  );
}

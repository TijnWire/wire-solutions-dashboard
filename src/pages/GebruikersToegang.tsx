import { useState } from "react";
import { UserCog, Lock, type LucideIcon } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Gebruikersbeheer } from "./Gebruikersbeheer";
import { Toegang } from "./Toegang";

// Gecombineerde beheerpagina: gebruikers beheren + (voor eigenaar/HR) de toegang per rol/persoon.
export function GebruikersToegang() {
  const { currentUser } = useApp();
  const magToegang = currentUser?.rol === "eigenaar" || currentUser?.rol === "hr";
  const [tab, setTab] = useState<"gebruikers" | "toegang">("gebruikers");

  const tabs: { key: "gebruikers" | "toegang"; label: string; icon: LucideIcon }[] = [
    { key: "gebruikers", label: "Gebruikers", icon: UserCog },
    ...(magToegang ? [{ key: "toegang" as const, label: "Toegang", icon: Lock }] : []),
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-ink-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tab === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "toegang" && magToegang ? <Toegang /> : <Gebruikersbeheer />}
    </div>
  );
}

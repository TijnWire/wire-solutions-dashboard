import { useState } from "react";
import { Lock, Check, ChevronDown } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { WERKNEMER_TOEGANG, WERKNEMER_TOEGANG_KEYS } from "../lib/nav";
import type { User } from "../lib/types";

// Per werknemer aanklikken tot welke werk-onderdelen hij toegang heeft. Alleen de eigenaar.
// Persoonlijke onderdelen (Mijn werk, Verlof, Loonstroken, Boetes, Mededelingen, Kennisbank) blijven
// altijd zichtbaar; boekhouding/klanten/beheer zijn sowieso al niet toegankelijk voor werknemers.
export function Toegang() {
  const { users, currentUser, updateUser } = useApp();
  const [open, setOpen] = useState<string | null>(null);

  if (!currentUser) return null;
  if (currentUser.rol !== "eigenaar") {
    return <Card className="p-8 text-center text-sm text-ink-500">Alleen de eigenaar kan de toegang beheren.</Card>;
  }

  const werknemers = users.filter((u) => u.rol === "monteur");
  // undefined = volledige toegang; anders alleen de aangevinkte keys.
  const toegangVan = (u: User) => (u.toegang ?? WERKNEMER_TOEGANG_KEYS).filter((k) => WERKNEMER_TOEGANG_KEYS.includes(k));
  const magArea = (u: User, key: string) => toegangVan(u).includes(key);
  const toggle = (u: User, key: string) => {
    const s = new Set(toegangVan(u));
    s.has(key) ? s.delete(key) : s.add(key);
    updateUser(u.id, { toegang: [...s] });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Toegang</h2>
        <p className="text-sm text-ink-500">Klik per werknemer aan waar hij mee bezig is — alleen die onderdelen ziet hij in de app. De rest blijft verborgen. Boekhouding, Klanten &amp; Database en beheer zijn sowieso niet toegankelijk voor werknemers.</p>
      </div>

      {werknemers.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">Er zijn nog geen werknemers. Voeg ze toe bij Gebruikersbeheer.</Card>
      ) : (
        <div className="space-y-3">
          {werknemers.map((u) => {
            const uit = open === u.id;
            const n = toegangVan(u).length;
            const vol = !u.toegang; // undefined = volledige toegang
            return (
              <Card key={u.id} className="overflow-hidden">
                <button type="button" onClick={() => setOpen(uit ? null : u.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50/70">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">{u.initialen}</div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-ink-900">{u.naam}</div>
                    <div className="truncate text-xs text-ink-500">{vol ? "Volledige toegang" : `${n} van ${WERKNEMER_TOEGANG_KEYS.length} onderdelen`}</div>
                  </div>
                  <Badge tone={vol ? "green" : n === 0 ? "red" : "amber"}>{vol ? "Alles" : String(n)}</Badge>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${uit ? "" : "-rotate-90"}`} />
                </button>
                {uit && (
                  <div className="space-y-3 border-t border-ink-100 p-4">
                    <div className="flex flex-wrap gap-2">
                      {WERKNEMER_TOEGANG.map((a) => {
                        const aan = magArea(u, a.key);
                        return (
                          <button key={a.key} type="button" onClick={() => toggle(u, a.key)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${aan ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500 hover:bg-ink-200"}`}>
                            {aan ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />} {a.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-3">
                      <button type="button" onClick={() => updateUser(u.id, { toegang: undefined })} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">Volledige toegang</button>
                      <button type="button" onClick={() => updateUser(u.id, { toegang: [] })} className="rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">Alles uit</button>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

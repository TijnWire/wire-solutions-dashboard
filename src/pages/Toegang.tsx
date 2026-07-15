import { useState } from "react";
import { Lock, Check, ChevronDown } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { NAV, GROUPS, WERKNEMER_TOEGANG_KEYS } from "../lib/nav";
import type { User } from "../lib/types";

// Per werknemer instellen wat hij in de app ziet — ingedeeld zóals het menu (klikbare groepskoppen).
// Alleen de eigenaar. De regelbare onderdelen zijn de "werk"-onderdelen (WERKNEMER_TOEGANG); persoonlijke
// onderdelen (Mijn werk, Mededelingen, Verlof, Loonstroken, Boetes, Kennisbank) ziet iedereen standaard en
// staan met een slotje (altijd aan). Boekhouding/Klanten/beheer zijn sowieso al leiding-only.

// Menu-items die een monteur überhaupt kan zien (rol 'monteur'), gegroepeerd in de menu-volgorde.
const MONTEUR_GROEPEN = GROUPS
  .map((groep) => ({ groep, items: NAV.filter((i) => i.group === groep && i.roles.includes("monteur")) }))
  .filter((x) => x.items.length > 0);
const AANTAL_REGELBAAR = WERKNEMER_TOEGANG_KEYS.length;

export function Toegang() {
  const { users, currentUser, updateUser } = useApp();
  const [open, setOpen] = useState<string | null>(null); // welke werknemer is uitgeklapt
  const [dichteGroepen, setDichteGroepen] = useState<Set<string>>(new Set()); // groepen staan standaard open

  if (!currentUser) return null;
  if (currentUser.rol !== "eigenaar" && currentUser.rol !== "hr") {
    return <Card className="p-8 text-center text-sm text-ink-500">Alleen de eigenaar en HR kunnen de toegang beheren.</Card>;
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
  const toggleGroep = (g: string) => setDichteGroepen((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Toegang</h2>
        <p className="text-sm text-ink-500">
          Per werknemer, ingedeeld zoals het menu. Klik op een kop om die groep open/dicht te klappen en vink aan welke
          onderdelen hij ziet. Onderdelen met een <Lock className="inline h-3 w-3" />-slotje ziet iedereen standaard — die
          staan altijd aan. Boekhouding, Klanten &amp; Database en beheer zijn sowieso niet toegankelijk voor werknemers.
        </p>
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
                    <div className="truncate text-xs text-ink-500">{vol ? "Volledige toegang" : `${n} van ${AANTAL_REGELBAAR} onderdelen`}</div>
                  </div>
                  <Badge tone={vol ? "green" : n === 0 ? "red" : "amber"}>{vol ? "Alles" : String(n)}</Badge>
                  <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${uit ? "" : "-rotate-90"}`} />
                </button>

                {uit && (
                  <div className="space-y-2 border-t border-ink-100 p-4">
                    {MONTEUR_GROEPEN.map(({ groep, items }) => {
                      const groepDicht = dichteGroepen.has(groep);
                      const regelbaar = items.filter((i) => WERKNEMER_TOEGANG_KEYS.includes(i.key));
                      const aanCount = regelbaar.filter((i) => magArea(u, i.key)).length;
                      return (
                        <div key={groep} className="overflow-hidden rounded-xl border border-ink-200">
                          <button type="button" onClick={() => toggleGroep(groep)} className="flex w-full items-center gap-2 bg-ink-50/70 px-3 py-2 text-left hover:bg-ink-100">
                            <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${groepDicht ? "-rotate-90" : ""}`} />
                            <span className="flex-1 text-sm font-bold text-ink-800">{groep}</span>
                            {regelbaar.length > 0 && <span className="text-xs font-medium text-ink-400">{aanCount}/{regelbaar.length} aan</span>}
                          </button>
                          {!groepDicht && (
                            <div className="flex flex-wrap gap-2 p-3">
                              {items.map((i) => {
                                const Icon = i.icon;
                                if (!WERKNEMER_TOEGANG_KEYS.includes(i.key)) {
                                  // Persoonlijk onderdeel — altijd zichtbaar, niet uit te zetten.
                                  return (
                                    <span key={i.key} title="Dit ziet iedereen standaard" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-medium text-ink-400">
                                      <Icon className="h-4 w-4" /> {i.label} <Lock className="h-3.5 w-3.5" />
                                    </span>
                                  );
                                }
                                const aan = magArea(u, i.key);
                                return (
                                  <button key={i.key} type="button" onClick={() => toggle(u, i.key)} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${aan ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-500 hover:bg-ink-200"}`}>
                                    <Icon className="h-4 w-4" /> {i.label} {aan ? <Check className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

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

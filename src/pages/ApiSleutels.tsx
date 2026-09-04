import { useState } from "react";
import { Plug, Pencil, Save, Lock, Eye, EyeOff } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Bevestig } from "../components/ui";
import type { Instellingen as InstellingenT } from "../lib/types";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const statusInfo: Record<string, { label: string; cls: string }> = {
  actief: { label: "Actief", cls: "bg-green-50 text-green-700 ring-green-200" },
  ingesteld: { label: "Ingesteld", cls: "bg-green-50 text-green-700 ring-green-200" },
  demo: { label: "Demo", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  niet: { label: "Niet ingesteld", cls: "bg-ink-100 text-ink-500 ring-ink-200" },
};

// Toon een sleutel afgeschermd: alleen bolletjes met de laatste 4 tekens als herkenningshint.
// Zo staat een geheime sleutel nooit zomaar leesbaar op het scherm (ook niet als iemand meekijkt).
function maskeer(waarde: string): string {
  if (!waarde) return "";
  if (waarde.length <= 4) return "••••";
  return "••••••••" + waarde.slice(-4);
}

// Aparte pagina: alle koppelingen/API-sleutels en hun status.
export function ApiSleutels() {
  const { instellingen, updateInstellingen, currentUser } = useApp();
  const [bewerkId, setBewerkId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<InstellingenT>>({});
  const [toon, setToon] = useState<Record<string, boolean>>({}); // per veld: geheime waarde tijdelijk zichtbaar?
  const [bevestig, setBevestig] = useState<{ id: string; naam: string } | null>(null);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Lock className="mx-auto h-10 w-10 text-ink-300" />
        <h2 className="mt-3 text-lg font-bold text-ink-900">Geen toegang</h2>
        <p className="mt-1 text-sm text-ink-500">De API-sleutels zijn alleen voor de beheerder en eigenaar.</p>
      </div>
    );
  }

  const speechOK = !!((window as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition || (window as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);

  type Integratie = { id: string; naam: string; beschr: string; status: string; velden?: [keyof InstellingenT, string][] };
  const integraties: Integratie[] = [
    { id: "idb", naam: "Lokale opslag (IndexedDB)", beschr: "Alles wordt veilig op dit apparaat bewaard.", status: "actief" },
    { id: "supabase", naam: "Centrale database (Supabase)", beschr: "Deelt en synchroniseert gegevens tussen alle apparaten en het hele team.", status: instellingen.supabaseUrl ? "ingesteld" : "niet", velden: [["supabaseUrl", "Project-URL"], ["supabaseKey", "Anon key"]] },
    { id: "ai", naam: "AI (OpenRouter, server-side)", beschr: "Slimme scan van PDF's/formulieren en de assistent. De sleutel staat veilig op de server (OpenRouter); er hoeft niets op dit apparaat te worden ingevuld.", status: "actief" },
    { id: "speech", naam: "Spraakherkenning (browser)", beschr: "Voor de live vertaling aan de deur. Werkt het best in Chrome/Edge.", status: speechOK ? "actief" : "niet" },
  ];

  const startBewerken = (i: Integratie) => {
    // Zet het concept op de huidige echte waarden, zodat bewerken vanaf de bestaande sleutels vertrekt.
    const d: Partial<InstellingenT> = {};
    i.velden!.forEach(([k]) => { (d as Record<string, unknown>)[k] = instellingen[k]; });
    setDraft(d);
    setToon({});
    setBewerkId(i.id);
  };

  const annuleer = () => { setBewerkId(null); setDraft({}); setToon({}); };

  // Pas na bevestiging schrijven we de nieuwe waarden echt weg.
  const bevestigOpslaan = () => {
    updateInstellingen(draft);
    setBewerkId(null);
    setDraft({});
    setToon({});
    setBevestig(null);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-500">Overzicht van alle koppelingen en hun status. De sleutels staan afgeschermd — klik op Wijzigen om ze aan te passen.</p>
      {integraties.map((i) => {
        const si = statusInfo[i.status];
        const open = bewerkId === i.id;
        return (
          <Card key={i.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-start gap-3">
                <div className="rounded-lg bg-ink-100 p-2 text-ink-600"><Plug className="h-4 w-4" /></div>
                <div>
                  <div className="text-sm font-semibold text-ink-900">{i.naam}</div>
                  <div className="text-xs text-ink-500">{i.beschr}</div>
                </div>
              </div>
              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${si.cls}`}>{si.label}</span>
            </div>
            {i.velden && (
              <div className="mt-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {i.velden.map(([k, ph]) => {
                    const echteWaarde = (instellingen[k] ?? "") as string;
                    const zichtbaar = !!toon[k];
                    if (!open) {
                      // Dicht: afgeschermde, niet-bewerkbare weergave (bolletjes + laatste 4 tekens).
                      return (
                        <input
                          key={k}
                          value={echteWaarde ? maskeer(echteWaarde) : ""}
                          placeholder={ph + " — niet ingesteld"}
                          disabled
                          className={veld + " cursor-not-allowed bg-ink-50 font-mono tracking-wide text-ink-500"}
                        />
                      );
                    }
                    // Open (bewerken): bewerkbaar veld, standaard verborgen, met oog-knop om te tonen.
                    return (
                      <div key={k} className="relative">
                        <input
                          type={zichtbaar ? "text" : "password"}
                          value={(draft[k] ?? "") as string}
                          onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                          placeholder={ph}
                          autoComplete="off"
                          className={veld + " pr-10"}
                        />
                        <button
                          type="button"
                          onClick={() => setToon((t) => ({ ...t, [k]: !t[k] }))}
                          className="absolute inset-y-0 right-0 flex items-center px-3 text-ink-400 hover:text-ink-700"
                          title={zichtbaar ? "Verbergen" : "Tonen"}
                        >
                          {zichtbaar ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  {open ? (
                    <>
                      <button type="button" onClick={annuleer} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-50">
                        Annuleren
                      </button>
                      <button type="button" onClick={() => setBevestig({ id: i.id, naam: i.naam })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                        <Save className="h-3.5 w-3.5" /> Opslaan
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => startBewerken(i)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
                      <Pencil className="h-3.5 w-3.5" /> Wijzigen
                    </button>
                  )}
                </div>
              </div>
            )}
          </Card>
        );
      })}

      <Bevestig
        open={!!bevestig}
        titel="Weet je het zeker?"
        tekst={`Je staat op het punt de sleutel(s) van "${bevestig?.naam ?? ""}" aan te passen. Een verkeerde sleutel kan deze koppeling voor het hele team stilleggen. Weet je zeker dat je dit wilt opslaan?`}
        bevestigLabel="Ja, opslaan"
        bevestigTone="brand"
        onBevestig={bevestigOpslaan}
        onAnnuleer={() => setBevestig(null)}
      />
    </div>
  );
}

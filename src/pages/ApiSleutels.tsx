import { useState } from "react";
import { Plug, Pencil, Save, Lock } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import type { Instellingen as InstellingenT } from "../lib/types";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

const statusInfo: Record<string, { label: string; cls: string }> = {
  actief: { label: "Actief", cls: "bg-green-50 text-green-700 ring-green-200" },
  ingesteld: { label: "Ingesteld", cls: "bg-green-50 text-green-700 ring-green-200" },
  demo: { label: "Demo", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  niet: { label: "Niet ingesteld", cls: "bg-ink-100 text-ink-500 ring-ink-200" },
};

// Aparte pagina: alle koppelingen/API-sleutels en hun status.
export function ApiSleutels() {
  const { instellingen, updateInstellingen, currentUser } = useApp();
  const [bewerkId, setBewerkId] = useState<string | null>(null);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
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
    { id: "wa", naam: "WhatsApp Business API", beschr: "Verstuurt bevestigingen en herinneringen automatisch i.p.v. handmatig openen.", status: instellingen.whatsappToken ? "ingesteld" : "niet", velden: [["whatsappToken", "API-token"]] },
    { id: "maps", naam: "Google Maps", beschr: "Nu: gratis kaartlinks voor navigatie. Met API-sleutel: echte route-optimalisatie.", status: instellingen.googleMapsKey ? "ingesteld" : "demo", velden: [["googleMapsKey", "API-sleutel"]] },
    { id: "claude", naam: "Claude (AI & vertaling)", beschr: "Slimme vertaling en AI-chat. Nu een gratis vertaaldienst als demo.", status: instellingen.claudeKey ? "ingesteld" : "demo", velden: [["claudeKey", "API-sleutel"]] },
    { id: "speech", naam: "Spraakherkenning (browser)", beschr: "Voor de live vertaling aan de deur. Werkt het best in Chrome/Edge.", status: speechOK ? "actief" : "niet" },
  ];

  return (
    <div className="space-y-3">
      <div className="mb-1">
        <h2 className="text-xl font-bold text-ink-900">API-sleutels</h2>
        <p className="text-sm text-ink-500">Overzicht van alle koppelingen en hun status. Vul de sleutels in om de bijbehorende functies aan te zetten.</p>
      </div>
      {integraties.map((i) => {
        const si = statusInfo[i.status];
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
            {i.velden && (() => {
              const open = bewerkId === i.id;
              return (
                <div className="mt-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    {i.velden!.map(([k, ph]) => (
                      <input
                        key={k}
                        value={instellingen[k]}
                        onChange={(e) => updateInstellingen({ [k]: e.target.value })}
                        placeholder={ph}
                        disabled={!open}
                        className={veld + (open ? "" : " cursor-not-allowed bg-ink-50 text-ink-500")}
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-end">
                    {open ? (
                      <button type="button" onClick={() => setBewerkId(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700">
                        <Save className="h-3.5 w-3.5" /> Klaar
                      </button>
                    ) : (
                      <button type="button" onClick={() => setBewerkId(i.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
                        <Pencil className="h-3.5 w-3.5" /> Wijzigen
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}
          </Card>
        );
      })}
    </div>
  );
}

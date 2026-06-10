import { useEffect, useState } from "react";
import { Building2, Plug, Activity, CheckCircle2, Info, AlertTriangle, RotateCcw, Database, Pencil, Save, Lock } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Bevestig } from "../components/ui";
import { berekenMeldingen } from "../lib/meldingen";
import type { Instellingen as InstellingenT } from "../lib/types";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

const statusInfo: Record<string, { label: string; cls: string }> = {
  actief: { label: "Actief", cls: "bg-green-50 text-green-700 ring-green-200" },
  ingesteld: { label: "Ingesteld", cls: "bg-green-50 text-green-700 ring-green-200" },
  demo: { label: "Demo", cls: "bg-amber-50 text-amber-700 ring-amber-200" },
  niet: { label: "Niet ingesteld", cls: "bg-ink-100 text-ink-500 ring-ink-200" },
};

function BedrijfTab({ isLeiding }: { isLeiding: boolean }) {
  const { bedrijf, updateBedrijf } = useApp();
  const [bewerk, setBewerk] = useState(false);
  const [draft, setDraft] = useState(bedrijf);

  // Houd het concept gelijk met de opgeslagen gegevens zolang je niet bewerkt
  useEffect(() => { if (!bewerk) setDraft(bedrijf); }, [bedrijf, bewerk]);

  const opslaan = () => { updateBedrijf(draft); setBewerk(false); };
  const annuleren = () => { setDraft(bedrijf); setBewerk(false); };

  const rij = (label: string, key: keyof typeof bedrijf, ph = "") => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        value={draft[key] ?? ""}
        disabled={!bewerk}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        placeholder={ph}
        className={veld + (bewerk ? "" : " bg-ink-50 text-ink-600")}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <img src="/wire-logo.png" alt="Wire Solutions" className="h-16 w-auto" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink-900">Bedrijfslogo</div>
          <p className="text-xs text-ink-500">Dit logo staat op het dashboard, het inlogscherm en de facturen. Wil je het wijzigen? Vervang dan <code className="rounded bg-ink-100 px-1">public/wire-logo.png</code> (of laat het mij doen).</p>
        </div>
      </Card>

      {!isLeiding ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-ink-500">
          <Lock className="h-5 w-5 text-ink-400" />
          Alleen de beheerder heeft toegang tot de bedrijfsgegevens.
        </Card>
      ) : (
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-ink-900">Bedrijfsgegevens</h3>
              <p className="text-xs text-ink-500">Deze gegevens komen automatisch op elke factuur.</p>
            </div>
            {bewerk ? (
              <div className="flex items-center gap-2">
                <button type="button" onClick={annuleren} className="rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
                <button type="button" onClick={opslaan} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">
                  <Save className="h-4 w-4" /> Opslaan
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setBewerk(true)} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                <Pencil className="h-4 w-4" /> Wijzigen
              </button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {rij("Bedrijfsnaam", "naam")}
            {rij("E-mail", "email")}
            {rij("Adres", "adres")}
            {rij("Postcode + plaats", "postcodePlaats")}
            {rij("Telefoon", "telefoon")}
            {rij("KvK-nummer", "kvk")}
            {rij("BTW-nummer", "btw")}
            {rij("IBAN", "iban")}
            {rij("BIC", "bic")}
          </div>

          <p className="text-xs text-ink-400">
            {bewerk ? "Klik op Opslaan om de wijzigingen te bewaren." : "Klik op Wijzigen om de gegevens aan te passen."}
          </p>
        </Card>
      )}
    </div>
  );
}

function IntegratiesTab({ isLeiding }: { isLeiding: boolean }) {
  const { instellingen, updateInstellingen } = useApp();
  const [bewerkId, setBewerkId] = useState<string | null>(null); // welke koppeling staat open om te wijzigen
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
      <p className="text-sm text-ink-500">Overzicht van alle koppelingen en hun status. Sleutels invullen kan straks voor de cloud-versie.</p>
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
            {i.velden && isLeiding && (() => {
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

function SysteemTab({ isLeiding }: { isLeiding: boolean }) {
  const { bedrijf, instellingen, verlof, projects } = useApp();
  const meldingen = berekenMeldingen(bedrijf, instellingen, verlof, projects);
  const [opslag, setOpslag] = useState<{ used: number; quota: number } | null>(null);
  const [reset, setReset] = useState(false);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setOpslag({ used: e.usage || 0, quota: e.quota || 0 })).catch(() => {});
  }, []);

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";
  const pct = opslag && opslag.quota ? Math.min(100, Math.round((opslag.used / opslag.quota) * 100)) : 0;

  const doeReset = () => {
    try { indexedDB.deleteDatabase("wire-solutions"); } catch { /* */ }
    try { localStorage.clear(); } catch { /* */ }
    location.reload();
  };

  return (
    <div className="space-y-4">
      {/* Meldingen */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><Activity className="h-4 w-4 text-ink-500" /> Meldingen</h3>
        {meldingen.length === 0 ? (
          <div className="flex items-center gap-2 text-sm text-green-700"><CheckCircle2 className="h-5 w-5" /> Alles in orde — geen meldingen.</div>
        ) : (
          <div className="space-y-2">
            {meldingen.map((m) => (
              <div key={m.id} className={`flex items-start gap-3 rounded-lg border p-3 ${m.ernst === "waarschuwing" ? "border-amber-200 bg-amber-50" : "border-ink-200 bg-white"}`}>
                {m.ernst === "waarschuwing" ? <AlertTriangle className="h-5 w-5 shrink-0 text-amber-500" /> : <Info className="h-5 w-5 shrink-0 text-brand-500" />}
                <div>
                  <div className="text-sm font-semibold text-ink-900">{m.titel}</div>
                  <div className="text-xs text-ink-600">{m.tekst}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Opslag */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><Database className="h-4 w-4 text-ink-500" /> Opslag op dit apparaat</h3>
        {opslag ? (
          <>
            <div className="mb-1.5 flex justify-between text-sm text-ink-600"><span>{mb(opslag.used)} gebruikt</span><span>van ± {mb(opslag.quota)}</span></div>
            <div className="h-2.5 overflow-hidden rounded-full bg-ink-100"><div className={`h-full rounded-full ${pct > 85 ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} /></div>
            {pct > 85 && <p className="mt-2 text-xs text-red-600">De opslag is bijna vol. Ruim oude voorschouwen/foto's op of zet de cloud-database aan.</p>}
          </>
        ) : (
          <p className="text-sm text-ink-400">Opslaginfo niet beschikbaar in deze browser.</p>
        )}
      </Card>

      {/* App-info + onderhoud */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-ink-900">App</h3>
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-600">
          <span>Wire Solutions dashboard · versie 0.1.0 (lokale demo)</span>
          {isLeiding && (
            <button type="button" onClick={() => setReset(true)} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
              <RotateCcw className="h-4 w-4" /> Voorbeelddata opnieuw instellen
            </button>
          )}
        </div>
      </Card>

      <Bevestig
        open={reset}
        titel="Alles opnieuw instellen?"
        tekst="Dit verwijdert alle ingevoerde gegevens op dit apparaat en zet de voorbeelddata terug. Dit kan niet ongedaan worden gemaakt."
        bevestigLabel="Opnieuw instellen"
        onBevestig={doeReset}
        onAnnuleer={() => setReset(false)}
      />
    </div>
  );
}

export function Instellingen() {
  const { currentUser } = useApp();
  const [tab, setTab] = useState<"bedrijf" | "integraties" | "systeem">("bedrijf");
  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";

  // Instellingen zijn alleen voor de leiding — werknemers krijgen geen toegang.
  if (!isLeiding) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Lock className="mx-auto h-10 w-10 text-ink-300" />
        <h2 className="mt-3 text-lg font-bold text-ink-900">Geen toegang</h2>
        <p className="mt-1 text-sm text-ink-500">Instellingen zijn alleen voor de beheerder en eigenaar.</p>
      </div>
    );
  }

  const tabs = [
    { key: "bedrijf", label: "Bedrijf & logo", icon: Building2 },
    { key: "integraties", label: "Integraties", icon: Plug },
    { key: "systeem", label: "Systeem & meldingen", icon: Activity },
  ] as const;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Instellingen</h2>
        <p className="text-sm text-ink-500">Bedrijfsgegevens, integraties en de systeemstatus van de app.</p>
      </div>

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

      {tab === "bedrijf" && <BedrijfTab isLeiding={isLeiding} />}
      {tab === "integraties" && <IntegratiesTab isLeiding={isLeiding} />}
      {tab === "systeem" && <SysteemTab isLeiding={isLeiding} />}
    </div>
  );
}

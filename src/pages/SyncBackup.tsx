import { useState } from "react";
import { CheckCircle2, AlertTriangle, RotateCcw, Database, Lock } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Bevestig } from "../components/ui";
import { sbSyncTest, sbAantallen, type SyncTest } from "../lib/supabase";

// Aparte pagina: sync-status van dit apparaat + de automatische veiligheidskopie (met herstel).
export function SyncBackup() {
  const { currentUser, synced, backupInfo, herstelBackup, buurtaanpak, voorschouwen, saneringen, rondes, afspraken, facturen, projects, taken } = useApp();
  const [herstelVraag, setHerstelVraag] = useState(false);
  const [herstelKlaar, setHerstelKlaar] = useState(false);
  const [test, setTest] = useState<SyncTest | null>(null);
  const [centraal, setCentraal] = useState<Record<string, number> | null>(null);
  const [testBezig, setTestBezig] = useState(false);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  if (!isLeiding) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <Lock className="mx-auto h-10 w-10 text-ink-300" />
        <h2 className="mt-3 text-lg font-bold text-ink-900">Geen toegang</h2>
        <p className="mt-1 text-sm text-ink-500">Sync & back-up zijn alleen voor de beheerder en eigenaar.</p>
      </div>
    );
  }

  const doeHerstel = async () => { await herstelBackup(); setHerstelVraag(false); setHerstelKlaar(true); };
  const syncTesten = async () => {
    setTestBezig(true);
    try {
      setTest(await sbSyncTest());
      const a = await sbAantallen();
      setCentraal(a.ok ? a.aantallen : null);
    } finally { setTestBezig(false); }
  };
  const vergelijk = [
    { label: "Buurtaanpak", key: "buurtaanpak", lokaal: buurtaanpak.length },
    { label: "Voorschouwen", key: "voorschouwen", lokaal: voorschouwen.length },
    { label: "Saneringen", key: "saneringen", lokaal: saneringen.length },
    { label: "Brievenrondes", key: "rondes", lokaal: rondes.length },
    { label: "Afspraken", key: "afspraken", lokaal: afspraken.length },
    { label: "Facturen", key: "facturen", lokaal: facturen.length },
    { label: "Projecten", key: "projects", lokaal: projects.length },
    { label: "Taken", key: "taken", lokaal: taken.length },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Sync &amp; back-up</h2>
        <p className="text-sm text-ink-500">Of dit apparaat met het team synchroniseert, en de automatische veiligheidskopie.</p>
      </div>

      {/* Sync-status van DIT apparaat */}
      <Card className={`p-4 ${synced ? "border-green-300 bg-green-50/60" : "border-amber-300 bg-amber-50/60"}`}>
        <div className="flex flex-wrap items-start gap-3">
          <div className={`rounded-lg p-2 ${synced ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
            {synced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink-900">{synced ? "Dit apparaat is gesynchroniseerd" : "Dit apparaat synchroniseert nu NIET"}</div>
            <div className="text-xs text-ink-500">
              {synced
                ? "Wijzigingen worden automatisch gedeeld met alle apparaten en het hele team."
                : "Je werkt nu lokaal — wijzigingen blijven op dit apparaat. Log uit en weer in om te synchroniseren. Test hiernaast wat er misgaat."}
            </div>
          </div>
          <button type="button" onClick={() => void syncTesten()} disabled={testBezig} className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
            {testBezig ? "Bezig…" : "Sync testen"}
          </button>
        </div>
        {test && (
          <div className={`mt-3 rounded-lg p-3 text-xs ${test.schrijven ? "bg-green-100 text-green-800" : "bg-red-50 text-red-700"}`}>
            <div className="mb-1 flex flex-wrap gap-x-3 gap-y-0.5 font-semibold">
              <span>{test.sessie ? "✓" : "✗"} Verbonden{test.email ? ` (${test.email})` : ""}</span>
              <span>{test.lezen ? "✓" : "✗"} Lezen</span>
              <span>{test.schrijven ? "✓" : "✗"} Schrijven</span>
            </div>
            {test.melding}
          </div>
        )}
        {test && (
          <div className="mt-3 overflow-hidden rounded-lg border border-ink-200">
            <div className="grid grid-cols-3 bg-ink-50 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">
              <span>Onderdeel</span><span className="text-right">Dit apparaat</span><span className="text-right">Centrale database</span>
            </div>
            {vergelijk.map((r) => {
              const c = centraal ? centraal[r.key] ?? 0 : null;
              const mismatch = c !== null && ((r.lokaal > 0 && c === 0) || (c > 0 && r.lokaal === 0));
              return (
                <div key={r.key} className={`grid grid-cols-3 px-3 py-1.5 text-xs ${mismatch ? "bg-amber-50" : ""}`}>
                  <span className="text-ink-600">{r.label}</span>
                  <span className="text-right font-medium text-ink-800">{r.lokaal}</span>
                  <span className={`text-right font-medium ${c === null ? "text-ink-300" : mismatch ? "text-amber-700" : "text-ink-800"}`}>{c === null ? "—" : c}</span>
                </div>
              );
            })}
            <div className="border-t border-ink-100 px-3 py-1.5 text-[11px] text-ink-500">
              Staat er centraal 0 terwijl dit apparaat data heeft? Dan komt de data niet in de cloud. Anders verschijnt alles vanzelf op alle apparaten.
            </div>
          </div>
        )}
      </Card>

      {/* Automatische veiligheidskopie */}
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="rounded-lg bg-ink-100 p-2 text-ink-600"><Database className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink-900">Automatische veiligheidskopie</div>
          <div className="text-xs text-ink-500">
            {backupInfo
              ? `Laatste back-up: ${new Date(backupInfo.tijd).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · ${backupInfo.totaal} items, veilig op dit apparaat. Een lege staat overschrijft de back-up nooit.`
              : "Nog geen back-up — wordt automatisch gemaakt zodra er gegevens zijn."}
          </div>
        </div>
        {backupInfo && (
          <button type="button" onClick={() => setHerstelVraag(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <RotateCcw className="h-4 w-4" /> Herstellen
          </button>
        )}
      </Card>

      <Bevestig open={herstelVraag} titel="Gegevens herstellen?" tekst={backupInfo ? `Alle gegevens worden teruggezet naar de veiligheidskopie van ${new Date(backupInfo.tijd).toLocaleString("nl-NL")} (${backupInfo.totaal} items). Recentere wijzigingen die niet in de kopie staan, worden overschreven.` : ""} bevestigLabel="Ja, herstellen" bevestigTone="brand" onBevestig={() => void doeHerstel()} onAnnuleer={() => setHerstelVraag(false)} />
      {herstelKlaar && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setHerstelKlaar(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-2xl">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100"><CheckCircle2 className="h-7 w-7 text-green-600" /></div>
            <h3 className="mt-3 text-base font-bold text-ink-900">Gegevens hersteld ✓</h3>
            <p className="mt-1 text-sm text-ink-500">De veiligheidskopie is teruggezet. Dit wordt nu ook met je andere apparaten gesynchroniseerd.</p>
            <button type="button" onClick={() => setHerstelKlaar(false)} className="mt-4 rounded-lg bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">Klaar</button>
          </div>
        </div>
      )}
    </div>
  );
}

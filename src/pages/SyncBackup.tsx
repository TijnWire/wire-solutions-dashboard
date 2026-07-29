import { useState } from "react";
import { CheckCircle2, AlertTriangle, RotateCcw, Database, Lock, Loader2, Image as ImageIcon } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Bevestig } from "../components/ui";
import { verhuisAlleFotos, type VerhuisVoortgang } from "../lib/fotoOpslag";
import { sbSyncTest, sbAantallen, sbDbStatus, sbHerstelSpiegel, sbKoppelAccounts, type SyncTest, type DbStatus } from "../lib/supabase";

// Aparte pagina: sync-status van dit apparaat + de automatische veiligheidskopie (met herstel).
export function SyncBackup() {
  const { currentUser, users, synced, backupInfo, herstelBackup, buurtaanpak, voorschouwen, saneringen, rondes, afspraken, facturen, projects, taken } = useApp();
  const [verhuis, setVerhuis] = useState<VerhuisVoortgang | null>(null);
  const [verhuisFout, setVerhuisFout] = useState("");

  const startVerhuizing = async () => {
    setVerhuisFout("");
    setVerhuis({ gedaan: 0, totaal: 0, verplaatst: 0, bespaard: 0 });
    const uit = await verhuisAlleFotos(setVerhuis);
    if (uit.fout) setVerhuisFout(uit.fout);
    setVerhuis(uit);
  };

  const [herstelVraag, setHerstelVraag] = useState(false);
  const [herstelKlaar, setHerstelKlaar] = useState(false);
  const [test, setTest] = useState<SyncTest | null>(null);
  const [centraal, setCentraal] = useState<Record<string, number> | null>(null);
  const [testBezig, setTestBezig] = useState(false);
  const [dbs, setDbs] = useState<DbStatus | { fout: string } | null>(null);
  const [dbsBezig, setDbsBezig] = useState(false);
  const [spiegelMelding, setSpiegelMelding] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
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
  const dbsOphalen = async () => {
    setDbsBezig(true);
    setSpiegelMelding("");
    try { setDbs(await sbDbStatus()); } finally { setDbsBezig(false); }
  };
  const spiegelHerstellen = async () => {
    setDbsBezig(true);
    setSpiegelMelding("");
    try {
      const r = await sbHerstelSpiegel();
      setSpiegelMelding(r.ok
        ? `Klaar — ${r.onderdelen ?? 0} onderdelen, ${r.accounts ?? 0} inlogaccounts en ${r.rollen ?? 0} rollen naar Supabase gekopieerd.`
        : `Niet gelukt: ${r.error ?? "onbekende fout"}`);
      setDbs(await sbDbStatus());
    } finally { setDbsBezig(false); }
  };
  const accountsKoppelen = async () => {
    setDbsBezig(true);
    setSpiegelMelding("");
    try {
      const r = await sbKoppelAccounts();
      setSpiegelMelding(r.ok
        ? `${r.gekoppeld ?? 0} medewerkers hebben nu een inlogaccount in de centrale database (${r.aanwezig ?? 0} hadden er al een).` +
          (r.overgeslagen?.length ? ` Overgeslagen (geen wachtwoord bekend): ${r.overgeslagen.join(", ")}.` : "")
        : `Niet gelukt: ${r.error ?? "onbekende fout"}`);
      setDbs(await sbDbStatus());
    } finally { setDbsBezig(false); }
  };
  const isEigenaarOfHr = currentUser.rol === "eigenaar" || currentUser.rol === "hr";

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
      <p className="text-sm text-ink-500">Of dit apparaat met het team synchroniseert, en de automatische veiligheidskopie.</p>

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

      {/* De twee databases naast elkaar: Cloudflare is de baas, Supabase is de tweede kopie. */}
      <Card className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="text-sm font-bold text-ink-900">De twee databases</div>
            <div className="text-xs text-ink-500">
              Cloudflare is de hoofddatabase. Supabase houdt een tweede kopie bij en springt in als Cloudflare hapert.
            </div>
          </div>
          <button type="button" onClick={() => void dbsOphalen()} disabled={dbsBezig} className="shrink-0 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50">
            {dbsBezig ? "Bezig…" : "Controleren"}
          </button>
        </div>

        {dbs && "fout" in dbs && (
          <div className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">Kon de status niet ophalen: {dbs.fout}</div>
        )}

        {dbs && !("fout" in dbs) && (
          <>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className={`rounded-lg border p-3 ${dbs.cloudflare.gezond ? "border-green-300 bg-green-50/60" : "border-red-300 bg-red-50/60"}`}>
                <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  <Database className="h-4 w-4" /> Cloudflare {dbs.cloudflare.gezond ? "✓" : "✗"}
                </div>
                <div className="mt-1 text-xs text-ink-600">
                  {dbs.cloudflare.gezond
                    ? `${dbs.cloudflare.onderdelen} onderdelen · ${dbs.cloudflare.accounts} inlogaccounts`
                    : dbs.cloudflare.fout || "Niet bereikbaar"}
                </div>
              </div>
              <div className={`rounded-lg border p-3 ${!dbs.supabase.aan ? "border-ink-200 bg-ink-50" : dbs.supabase.gezond ? "border-green-300 bg-green-50/60" : "border-amber-300 bg-amber-50/60"}`}>
                <div className="flex items-center gap-2 text-sm font-bold text-ink-900">
                  <Database className="h-4 w-4" /> Supabase {!dbs.supabase.aan ? "—" : dbs.supabase.gezond ? "✓" : "✗"}
                </div>
                <div className="mt-1 text-xs text-ink-600">
                  {dbs.supabase.gezond
                    ? `${dbs.supabase.onderdelen ?? 0} onderdelen · ${dbs.supabase.accounts ?? 0} inlogaccounts`
                    : dbs.supabase.melding}
                </div>
              </div>
            </div>

            <div className={`mt-2 rounded-lg px-3 py-2 text-xs ${dbs.gelijk ? "bg-green-100 text-green-800" : "bg-amber-50 text-amber-800"}`}>
              {dbs.gelijk
                ? "Beide databases lopen gelijk — er staat overal hetzelfde in."
                : "De twee databases lopen nog niet gelijk. Voor het werken maakt dat niets uit (Cloudflare is leidend), maar de reservekopie is dan niet compleet."}
            </div>

            {/* Niet elk teamlid heeft automatisch een inlogaccount in de centrale database: wie er nog een
                van vóór de centrale login heeft, kan alleen inloggen op een apparaat waar de teamlijst al
                staat. Deze knop maakt die accounts alsnog aan uit de bestaande wachtwoorden. */}
            {isEigenaarOfHr && dbs.cloudflare.gezond && dbs.cloudflare.accounts < users.length && (
              <div className="mt-2 rounded-lg border border-amber-300 bg-amber-50 p-3">
                <div className="text-xs font-semibold text-amber-900">
                  {users.length - dbs.cloudflare.accounts} van de {users.length} medewerkers kan nog niet op een nieuw apparaat inloggen
                </div>
                <div className="mt-0.5 text-xs text-amber-800">
                  Hun account bestaat alleen op hun eigen telefoon. Met onderstaande knop krijgen ze allemaal een
                  echt inlogaccount — met hun huidige wachtwoord, niemand hoeft iets te wijzigen.
                </div>
                <button type="button" onClick={() => void accountsKoppelen()} disabled={dbsBezig} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">
                  <Database className="h-4 w-4" /> Alle accounts koppelen
                </button>
              </div>
            )}

            {isEigenaarOfHr && dbs.supabase.aan && !dbs.gelijk && (
              <button type="button" onClick={() => void spiegelHerstellen()} disabled={dbsBezig} className="mt-2 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60">
                <RotateCcw className="h-4 w-4" /> Reservekopie bijwerken
              </button>
            )}
          </>
        )}

        {spiegelMelding && <div className="mt-2 rounded-lg bg-ink-50 px-3 py-2 text-xs text-ink-700">{spiegelMelding}</div>}
      </Card>

      {/* Foto's naar de fotoruimte */}
      {/* De voorschouwfoto's zaten als tekst ín de gegevens die tussen alle apparaten heen en weer
          gaan: één blok van bijna 18 MB, dat bij elke toegevoegde foto opnieuw rondging. Dit knopje
          verhuist ze naar de fotoruimte (R2), waarna er alleen een verwijzing van een paar tientallen
          tekens overblijft. Het verplaatsen gebeurt op de server — er gaat geen megabyte over jouw
          verbinding — en het kan zonder gevaar meerdere keren gedraaid worden. */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-brand-50 p-2 text-brand-600"><ImageIcon className="h-5 w-5" /></div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold text-ink-900">Foto's uit de synchronisatie halen</div>
            <div className="text-xs text-ink-500">
              Verhuist de bestaande voorschouwfoto's naar de fotoruimte. Daarna synchroniseert de app
              merkbaar sneller, vooral op een telefoon. Veilig om vaker te doen.
            </div>
          </div>
          <button
            type="button"
            onClick={() => void startVerhuizing()}
            disabled={!!verhuis && verhuis.gedaan < verhuis.totaal}
            className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {verhuis && verhuis.gedaan < verhuis.totaal
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Bezig…</>
              : <><ImageIcon className="h-4 w-4" /> Foto's verplaatsen</>}
          </button>
        </div>

        {verhuis && (
          <div className="mt-3">
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${verhuis.totaal ? Math.round((verhuis.gedaan / verhuis.totaal) * 100) : 0}%` }} />
            </div>
            <div className="mt-1.5 text-xs text-ink-600">
              {verhuis.gedaan} van de {verhuis.totaal} onderdelen · <b>{verhuis.verplaatst} foto's verplaatst</b>
              {verhuis.bespaard > 0 && ` · ${(verhuis.bespaard / 1_000_000).toFixed(1)} MB uit de synchronisatie gehaald`}
              {verhuis.gedaan >= verhuis.totaal && verhuis.totaal > 0 && " · klaar"}
            </div>
          </div>
        )}
        {verhuisFout && <div className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{verhuisFout}</div>}
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

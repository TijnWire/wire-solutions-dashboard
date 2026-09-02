import { useState } from "react";
import { CheckCircle2, AlertTriangle, RotateCcw, Database, Lock, Loader2, RefreshCw } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Bevestig } from "../components/ui";
import { magAlles } from "../lib/rechten";
import { sbSyncTest, sbAantallen, sbDbStatus, sbHerstelSpiegel, sbKoppelAccounts, type SyncTest, type DbStatus, type SyncStap } from "../lib/supabase";

// De drie stappen van de test, in de volgorde waarin ze gebeuren.
const STAP_LABELS: [SyncStap, string][] = [
  ["sessie", "Ingelogd"],
  ["lezen", "Gegevens lezen"],
  ["schrijven", "Gegevens opslaan"],
];

// Aparte pagina: sync-status van dit apparaat + de automatische veiligheidskopie (met herstel).
export function SyncBackup() {
  const { currentUser, users, synced, backupInfo, herstelBackup, buurtaanpak, voorschouwen, saneringen, rondes, afspraken, facturen, projects, taken } = useApp();

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

  const [stappen, setStappen] = useState<Partial<Record<SyncStap, boolean>>>({});

  const doeHerstel = async () => { await herstelBackup(); setHerstelVraag(false); setHerstelKlaar(true); };
  const syncTesten = async () => {
    setTestBezig(true);
    setStappen({});
    try {
      // Elke stap meldt zich zodra hij klaar is; dan zie je bij een fout wélke stap strandde.
      setTest(await sbSyncTest((stap, gelukt) => setStappen((v) => ({ ...v, [stap]: gelukt }))));
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
  const isEigenaarOfHr = magAlles(currentUser);

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
          {/* Een levend bolletje in plaats van een stilstaand icoontje: loopt het synchroniseren, dan
              zie je dat het loopt. Tijdens het testen draait hij. */}
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center">
            {synced && !testBezig && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-40" />}
            <span className={`relative inline-flex h-9 w-9 items-center justify-center rounded-full ${synced ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}>
              {testBezig ? <Loader2 className="h-5 w-5 animate-spin" />
                : synced ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-base font-bold text-ink-900">{synced ? "Dit apparaat is gesynchroniseerd" : "Dit apparaat synchroniseert nu niet"}</div>
            <div className="text-sm text-ink-600">
              {synced
                ? "Wijzigingen worden automatisch gedeeld met alle apparaten en het hele team."
                : "Je werk blijft veilig op dit apparaat staan en gaat mee zodra de verbinding er weer is. Test hiernaast wat er misgaat."}
            </div>
          </div>
          <button type="button" onClick={() => void syncTesten()} disabled={testBezig}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-200 transition-colors hover:bg-ink-50 disabled:opacity-60">
            {testBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            {testBezig ? "Bezig met testen…" : "Sync testen"}
          </button>
        </div>
        {(testBezig || test) && (
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {STAP_LABELS.map(([sleutel, label], i) => {
              const uitslag = stappen[sleutel];
              // Welke stap is nu aan de beurt? De eerste waarvan de uitslag nog niet binnen is.
              const bezigNu = testBezig && uitslag === undefined
                && STAP_LABELS.filter(([k]) => stappen[k] !== undefined).length === i;
              return (
                <div key={sleutel} className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors ${
                  uitslag === true ? "bg-green-100 text-green-800"
                    : uitslag === false ? "bg-red-100 text-red-800"
                    : bezigNu ? "bg-white text-ink-800 ring-1 ring-brand-200"
                    : "bg-white/60 text-ink-400"}`}>
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                    {uitslag === true ? <CheckCircle2 className="h-5 w-5" />
                      : uitslag === false ? <AlertTriangle className="h-5 w-5" />
                      : bezigNu ? <Loader2 className="h-4 w-4 animate-spin" />
                      : <span className="h-2 w-2 rounded-full bg-current opacity-40" />}
                  </span>
                  <span className="truncate text-sm font-semibold">{label}</span>
                </div>
              );
            })}
          </div>
        )}
        {test && (
          <div className={`mt-2 rounded-xl px-3 py-2.5 text-sm ${test.schrijven ? "bg-green-100 text-green-900" : "bg-red-50 text-red-800"}`}>
            {test.email && <div className="mb-0.5 text-xs font-semibold opacity-70">{test.email}</div>}
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

      {/* De twee databases naast elkaar: Cloudflare is de baas, Supabase is de tweede kopie.
          Alleen voor de leiding: hier zit ook het terugzetten van de spiegel, en dat raakt het werk
          van het hele team. Een werknemer hoeft alleen te weten of zijn eigen telefoon meeloopt. */}
      {isLeiding && (
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
                : "De reservekopie loopt nog achter. Voor het werken maakt dat niets uit — Cloudflare is leidend — en hij trekt vanzelf bij."}
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

      )}

      {/* Automatische veiligheidskopie */}
      <Card className="flex flex-wrap items-center gap-3 px-4 py-3.5">
        <div className="rounded-lg bg-ink-100 p-2 text-ink-600"><Database className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-ink-900">Automatische veiligheidskopie</div>
          <div className="text-xs text-ink-500">
            {backupInfo
              ? `Laatste back-up: ${new Date(backupInfo.tijd).toLocaleString("nl-NL", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })} · ${backupInfo.totaal} items, veilig op dit apparaat. Terugzetten voegt alleen toe wat weg is — het maakt niets ongedaan.`
              : "Nog geen back-up — wordt automatisch gemaakt zodra er gegevens zijn."}
          </div>
        </div>
        {/* Terugzetten haalt verdwenen records terug voor het hele bedrijf. Dat is een beslissing van
            de leiding, niet iets wat je per ongeluk aantikt terwijl je een adres zoekt. */}
        {backupInfo && isLeiding && (
          <button type="button" onClick={() => setHerstelVraag(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
            <RotateCcw className="h-4 w-4" /> Herstellen
          </button>
        )}
      </Card>

      <Bevestig open={herstelVraag} titel="Verdwenen gegevens terugzetten?" tekst={backupInfo ? `Records die er nu niet meer zijn, worden teruggezet uit de kopie van ${new Date(backupInfo.tijd).toLocaleString("nl-NL")} (${backupInfo.totaal} items).

Wat er nu staat blijft ongemoeid: mappen die je daarna hebt gearchiveerd blijven gearchiveerd, en hernoemen of toewijzen van na de kopie wordt niet ongedaan gemaakt. Er wordt dus niets overschreven — er komt alleen bij wat weg was.` : ""} bevestigLabel="Ja, terugzetten" bevestigTone="brand" onBevestig={() => void doeHerstel()} onAnnuleer={() => setHerstelVraag(false)} />
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

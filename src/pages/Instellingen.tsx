import { useEffect, useRef, useState } from "react";
import { Building2, Activity, CheckCircle2, Info, AlertTriangle, Database, Pencil, Save, Lock, Plug, RefreshCw, Upload, Eye, ChevronRight, RotateCcw } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import { berekenMeldingen } from "../lib/meldingen";
import { APP_VERSIE } from "../lib/versie";
import { logoSrc, logoNaarDataUrl } from "../lib/logo";
import { ApiSleutels } from "./ApiSleutels";
import { SyncBackup } from "./SyncBackup";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

// ── Logo-kaart: toont het huidige logo en laat de leiding het vervangen (of terugzetten). ──
function LogoKaart({ isLeiding }: { isLeiding: boolean }) {
  const { bedrijf, updateBedrijf } = useApp();
  const invoer = useRef<HTMLInputElement | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);

  const kies = async (file?: File | null) => {
    if (!file) return;
    setFout("");
    if (!file.type.startsWith("image/")) { setFout("Kies een afbeelding (PNG of JPG)."); return; }
    setBezig(true);
    try {
      const dataUrl = await logoNaarDataUrl(file);
      updateBedrijf({ logo: dataUrl });
    } catch {
      setFout("Kon dit bestand niet als logo gebruiken. Probeer een andere afbeelding.");
    } finally {
      setBezig(false);
    }
  };

  return (
    <Card className="flex flex-wrap items-center gap-4 p-5">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-ink-50 p-1">
        <img src={logoSrc(bedrijf)} alt="Bedrijfslogo" className="max-h-full max-w-full object-contain" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-bold text-ink-900">Bedrijfslogo</div>
        <p className="text-xs text-ink-500">Dit logo staat op het dashboard, het inlogscherm en de sidebar. {isLeiding ? "Kies hieronder een eigen logo — het verschijnt meteen bij het hele team." : "Alleen de leiding kan dit wijzigen."}</p>
        {fout && <p className="mt-1 text-xs text-red-600">{fout}</p>}
      </div>
      {isLeiding && (
        <div className="flex items-center gap-2">
          <input ref={invoer} type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void kies(f); }} />
          <button type="button" onClick={() => invoer.current?.click()} disabled={bezig} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-60">
            <Upload className="h-4 w-4" /> {bezig ? "Bezig…" : "Logo kiezen"}
          </button>
          {bedrijf.logo && (
            <button type="button" onClick={() => updateBedrijf({ logo: "" })} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-50" title="Terug naar het standaardlogo">
              <RotateCcw className="h-4 w-4" /> Standaard
            </button>
          )}
        </div>
      )}
    </Card>
  );
}

function BedrijfTab({ isLeiding }: { isLeiding: boolean }) {
  const { bedrijf, updateBedrijf } = useApp();
  const [open, setOpen] = useState(false);   // bedrijfsgegevens zijn eerst verborgen; pas na een klik zichtbaar
  const [bewerk, setBewerk] = useState(false);
  const [draft, setDraft] = useState(bedrijf);

  // Houd het concept gelijk met de opgeslagen gegevens zolang je niet bewerkt
  useEffect(() => { if (!bewerk) setDraft(bedrijf); }, [bedrijf, bewerk]);

  const opslaan = () => { updateBedrijf(draft); setBewerk(false); };
  const annuleren = () => { setDraft(bedrijf); setBewerk(false); };
  const sluit = () => { setBewerk(false); setDraft(bedrijf); setOpen(false); };

  const rij = (label: string, key: keyof typeof bedrijf, ph = "") => (
    <div>
      <label className={labelCls}>{label}</label>
      <input
        value={(draft[key] ?? "") as string}
        disabled={!bewerk}
        onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
        placeholder={ph}
        className={veld + (bewerk ? "" : " bg-ink-50 text-ink-600")}
      />
    </div>
  );

  return (
    <div className="space-y-4">
      <LogoKaart isLeiding={isLeiding} />

      {!isLeiding ? (
        <Card className="flex items-center gap-3 p-6 text-sm text-ink-500">
          <Lock className="h-5 w-5 text-ink-400" />
          Alleen de beheerder heeft toegang tot de bedrijfsgegevens.
        </Card>
      ) : !open ? (
        // De bedrijfsgegevens (IBAN, BTW, KvK…) staan niet meteen open — je klikt deze kaart eerst open.
        // Zo liggen ze niet zomaar op het scherm als je Instellingen opent (bijv. met iemand mee-kijkend).
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-2xl border border-ink-200 bg-white p-5 text-left shadow-card transition-colors hover:border-brand-300 hover:bg-brand-50/40"
        >
          <div className="flex items-center gap-4">
            <div className="rounded-xl bg-ink-100 p-2.5 text-ink-600"><Lock className="h-5 w-5" /></div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold text-ink-900">Bedrijfsgegevens</div>
              <p className="text-xs text-ink-500">Verborgen. Klik om de gegevens (IBAN, BTW, KvK…) te bekijken en te bewerken.</p>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-brand-700"><Eye className="h-4 w-4" /> Bekijken <ChevronRight className="h-4 w-4" /></span>
          </div>
        </button>
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
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => setBewerk(true)} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                  <Pencil className="h-4 w-4" /> Wijzigen
                </button>
                <button type="button" onClick={sluit} className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-500 hover:bg-ink-50">Verbergen</button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
            {bewerk ? "Klik op Opslaan om de wijzigingen te bewaren." : "Klik op Wijzigen om de gegevens aan te passen, of op Verbergen om ze weer te verbergen."}
          </p>
        </Card>
      )}
    </div>
  );
}

function SysteemTab() {
  const { bedrijf, instellingen, verlof, projects } = useApp();
  const meldingen = berekenMeldingen(bedrijf, instellingen, verlof, projects);
  const [opslag, setOpslag] = useState<{ used: number; quota: number } | null>(null);

  useEffect(() => {
    navigator.storage?.estimate?.().then((e) => setOpslag({ used: e.usage || 0, quota: e.quota || 0 })).catch(() => {});
  }, []);

  const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";
  const pct = opslag && opslag.quota ? Math.min(100, Math.round((opslag.used / opslag.quota) * 100)) : 0;

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

      {/* App-info */}
      <Card className="p-5">
        <h3 className="mb-3 text-sm font-bold text-ink-900">App</h3>
        <div className="text-sm text-ink-600">Wire Solutions dashboard · V{APP_VERSIE} · live</div>
      </Card>
    </div>
  );
}

export function Instellingen() {
  const { currentUser } = useApp();
  const [tab, setTab] = useState<"bedrijf" | "api" | "sync" | "systeem">("bedrijf");
  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  // De werknemer krijgt hier één tabblad: Sync & back-up. Loopt zijn telefoon mee met de rest? Dat
  // wil je zelf kunnen nakijken, aan een deur, zonder eerst iemand te bellen. De rest blijft dicht —
  // daar staan bedrijfsgegevens en API-sleutels, en dat gaat hem niet aan.
  const tabs = ([
    { key: "bedrijf", label: "Bedrijf & logo", icon: Building2, leiding: true },
    { key: "api", label: "API-sleutels", icon: Plug, leiding: true },
    { key: "sync", label: "Sync & back-up", icon: RefreshCw, leiding: false },
    { key: "systeem", label: "Systeem & meldingen", icon: Activity, leiding: true },
  ] as const).filter((t) => isLeiding || !t.leiding);

  // Is het geopende tabblad niet (meer) van jou, dan valt hij terug op het eerste dat wél mag.
  // Anders zou een werknemer een leeg scherm zien omdat "bedrijf" de begintoestand is.
  const tabNu = tabs.some((t) => t.key === tab) ? tab : tabs[0].key;

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Instellingen</h2>
        <p className="text-sm text-ink-500">
          {isLeiding ? "Bedrijfsgegevens, API-sleutels, sync & back-up en de systeemstatus van de app." : "Of dit apparaat meeloopt met de rest van het team."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-ink-200">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={`-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-semibold ${tabNu === t.key ? "border-brand-600 text-brand-700" : "border-transparent text-ink-500 hover:text-ink-800"}`}>
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tabNu === "bedrijf" && <BedrijfTab isLeiding={isLeiding} />}
      {tabNu === "api" && <ApiSleutels />}
      {tabNu === "sync" && <SyncBackup />}
      {tabNu === "systeem" && <SysteemTab />}
    </div>
  );
}

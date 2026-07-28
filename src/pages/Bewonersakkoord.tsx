import { useEffect, useMemo, useState } from "react";
import {
  Plus, ArrowLeft, ArrowRight, Search, Loader2, AlertCircle, MapPin,
  Building2, CalendarRange, Clock, FolderOpen, RotateCcw,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import {
  haalDossiers, bewaarDossier, verwijderDossier, netPd, pdGeldig,
  REGIOS, STATUS_INFO, type Dossier, type Regio,
} from "../lib/akkoord";

// Bewonersakkoord — pagina 1: het dossier.
// ─────────────────────────────────────────────────────────────────────────────
// Bewust een eigen gezicht, niet de generieke dashboardlayout: deze module draait om één ding per
// dossier — wat is de volgende stap? Daarom staat op elke kaart de eerstvolgende actie, en niet een
// tabel met alles wat er ooit is gebeurd.
//
// Blauw als accentkleur, tegenover het oranje van bodemonderzoek. Twee modules die op elkaar lijken
// maar verschillend werken, moeten er ook verschillend uitzien — anders opent iemand de verkeerde.

const veld = "w-full rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100";
const label = "mb-1.5 block text-sm font-semibold text-ink-700";

const STATUS_KLEUR: Record<string, string> = {
  slate: "bg-ink-100 text-ink-600",
  indigo: "bg-sky-100 text-sky-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
};

const datumNL = (iso: string) => {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}-${Number(d[1])}-${d[0]}` : iso;
};

// ── Nieuw dossier ──
function NieuwDossier({ onKlaar, onAnnuleer }: { onKlaar: (pd: string) => void; onAnnuleer: () => void }) {
  const [pd, setPd] = useState("");
  const [regio, setRegio] = useState<Regio | "">("");
  const [opdrachtgever, setOpdrachtgever] = useState("");
  const [gebouw, setGebouw] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [starttijd, setStarttijd] = useState("08:00");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [washerstel, setWasHerstel] = useState(false);

  const pdNet = netPd(pd);
  const pdFoutief = pd.trim().length > 0 && !pdGeldig(pd);

  const bewaar = async (herstelEerst = false) => {
    setFout("");
    if (!pdGeldig(pd)) return setFout("Vul een geldig PD-nummer in: PD gevolgd door cijfers, bijvoorbeeld PD123456.");
    if (!regio) return setFout("Kies een regio.");
    setBezig(true);
    try {
      if (herstelEerst) await verwijderDossier(pdNet, true);
      const r = await bewaarDossier({
        pd_nummer: pdNet, regio, opdrachtgever, gebouw, omschrijving,
        uitvoering_van: van, uitvoering_tot: tot, starttijd,
        bijwerken: herstelEerst,
      });
      if (!r.ok) { setFout(r.fout ?? "Niet gelukt."); setWasHerstel(!!r.verwijderd); return; }
      onKlaar(pdNet);
    } finally { setBezig(false); }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onAnnuleer} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>

      <div>
        <h2 className="text-2xl font-bold text-ink-900">Nieuw dossier</h2>
        <p className="text-sm text-ink-500">Alles onder dit PD-nummer hoort bij elkaar en wordt straks in één keer afgeboekt.</p>
      </div>

      <div className="space-y-4 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm">
        <label className="block">
          <span className={label}>PD-nummer</span>
          <input
            value={pd}
            onChange={(e) => { setPd(e.target.value); setFout(""); setWasHerstel(false); }}
            placeholder="PD123456"
            autoComplete="off"
            className={`${veld} font-mono tracking-wide ${pdFoutief ? "border-amber-400" : ""}`}
          />
          {pdFoutief
            ? <span className="mt-1 block text-xs text-amber-700">Verwacht: PD gevolgd door cijfers.</span>
            : pdNet && <span className="mt-1 block text-xs text-ink-500">Wordt opgeslagen als <span className="font-mono font-semibold">{pdNet}</span></span>}
        </label>

        <div>
          <span className={label}>Regio</span>
          <div className="flex gap-2">
            {REGIOS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setRegio(r); setFout(""); }}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  regio === r ? "border-sky-500 bg-sky-50 text-sky-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={label}>Opdrachtgever</span>
            <input value={opdrachtgever} onChange={(e) => setOpdrachtgever(e.target.value)} placeholder="bijv. Stedin" className={veld} />
          </label>
          <label className="block">
            <span className={label}>Gebouw of locatie</span>
            <input value={gebouw} onChange={(e) => setGebouw(e.target.value)} placeholder="bijv. Kerkstraat 1-40" className={veld} />
          </label>
        </div>

        <label className="block">
          <span className={label}>Omschrijving werkzaamheden</span>
          <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="bijv. Vervangen gasleiding" className={veld} />
        </label>

        <div>
          <span className={label}>Geplande uitvoeringsperiode</span>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <span className="mb-1 block text-xs text-ink-500">Van</span>
              <DatumKiezer value={van} onChange={setVan} placeholder="Eerste dag" />
            </div>
            <span className="pb-2.5 text-sm text-ink-400">t/m</span>
            <div>
              <span className="mb-1 block text-xs text-ink-500">Tot en met</span>
              <DatumKiezer value={tot} onChange={setTot} placeholder="Laatste dag" />
            </div>
          </div>
        </div>

        <div>
          <span className={label}>Hoe laat moeten bewoners thuis zijn?</span>
          <div className="flex gap-2">
            {["08:00", "09:30"].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setStarttijd(t)}
                className={`rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  starttijd === t ? "border-sky-500 bg-sky-50 text-sky-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {t} – 16:00
              </button>
            ))}
          </div>
          <span className="mt-1 block text-xs text-ink-500">Per cluster nog aan te passen.</span>
        </div>
      </div>

      {fout && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <div>{fout}</div>
            {washerstel && (
              <button type="button" onClick={() => void bewaar(true)} className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700">
                <RotateCcw className="h-3.5 w-3.5" /> Ja, dossier terughalen
              </button>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => void bewaar(false)}
        disabled={bezig}
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-600 px-5 py-3.5 text-base font-bold text-white hover:bg-sky-700 disabled:opacity-60 sm:w-auto"
      >
        {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
        Dossier aanmaken
      </button>
    </div>
  );
}

// ── Overzicht ──
export function Bewonersakkoord() {
  const { currentUser } = useApp();
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [zoek, setZoek] = useState("");

  const laad = () => { void haalDossiers().then(setDossiers); };
  useEffect(laad, []);

  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return dossiers ?? [];
    return (dossiers ?? []).filter((d) =>
      `${d.pd_nummer} ${d.opdrachtgever} ${d.gebouw} ${d.omschrijving} ${d.regio}`.toLowerCase().includes(q));
  }, [dossiers, zoek]);

  if (nieuw) return <NieuwDossier onAnnuleer={() => setNieuw(false)} onKlaar={() => { setNieuw(false); laad(); }} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Bewonersakkoord</h2>
          <p className="text-sm text-ink-500">
            Werkzaamheden waarbij iedereen in een gebouw of postcode op dezelfde dag thuis moet zijn.
          </p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setNieuw(true)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-700">
            <Plus className="h-4 w-4" /> Nieuw dossier
          </button>
        )}
      </div>

      {(dossiers?.length ?? 0) > 4 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="PD-nummer, opdrachtgever of gebouw…"
            className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-100" />
        </div>
      )}

      {dossiers === null ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-ink-400">
          <Loader2 className="h-4 w-4 animate-spin" /> Bezig met ophalen…
        </div>
      ) : zichtbaar.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-12 text-center">
          <FolderOpen className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">
            {zoek ? `Geen dossier gevonden voor "${zoek}".` : isLeiding ? "Nog geen dossiers. Maak er een aan met het PD-nummer van de opdracht." : "Er zijn nog geen dossiers."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {zichtbaar.map((d) => {
            const info = STATUS_INFO[d.status] ?? STATUS_INFO.nieuw;
            return (
              <div key={d.pd_nummer} className="rounded-2xl border border-ink-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-lg font-bold tracking-wide text-ink-900">{d.pd_nummer}</div>
                    <div className="truncate text-sm text-ink-600">{[d.opdrachtgever, d.gebouw].filter(Boolean).join(" · ") || "—"}</div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_KLEUR[info.kleur]}`}>{info.label}</span>
                </div>

                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-500">
                  <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {d.regio || "geen regio"}</span>
                  {d.uitvoering_van && (
                    <span className="inline-flex items-center gap-1">
                      <CalendarRange className="h-3.5 w-3.5" /> {datumNL(d.uitvoering_van)}{d.uitvoering_tot ? ` t/m ${datumNL(d.uitvoering_tot)}` : ""}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> vanaf {d.starttijd}</span>
                  {!!d.adressen && <span className="inline-flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> {d.adressen} adressen{d.clusters ? ` · ${d.clusters} clusters` : ""}</span>}
                </div>

                {/* De volgende actie — het hele idee van deze module: één dossier, één ding te doen. */}
                <div className="mt-3 flex items-center justify-between gap-2 rounded-xl bg-sky-50 px-3 py-2">
                  <span className="min-w-0">
                    <span className="block text-[11px] font-semibold uppercase tracking-wide text-sky-700">Volgende stap</span>
                    <span className="block truncate text-sm font-semibold text-sky-900">{info.volgende}</span>
                  </span>
                  <ArrowRight className="h-5 w-5 shrink-0 text-sky-600" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import {
  Plus, ArrowLeft, Search, Loader2, AlertCircle,
  FolderOpen, RotateCcw, Building2,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { SaneerFlow } from "../components/SaneerFlow";
import { useProjectFilter } from "../components/ProjectFilter";
import { WerkTabs, type WerkTab } from "../components/WerkTabs";
import {
  haalDossiers, bewaarDossier, verwijderDossier, netPd, pdGeldig,
  REGIOS, STATUS_INFO, type Dossier, type Regio,
} from "../lib/saneerflow";

// Saneren — pagina 1: het dossier.
// ─────────────────────────────────────────────────────────────────────────────
// Bewust een eigen gezicht, niet de generieke dashboardlayout: deze module draait om één ding per
// dossier — wat is de volgende stap? Daarom staat op elke kaart de eerstvolgende actie, en niet een
// tabel met alles wat er ooit is gebeurd.
//
// Blauw als accentkleur, tegenover het oranje van bodemonderzoek. Twee modules die op elkaar lijken
// maar verschillend werken, moeten er ook verschillend uitzien — anders opent iemand de verkeerde.

const veld = "w-full rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const label = "mb-1.5 block text-sm font-semibold text-ink-700";

// Hoe ver een dossier is, afgeleid uit de stand. Genoeg voor een balkje op de kaart; de echte
// tellers staan binnenin bij de stappen.
const VOORTGANG: Record<string, number> = {
  nieuw: 5, geimporteerd: 20, verdeeld: 35, in_uitvoering: 55,
  datum_akkoord: 75, poster_geplaatst: 90, afgerond: 100, afgeboekt: 100,
};

const STATUS_KLEUR: Record<string, string> = {
  slate: "bg-ink-100 text-ink-600",
  indigo: "bg-brand-100 text-brand-800",
  amber: "bg-amber-100 text-amber-800",
  green: "bg-green-100 text-green-800",
};

const datumNL = (iso: string) => {
  if (!iso) return "";
  const d = iso.slice(0, 10).split("-");
  return d.length === 3 ? `${Number(d[2])}-${Number(d[1])}-${d[0]}` : iso;
};

// Het werk duurt één dag. De database bewaart nog steeds een periode, en dat is met opzet: het
// tweede veld is de speelruimte waarbinnen de app een andere dag mag voorstellen als iemand niet kan.
// Dat hoeft niemand in te vullen — het volgt uit de gekozen dag.
const SPEELRUIMTE_WEKEN = 8;
const speelruimteTot = (dag: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dag)) return dag;
  const d = new Date(`${dag}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + SPEELRUIMTE_WEKEN * 7);
  return d.toISOString().slice(0, 10);
};

// ── Nieuw dossier ──
function NieuwDossier({ onKlaar, onAnnuleer }: { onKlaar: (pd: string) => void; onAnnuleer: () => void }) {
  const [cijfers, setCijfers] = useState("");
  const pd = cijfers ? `PD${cijfers}` : "";
  const [regio, setRegio] = useState<Regio | "">("");
  const [opdrachtgever, setOpdrachtgever] = useState("");
  const [gebouw, setGebouw] = useState("");
  const [omschrijving, setOmschrijving] = useState("");
  const [dag, setDag] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState("");
  const [washerstel, setWasHerstel] = useState(false);

  const pdNet = netPd(pd);
  const pdFoutief = cijfers.length > 0 && !pdGeldig(pd);

  const bewaar = async (herstelEerst = false) => {
    setFout("");
    if (!pdGeldig(pd)) return setFout("Vul de cijfers van het PD-nummer in, bijvoorbeeld 123456.");
    if (!regio) return setFout("Kies een regio.");
    setBezig(true);
    try {
      if (herstelEerst) await verwijderDossier(pdNet, true);
      const r = await bewaarDossier({
        pd_nummer: pdNet, regio, opdrachtgever, gebouw, omschrijving,
        uitvoering_van: dag, uitvoering_tot: speelruimteTot(dag), starttijd: "08:00",
        bijwerken: herstelEerst,
      });
      if (!r.ok) { setFout(r.fout ?? "Niet gelukt."); setWasHerstel(!!r.verwijderd); return; }
      onKlaar(pdNet);
    } finally { setBezig(false); }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <button type="button" onClick={onAnnuleer} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>

      <div>
        <h2 className="text-2xl font-bold text-ink-900 lg:text-3xl">Nieuw dossier</h2>
        <p className="text-sm text-ink-500">Alles onder dit PD-nummer hoort bij elkaar en wordt straks in één keer afgeboekt.</p>
      </div>

      <div className="space-y-5 rounded-2xl border border-ink-200 bg-white p-5 shadow-sm lg:grid lg:grid-cols-2 lg:gap-x-8 lg:gap-y-6 lg:space-y-0 lg:p-8">
        <label className="block lg:col-span-1">
          <span className={label}>PD-nummer</span>
          {/* De PD staat er vast voor: die typ je bij elk dossier opnieuw en dat is precies waar
              typefouten insluipen. Je vult alleen de cijfers in. Plak je een heel nummer ("PD123456"),
              dan halen we de letters er zelf af. */}
          <div className={`flex items-stretch overflow-hidden rounded-xl border ${pdFoutief ? "border-amber-400" : "border-ink-200"} focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100`}>
            <span className="flex select-none items-center bg-ink-50 px-4 font-mono text-base font-bold tracking-wide text-ink-500">PD</span>
            <input
              value={cijfers}
              onChange={(e) => { setCijfers(e.target.value.replace(/\D/g, "").slice(0, 12)); setFout(""); setWasHerstel(false); }}
              placeholder="123456"
              inputMode="numeric"
              autoComplete="off"
              className="w-full px-4 py-3 font-mono text-base tracking-wide outline-none"
            />
          </div>
          {pdFoutief
            ? <span className="mt-1 block text-xs text-amber-700">Vul de cijfers van het PD-nummer in.</span>
            : pdNet && <span className="mt-1 block text-xs text-ink-500">Wordt opgeslagen als <span className="font-mono font-semibold">{pdNet}</span></span>}
        </label>

        <div className="lg:col-span-1">
          <span className={label}>Regio</span>
          <div className="flex gap-2">
            {REGIOS.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => { setRegio(r); setFout(""); }}
                className={`flex-1 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition-colors ${
                  regio === r ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2">
          <label className="block">
            <span className={label}>Opdrachtgever</span>
            <input value={opdrachtgever} onChange={(e) => setOpdrachtgever(e.target.value)} placeholder="bijv. Stedin" className={veld} />
          </label>
          <label className="block">
            <span className={label}>Gebouw of locatie</span>
            <input value={gebouw} onChange={(e) => setGebouw(e.target.value)} placeholder="bijv. Kerkstraat 1-40" className={veld} />
          </label>
        </div>

        <label className="block lg:col-span-2">
          <span className={label}>Omschrijving werkzaamheden</span>
          <input value={omschrijving} onChange={(e) => setOmschrijving(e.target.value)} placeholder="bijv. Vervangen gasleiding" className={veld} />
        </label>

        <div className="lg:col-span-1">
          <span className={label}>Geplande uitvoeringsdag</span>
          {/* Het werk duurt één dag — het hele gebouw tegelijk. Vandaar één datum en geen periode.
              Kan straks één bewoner niet, dan zoekt de app een andere dag in de weken erna; die
              speelruimte hoef je hier niet in te vullen. */}
          <DatumKiezer value={dag} onChange={setDag} placeholder="Kies de dag" />
          <span className="mt-1 block text-xs text-ink-500">
            Eén dag voor het hele gebouw. Kan een bewoner niet, dan stelt de app een andere dag voor
            binnen {SPEELRUIMTE_WEKEN} weken hierna.
          </span>
        </div>

        {/* Bewoners moeten thuis zijn van 08:00 tot 16:00. Dat is bij elke sanering hetzelfde, dus
            het is geen keuze meer — één vraag minder bij het aanmaken. Per cluster kan het nog
            afwijken als een gebouw dat vraagt. */}
        <div className="self-end rounded-xl bg-brand-50 px-4 py-3 lg:col-span-1">
          <span className="block text-sm font-semibold text-brand-900">Bewoners zijn thuis van 08:00 tot 16:00</span>
          <span className="mt-0.5 block text-xs text-brand-800">Dat is de standaard voor elke sanering. Per groep nog aan te passen als een gebouw dat vraagt.</span>
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
        className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-brand-600 px-5 py-3.5 text-base font-bold text-white hover:bg-brand-700 disabled:opacity-60 sm:w-auto"
      >
        {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <Plus className="h-5 w-5" />}
        Dossier aanmaken
      </button>
    </div>
  );
}

// ── Overzicht ──
export function SaneerDossiers({ onEerder }: { onEerder: () => void }) {
  const { currentUser } = useApp();
  const [dossiers, setDossiers] = useState<Dossier[] | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [zoek, setZoek] = useState("");
  // Welk dossier staat open? Eén tegelijk — daarbinnen loopt de stappenflow.
  const [open, setOpen] = useState<string | null>(null);
  // Dezelfde drie beelden als bij Brieven & Routes en Voorschouwen: waar wordt aan gewerkt, wat kan
  // naar Stedin, en wat is afgehandeld. Het is geen apart vinkje maar precies de stand die de
  // knoppen al zetten — anders houd je twee dingen bij die uit de pas gaan lopen.
  const [tab, setTab] = useState<WerkTab>("overzicht");

  const laad = () => { void haalDossiers().then(setDossiers); };
  useEffect(laad, []);

  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer" || currentUser?.rol === "hr";

  // De telling moet over álle dossiers gaan, niet over wat er na de periodefilter overblijft —
  // anders zegt het tabblad "Archief (0)" terwijl er van vorig jaar tientallen in staan.
  const alle = dossiers ?? [];
  const klaarLijst = useMemo(() => alle.filter((d) => d.status === "afgerond"), [alle]);
  const archiefLijst = useMemo(() => alle.filter((d) => d.status === "afgeboekt"), [alle]);
  const inTab = useMemo(
    () => (tab === "stedin" ? klaarLijst : tab === "archief" ? archiefLijst : alle.filter((d) => d.status !== "afgerond" && d.status !== "afgeboekt")),
    [alle, tab, klaarLijst, archiefLijst]
  );

  const filter = useProjectFilter(inTab, {
    datum: (d) => (d.uitvoering_van || d.aangemaakt_op || "").slice(0, 10),
    isOpen: (d) => d.status !== "afgerond" && d.status !== "afgeboekt",
  });
  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    if (!q) return filter.zichtbaar;
    return filter.zichtbaar.filter((d) =>
      `${d.pd_nummer} ${d.opdrachtgever} ${d.gebouw} ${d.omschrijving} ${d.regio}`.toLowerCase().includes(q));
  }, [filter.zichtbaar, zoek]);

  if (nieuw) return <NieuwDossier onAnnuleer={() => setNieuw(false)} onKlaar={(pd) => { setNieuw(false); laad(); setOpen(pd); }} />;
  if (open) return <SaneerFlow pd={open} onTerug={() => { setOpen(null); laad(); }} />;

  return (
    <div className="space-y-5">
      <WerkTabs tab={tab} setTab={setTab} klaar={klaarLijst.length} archief={archiefLijst.length} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Saneren</h2>
          <p className="text-sm text-ink-500">
            Adressen inlezen, verdelen, en met iedereen in een gebouw of postcode dezelfde dag afspreken.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={onEerder} className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50">
            <FolderOpen className="h-4 w-4" /> Eerder ingevoerd
          </button>
          {isLeiding && (
            <button type="button" onClick={() => setNieuw(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> Nieuwe sanering
            </button>
          )}
        </div>
      </div>

      {filter.balk}

      {(dossiers?.length ?? 0) > 4 && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="PD-nummer, opdrachtgever of gebouw…"
            className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
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
            {zoek ? `Geen dossier gevonden voor "${zoek}".`
              : tab === "stedin" ? "Nog niets klaar voor Stedin. Zodra het werk van een dossier is afgerond, staat het hier klaar om af te boeken."
              : tab === "archief" ? "Het archief is nog leeg. Hier komen de dossiers die op hun PD-nummer zijn afgeboekt."
              : isLeiding ? "Nog geen dossiers. Maak er een aan met het PD-nummer van de opdracht." : "Er zijn nog geen dossiers."}
          </p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {zichtbaar.map((d) => {
            const info = STATUS_INFO[d.status] ?? STATUS_INFO.nieuw;
            return (
              <button
                key={d.pd_nummer}
                type="button"
                onClick={() => setOpen(d.pd_nummer)}
                className="rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                {/* Zelfde opbouw als bij TAUW: een icoon, de naam van de locatie groot, en de rest
                    eronder. Het PD-nummer is een administratief kenmerk — je herkent een klus aan de
                    plek, niet aan elf cijfers. Dus dat staat klein bij de details. */}
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-base font-bold text-ink-900">
                      {d.gebouw || d.omschrijving || d.pd_nummer}
                    </span>
                    <span className="block truncate text-xs text-ink-500">
                      <span className="font-mono">{d.pd_nummer}</span>
                      {d.opdrachtgever ? ` · ${d.opdrachtgever}` : ""}
                      {d.regio ? ` · ${d.regio}` : ""}
                      {d.adressen ? ` · ${d.adressen} adressen` : ""}
                    </span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_KLEUR[info.kleur]}`}>{info.label}</span>
                </div>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs">
                  <span className="font-semibold text-brand-700">{info.volgende}</span>
                  <span className="text-ink-500">
                    {d.uitvoering_van ? `uitvoering ${datumNL(d.uitvoering_van)}` : "nog geen dag"}
                    {` · ${d.starttijd || "08:00"}–16:00`}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
                  <div className="h-full rounded-full bg-green-500 transition-all"
                    style={{ width: `${Math.round(((VOORTGANG[d.status] ?? 0) / 100) * 100)}%` }} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

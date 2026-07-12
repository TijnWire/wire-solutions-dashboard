import { useState } from "react";
import { Mail, Plus, Check, Trash2, ChevronDown, RotateCcw, MapPin } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import type { BlancoBrief } from "../lib/types";

// Blanco brieven: je loopt een buurt/wijk en tikt per straat aan welk huisnummer je hebt gehad.
// Alles synct met het team, dus iedereen ziet meteen wat er al gedaan is.

type Stap = "alle" | "even" | "oneven";

// Zet een reeks huisnummers ("van" t/m "tot") om naar losse nummers, evt. alleen even/oneven.
function reeks(van: string, tot: string, stap: Stap): string[] {
  const a = parseInt(van, 10);
  const b = parseInt(tot, 10);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < a || b - a > 500) return [];
  const out: string[] = [];
  for (let n = a; n <= b; n++) {
    if (stap === "even" && n % 2 !== 0) continue;
    if (stap === "oneven" && n % 2 === 0) continue;
    out.push(String(n));
  }
  return out;
}

// Huisnummers netjes op volgorde (12 vóór 12A vóór 100).
function nrSort(a: string, b: string): number {
  const na = parseInt(a, 10);
  const nb = parseInt(b, 10);
  const va = Number.isNaN(na) ? Infinity : na;
  const vb = Number.isNaN(nb) ? Infinity : nb;
  if (va !== vb) return va - vb;
  return a.localeCompare(b, "nl", { numeric: true });
}

export function Blanco() {
  const { blancoBrieven, addBlanco, deleteBlanco, currentUser } = useApp();

  const [toonNieuw, setToonNieuw] = useState(false);
  const [straat, setStraat] = useState("");
  const [plaats, setPlaats] = useState("");
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [stap, setStap] = useState<Stap>("alle");
  const [openId, setOpenId] = useState<string | null>(null);
  const [teVerwijderen, setTeVerwijderen] = useState<BlancoBrief | null>(null);

  if (!currentUser) return null;

  const maakRoute = () => {
    const s = straat.trim();
    if (!s) return;
    const nummers = reeks(van, tot, stap).map((nr) => ({ nr, gedaan: false }));
    const id = addBlanco({ straat: s, plaats: plaats.trim(), nummers });
    setStraat("");
    setPlaats("");
    setVan("");
    setTot("");
    setStap("alle");
    setToonNieuw(false);
    setOpenId(id);
  };

  // Groepeer de routes per buurt/wijk (plaats), en binnen een groep op straatnaam.
  const plaatsen = [...new Set(blancoBrieven.map((r) => r.plaats.trim() || "Overig"))].sort((a, b) => a.localeCompare(b, "nl"));

  const totaalGehad = blancoBrieven.reduce((s, r) => s + r.nummers.filter((n) => n.gedaan).length, 0);
  const totaalNummers = blancoBrieven.reduce((s, r) => s + r.nummers.length, 0);

  const veldKlasse = "w-full rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Blanco brieven</h2>
          <p className="text-sm text-ink-500">
            Loop je een buurt of wijk met blanco brieven? Maak per straat een lijst en tik aan welk huisnummer je hebt gehad.
            {totaalNummers > 0 && <> — <span className="font-semibold text-ink-700">{totaalGehad} van {totaalNummers}</span> gehad.</>}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setToonNieuw((v) => !v)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
        >
          <Plus className="h-4 w-4" /> Nieuwe straat
        </button>
      </div>

      {toonNieuw && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-500">Straat</span>
              <input value={straat} onChange={(e) => setStraat(e.target.value)} placeholder="Bijv. Kerkweg" className={veldKlasse} autoFocus />
            </label>
            <label className="space-y-1">
              <span className="text-xs font-semibold text-ink-500">Buurt / wijk / plaats</span>
              <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder="Bijv. Ouderkerk aan den IJssel" className={veldKlasse} />
            </label>
          </div>

          <div className="space-y-2 rounded-xl bg-ink-50 p-3">
            <span className="text-xs font-semibold text-ink-500">Huisnummers toevoegen (mag ook later)</span>
            <div className="flex flex-wrap items-end gap-2">
              <label className="space-y-1">
                <span className="block text-[11px] text-ink-400">Van</span>
                <input value={van} onChange={(e) => setVan(e.target.value)} inputMode="numeric" placeholder="1" className={`${veldKlasse} w-20`} />
              </label>
              <label className="space-y-1">
                <span className="block text-[11px] text-ink-400">Tot en met</span>
                <input value={tot} onChange={(e) => setTot(e.target.value)} inputMode="numeric" placeholder="60" className={`${veldKlasse} w-20`} />
              </label>
              <div className="flex overflow-hidden rounded-lg border border-ink-200">
                {(["alle", "oneven", "even"] as Stap[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStap(s)}
                    className={`px-3 py-2 text-xs font-semibold capitalize transition-colors ${stap === s ? "bg-brand-600 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <span className="text-xs text-ink-400">{reeks(van, tot, stap).length > 0 ? `${reeks(van, tot, stap).length} nummers` : "—"}</span>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setToonNieuw(false)} className="rounded-lg border border-ink-200 px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
            <button type="button" onClick={maakRoute} disabled={!straat.trim()} className="rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">Straat toevoegen</button>
          </div>
        </Card>
      )}

      {blancoBrieven.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-10 text-center">
          <div className="rounded-xl bg-ink-100 p-3 text-ink-400"><Mail className="h-6 w-6" /></div>
          <p className="text-sm font-semibold text-ink-700">Nog geen blanco routes</p>
          <p className="max-w-sm text-sm text-ink-500">Klik op <span className="font-semibold">Nieuwe straat</span> om te beginnen. Voeg de huisnummers toe en tik ze onderweg aan zodra je ze hebt gehad.</p>
        </Card>
      ) : (
        <div className="space-y-6">
          {plaatsen.map((pl) => {
            const routes = blancoBrieven
              .filter((r) => (r.plaats.trim() || "Overig") === pl)
              .sort((a, b) => a.straat.localeCompare(b.straat, "nl", { numeric: true }));
            return (
              <div key={pl} className="space-y-3">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-ink-700">
                  <MapPin className="h-4 w-4 text-ink-400" /> {pl}
                </div>
                <div className="space-y-3">
                  {routes.map((r) => (
                    <RouteKaart
                      key={r.id}
                      route={r}
                      open={openId === r.id}
                      onToggle={() => setOpenId(openId === r.id ? null : r.id)}
                      onVerwijder={() => setTeVerwijderen(r)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {teVerwijderen && (
        <Bevestig
          open
          titel="Straat verwijderen?"
          tekst={`"${teVerwijderen.straat}" en alle bijbehorende huisnummers worden verwijderd. Dit kan niet ongedaan worden gemaakt.`}
          bevestigLabel="Verwijderen"
          onBevestig={() => { deleteBlanco(teVerwijderen.id); setTeVerwijderen(null); }}
          onAnnuleer={() => setTeVerwijderen(null)}
        />
      )}
    </div>
  );
}

// Eén straat: kop met voortgang, en (uitgeklapt) het aanklikbare huisnummer-rooster + toevoeg-velden.
function RouteKaart({ route, open, onToggle, onVerwijder }: {
  route: BlancoBrief;
  open: boolean;
  onToggle: () => void;
  onVerwijder: () => void;
}) {
  const { updateBlanco } = useApp();
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [stap, setStap] = useState<Stap>("alle");
  const [los, setLos] = useState("");

  const gehad = route.nummers.filter((n) => n.gedaan).length;
  const totaal = route.nummers.length;
  const pct = totaal === 0 ? 0 : Math.round((gehad / totaal) * 100);
  const gesorteerd = [...route.nummers].sort((a, b) => nrSort(a.nr, b.nr));

  const toggleNr = (nr: string) =>
    updateBlanco(route.id, { nummers: route.nummers.map((x) => (x.nr === nr ? { ...x, gedaan: !x.gedaan } : x)) });

  const voegToe = (nums: string[]) => {
    const bestaand = new Set(route.nummers.map((x) => x.nr));
    const extra = nums.map((n) => n.trim()).filter((n) => n && !bestaand.has(n)).map((nr) => ({ nr, gedaan: false }));
    if (!extra.length) return;
    updateBlanco(route.id, { nummers: [...route.nummers, ...extra] });
  };

  const verwijderNr = (nr: string) =>
    updateBlanco(route.id, { nummers: route.nummers.filter((x) => x.nr !== nr) });

  const resetAlles = () =>
    updateBlanco(route.id, { nummers: route.nummers.map((x) => ({ ...x, gedaan: false })) });

  const veldKlasse = "rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm text-ink-800 outline-none transition-colors focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <Card className="overflow-hidden">
      <button type="button" onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50/70">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Mail className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-900">{route.straat}</div>
          <div className="mt-1.5 flex items-center gap-2">
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-ink-500">{gehad}/{totaal} gehad</span>
          </div>
        </div>
        <Badge tone={totaal > 0 && gehad === totaal ? "green" : "amber"}>{totaal > 0 && gehad === totaal ? "Klaar" : `${pct}%`}</Badge>
        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${open ? "" : "-rotate-90"}`} />
      </button>

      {open && (
        <div className="space-y-4 border-t border-ink-100 p-4">
          {totaal === 0 ? (
            <p className="text-sm text-ink-500">Nog geen huisnummers. Voeg hieronder een reeks (bijv. 1 t/m 60) of losse nummers toe.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {gesorteerd.map((x) => (
                <button
                  key={x.nr}
                  type="button"
                  onClick={() => toggleNr(x.nr)}
                  className={`group relative inline-flex h-11 min-w-[3rem] items-center justify-center gap-1 rounded-xl px-3 text-sm font-semibold transition-colors ${x.gedaan ? "bg-emerald-500 text-white shadow-sm" : "bg-ink-100 text-ink-700 hover:bg-ink-200"}`}
                >
                  {x.gedaan && <Check className="h-4 w-4" />}
                  {x.nr}
                </button>
              ))}
            </div>
          )}

          {/* Huisnummers toevoegen: reeks of los nummer */}
          <div className="space-y-2 rounded-xl bg-ink-50 p-3">
            <span className="text-xs font-semibold text-ink-500">Huisnummers toevoegen</span>
            <div className="flex flex-wrap items-center gap-2">
              <input value={van} onChange={(e) => setVan(e.target.value)} inputMode="numeric" placeholder="van" className={`${veldKlasse} w-16`} />
              <input value={tot} onChange={(e) => setTot(e.target.value)} inputMode="numeric" placeholder="t/m" className={`${veldKlasse} w-16`} />
              <div className="flex overflow-hidden rounded-lg border border-ink-200">
                {(["alle", "oneven", "even"] as Stap[]).map((s) => (
                  <button key={s} type="button" onClick={() => setStap(s)} className={`px-2.5 py-2 text-xs font-semibold capitalize transition-colors ${stap === s ? "bg-brand-600 text-white" : "bg-white text-ink-600 hover:bg-ink-50"}`}>{s}</button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => { voegToe(reeks(van, tot, stap)); setVan(""); setTot(""); }}
                disabled={reeks(van, tot, stap).length === 0}
                className="rounded-lg bg-ink-800 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-ink-900 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Reeks
              </button>
              <span className="mx-1 text-ink-300">·</span>
              <input
                value={los}
                onChange={(e) => setLos(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); voegToe([los]); setLos(""); } }}
                placeholder="los nr, bijv. 12A"
                className={`${veldKlasse} w-32`}
              />
              <button type="button" onClick={() => { voegToe([los]); setLos(""); }} disabled={!los.trim()} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-2.5 py-2 text-xs font-semibold text-ink-700 transition-colors hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40">
                <Plus className="h-3.5 w-3.5" /> Toevoegen
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
            <span className="text-xs text-ink-400">Tik op een huisnummer om het op "gehad" (groen) te zetten. Nog een keer tikken maakt het weer ongedaan.</span>
            <div className="flex items-center gap-2">
              {gehad > 0 && (
                <button type="button" onClick={resetAlles} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                  <RotateCcw className="h-3.5 w-3.5" /> Alles op te doen
                </button>
              )}
              <button type="button" onClick={onVerwijder} className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50">
                <Trash2 className="h-3.5 w-3.5" /> Straat verwijderen
              </button>
            </div>
          </div>

          {/* Snel losse nummers verwijderen die per ongeluk zijn toegevoegd */}
          {totaal > 0 && (
            <details className="text-xs text-ink-400">
              <summary className="cursor-pointer select-none">Een verkeerd huisnummer verwijderen?</summary>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {gesorteerd.map((x) => (
                  <button key={x.nr} type="button" onClick={() => verwijderNr(x.nr)} className="inline-flex items-center gap-1 rounded-lg bg-ink-100 px-2 py-1 text-xs text-ink-600 hover:bg-red-100 hover:text-red-600">
                    {x.nr} <Trash2 className="h-3 w-3" />
                  </button>
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </Card>
  );
}

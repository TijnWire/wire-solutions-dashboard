import { useState } from "react";
import { Search, Bell, Menu, Info, AlertTriangle, ChevronRight, X, FolderKanban, SearchX } from "lucide-react";
import type { Melding } from "../lib/meldingen";
import type { ZoekGroep, ZoekItem } from "../lib/zoeken";

// Kleur per resultaattype, zodat je binnen een project meteen ziet wat het is.
const CHIP_KLEUR: Record<string, string> = {
  Afspraak: "bg-blue-50 text-blue-600",
  Brievenronde: "bg-amber-50 text-amber-700",
  Voorschouw: "bg-violet-50 text-violet-600",
  Klant: "bg-emerald-50 text-emerald-700",
  Factuur: "bg-rose-50 text-rose-600",
  Medewerker: "bg-ink-100 text-ink-600",
  Kennisbank: "bg-teal-50 text-teal-700",
};

const resultaatLabel = (n: number, q: string) =>
  `${n} resulta${n === 1 ? "at" : "ten"} voor “${q.trim()}”`;

// Resultaatlijst, gegroepeerd per project. Gedeeld door de laptop-dropdown en het mobiele venster.
function ZoekLijst({ groepen, totaal, onKies }: { groepen: ZoekGroep[]; totaal: number; onKies: (item: ZoekItem) => void }) {
  if (totaal === 0) {
    return (
      <div className="flex flex-col items-center gap-2 px-6 py-14 text-center">
        <SearchX className="h-8 w-8 text-ink-300" />
        <p className="text-sm font-semibold text-ink-700">Niets gevonden</p>
        <p className="max-w-[16rem] text-xs text-ink-400">Probeer een adres, gemeente, klantnaam of factuurnummer.</p>
      </div>
    );
  }
  return (
    <div>
      {groepen.map((g) => (
        <section key={g.projectId ?? "overig"} className="border-b border-ink-100 last:border-0">
          {/* Projectkop */}
          <div className="sticky top-0 z-10 flex items-center gap-2.5 bg-ink-50/95 px-4 py-2.5 backdrop-blur">
            <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${g.projectId ? "bg-brand-100 text-brand-600" : "bg-ink-200 text-ink-500"}`}>
              <FolderKanban className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-bold text-ink-800">{g.titel}</div>
              {g.wijk && <div className="truncate text-[11px] text-ink-400">{g.wijk}</div>}
            </div>
            <span className="shrink-0 rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-500 ring-1 ring-ink-200">{g.items.length}</span>
          </div>
          {/* Resultaten */}
          {g.items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onKies(item)}
              className="flex w-full items-center gap-3 border-t border-ink-50 px-4 py-3 text-left transition-colors hover:bg-brand-50 active:bg-brand-100"
            >
              <span className={`inline-flex shrink-0 items-center justify-center rounded-md px-2 py-1 text-[11px] font-semibold md:w-24 ${CHIP_KLEUR[item.categorie] ?? "bg-ink-100 text-ink-600"}`}>
                {item.categorie}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-ink-900">{item.titel}</div>
                <div className="truncate text-xs text-ink-500">{item.sub}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
            </button>
          ))}
        </section>
      ))}
    </div>
  );
}

export function Topbar({
  title,
  onMenu,
  meldingen = [],
  onMelding,
  onZoek,
  onResultaat,
}: {
  title: string;
  onMenu?: () => void;
  meldingen?: Melding[];
  onMelding?: (m: Melding) => void;
  onZoek?: (q: string) => ZoekGroep[];
  onResultaat?: (item: ZoekItem) => void;
}) {
  const [open, setOpen] = useState(false);
  const [mobielZoek, setMobielZoek] = useState(false);
  const [q, setQ] = useState("");
  const aantal = meldingen.length;

  const groepen = q.trim().length >= 2 && onZoek ? onZoek(q) : [];
  const totaalResultaten = groepen.reduce((s, g) => s + g.items.length, 0);
  const zoekActief = q.trim().length >= 2;

  const kiesResultaat = (item: ZoekItem) => {
    onResultaat?.(item);
    setQ("");
    setMobielZoek(false);
  };

  const sluitMobielZoek = () => {
    setMobielZoek(false);
    setQ("");
  };

  return (
    <>
    <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-ink-200 bg-white/80 px-4 pb-3.5 pt-[calc(0.875rem+env(safe-area-inset-top))] backdrop-blur md:px-6 md:py-3.5">
      <button type="button" onClick={onMenu} className="-ml-1 rounded-lg p-2 text-ink-600 hover:bg-ink-100 md:hidden" title="Menu">
        <Menu className="h-5 w-5" />
      </button>
      <div className="min-w-0">
        <h1 className="truncate text-lg font-bold text-ink-900">{title}</h1>
        <p className="text-xs text-ink-500">
          {new Date().toLocaleDateString("nl-NL", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </p>
      </div>

      {/* Zoeken — laptop / desktop */}
      <div className="relative ml-auto hidden md:block">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 z-50 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek klant, adres, gemeente of factuur…"
          className="relative z-50 w-80 rounded-xl border border-ink-200 bg-ink-50 py-2.5 pl-10 pr-9 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100 lg:w-96"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} className="absolute right-2.5 top-1/2 z-50 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-700" title="Wissen">
            <X className="h-4 w-4" />
          </button>
        )}

        {zoekActief && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setQ("")} />
            <div className="absolute right-0 z-50 mt-2 w-[34rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
              {totaalResultaten > 0 && (
                <div className="flex items-center justify-between border-b border-ink-100 px-4 py-2.5">
                  <span className="text-xs font-semibold text-ink-500">{resultaatLabel(totaalResultaten, q)}</span>
                  <span className="text-[11px] text-ink-400">{groepen.length} {groepen.length === 1 ? "groep" : "groepen"}</span>
                </div>
              )}
              <div className="scrollbar-thin max-h-[30rem] overflow-y-auto">
                <ZoekLijst groepen={groepen} totaal={totaalResultaten} onKies={kiesResultaat} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Rechts: mobiele zoekknop + meldingen */}
      <div className="ml-auto flex items-center gap-2 md:ml-0">
        {/* Mobiele zoekknop — opent een schermvullend venster */}
        <button
          type="button"
          onClick={() => setMobielZoek(true)}
          className="rounded-lg border border-ink-200 bg-white p-2 text-ink-500 hover:bg-ink-50 hover:text-ink-700 md:hidden"
          title="Zoeken"
        >
          <Search className="h-[18px] w-[18px]" />
        </button>

        {/* Meldingen */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            title={aantal > 0 ? `${aantal} melding${aantal === 1 ? "" : "en"}` : "Geen meldingen"}
            className="relative z-50 rounded-lg border border-ink-200 bg-white p-2 text-ink-500 hover:bg-ink-50 hover:text-ink-700"
          >
            <Bell className="h-[18px] w-[18px]" />
            {aantal > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                {aantal}
              </span>
            )}
          </button>

          {open && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
              <div className="absolute right-0 z-50 mt-2 w-[19rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-ink-100 px-4 py-3">
                  <span className="text-sm font-bold text-ink-900">Meldingen</span>
                  {aantal > 0 && <span className="rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">{aantal}</span>}
                </div>
                <div className="scrollbar-thin max-h-96 overflow-y-auto">
                  {aantal === 0 ? (
                    <div className="p-8 text-center text-sm text-ink-400">Geen meldingen — alles bij! 🎉</div>
                  ) : (
                    meldingen.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => { onMelding?.(m); setOpen(false); }}
                        className="flex w-full items-start gap-3 border-b border-ink-50 px-4 py-3 text-left transition-colors hover:bg-ink-50 last:border-0"
                      >
                        {m.ernst === "waarschuwing" ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-brand-500" />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-ink-900">{m.titel}</div>
                          <div className="text-xs text-ink-500">{m.tekst}</div>
                        </div>
                        {m.navKey && <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-ink-300" />}
                      </button>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>

      {/* Zoeken — mobiel: schermvullend venster (buiten de header, anders beperkt backdrop-blur het fixed-venster) */}
      {mobielZoek && (
        <div className="fixed inset-0 z-[60] flex flex-col bg-white md:hidden">
          <div className="flex items-center gap-2 border-b border-ink-200 px-3 py-3">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Zoek klant, adres of gemeente…"
                className="w-full rounded-xl border border-ink-200 bg-ink-50 py-2.5 pl-10 pr-9 text-sm text-ink-800 outline-none placeholder:text-ink-400 focus:border-brand-400 focus:bg-white focus:ring-2 focus:ring-brand-100"
              />
              {q && (
                <button type="button" onClick={() => setQ("")} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-ink-400 hover:text-ink-700" title="Wissen">
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
            <button type="button" onClick={sluitMobielZoek} className="shrink-0 rounded-lg px-3 py-2 text-sm font-semibold text-ink-600 hover:bg-ink-100">
              Sluit
            </button>
          </div>

          <div className="scrollbar-thin flex-1 overflow-y-auto">
            {!zoekActief ? (
              <div className="flex flex-col items-center gap-2 px-6 py-16 text-center">
                <Search className="h-8 w-8 text-ink-300" />
                <p className="text-sm text-ink-400">Typ minimaal 2 tekens om te zoeken.</p>
              </div>
            ) : (
              <>
                {totaalResultaten > 0 && (
                  <div className="border-b border-ink-100 px-4 py-2.5 text-xs font-semibold text-ink-500">{resultaatLabel(totaalResultaten, q)}</div>
                )}
                <ZoekLijst groepen={groepen} totaal={totaalResultaten} onKies={kiesResultaat} />
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

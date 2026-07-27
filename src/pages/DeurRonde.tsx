import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Navigation, Phone, Check, X, CalendarDays, Clock,
  DoorClosed, User, CheckCircle2, ChevronLeft, ListChecks, Ban, RotateCcw, Trash2, Loader2, ShieldCheck,
} from "lucide-react";
import {
  TIJDSLOTS, dagenVanVenster, dagLabel, magAfronden, telefoonGeldig, bezetting, voortgangVan,
  slotActief, slotMax,
} from "../lib/bodemonderzoek";
import { UITKOMST_LABEL, type AdresUitkomst, type TauwAdres, type TauwOpdracht, type TauwSlot } from "../lib/types";
import { sbBodemAfspraak, sbBodemBezoek, type BodemUitkomst } from "../lib/supabase";

// De ronde langs de deuren voor het bodemonderzoek (TAUW / Van der Helm).
// ─────────────────────────────────────────────────────────────────────────────
// Eén adres tegelijk, groot in beeld, met de knoppen onder je duim. De werknemer staat hiermee bij
// iemand op de stoep: hij noteert de naam en het telefoonnummer, vraagt of de bewoner erbij wil zijn
// als de aannemer in de tuin komt, en prikt bij "ja" meteen een dag + tijdslot binnen het venster dat
// de beheerder heeft ingesteld. Zegt de bewoner "nee", dan is het formulier na naam + telefoon klaar.
//
// De opzet volgt Voorschouwen: een eigen pagina met een vaste kop, een scrollende inhoud en een
// vastgeplakte balk onderin.

const veld =
  "w-full rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const adresRegel = (a: TauwAdres) => `${a.straat} ${a.huisnummer}`.replace(/\s+/g, " ").trim();
const plaatsRegel = (a: TauwAdres) => `${a.postcode} ${a.plaats}`.replace(/\s+/g, " ").trim();

// ── Keuzeknop "wil de bewoner erbij zijn?" ── bewust twee grote vlakken i.p.v. een radio: aan de deur
// tik je met één hand, vaak met handschoenen aan.
function KeuzeKnop({ actief, kleur, icoon, titel, uitleg, onKies }: {
  actief: boolean;
  kleur: "green" | "slate";
  icoon: React.ReactNode;
  titel: string;
  uitleg: string;
  onKies: () => void;
}) {
  const aan = kleur === "green"
    ? "border-green-500 bg-green-50 text-green-900 ring-2 ring-green-200"
    : "border-ink-400 bg-ink-50 text-ink-900 ring-2 ring-ink-200";
  return (
    <button
      type="button"
      onClick={onKies}
      aria-pressed={actief}
      className={`flex min-h-[84px] flex-1 flex-col items-center justify-center gap-1 rounded-2xl border-2 px-3 py-3 text-center transition-colors ${
        actief ? aan : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
      }`}
    >
      <span className={actief && kleur === "green" ? "text-green-600" : "text-ink-400"}>{icoon}</span>
      <span className="text-sm font-bold leading-tight">{titel}</span>
      <span className="text-[11px] leading-tight text-ink-500">{uitleg}</span>
    </button>
  );
}

// ── Dag + tijdslot kiezen ── alleen de dagen uit het venster van de beheerder, zodat er aan de deur
// niets buiten de planning gekozen kan worden.
function TijdslotKiezer({ adres, alleAdressen, dagen, sloten, onKies }: {
  adres: TauwAdres;
  alleAdressen: TauwAdres[];
  dagen: string[];
  sloten?: TauwSlot[];
  onKies: (patch: Partial<TauwAdres>) => void;
}) {
  const dagBalk = useRef<HTMLDivElement | null>(null);
  // De gekozen dag in beeld schuiven — bij drie weken passen er 15 niet naast elkaar.
  useEffect(() => {
    const el = dagBalk.current?.querySelector<HTMLElement>("[data-gekozen='true']");
    el?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [adres.datum]);

  if (!dagen.length) {
    return (
      <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
        Er is nog geen afsprakenperiode ingesteld voor deze map. Vraag de beheerder om die in te stellen —
        anders kun je geen moment afspreken.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
          <CalendarDays className="h-4 w-4 text-ink-400" /> Welke dag komt het uit?
        </div>
        <div ref={dagBalk} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {dagen.map((d) => {
            const gekozen = adres.datum === d;
            return (
              <button
                key={d}
                type="button"
                data-gekozen={gekozen}
                onClick={() => onKies({ datum: d, tijdslot: undefined })}
                className={`shrink-0 rounded-xl border-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                  gekozen ? "border-brand-500 bg-brand-50 text-brand-800" : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                }`}
              >
                {dagLabel(d)}
              </button>
            );
          })}
        </div>
      </div>

      {adres.datum && (
        <div>
          <div className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <Clock className="h-4 w-4 text-ink-400" /> Hoe laat?
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TIJDSLOTS.map((s) => {
              const gekozen = adres.tijdslot === s;
              const aan = slotActief(sloten, s);
              // Hoeveel bewoners staan er al in dit blok, en hoeveel passen er in?
              const al = bezetting(alleAdressen.filter((x) => x.id !== adres.id), adres.datum, s);
              const max = slotMax(sloten, s);
              const vol = max !== null && al >= max;
              // Uitgezette en volle blokken blijven zichtbaar maar zijn niet aan te tikken — anders snapt
              // de medewerker aan de deur niet waarom een blok ontbreekt.
              const uit = !aan || (vol && !gekozen);
              return (
                <button
                  key={s}
                  type="button"
                  disabled={uit}
                  onClick={() => onKies({ tijdslot: s })}
                  className={`relative rounded-xl border-2 px-2 py-3 text-sm font-semibold transition-colors ${
                    gekozen
                      ? "border-brand-500 bg-brand-50 text-brand-800"
                      : uit
                        ? "cursor-not-allowed border-ink-200 bg-ink-100 text-ink-400"
                        : "border-ink-200 bg-white text-ink-700 hover:bg-ink-50"
                  }`}
                >
                  {s.replace("-", " – ")}
                  <span className="mt-0.5 block text-[10px] font-medium">
                    {!aan ? "niet beschikbaar" : max !== null ? `${al}/${max}${vol ? " · vol" : ""}` : al > 0 ? `${al} gepland` : "vrij"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function DeurRonde({ opdracht, adressen, onOpslaan, onTerug }: {
  opdracht: TauwOpdracht;
  adressen: TauwAdres[]; // alleen de adressen van deze medewerker, in looproute
  onOpslaan: (adresId: string, patch: Partial<TauwAdres>) => void;
  onTerug: () => void;
}) {
  // Begin bij het eerste adres dat nog niet af is; is alles af, dan bij het laatste.
  const eersteOpen = Math.max(0, adressen.findIndex((a) => !a.afgerond));
  const [index, setIndex] = useState(eersteOpen === -1 ? 0 : eersteOpen);
  const [melding, setMelding] = useState("");
  // Zegt de bewoner "ja", dan gaan we naar een eigen stap voor dag + tijdslot. Op een telefoon wordt het
  // formulier anders veel te lang: adresgegevens, naam, telefoon én een raster met 15 dagen × 8 blokken.
  const [stap, setStap] = useState<"deur" | "tijdslot" | "bevestigen">("deur");
  const [bezig, setBezig] = useState(false);           // bezig met vastleggen op de server
  const [andersOpen, setAndersOpen] = useState(false); // het menu met de andere uitkomsten
  const [notitie, setNotitie] = useState("");          // notitie bij "later terugkomen"
  const bovenkant = useRef<HTMLDivElement | null>(null);

  // Dezelfde regels als de beheerder heeft ingesteld: periode, werkdagen en feestdagen.
  const dagen = useMemo(() => dagenVanVenster(opdracht.venster), [opdracht.venster]);
  const voortgang = voortgangVan(adressen);
  const adres = adressen[index];

  // Bij een volgend adres (of een volgende stap) weer bovenaan beginnen.
  useEffect(() => { bovenkant.current?.scrollIntoView({ block: "start" }); setMelding(""); }, [index, stap]);
  // Nieuw adres = terug naar de deur-stap.
  useEffect(() => { setStap("deur"); }, [index]);

  if (!adres) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <ListChecks className="mx-auto h-10 w-10 text-ink-300" />
        <h2 className="mt-3 text-lg font-bold text-ink-900">Geen adressen</h2>
        <p className="mt-1 text-sm text-ink-500">Er zijn nog geen adressen aan jou toegewezen in deze map.</p>
        <button type="button" onClick={onTerug} className="mt-4 rounded-lg border border-ink-200 px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Terug</button>
      </div>
    );
  }

  const zet = (patch: Partial<TauwAdres>) => {
    onOpslaan(adres.id, patch);
    setMelding("");
  };
  const controle = magAfronden(adres);
  const laatste = index >= adressen.length - 1;

  const volgende = () => { if (!laatste) setIndex((i) => i + 1); else onTerug(); };

  // Doorlopen naar de volgende stap; het echte vastleggen gebeurt op het bevestigingsscherm.
  const verder = () => {
    if (adres.aanwezig === "ja" && stap === "deur" && (!adres.datum || !adres.tijdslot)) { setStap("tijdslot"); return; }
    if (!controle.ok) { setMelding(controle.reden); return; }
    setStap("bevestigen");
  };

  // Definitief vastleggen. Bij "ja" gaat de afspraak naar de server, die de capaciteit van het tijdblok
  // bewaakt: is een collega je net voor geweest, dan krijg je dat hier te zien in plaats van dat je
  // allebei denkt dat het gelukt is.
  const legVast = async () => {
    if (!controle.ok) { setMelding(controle.reden); return; }
    setBezig(true);
    setMelding("");
    try {
      if (adres.aanwezig === "ja") {
        const r = await sbBodemAfspraak({
          projectId: opdracht.id, adresId: adres.id,
          datum: adres.datum, tijdslot: adres.tijdslot!,
          naam: adres.bewoner, telefoon: adres.telefoon, email: adres.email ?? "", notitie: adres.notitie,
        });
        if (!r.ok) {
          // Blok vol of dag niet toegestaan → terug naar de tijdslotkeuze met de reden erbij.
          setMelding(r.error ?? "De afspraak kon niet worden vastgelegd.");
          setStap("tijdslot");
          return;
        }
      }
      zet({ uitkomst: "afgerond", afgerond: true, afgerondOp: new Date().toISOString(), geenGehoor: false });
      volgende();
    } finally {
      setBezig(false);
    }
  };

  // De uitkomsten waarbij er géén afspraak komt. De server houdt de geschiedenis bij (1e/2e/3e poging),
  // maar dat mag het doorlopen nooit ophouden — lukt het niet, dan staat het lokaal en synct het later.
  const sluitAf = (uitkomst: AdresUitkomst) => {
    const isNietThuis = uitkomst === "niet_thuis";
    zet({
      uitkomst,
      afgerond: uitkomst === "weigert" || uitkomst === "ongeldig",
      geenGehoor: isNietThuis,
      pogingen: isNietThuis ? (adres.pogingen ?? 0) + 1 : adres.pogingen,
      notitie: notitie.trim() ? [adres.notitie, notitie.trim()].filter(Boolean).join(" · ") : adres.notitie,
    });
    void sbBodemBezoek({ projectId: opdracht.id, adresId: adres.id, uitkomst: uitkomst as BodemUitkomst, notitie: notitie.trim() });
    setNotitie("");
    setAndersOpen(false);
    volgende();
  };

  const navUrl = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${adresRegel(adres)}, ${plaatsRegel(adres)}`)}`;

  // ── Laatste stap: alles op een rij ── zodat niemand per ongeluk een adres afsluit met een typefout
  // in het telefoonnummer of op de verkeerde dag.
  if (stap === "bevestigen") {
    return (
      <div ref={bovenkant} className="mx-auto max-w-2xl pb-28">
        <div className="sticky top-0 z-20 -mx-4 border-b border-ink-100 bg-white/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-b-xl">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStap(adres.aanwezig === "ja" ? "tijdslot" : "deur")} aria-label="Terug" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-ink-900">Klopt dit?</div>
              <div className="truncate text-xs text-ink-500">Controleer het even voordat je afrondt</div>
            </div>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
          {[
            { label: "Adres", waarde: `${adresRegel(adres)}, ${plaatsRegel(adres)}` },
            { label: "Bewoner", waarde: adres.bewoner || "\u2014" },
            { label: "Telefoon", waarde: adres.telefoon || "\u2014" },
            ...(adres.email ? [{ label: "E-mail", waarde: adres.email }] : []),
            { label: "Wil erbij zijn", waarde: adres.aanwezig === "ja" ? "Ja" : "Nee" },
            ...(adres.aanwezig === "ja"
              ? [{ label: "Afspraak", waarde: `${dagLabel(adres.datum)} \u00b7 ${adres.tijdslot?.replace("-", " \u2013 ")}` }]
              : [{ label: "Toestemming tuin", waarde: adres.toestemmingTuin ? "Gegeven" : "Nog niet aangevinkt" }]),
          ].map((r, i) => (
            <div key={r.label} className={`flex items-start justify-between gap-3 px-4 py-3 ${i ? "border-t border-ink-100" : ""}`}>
              <span className="text-sm text-ink-500">{r.label}</span>
              <span className="text-right text-sm font-semibold text-ink-900">{r.waarde}</span>
            </div>
          ))}
        </div>

        {adres.aanwezig === "nee" && !adres.toestemmingTuin && (
          <label className="mt-3 flex items-start gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50 px-4 py-3">
            <input
              type="checkbox"
              checked={!!adres.toestemmingTuin}
              onChange={(e) => zet({ toestemmingTuin: e.target.checked })}
              className="mt-0.5 h-5 w-5 shrink-0"
            />
            <span className="text-sm text-amber-900">
              <span className="block font-semibold">Bewoner geeft toestemming voor toegang tot de tuin</span>
              <span className="block text-xs text-amber-800">Nodig omdat de aannemer er zonder de bewoner aan de slag gaat.</span>
            </span>
          </label>
        )}

        {melding && <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{melding}</div>}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button type="button" onClick={() => setStap(adres.aanwezig === "ja" ? "tijdslot" : "deur")} className="rounded-xl border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              Aanpassen
            </button>
            <button
              type="button"
              onClick={() => void legVast()}
              disabled={bezig || (adres.aanwezig === "nee" && !adres.toestemmingTuin)}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:bg-ink-300"
            >
              {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <ShieldCheck className="h-5 w-5" />}
              {adres.aanwezig === "ja" ? "Afspraak vastleggen" : "Adres afronden"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Stap 2: het moment prikken ── een eigen scherm, alleen voor bewoners die erbij willen zijn.
  if (stap === "tijdslot") {
    const compleet = !!adres.datum && !!adres.tijdslot;
    return (
      <div ref={bovenkant} className="mx-auto max-w-2xl pb-28">
        <div className="sticky top-0 z-20 -mx-4 border-b border-ink-100 bg-white/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-b-xl">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => setStap("deur")} aria-label="Terug naar het adres" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-ink-900">Moment afspreken</div>
              <div className="truncate text-xs text-ink-500">{adresRegel(adres)} · {adres.bewoner || "bewoner"}</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50/60 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-green-800">
            <Check className="h-4 w-4" /> Deze bewoner wil erbij zijn
          </div>
          <p className="mt-0.5 text-xs text-green-700">Kies samen een dag en een tijdblok binnen de afgesproken periode.</p>
        </div>

        <div className="mt-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
          <TijdslotKiezer adres={adres} alleAdressen={adressen} dagen={dagen} sloten={opdracht.venster?.sloten} onKies={zet} />
        </div>

        {compleet && (
          <div className="mt-3 rounded-2xl border border-ink-200 bg-white px-4 py-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-ink-400">Afgesproken</div>
            <div className="mt-0.5 text-base font-bold text-ink-900">
              {dagLabel(adres.datum)} · {adres.tijdslot?.replace("-", " – ")}
            </div>
          </div>
        )}

        {melding && <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{melding}</div>}

        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <button type="button" onClick={() => setStap("deur")} className="rounded-xl border border-ink-200 px-4 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              Terug
            </button>
            <button
              type="button"
              onClick={verder}
              className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white ${compleet ? "bg-brand-600 hover:bg-brand-700" : "bg-ink-300"}`}
            >
              <Check className="h-5 w-5" />
              {laatste ? "Afronden" : "Afronden & volgende"}
              {!laatste && <ArrowRight className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div ref={bovenkant} className="mx-auto max-w-2xl pb-28">
      {/* Kop: waar ben ik, hoe ver ben ik */}
      <div className="sticky top-0 z-20 -mx-4 border-b border-ink-100 bg-white/95 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-b-xl">
        <div className="flex items-center gap-3">
          <button type="button" onClick={onTerug} aria-label="Terug naar de lijst" className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-bold text-ink-900">{opdracht.referentie || "Bodemonderzoek"}</div>
            <div className="text-xs text-ink-500">
              Adres {index + 1} van {adressen.length} · {voortgang.afgerond} afgerond
            </div>
          </div>
          <div className="text-right text-xs font-semibold text-ink-500">
            {Math.round((voortgang.afgerond / Math.max(1, adressen.length)) * 100)}%
          </div>
        </div>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-100">
          <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${(voortgang.afgerond / Math.max(1, adressen.length)) * 100}%` }} />
        </div>
      </div>

      {/* Het adres */}
      <div className="mt-4 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-xl font-bold leading-tight text-ink-900">{adresRegel(adres) || "Onbekend adres"}</div>
            <div className="text-sm text-ink-500">{plaatsRegel(adres)}</div>
          </div>
          <div className="flex shrink-0 gap-1.5">
            {adres.telefoon && telefoonGeldig(adres.telefoon) && (
              <a href={`tel:${adres.telefoon.replace(/\s/g, "")}`} aria-label="Bellen" className="rounded-xl border border-ink-200 p-2.5 text-ink-600 hover:bg-ink-50">
                <Phone className="h-5 w-5" />
              </a>
            )}
            <a href={navUrl} target="_blank" rel="noreferrer" aria-label="Route" className="rounded-xl border border-ink-200 p-2.5 text-ink-600 hover:bg-ink-50">
              <Navigation className="h-5 w-5" />
            </a>
          </div>
        </div>
        {adres.notitie && <div className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{adres.notitie}</div>}
        {adres.geenGehoor && (
          <div className="mt-2 rounded-lg bg-ink-100 px-3 py-2 text-sm text-ink-600">
            Eerder niemand thuis getroffen ({adres.pogingen ?? 1}×).
          </div>
        )}
      </div>

      {/* Gegevens van de bewoner */}
      <div className="mt-3 space-y-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <User className="h-4 w-4 text-ink-400" /> Naam bewoner
          </span>
          <input
            value={adres.bewoner}
            onChange={(e) => zet({ bewoner: e.target.value })}
            placeholder="Bijv. Fam. Jansen"
            autoComplete="off"
            className={veld}
          />
        </label>
        <label className="block">
          <span className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-ink-700">
            <Phone className="h-4 w-4 text-ink-400" /> Telefoonnummer
          </span>
          <input
            value={adres.telefoon}
            onChange={(e) => zet({ telefoon: e.target.value })}
            placeholder="06 12 34 56 78"
            type="tel"
            inputMode="tel"
            autoComplete="off"
            className={`${veld} ${adres.telefoon && !telefoonGeldig(adres.telefoon) ? "border-amber-400" : ""}`}
          />
          {adres.telefoon && !telefoonGeldig(adres.telefoon) && (
            <span className="mt-1 block text-xs text-amber-700">Dit lijkt geen Nederlands telefoonnummer.</span>
          )}
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-ink-700">E-mailadres <span className="font-normal text-ink-400">(mag leeg)</span></span>
          <input
            value={adres.email ?? ""}
            onChange={(e) => zet({ email: e.target.value })}
            placeholder="naam@voorbeeld.nl"
            type="email"
            inputMode="email"
            autoComplete="off"
            className={veld}
          />
        </label>
      </div>

      {/* De vraag die de splitsing maakt */}
      <div className="mt-3 rounded-2xl border border-ink-200 bg-white p-4 shadow-sm">
        <div className="mb-2 text-sm font-semibold text-ink-700">Wil de bewoner erbij zijn tijdens het bodemonderzoek?</div>
        <div className="flex gap-2">
          <KeuzeKnop
            actief={adres.aanwezig === "ja"}
            kleur="green"
            icoon={<Check className="h-6 w-6" />}
            titel="Ja, erbij zijn"
            uitleg="Samen een moment afspreken"
            onKies={() => { zet({ aanwezig: "ja" }); setStap("tijdslot"); }}
          />
          <KeuzeKnop
            actief={adres.aanwezig === "nee"}
            kleur="slate"
            icoon={<X className="h-6 w-6" />}
            titel="Nee, hoeft niet"
            uitleg="Aannemer mag zo de tuin in"
            onKies={() => zet({ aanwezig: "nee", datum: "", tijdslot: undefined })}
          />
        </div>

        {adres.aanwezig === "ja" && (
          <button
            type="button"
            onClick={() => setStap("tijdslot")}
            className="mt-3 flex w-full items-center justify-between gap-2 rounded-xl border-2 border-green-300 bg-green-50 px-4 py-3 text-left hover:bg-green-100"
          >
            <span>
              <span className="block text-xs font-semibold uppercase tracking-wide text-green-700">Afspraak</span>
              <span className="block text-sm font-bold text-green-900">
                {adres.datum && adres.tijdslot ? `${dagLabel(adres.datum)} · ${adres.tijdslot.replace("-", " – ")}` : "Nog geen moment gekozen"}
              </span>
            </span>
            <ArrowRight className="h-5 w-5 shrink-0 text-green-700" />
          </button>
        )}
        {adres.aanwezig === "nee" && (
          <div className="mt-3 rounded-lg bg-ink-50 px-3 py-2 text-sm text-ink-600">
            Klaar zo — voor dit adres zijn alleen de naam en het telefoonnummer nodig.
          </div>
        )}
      </div>

      {melding && (
        <div className="mt-3 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{melding}</div>
      )}

      {/* Geen afspraak: waarom niet? Elk adres krijgt een eigen reden, zodat er niets zoekraakt. */}
      {andersOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-black/40" onClick={() => setAndersOpen(false)}>
          <div className="w-full rounded-t-2xl bg-white p-4 pb-6" onClick={(e) => e.stopPropagation()}>
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-ink-200" />
            <h3 className="mb-1 text-base font-bold text-ink-900">Geen afspraak gemaakt</h3>
            <p className="mb-3 text-sm text-ink-500">Wat is er aan de hand bij {adresRegel(adres)}?</p>
            <input
              value={notitie}
              onChange={(e) => setNotitie(e.target.value)}
              placeholder="Notitie (bijv. 'na 18:00 terugkomen')"
              className="mb-3 w-full rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-brand-400"
            />
            <div className="space-y-2">
              {([
                ["niet_thuis", <DoorClosed key="a" className="h-5 w-5" />, "Niemand thuis, ik kom terug"],
                ["later", <RotateCcw key="b" className="h-5 w-5" />, "Later terugkomen (afgesproken moment)"],
                ["weigert", <Ban key="c" className="h-5 w-5" />, "Bewoner wil niet meewerken"],
                ["ongeldig", <Trash2 key="d" className="h-5 w-5" />, "Adres bestaat niet / leegstand"],
              ] as [AdresUitkomst, React.ReactNode, string][]).map(([u, icoon, uitleg]) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => sluitAf(u)}
                  className="flex w-full items-center gap-3 rounded-xl border border-ink-200 px-4 py-3 text-left hover:bg-ink-50"
                >
                  <span className="text-ink-500">{icoon}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-ink-900">{UITKOMST_LABEL[u]}</span>
                    <span className="block text-xs text-ink-500">{uitleg}</span>
                  </span>
                </button>
              ))}
            </div>
            <button type="button" onClick={() => setAndersOpen(false)} className="mt-3 w-full rounded-xl px-4 py-3 text-sm font-semibold text-ink-500 hover:bg-ink-50">
              Annuleren
            </button>
          </div>
        </div>
      )}

      {/* Vaste balk onderin — binnen duimbereik */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-ink-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center gap-2">
          <button
            type="button"
            onClick={() => setIndex((i) => Math.max(0, i - 1))}
            disabled={index === 0}
            aria-label="Vorige adres"
            className="rounded-xl border border-ink-200 p-3 text-ink-600 hover:bg-ink-50 disabled:opacity-30"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => setAndersOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-ink-200 px-3 py-3 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <DoorClosed className="h-4 w-4" /> Geen afspraak
          </button>
          <button
            type="button"
            onClick={verder}
            className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white ${
              controle.ok ? "bg-brand-600 hover:bg-brand-700" : "bg-ink-300"
            }`}
          >
            {adres.afgerond ? <CheckCircle2 className="h-5 w-5" /> : <Check className="h-5 w-5" />}
            {laatste ? "Afronden" : "Afronden & volgende"}
            {!laatste && <ArrowRight className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}

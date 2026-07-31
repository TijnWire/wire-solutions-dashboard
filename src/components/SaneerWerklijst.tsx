import { useEffect, useRef, useState } from "react";
import { Phone, Check, Mail, Search, Loader2, MapPin, Navigation, Users } from "lucide-react";
import { wijzigFlowAdres, type FlowAdres } from "../lib/saneerflowWerk";

// Alleen wat we van een groep nodig hebben. Het dossier levert een lichtere vorm dan de volledige
// Cluster, en die hoeven we hier niet compleet te maken om een naam en een datum te tonen.
type WerkGroep = { id: string; naam: string; toegewezen_aan: string | null; definitieve_datum: string };

// Saneren — één werklijst voor alle adressen van een dossier.
// ─────────────────────────────────────────────────────────────────────────────
// Het was eerst een stappenplan: "Langs de deur" was een pagina, "Bellen" was een andere pagina, en
// je moest bovenin van de één naar de ander klikken. Maar het is één stapel adressen. Of je bij een
// adres moet aanbellen of moet bellen hangt alleen af van of je het nummer hebt — dat is geen andere
// stap in het werk, dat is een eigenschap van dat ene adres. En zodra je aan de deur een nummer
// opschrijft verhuist het adres van de ene pagina naar de andere, waardoor het onder je handen
// wegschuift.
//
// Dus: één lijst. De knoppen bovenin verbergen alleen wat je nu even niet hoeft te zien.
//
// ── WAT JE AAN DE DEUR DOET ──
// Er zijn precies drie uitkomsten, en die staan alle drie op de regel:
//   1. Ze doen open en gaan akkoord met de dag  → Afgesproken
//   2. Ze doen open maar willen gebeld worden   → nummer invullen, hij schuift naar Te bellen
//   3. Niemand thuis                            → Kaartje in de bus, dat ze ons terugbellen
// Meer smaken zijn er niet, dus meer knoppen horen er ook niet te zijn.

export type Beeld = "deur" | "bellen" | "klaar" | "alles";

const adresTekst = (a: FlowAdres) => `${a.straat} ${a.huisnummer}${a.toevoeging}`.replace(/\s+/g, " ").trim();

// Een Nederlands nummer is 10 cijfers vanaf de 0, of 11 vanaf 31. Zodra het compleet is hoeft er
// niemand meer op "bewaren" te drukken — aan een deur, met een telefoon in je hand, is dat precies
// de handeling die je vergeet.
const cijfers = (t: string) => t.replace(/\D/g, "");
export function nummerCompleet(t: string): boolean {
  const c = cijfers(t);
  return (c.startsWith("31") && c.length === 11) || (c.startsWith("0") && c.length === 10);
}

// In welk beeld hoort dit adres?
export function beeldVan(a: FlowAdres): Exclude<Beeld, "alles"> {
  if (a.belstatus === "akkoord" || a.belstatus === "weigert") return "klaar";
  return a.telefoon.trim() ? "bellen" : "deur";
}

// De zeef hoort bij de kop en niet bij de lijst: staat hij in de lijst, dan schuift hij bij het
// scrollen onder de vastgezette kop door en zie je hem half. Hij wordt daarom apart aangeleverd en
// bovenin meegezet, zodat kop en zeef één blok zijn dat blijft staan.
export function WerklijstZeef({ adressen, beeld, setBeeld, zoek, setZoek }: {
  adressen: FlowAdres[];
  beeld: Beeld; setBeeld: (b: Beeld) => void;
  zoek: string; setZoek: (z: string) => void;
}) {
  const tel = (b: Exclude<Beeld, "alles">) => adressen.filter((a) => beeldVan(a) === b).length;
  const knopjes = ([
    ["deur", "Langs de deur", tel("deur")],
    ["bellen", "Te bellen", tel("bellen")],
    ["klaar", "Klaar", tel("klaar")],
    ["alles", "Alles", adressen.length],
  ] as const);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {knopjes.map(([k, label, n]) => (
        <button key={k} type="button" onClick={() => setBeeld(k)}
          className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition-colors ${
            beeld === k ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
          {label}
          <span className={`rounded-full px-1.5 text-xs ${beeld === k ? "bg-white/25" : "bg-ink-100 text-ink-500"}`}>{n}</span>
        </button>
      ))}
      <div className="relative ml-auto w-full sm:w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Straat, bewoner of nummer…"
          className="w-full rounded-xl border border-ink-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400" />
      </div>

      {/* Wat je op dit beeld doet. Stond eerst in de lijst, en verdween dus half onder de kop zodra
          je ging scrollen. Hij hoort bij de zeef: hij verandert mee met wat je aanklikt. */}
      <p className="w-full text-sm text-ink-600">
        {beeld === "deur" ? "Rijd langs deze deuren. Gaan ze akkoord met de dag? Vink af. Willen ze gebeld worden? Vul het nummer in. Niemand thuis? Kaartje in de bus."
          : beeld === "bellen" ? "Van deze adressen heb je een nummer. Bel ze en spreek de dag af waarop iedereen thuis moet zijn."
          : beeld === "klaar" ? "Hier is het rond. Blijft staan zodat je kunt terugkijken wat er is afgesproken."
          : "Alle adressen van dit dossier bij elkaar."}
      </p>
    </div>
  );
}

export function SaneerWerklijst({ adressen, clusters, naamVan, onWijzig, beeld, setBeeld, zoek }: {
  adressen: FlowAdres[];
  clusters: WerkGroep[];
  naamVan: (id?: string | null) => string;
  onWijzig: () => void;
  beeld: Beeld; setBeeld: (b: Beeld) => void;
  zoek: string;
}) {
  const [bezig, setBezig] = useState<string>("");
  const [concept, setConcept] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});

  // Het beeld waar niets meer in staat, hoef je niet open te houden. Heb je alle deuren gehad, dan
  // sta je vanzelf in de bellijst — dat is immers waar het werk dan ligt.
  const inBeeld = (b: Exclude<Beeld, "alles">) => adressen.filter((a) => beeldVan(a) === b);
  const telDeur = inBeeld("deur").length, telBellen = inBeeld("bellen").length;
  useEffect(() => {
    if (beeld === "deur" && telDeur === 0 && telBellen > 0) setBeeld("bellen");
  }, [beeld, telDeur, telBellen]);

  const q = zoek.trim().toLowerCase();
  const lijst = adressen
    .filter((a) => beeld === "alles" || beeldVan(a) === beeld)
    .filter((a) => !q || `${adresTekst(a)} ${a.postcode} ${a.bewoner} ${a.telefoon}`.toLowerCase().includes(q));

  const clusterVan = (a: FlowAdres) => clusters.find((k) => k.id === a.cluster_id);

  const zet = async (a: FlowAdres, patch: Partial<FlowAdres>) => {
    setBezig(a.id);
    await wijzigFlowAdres(a.id, patch);
    setBezig("");
    onWijzig();
  };

  // Tikt iemand een compleet nummer, dan gaat het na een korte stilte vanzelf mee. Geen knop, geen
  // "weet je het zeker" — het staat er of het staat er niet.
  const tikNummer = (a: FlowAdres, waarde: string) => {
    setConcept((c) => ({ ...c, [a.id]: waarde }));
    window.clearTimeout(timers.current[a.id]);
    if (!nummerCompleet(waarde)) return;
    timers.current[a.id] = window.setTimeout(() => {
      void zet(a, { telefoon: waarde.trim() });
      setConcept((c) => { const n = { ...c }; delete n[a.id]; return n; });
    }, 600);
  };

  return (
    <div className="space-y-3">
      {lijst.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white p-10 text-center">
          <MapPin className="mx-auto h-8 w-8 text-ink-300" />
          <p className="mt-2 text-sm text-ink-500">
            {q ? `Niets gevonden voor "${zoek}".`
              : beeld === "deur" ? "Geen deuren meer — van elk adres is een nummer bekend."
              : beeld === "bellen" ? "Niemand te bellen. Haal eerst nummers op aan de deur."
              : beeld === "klaar" ? "Nog niets rond."
              : "Nog geen adressen ingelezen."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {lijst.map((a) => {
            const b = beeldVan(a);
            const k = clusterVan(a);
            const waarde = concept[a.id] ?? a.telefoon;
            const bezigNu = bezig === a.id;
            return (
              <div key={a.id} className={`rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
                b === "klaar" ? "border-green-200 bg-green-50/40" : a.kaartje_op ? "border-amber-200" : "border-ink-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-base font-bold text-ink-900">{adresTekst(a)}</span>
                      {b === "klaar" && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-800">
                          <Check className="h-3 w-3" /> {a.belstatus === "weigert" ? "Werkt niet mee" : "Afgesproken"}
                        </span>
                      )}
                      {b !== "klaar" && a.kaartje_op && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">
                          <Mail className="h-3 w-3" /> Kaartje in de bus
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-ink-500">
                      {[a.postcode, a.plaats, a.bewoner || null, k?.naam || a.cluster_naam || null,
                        k?.toegewezen_aan ? naamVan(k.toegewezen_aan) : null].filter(Boolean).join(" · ")}
                    </div>
                  </div>

                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${adresTekst(a)}, ${a.postcode} ${a.plaats}`)}`}
                    target="_blank" rel="noopener noreferrer" title="Route hierheen"
                    className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-ink-100 hover:text-brand-600">
                    <Navigation className="h-4 w-4" />
                  </a>
                </div>

                {/* De handelingen. Alleen die van dit adres — een gebeld adres heeft geen kaartje nodig. */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {b !== "klaar" && (
                    <>
                      {a.telefoon.trim() ? (
                        <a href={`tel:${a.telefoon}`} className="inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2.5 font-mono text-sm font-bold text-green-700 ring-1 ring-green-200 hover:bg-green-50">
                          <Phone className="h-4 w-4" /> {a.telefoon}
                        </a>
                      ) : (
                        <input
                          value={waarde}
                          onChange={(e) => tikNummer(a, e.target.value)}
                          inputMode="tel"
                          placeholder="06 12 34 56 78"
                          aria-label={`Telefoonnummer ${adresTekst(a)}`}
                          className="w-44 rounded-xl border border-ink-200 px-3 py-2.5 font-mono text-sm outline-none placeholder:text-ink-300 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                      )}

                      <button type="button" disabled={bezigNu} onClick={() => void zet(a, { belstatus: "akkoord" })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
                        {bezigNu ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Afgesproken
                      </button>

                      {b === "deur" && !a.kaartje_op && (
                        <button type="button" disabled={bezigNu} onClick={() => void zet(a, { kaartje_op: new Date().toISOString().slice(0, 10), bezoeken: (a.bezoeken || 0) + 1 })}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-50">
                          <Mail className="h-4 w-4" /> Kaartje in de bus
                        </button>
                      )}

                      {b === "bellen" && (
                        <button type="button" disabled={bezigNu} onClick={() => void zet(a, { belstatus: "geen_gehoor", belpogingen: (a.belpogingen || 0) + 1 })}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-50">
                          Geen gehoor{a.belpogingen ? ` (${a.belpogingen})` : ""}
                        </button>
                      )}
                    </>
                  )}

                  {b === "klaar" && (
                    <button type="button" disabled={bezigNu} onClick={() => void zet(a, { belstatus: "" })}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50 disabled:opacity-50">
                      Toch niet — terugzetten
                    </button>
                  )}

                  {k?.definitieve_datum && (
                    <span className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-ink-500">
                      <Users className="h-3.5 w-3.5" /> uitvoering {k.definitieve_datum.slice(0, 10).split("-").reverse().map(Number).join("-")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

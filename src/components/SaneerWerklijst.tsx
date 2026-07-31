import { useEffect, useRef, useState } from "react";
import { Phone, Check, Mail, Search, Loader2, MapPin, Navigation, Users, CalendarX, X, CheckSquare, Square, Trash2 } from "lucide-react";
import { wijzigFlowAdres, startRonde, type FlowAdres } from "../lib/saneerflowWerk";
import { DatumKiezer } from "./DatumKiezer";
import { Bevestig } from "./ui";

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

// "di 14 sep" — kort genoeg voor op een knop, en met de weekdag erbij, want dát is wat een bewoner
// aan de deur onthoudt. Een datum in cijfers zegt niemand iets als je hem hardop moet uitspreken.
const dagKort = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso
    : d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};

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
  // Eerst het geheel, dan de volgorde waarin het werk loopt: langs de deur, daarna bellen, en dan is
  // het klaar. Zo lees je de balk van links naar rechts als het verloop van een dossier.
  const knopjes = ([
    ["alles", "Alles", adressen.length],
    ["deur", "Langs de deur", tel("deur")],
    ["bellen", "Te bellen", tel("bellen")],
    ["klaar", "Klaar", tel("klaar")],
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

      {/* Zoeken staat links, direct boven de adressen waar het over gaat. Rechts naast de knoppen
          keek je er telkens overheen — daar zit op een laptop een halve meter niets tussen. */}
      <div className="relative w-full sm:w-72">
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

export function SaneerWerklijst({ adressen, clusters, naamVan, onWijzig, beeld, setBeeld, zoek, uitvoering, starttijd }: {
  adressen: FlowAdres[];
  clusters: WerkGroep[];
  uitvoering: string;   // de dag die op het dossier staat, zolang de groep er zelf nog geen heeft
  starttijd: string;
  naamVan: (id?: string | null) => string;
  onWijzig: () => void;
  beeld: Beeld; setBeeld: (b: Beeld) => void;
  zoek: string;
}) {
  const [bezig, setBezig] = useState<string>("");
  const [concept, setConcept] = useState<Record<string, string>>({});
  const timers = useRef<Record<string, number>>({});
  // Eén bewoner die niet kan, maakt de dag voor het hele portiek ongeldig — er wordt in één keer
  // gesaneerd, dus half is niets. Dit houdt bij welke groep een nieuwe dag zoekt.
  const [nieuweDag, setNieuweDag] = useState<{ clusterId: string; datum: string } | null>(null);
  const [dagBezig, setDagBezig] = useState(false);
  const [dagFout, setDagFout] = useState("");
  // Meerdere adressen tegelijk. In een portiek doe je vaak in één keer dezelfde handeling — vier
  // deuren op rij waar niemand thuis was, of een hele galerij die al akkoord is. Dat één voor één
  // aantikken is werk dat de app hoort te doen.
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulkBezig, setBulkBezig] = useState(false);
  // Welk adres staat op het punt uit de lijst te gaan? Verwijderen is hier zacht — de regel blijft in
  // de database — maar uit de lijst is uit de lijst, en dat wil je niet per ongeluk doen terwijl je
  // met een telefoon in je hand op een galerij staat.
  const [teVerwijderen, setTeVerwijderen] = useState<FlowAdres | null>(null);
  // Zodra er een nummer staat, hoort dit adres niet meer bij de deuren maar bij de bellijst. Dat
  // gebeurt vanzelf — maar dan verdwijnt de regel onder je handen, en zonder bericht lijkt het alsof
  // je invoer weg is. Dit meldt kort waar hij gebleven is.
  const [verhuisd, setVerhuisd] = useState("");

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

  // We rekenen altijd met wat je nú ziet: wissel je van beeld of typ je in het zoekveld, dan neemt
  // een selectie van daarvoor nooit stiekem iets mee dat buiten beeld staat.
  const gekozen = lijst.filter((a) => sel.has(a.id));
  const allesAan = lijst.length > 0 && gekozen.length === lijst.length;
  const kies = (id: string) => setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const kiesAlles = () => setSel(allesAan ? new Set() : new Set(lijst.map((a) => a.id)));

  const bulk = async (maak: (a: FlowAdres) => Partial<FlowAdres>) => {
    setBulkBezig(true);
    for (const a of gekozen) await wijzigFlowAdres(a.id, maak(a));
    setBulkBezig(false);
    setSel(new Set());
    onWijzig();
  };

  // Google Maps doet maximaal tien stops per route: het laatste adres is de bestemming, de rest zijn
  // tussenpunten. Zit je daarboven, dan zeggen we dat erbij in plaats van er stilletjes een paar weg
  // te laten — een route die zegt "8 adressen" maar er 6 rijdt, kost je een tweede rit.
  const MAX_STOPS = 10;
  const routeVoorSelectie = () => {
    const stops = gekozen.slice(0, MAX_STOPS).map((a) => `${adresTekst(a)}, ${a.postcode} ${a.plaats}`);
    const bestemming = encodeURIComponent(stops[stops.length - 1] ?? "");
    const tussen = stops.slice(0, -1).map(encodeURIComponent).join("|");
    return `https://www.google.com/maps/dir/?api=1&destination=${bestemming}${tussen ? `&waypoints=${tussen}` : ""}&travelmode=driving`;
  };
  const inGroep = (clusterId: string) => adressen.filter((a) => a.cluster_id === clusterId);

  // Een nieuwe ronde starten zet de hele groep terug op "nog af te spreken" en wist de oude dag.
  // Telefoonnummers, namen en het kaartje in de bus blijven staan: die hangen aan het adres en niet
  // aan de dag, dus je hoeft nooit opnieuw langs de deur voor een nummer dat je al had.
  const startNieuweDag = async () => {
    if (!nieuweDag?.datum) return;
    setDagBezig(true); setDagFout("");
    const r = await startRonde(nieuweDag.clusterId, nieuweDag.datum);
    setDagBezig(false);
    if (!r.ok) { setDagFout(r.fout ?? "Het starten van een nieuwe ronde mislukte."); return; }
    setNieuweDag(null);
    setBeeld("bellen");
    onWijzig();
  };

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
      setVerhuisd(adresTekst(a));
      window.setTimeout(() => setVerhuisd(""), 5000);
    }, 600);
  };

  return (
    <div className="space-y-3">
      {/* Selecteren en in één keer afhandelen. Dezelfde balk als bij Brieven & Routes, zodat je niet
          per pagina hoeft te leren hoe selecteren werkt. */}
      {lijst.length > 0 && (
        <div className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 transition-colors ${
          gekozen.length > 0 ? "border-brand-200 bg-brand-50" : "border-ink-200 bg-white"}`}>
          <button type="button" onClick={kiesAlles}
            className={`inline-flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-semibold transition-colors ${
              allesAan ? "bg-brand-600 text-white" : "text-ink-700 hover:bg-ink-100"}`}>
            {allesAan ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4 text-ink-400" />}
            {allesAan ? "Alles deselecteren" : "Alles selecteren"}
          </button>

          {gekozen.length > 0 ? (
            <>
              <span className="inline-flex items-center rounded-full bg-white px-2.5 py-1 text-xs font-bold text-brand-800 ring-1 ring-brand-200">
                {gekozen.length} geselecteerd
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                <button type="button" disabled={bulkBezig} onClick={() => void bulk(() => ({ belstatus: "akkoord" }))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-green-700 disabled:opacity-50">
                  {bulkBezig ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Afgesproken
                </button>
                <button type="button" disabled={bulkBezig}
                  onClick={() => void bulk((a) => ({ kaartje_op: new Date().toISOString().slice(0, 10), bezoeken: (a.bezoeken || 0) + 1 }))}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600 disabled:opacity-50">
                  <Mail className="h-3.5 w-3.5" /> Kaartje in de bus
                </button>
                <a href={routeVoorSelectie()} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                  <Navigation className="h-3.5 w-3.5" /> Route langs {Math.min(gekozen.length, MAX_STOPS)}
                  {gekozen.length > MAX_STOPS ? ` van ${gekozen.length}` : ""}
                </a>
              </div>
              <button type="button" onClick={() => setSel(new Set())} className="ml-auto rounded-lg px-2 py-1.5 text-xs font-medium text-ink-400 hover:text-ink-700">Wis selectie</button>
            </>
          ) : (
            <span className="text-xs text-ink-500">Vink adressen aan om ze in één keer af te handelen of er een route langs te rijden.</span>
          )}
        </div>
      )}

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
            // De groep bepaalt de dag; heeft die er nog geen, dan staat de dag van het dossier er als
            // voorstel, met erbij dat hij nog niet vaststaat.
            const dag = k?.definitieve_datum || uitvoering;
            const bezigNu = bezig === a.id;
            return (
              // Een tik op de regel selecteert hem. Dat vakje links is op een telefoon vier bij vier
              // millimeter; ernaast tikken deed niets. De knoppen houden hun eigen werking — daar
              // wordt de tik tegengehouden, anders zou "Route" het adres ook aanvinken.
              <div key={a.id} onClick={() => kies(a.id)} role="button" tabIndex={0} aria-pressed={sel.has(a.id)}
                onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); kies(a.id); } }}
                className={`cursor-pointer rounded-2xl border bg-white p-4 shadow-sm transition-colors ${
                sel.has(a.id) ? "border-brand-400 ring-2 ring-brand-200"
                  : b === "klaar" ? "border-green-200 bg-green-50/40" : a.kaartje_op ? "border-amber-200" : "border-ink-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <input type="checkbox" checked={sel.has(a.id)} onChange={() => kies(a.id)} onClick={(e) => e.stopPropagation()}
                    aria-label={`${adresTekst(a)} selecteren`}
                    className="mt-1 h-4 w-4 shrink-0 accent-brand-600" />
                  <a href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(`${adresTekst(a)}, ${a.postcode} ${a.plaats}`)}`}
                    target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} title="Route hierheen" aria-label={`Route naar ${adresTekst(a)}`}
                    className="order-last inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-400 hover:bg-brand-50 hover:text-brand-700">
                    <Navigation className="h-4 w-4" />
                  </a>
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

                </div>

                {/* Wanneer moet iedereen thuis zijn? Dat is geen bijzaak maar de kern van de
                    afspraak: het hele portiek moet op dezelfde dag thuis zijn, want er wordt in één
                    keer gesaneerd. Zonder die dag op de regel sta je aan een deur iets te beloven
                    wat je zelf niet weet. */}
                {dag && (
                  <div className="mt-2 inline-flex flex-wrap items-center gap-1.5 rounded-lg bg-ink-50 px-2.5 py-1.5 text-xs text-ink-600">
                    <Users className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    <span>Hele portiek thuis op <span className="font-bold text-ink-900">{dagKort(dag)}</span>, {starttijd || "08:00"}–16:00</span>
                    {!k?.definitieve_datum && <span className="text-ink-400">(nog niet definitief)</span>}
                  </div>
                )}

                {/* De handelingen. Alleen die van dit adres — een gebeld adres heeft geen kaartje nodig. */}
                <div className="mt-3 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
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

                      {/* De dag staat óp de knop. Je drukt hem in terwijl je met de bewoner praat, en
                          dan moet er geen twijfel zijn waar hij ja tegen zegt. */}
                      <button type="button" disabled={bezigNu} onClick={() => void zet(a, { belstatus: "akkoord" })}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
                        {bezigNu ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                        Afgesproken{dag ? ` · ${dagKort(dag)}` : ""}
                      </button>

                      {/* Een keuze die je aan en uit zet. Hij verdween eerst zodra je hem aantikte, en
                          dan kon je een vergissing niet meer terugdraaien — terwijl je juist met een
                          telefoon in je hand op een galerij staat. */}
                      {b === "deur" && (
                        <button type="button" disabled={bezigNu} aria-pressed={!!a.kaartje_op}
                          onClick={() => void zet(a, a.kaartje_op
                            ? { kaartje_op: "" }
                            : { kaartje_op: new Date().toISOString().slice(0, 10), bezoeken: (a.bezoeken || 0) + 1 })}
                          className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                            a.kaartje_op ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
                          {a.kaartje_op ? <Check className="h-4 w-4" /> : <Mail className="h-4 w-4" />} Kaartje in de bus
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

                  {/* Eén bewoner die niet kan, en de dag is voor iedereen van de baan. Dit is de knop
                      die je op dat moment nodig hebt: je staat aan die ene deur of hebt die ene aan
                      de lijn, en van daaruit zet je de hele groep in één keer terug. */}
                  {k && dag && b !== "klaar" && (
                    <button type="button" onClick={() => { setNieuweDag({ clusterId: k.id, datum: "" }); setDagFout(""); }}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-sm font-semibold text-red-600 ring-1 ring-red-200 hover:bg-red-50">
                      <CalendarX className="h-4 w-4" /> Kan niet op die dag
                    </button>
                  )}

                  {/* Uit de lijst halen staat rechtsonder, los van de knoppen die je de hele dag
                      gebruikt. Er komt eerst een vraag overheen — zie onderaan dit bestand. */}
                  <button type="button" onClick={() => setTeVerwijderen(a)}
                    title="Adres uit de lijst halen" aria-label={`${adresTekst(a)} uit de lijst halen`}
                    className="ml-auto inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-300 hover:bg-red-50 hover:text-red-600">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Wat er gaat gebeuren staat er voluit, want dit raakt niet alleen dit adres maar
                    iedereen in het portiek. Je leest het voor je op de knop drukt. */}
                {k && nieuweDag?.clusterId === k.id && (
                  <div className="mt-3 rounded-xl border border-red-200 bg-red-50/60 p-3" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-ink-900">Nieuwe dag voor het hele portiek</div>
                        <p className="mt-0.5 text-xs text-ink-600">
                          {dagKort(dag)} gaat niet door. Alle {inGroep(k.id).length} adressen van {k.naam || "deze groep"} gaan
                          terug naar ‘nog af te spreken’ en moeten opnieuw benaderd worden.
                          <span className="font-semibold text-ink-800"> De telefoonnummers die je al hebt blijven staan</span> —
                          je hoeft dus niet opnieuw langs de deur voor een nummer.
                        </p>
                      </div>
                      <button type="button" onClick={() => setNieuweDag(null)} aria-label="Sluiten"
                        className="shrink-0 rounded-lg p-1 text-ink-400 hover:bg-white hover:text-ink-700"><X className="h-4 w-4" /></button>
                    </div>

                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {/* De datumkiezer van het dashboard, niet die van de browser. Die laatste ziet er
                          op elk apparaat anders uit — en op een telefoon totaal anders dan hier. */}
                      <div className="w-48">
                        <DatumKiezer value={nieuweDag.datum} onChange={(iso) => setNieuweDag({ clusterId: k.id, datum: iso })} placeholder="Kies de nieuwe dag" />
                      </div>
                      <button type="button" disabled={!nieuweDag.datum || dagBezig} onClick={() => void startNieuweDag()}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
                        {dagBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarX className="h-4 w-4" />}
                        Alles opnieuw met deze dag
                      </button>
                    </div>
                    {dagFout && <p className="mt-2 text-xs font-semibold text-red-700">{dagFout}</p>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Waar het adres gebleven is. Eén regel, verdwijnt vanzelf, en je kunt er meteen heen. */}
      {verhuisd && (
        <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-ink-900/95 px-4 py-2.5 text-sm text-white shadow-xl">
            <Phone className="h-4 w-4 shrink-0 text-green-400" />
            <span><span className="font-semibold">{verhuisd}</span> staat nu bij Te bellen</span>
            <button type="button" onClick={() => { setBeeld("bellen"); setVerhuisd(""); }}
              className="rounded-full bg-white/15 px-3 py-1 text-xs font-bold hover:bg-white/25">Erheen</button>
          </div>
        </div>
      )}

      {/* Wat je kwijtraakt staat erin: het adres, en of er al een telefoonnummer of een afspraak bij
          stond. Dat is precies het verschil tussen "een dubbele regel weghalen" en "het werk van een
          middag weggooien". */}
      <Bevestig
        open={!!teVerwijderen}
        titel="Adres uit de lijst halen?"
        tekst={teVerwijderen
          ? `${adresTekst(teVerwijderen)} verdwijnt uit dit dossier.${
              teVerwijderen.telefoon.trim() ? ` Let op: het telefoonnummer ${teVerwijderen.telefoon} gaat mee uit beeld.` : ""}${
              teVerwijderen.belstatus === "akkoord" ? " Bij dit adres stond al een afspraak." : ""} De regel blijft in de database staan, dus terugzetten kan later nog.`
          : ""}
        bevestigLabel="Ja, eruit halen"
        bevestigTone="rood"
        onBevestig={() => {
          const a = teVerwijderen;
          setTeVerwijderen(null);
          if (a) void zet(a, { verwijderd: 1 });
        }}
        onAnnuleer={() => setTeVerwijderen(null)}
      />
    </div>
  );
}

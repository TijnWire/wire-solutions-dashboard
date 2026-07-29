import { useMemo, useState } from "react";
import {
  Navigation, PhoneCall, Mail, DoorClosed, Check, Loader2, MapPin, Route, Ban,
  ChevronRight, Search,
} from "lucide-react";
import { wijzigFlowAdres, type FlowAdres, type Cluster } from "../lib/saneerflowWerk";

// Saneren — stap 3: langs de deuren.
// ─────────────────────────────────────────────────────────────────────────────
// Wat hier écht gebeurt is niet "een afspraak maken". Aan de deur is meestal niemand thuis, of er
// doet iemand open die niet over de datum gaat. Wat je wél altijd kunt halen is een telefoonnummer —
// en dat is precies wat de volgende stap nodig heeft. Vandaar dat deze pagina daarop gebouwd is:
//
//   telefoonnummer genoteerd  →  het adres verschijnt vanzelf op de bellijst
//   niemand thuis             →  kaartje in de bus, met de datum erbij zodat de volgende collega
//                                ziet dat er al iets ligt en niet voor niets terugrijdt
//
// De route staat bovenaan: Google Maps met alle adressen van de groep als tussenstops, in de volgorde
// van de huisnummers. Onderweg heb je één hand vrij, dus alles staat groot en er is per adres één
// knop die je nodig hebt.

const knop = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";

const adresTekst = (a: FlowAdres) => `${a.straat} ${a.huisnummer}${a.toevoeging}`.replace(/\s+/g, " ").trim();
const volledig = (a: FlowAdres) => [adresTekst(a), a.postcode, a.plaats].filter(Boolean).join(", ");
const datumNL = (iso: string) => (iso ? iso.slice(0, 10).split("-").reverse().map(Number).join("-") : "");
const vandaag = () => new Date().toISOString().slice(0, 10);

// Google Maps kan in één routelink een bestemming plus tussenstops aan. Meer dan negen tussenstops
// slikt hij niet, dus knippen we een grote groep in stukken die je na elkaar rijdt.
const MAX_STOPS = 9;
function routeLinks(adressen: FlowAdres[]): string[] {
  const punten = adressen.map(volledig).filter(Boolean);
  const uit: string[] = [];
  for (let i = 0; i < punten.length; i += MAX_STOPS + 1) {
    const stuk = punten.slice(i, i + MAX_STOPS + 1);
    if (stuk.length === 0) continue;
    const bestemming = encodeURIComponent(stuk[stuk.length - 1]);
    const tussen = stuk.slice(0, -1).map(encodeURIComponent).join("|");
    uit.push(`https://www.google.com/maps/dir/?api=1&destination=${bestemming}${tussen ? `&waypoints=${tussen}` : ""}&travelmode=driving`);
  }
  return uit;
}
const naarAdres = (a: FlowAdres) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(volledig(a))}&travelmode=driving`;

// Waar staat dit adres? Bepaalt de kleur en wat er nog moet gebeuren.
type Stand = "klaar" | "kaartje" | "open" | "weigert";
const standVanAdres = (a: FlowAdres): Stand =>
  a.belstatus === "weigert" ? "weigert" : a.telefoon.trim() ? "klaar" : a.kaartje_op ? "kaartje" : "open";

const STAND: Record<Stand, { label: string; klasse: string; rand: string }> = {
  klaar:   { label: "Nummer bekend", klasse: "bg-green-100 text-green-800", rand: "border-green-200 bg-green-50/40" },
  kaartje: { label: "Kaartje in de bus", klasse: "bg-amber-100 text-amber-800", rand: "border-amber-200 bg-amber-50/40" },
  weigert: { label: "Werkt niet mee", klasse: "bg-red-100 text-red-800", rand: "border-red-200 bg-red-50/40" },
  open:    { label: "Nog langs", klasse: "bg-ink-100 text-ink-600", rand: "border-ink-200 bg-white" },
};

export function SaneerOnderweg({ cluster, adressen, onWijzig }: {
  cluster: Cluster;
  adressen: FlowAdres[];
  onWijzig: () => void;
}) {
  const [bezig, setBezig] = useState("");
  const [nummer, setNummer] = useState<Record<string, string>>({});
  const [zoek, setZoek] = useState("");
  const [alleen, setAlleen] = useState<"alles" | "open">("open");

  // Op huisnummer: zo loop je een portiek ook af.
  const opVolgorde = useMemo(() => [...adressen].sort((a, b) => {
    const na = parseInt(a.huisnummer.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.huisnummer.replace(/\D/g, ""), 10) || 0;
    return na - nb || a.toevoeging.localeCompare(b.toevoeging);
  }), [adressen]);

  const metNummer = opVolgorde.filter((a) => a.telefoon.trim()).length;
  const metKaartje = opVolgorde.filter((a) => !a.telefoon.trim() && a.kaartje_op).length;
  const nogOpen = opVolgorde.length - metNummer - metKaartje;
  const routes = useMemo(() => routeLinks(opVolgorde), [opVolgorde]);

  const zichtbaar = opVolgorde
    .filter((a) => (alleen === "alles" ? true : standVanAdres(a) === "open"))
    .filter((a) => !zoek.trim() || volledig(a).toLowerCase().includes(zoek.trim().toLowerCase()));

  async function bewaarNummer(a: FlowAdres) {
    const tel = (nummer[a.id] ?? "").trim();
    if (!tel) return;
    setBezig(a.id);
    await wijzigFlowAdres(a.id, { telefoon: tel, bezoeken: (a.bezoeken ?? 0) + 1 });
    setBezig("");
    setNummer((n) => ({ ...n, [a.id]: "" }));
    onWijzig();
  }

  async function zetKaartje(a: FlowAdres) {
    setBezig(a.id);
    await wijzigFlowAdres(a.id, { kaartje_op: a.kaartje_op ? "" : vandaag(), bezoeken: (a.bezoeken ?? 0) + 1 });
    setBezig("");
    onWijzig();
  }

  async function zetWeigert(a: FlowAdres) {
    setBezig(a.id);
    await wijzigFlowAdres(a.id, { belstatus: a.belstatus === "weigert" ? "" : "weigert" });
    setBezig("");
    onWijzig();
  }

  return (
    <div className="space-y-4">
      {/* ── De route ── */}
      <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 font-bold text-ink-900">
              <Route className="h-5 w-5 text-brand-600" /> {cluster.naam || cluster.postcode}
            </div>
            <p className="mt-0.5 text-sm text-ink-500">
              {opVolgorde.length} deuren op {cluster.postcode} · op huisnummer gezet, zoals je ze loopt
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {routes.map((url, i) => (
              <a key={url} href={url} target="_blank" rel="noreferrer"
                className={`${knop} bg-brand-600 text-white hover:bg-brand-700`}>
                <Navigation className="h-4 w-4" /> Route{routes.length > 1 ? ` ${i + 1} van ${routes.length}` : " in Maps"}
              </a>
            ))}
          </div>
        </div>
        {routes.length > 1 && (
          <p className="border-t border-ink-100 bg-ink-50/60 px-4 py-2 text-xs text-ink-500">
            Google Maps neemt maximaal {MAX_STOPS} tussenstops per route. Deze groep is daarom opgeknipt —
            rijd ze na elkaar.
          </p>
        )}
      </div>

      {/* ── Waar staan we ── */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { n: metNummer, label: "nummer bekend", kleur: "text-green-700" },
          { n: metKaartje, label: "kaartje in de bus", kleur: "text-amber-700" },
          { n: nogOpen, label: "nog langs", kleur: "text-ink-700" },
        ].map((v) => (
          <div key={v.label} className="rounded-2xl border border-ink-200 bg-white p-3 text-center">
            <div className={`text-2xl font-bold ${v.kleur}`}>{v.n}</div>
            <div className="text-xs text-ink-500">{v.label}</div>
          </div>
        ))}
      </div>

      {metNummer > 0 && (
        <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-sm text-green-900">
          <PhoneCall className="h-4 w-4 shrink-0" />
          <span>
            <b>{metNummer} {metNummer === 1 ? "adres staat" : "adressen staan"}</b> al op de bellijst bij stap 4.
            Daar maak je de afspraak.
          </span>
          <ChevronRight className="ml-auto h-4 w-4 shrink-0" />
        </div>
      )}

      {/* ── Filter ── */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1">
          {([["open", `Nog langs (${nogOpen})`], ["alles", `Alles (${opVolgorde.length})`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setAlleen(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                alleen === k ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[10rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek huisnummer…"
            className="w-full rounded-xl border border-ink-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400" />
        </div>
      </div>

      {/* ── De deuren ── */}
      {zichtbaar.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
          <Check className="mx-auto h-8 w-8 text-green-500" />
          <p className="mt-2 text-sm font-semibold text-ink-800">
            {alleen === "open" ? "Alle deuren in deze groep zijn gehad." : "Geen adres gevonden."}
          </p>
          {alleen === "open" && <p className="mt-0.5 text-sm text-ink-500">Ga door naar stap 4 om de mensen te bellen.</p>}
        </div>
      ) : (
        <div className="space-y-2">
          {zichtbaar.map((a) => {
            const stand = standVanAdres(a);
            const info = STAND[stand];
            return (
              <div key={a.id} className={`rounded-2xl border p-4 ${info.rand}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-ink-900">{adresTekst(a)}</div>
                    <div className="text-xs text-ink-500">
                      {a.postcode} {a.plaats}
                      {a.bewoner ? ` · ${a.bewoner}` : ""}
                      {a.bezoeken > 0 ? ` · ${a.bezoeken}× aangebeld` : ""}
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${info.klasse}`}>{info.label}</span>
                </div>

                {a.telefoon.trim() ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <a href={`tel:${a.telefoon}`} className={`${knop} bg-green-600 text-white hover:bg-green-700`}>
                      <PhoneCall className="h-4 w-4" /> {a.telefoon}
                    </a>
                    <a href={naarAdres(a)} target="_blank" rel="noreferrer" className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
                      <MapPin className="h-4 w-4" /> Navigeer
                    </a>
                  </div>
                ) : (
                  <>
                    {/* Het telefoonnummer is waar het hier om draait: zonder nummer kan niemand deze
                        bewoner bellen voor de afspraak, en dan moet er nóg een keer iemand langs. */}
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <input
                        value={nummer[a.id] ?? ""}
                        onChange={(e) => setNummer((n) => ({ ...n, [a.id]: e.target.value }))}
                        onKeyDown={(e) => { if (e.key === "Enter") void bewaarNummer(a); }}
                        placeholder="Telefoonnummer van de bewoner"
                        inputMode="tel"
                        className="min-w-[12rem] flex-1 rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                      <button type="button" onClick={() => void bewaarNummer(a)} disabled={bezig === a.id || !(nummer[a.id] ?? "").trim()}
                        className={`${knop} bg-brand-600 py-3 text-white hover:bg-brand-700 disabled:opacity-40`}>
                        {bezig === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Bewaren
                      </button>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <button type="button" onClick={() => void zetKaartje(a)} disabled={bezig === a.id}
                        className={`${knop} ${a.kaartje_op ? "bg-amber-100 text-amber-900" : "bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
                        {a.kaartje_op ? <Mail className="h-4 w-4" /> : <DoorClosed className="h-4 w-4" />}
                        {a.kaartje_op ? `Kaartje in de bus op ${datumNL(a.kaartje_op)}` : "Niemand thuis — kaartje in de bus"}
                      </button>
                      <a href={naarAdres(a)} target="_blank" rel="noreferrer" className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
                        <MapPin className="h-4 w-4" /> Navigeer
                      </a>
                      <button type="button" onClick={() => void zetWeigert(a)} disabled={bezig === a.id}
                        className={`${knop} ${a.belstatus === "weigert" ? "bg-red-100 text-red-800" : "bg-white text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
                        <Ban className="h-4 w-4" /> Werkt niet mee
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

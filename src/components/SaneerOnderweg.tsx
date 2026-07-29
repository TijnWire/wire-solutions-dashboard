import { useEffect, useMemo, useState } from "react";
import {
  Navigation, PhoneCall, Mail, Check, Loader2, MapPin, Ban, Search, CalendarX2, Undo2,
} from "lucide-react";
import { DatumKiezer } from "./DatumKiezer";
import {
  wijzigFlowAdres, legAntwoordVast, type FlowAdres, type Ronde, type Respons,
} from "../lib/saneerflowWerk";

// Saneren — stap 3: langs de deuren.
// ─────────────────────────────────────────────────────────────────────────────
// Eén kaart per voordeur, en daarop staat alles wat je aan die deur kunt doen. Geen aparte lijsten
// voor "het telefoonnummer" en "het antwoord op de datum": aan de deur is dat één gesprek.
//
// Twee dingen die hier bewust anders zijn dan gebruikelijk:
//
// 1. HET TELEFOONNUMMER BEWAART ZICHZELF. Je typt het en het staat er — ook als je wegklikt, de
//    pagina sluit of je telefoon in je zak stopt. Wat je typt gaat meteen op het apparaat in bewaring;
//    zodra het een volledig nummer is, gaat het naar de database en klapt het veld dicht. Een knop
//    "bewaren" die je kunt vergeten, is bij werk aan de deur een garantie op kwijtgeraakte nummers.
//
// 2. DE DATUM IS ALTIJD TERUG TE DRAAIEN. Zegt een bewoner eerst ja en later toch nee, dan klik je op
//    zijn kaart en zet je het om. Er is geen stand waarin dat niet meer kan.

const knop = "inline-flex items-center justify-center gap-2 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-colors";

const adresTekst = (a: FlowAdres) => `${a.straat} ${a.huisnummer}${a.toevoeging}`.replace(/\s+/g, " ").trim();
const volledig = (a: FlowAdres) => [adresTekst(a), a.postcode, a.plaats].filter(Boolean).join(", ");
const datumNL = (iso: string) => {
  if (!iso) return "";
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("nl-NL", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
};
const vandaag = () => new Date().toISOString().slice(0, 10);

// Wanneer is een telefoonnummer af? Nederlandse nummers zijn tien cijfers (06…, 010…), of elf met
// landnummer. Pas dán klapt het veld dicht — anders sluit hij al halverwege het intypen.
const cijfersVan = (s: string) => s.replace(/\D/g, "");
export function nummerCompleet(s: string): boolean {
  const c = cijfersVan(s);
  if (c.startsWith("31")) return c.length === 11;
  if (c.startsWith("0")) return c.length === 10;
  return false;
}

// Wat je hebt getypt maar nog niet af is, blijft op dit apparaat staan. Zo is een half ingetypt
// nummer niet weg als je wegklikt of de app sluit.
const KLAD = "wire.saneer.tel";
const leesKlad = (id: string) => { try { return localStorage.getItem(`${KLAD}.${id}`) ?? ""; } catch { return ""; } };
const schrijfKlad = (id: string, v: string) => { try { if (v) localStorage.setItem(`${KLAD}.${id}`, v); else localStorage.removeItem(`${KLAD}.${id}`); } catch { /* opslag geblokkeerd */ } };

// Google Maps neemt maximaal negen tussenstops per route; grotere groepen knippen we op.
const MAX_STOPS = 9;
function routeLinks(adressen: FlowAdres[]): string[] {
  const punten = adressen.map(volledig).filter(Boolean);
  const uit: string[] = [];
  for (let i = 0; i < punten.length; i += MAX_STOPS + 1) {
    const stuk = punten.slice(i, i + MAX_STOPS + 1);
    if (!stuk.length) continue;
    const bestemming = encodeURIComponent(stuk[stuk.length - 1]);
    const tussen = stuk.slice(0, -1).map(encodeURIComponent).join("|");
    uit.push(`https://www.google.com/maps/dir/?api=1&destination=${bestemming}${tussen ? `&waypoints=${tussen}` : ""}&travelmode=driving`);
  }
  return uit;
}
const naarAdres = (a: FlowAdres) =>
  `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(volledig(a))}&travelmode=driving`;

export function SaneerOnderweg({ adressen, ronde, responsen, onWijzig }: {
  adressen: FlowAdres[];
  ronde: Ronde | null;
  responsen: Respons[];
  onWijzig: () => void;
}) {
  const [zoek, setZoek] = useState("");
  const [alleen, setAlleen] = useState<"open" | "alles">("open");

  const opVolgorde = useMemo(() => [...adressen].sort((a, b) => {
    const na = parseInt(a.huisnummer.replace(/\D/g, ""), 10) || 0;
    const nb = parseInt(b.huisnummer.replace(/\D/g, ""), 10) || 0;
    return na - nb || a.toevoeging.localeCompare(b.toevoeging);
  }), [adressen]);

  const perAdres = useMemo(() => new Map(responsen.map((r) => [r.adres_id, r])), [responsen]);
  const routes = useMemo(() => routeLinks(opVolgorde), [opVolgorde]);

  // "Gehad" = er is een nummer én er ligt een antwoord op de datum, óf er hangt een kaartje.
  const gehad = (a: FlowAdres) => !!perAdres.get(a.id) || (!!a.telefoon.trim() && !ronde) || !!a.kaartje_op;
  const metNummer = opVolgorde.filter((a) => a.telefoon.trim()).length;
  const nogLangs = opVolgorde.filter((a) => !gehad(a)).length;

  const zichtbaar = opVolgorde
    .filter((a) => (alleen === "alles" ? true : !gehad(a)))
    .filter((a) => !zoek.trim() || volledig(a).toLowerCase().includes(zoek.trim().toLowerCase()));

  return (
    <div className="space-y-3">
      {/* Eén regel met alles wat je onderweg moet weten. */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-3">
        <div className="text-sm">
          <b className="text-ink-900">{opVolgorde.length} deuren</b>
          <span className="text-ink-500">
            {" · "}{metNummer} nummer{metNummer === 1 ? "" : "s"}
            {" · "}{nogLangs} nog langs
            {ronde?.voorgestelde_datum ? ` · voorstel ${datumNL(ronde.voorgestelde_datum)}` : ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {routes.map((url, i) => (
            <a key={url} href={url} target="_blank" rel="noreferrer" className={`${knop} bg-brand-600 text-white hover:bg-brand-700`}>
              <Navigation className="h-4 w-4" /> Route{routes.length > 1 ? ` ${i + 1}/${routes.length}` : ""}
            </a>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1">
          {([["open", `Nog langs (${nogLangs})`], ["alles", `Alles (${opVolgorde.length})`]] as const).map(([k, label]) => (
            <button key={k} type="button" onClick={() => setAlleen(k)}
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                alleen === k ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>
              {label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[9rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek huisnummer…"
            className="w-full rounded-xl border border-ink-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400" />
        </div>
      </div>

      {zichtbaar.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-ink-300 bg-white px-6 py-10 text-center">
          <Check className="mx-auto h-8 w-8 text-green-500" />
          <p className="mt-2 text-sm font-semibold text-ink-800">
            {alleen === "open" ? "Alle deuren zijn gehad." : "Geen adres gevonden."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {zichtbaar.map((a) => (
            <Deur key={a.id} adres={a} ronde={ronde} respons={perAdres.get(a.id)} onWijzig={onWijzig} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Eén voordeur ──
function Deur({ adres, ronde, respons, onWijzig }: {
  adres: FlowAdres;
  ronde: Ronde | null;
  respons?: Respons;
  onWijzig: () => void;
}) {
  const [tel, setTel] = useState(() => adres.telefoon || leesKlad(adres.id));
  const [bezig, setBezig] = useState("");
  const [andereDag, setAndereDag] = useState(false);

  // Elke toetsaanslag gaat meteen in bewaring op dit apparaat. Is het nummer af, dan gaat het door
  // naar de database en verdwijnt het kladje.
  useEffect(() => {
    if (tel === adres.telefoon) return;
    schrijfKlad(adres.id, tel);
    if (!nummerCompleet(tel)) return;
    let actief = true;
    setBezig("tel");
    void wijzigFlowAdres(adres.id, { telefoon: tel.trim(), bezoeken: (adres.bezoeken ?? 0) + 1 }).then(() => {
      if (!actief) return;
      schrijfKlad(adres.id, "");
      setBezig("");
      onWijzig();
    });
    return () => { actief = false; };
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [tel]);

  const antwoord = respons?.antwoord;
  const voorstel = ronde?.voorgestelde_datum ?? "";

  async function zetAntwoord(a: "akkoord" | "niet_akkoord", kanWel?: string) {
    if (!ronde) return;
    setBezig("antwoord");
    await legAntwoordVast({
      adres_id: adres.id, ronde_id: ronde.id, antwoord: a, via: "deur",
      telefoon: tel.trim(),
      kan_wel: a === "akkoord" && voorstel ? [voorstel] : (kanWel ? [kanWel] : []),
      kan_niet: a === "niet_akkoord" && voorstel ? [voorstel] : [],
    });
    // Is de afspraak aan de deur al rond, dan hoeft er niemand meer te bellen. Daarom zetten we de
    // belstatus meteen mee: op de belpagina staat dit adres dan groen afgevinkt in plaats van
    // bovenaan de lijst met nog te bellen mensen.
    await wijzigFlowAdres(adres.id, { belstatus: a === "akkoord" ? "akkoord" : "" });
    setBezig(""); setAndereDag(false); onWijzig();
  }

  async function zetKaartje() {
    setBezig("kaartje");
    await wijzigFlowAdres(adres.id, { kaartje_op: adres.kaartje_op ? "" : vandaag(), bezoeken: (adres.bezoeken ?? 0) + 1 });
    setBezig(""); onWijzig();
  }

  async function zetWeigert() {
    setBezig("weigert");
    await wijzigFlowAdres(adres.id, { belstatus: adres.belstatus === "weigert" ? "" : "weigert" });
    setBezig(""); onWijzig();
  }

  const rand = antwoord === "akkoord" ? "border-green-300 bg-green-50/50"
    : antwoord === "niet_akkoord" ? "border-amber-300 bg-amber-50/50"
    : adres.belstatus === "weigert" ? "border-red-300 bg-red-50/50"
    : adres.kaartje_op ? "border-amber-200 bg-white"
    : "border-ink-200 bg-white";

  return (
    <div className={`rounded-2xl border p-4 ${rand}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-lg font-bold text-ink-900">{adresTekst(adres)}</div>
          <div className="text-xs text-ink-500">
            {adres.postcode} {adres.plaats}{adres.bewoner ? ` · ${adres.bewoner}` : ""}
            {adres.kaartje_op ? ` · kaartje ${datumNL(adres.kaartje_op)}` : ""}
          </div>
        </div>
        <a href={naarAdres(adres)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:bg-ink-100">
          <MapPin className="h-4 w-4" /> Navigeer
        </a>
      </div>

      {/* ── Telefoonnummer ── af = dicht, met de belknop; nog niet af = open veld. */}
      <div className="mt-3">
        {nummerCompleet(tel) && tel === adres.telefoon ? (
          <div className="flex flex-wrap items-center gap-2">
            <a href={`tel:${adres.telefoon}`} className={`${knop} bg-green-600 text-white hover:bg-green-700`}>
              <PhoneCall className="h-4 w-4" /> {adres.telefoon}
            </a>
            <button type="button" onClick={() => setTel("")} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-400 hover:bg-ink-100 hover:text-ink-700">
              nummer wijzigen
            </button>
          </div>
        ) : (
          <div className="relative">
            <input
              value={tel}
              onChange={(e) => setTel(e.target.value)}
              placeholder="Telefoonnummer van de bewoner"
              inputMode="tel"
              autoComplete="tel"
              className="w-full rounded-xl border border-ink-200 px-4 py-3 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-400">
              {bezig === "tel" ? <Loader2 className="h-4 w-4 animate-spin" /> : tel ? "wordt bewaard" : ""}
            </span>
          </div>
        )}
      </div>

      {/* ── De datum ── altijd om te draaien, ook als er al een antwoord ligt. */}
      {ronde && voorstel && (
        <div className="mt-3">
          {antwoord === "akkoord" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-green-100 px-3 py-2 text-sm font-bold text-green-800">
                <Check className="h-4 w-4" /> Kan op {datumNL(voorstel)}
              </span>
              <button type="button" onClick={() => void zetAntwoord("niet_akkoord")} disabled={!!bezig}
                className={`${knop} bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50`}>
                <Undo2 className="h-4 w-4" /> Toch niet
              </button>
            </div>
          ) : antwoord === "niet_akkoord" ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-amber-100 px-3 py-2 text-sm font-bold text-amber-900">
                <CalendarX2 className="h-4 w-4" /> Kan niet op {datumNL(voorstel)}
              </span>
              <button type="button" onClick={() => void zetAntwoord("akkoord")} disabled={!!bezig}
                className={`${knop} bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50`}>
                <Undo2 className="h-4 w-4" /> Kan toch wel
              </button>
              <DatumKiezer value="" onChange={(d) => d && void zetAntwoord("niet_akkoord", d)} placeholder="Wanneer wel?" />
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void zetAntwoord("akkoord")} disabled={!!bezig}
                className={`${knop} bg-green-600 text-white hover:bg-green-700`}>
                {bezig === "antwoord" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Kan op {datumNL(voorstel)}
              </button>
              <button type="button" onClick={() => { setAndereDag(true); void zetAntwoord("niet_akkoord"); }} disabled={!!bezig}
                className={`${knop} bg-white text-amber-800 ring-1 ring-amber-300 hover:bg-amber-50`}>
                <CalendarX2 className="h-4 w-4" /> Kan niet
              </button>
            </div>
          )}
          {andereDag && antwoord !== "akkoord" && (
            <p className="mt-1.5 text-xs text-ink-500">Weet de bewoner wanneer het wél kan? Zet die dag erbij — dan telt hij mee bij het volgende voorstel.</p>
          )}
        </div>
      )}

      {/* ── Niemand thuis of werkt niet mee ── */}
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => void zetKaartje()} disabled={!!bezig}
          className={`${knop} ${adres.kaartje_op ? "bg-amber-100 text-amber-900" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
          {bezig === "kaartje" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          {adres.kaartje_op ? "Kaartje ligt erin" : "Niemand thuis — kaartje"}
        </button>
        <button type="button" onClick={() => void zetWeigert()} disabled={!!bezig}
          className={`${knop} ${adres.belstatus === "weigert" ? "bg-red-100 text-red-800" : "bg-white text-ink-500 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
          <Ban className="h-4 w-4" /> Werkt niet mee
        </button>
      </div>
    </div>
  );
}

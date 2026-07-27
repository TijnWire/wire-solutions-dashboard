// Bodemonderzoek (TAUW / Van der Helm) — route-indeling, verdeling over het team en tijdsloten.
// ─────────────────────────────────────────────────────────────────────────────
// De beheerder importeert de adressen; deze module zet ze in een logische looproute en verdeelt ze
// over de medewerkers die die dag op pad gaan. Daarna gaat iedereen langs de deuren en legt per adres
// vast: naam, telefoonnummer, en of de bewoner erbij wil zijn. Zegt de bewoner ja, dan prikt de
// medewerker meteen een dag + tijdslot binnen het venster dat de beheerder heeft ingesteld.
//
// Bewust GEEN taalmodel voor het sorteren: dit moet op een telefoon zonder bereik werken, meteen
// antwoorden en elke keer dezelfde uitkomst geven. Een postcode + huisnummer bevatten alle informatie
// die je nodig hebt om een route te bouwen.

import { isFeestdag } from "./feestdagen";
import type { TauwAdres } from "./types";

// De acht blokken waaruit een bewoner kan kiezen.
export const TIJDSLOTS = [
  "08:00-09:00", "09:00-10:00", "10:00-11:00", "11:00-12:00",
  "12:00-13:00", "13:00-14:00", "14:00-15:00", "15:00-16:00",
] as const;
export type Tijdslot = (typeof TIJDSLOTS)[number];

// ── Datum-helpers (lokale kalender, niet UTC — anders schuift de dag om middernacht) ──
export function vandaagISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseISO(iso: string): Date {
  const [j, m, d] = iso.split("-").map(Number);
  return new Date(j, (m ?? 1) - 1, d ?? 1);
}
function naarISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const WEEKDAG = ["zo", "ma", "di", "wo", "do", "vr", "za"];
const MAAND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

// "2026-08-03" → "ma 3 aug"
export function dagLabel(iso: string): string {
  const d = parseISO(iso);
  return `${WEEKDAG[d.getDay()]} ${d.getDate()} ${MAAND[d.getMonth()]}`;
}

// Standaard wordt er van maandag t/m vrijdag gewerkt (0 = zondag … 6 = zaterdag).
export const STANDAARD_WERKDAGEN = [1, 2, 3, 4, 5];
export const DAGNAMEN = ["zo", "ma", "di", "wo", "do", "vr", "za"];

// Alle werkbare dagen binnen het venster. De einddatum komt óf uit een vrij ingevulde einddatum, óf
// uit het aantal weken. Dagen waarop niet gewerkt wordt en feestdagen vallen weg. Dit zijn precies de
// dagen die aan de deur gekozen mogen worden — de Worker bewaakt dezelfde regels bij het opslaan.
export function vensterDagen(startISO: string, weken: number, opties?: { eind?: string; werkdagen?: number[] }): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startISO)) return [];
  const werkdagen = opties?.werkdagen?.length ? opties.werkdagen : STANDAARD_WERKDAGEN;
  const eind = opties?.eind && /^\d{4}-\d{2}-\d{2}$/.test(opties.eind) ? opties.eind : "";
  const dagen: string[] = [];
  const d = parseISO(startISO);
  // Zonder einddatum rekenen we met het aantal weken; met einddatum lopen we tot en met die dag.
  // De bovengrens van 400 dagen is puur een noodrem tegen een verkeerd ingevulde einddatum.
  const maxIteraties = eind ? 400 : Math.max(1, Math.min(3, Math.round(weken))) * 7;
  for (let i = 0; i < maxIteraties; i++) {
    const iso = naarISO(d);
    if (eind && iso > eind) break;
    if (werkdagen.includes(d.getDay()) && !isFeestdag(iso)) dagen.push(iso);
    d.setDate(d.getDate() + 1);
  }
  return dagen;
}

// Het venster van een opdracht uitrekenen, met alle instellingen erbij.
export function dagenVanVenster(v?: { start: string; weken: number; eind?: string; werkdagen?: number[] }): string[] {
  return v ? vensterDagen(v.start, v.weken, { eind: v.eind, werkdagen: v.werkdagen }) : [];
}

// Staat dit blok aan? Zonder instelling staat elk blok aan.
export function slotActief(sloten: { slot: string; actief?: boolean }[] | undefined, slot: string): boolean {
  const s = sloten?.find((x) => x.slot === slot);
  return !s || s.actief !== false;
}

// Hoeveel afspraken passen er in dit blok? Zonder instelling onbeperkt.
export function slotMax(sloten: { slot: string; max?: number }[] | undefined, slot: string): number | null {
  const s = sloten?.find((x) => x.slot === slot);
  return s && typeof s.max === "number" && s.max >= 0 ? s.max : null;
}

// ── Routesortering ──
// Huisnummer als getal + toevoeging, zodat 2, 4, 10 in die volgorde staan (en niet 10, 2, 4).
function nummerDelen(huisnummer: string): { nr: number; rest: string } {
  const m = String(huisnummer).trim().match(/^(\d+)\s*(.*)$/);
  return m ? { nr: Number(m[1]), rest: (m[2] || "").toLowerCase() } : { nr: Number.MAX_SAFE_INTEGER, rest: String(huisnummer).toLowerCase() };
}

// Postcode zonder spaties, hoofdletters: "1234 ab" → "1234AB". Leeg blijft leeg (zulke adressen
// zakken naar achteren, zodat een half ingevuld adres de route niet doorbreekt).
const pcNet = (s: string) => String(s ?? "").replace(/\s+/g, "").toUpperCase();
const tekst = (s: string) => String(s ?? "").trim().toLowerCase();

// Zet de adressen in looproute: eerst per plaats, dan per postcodegebied, dan per straat, en binnen
// een straat één kant op — eerst de even nummers oplopend, daarna de oneven aflopend. Zo loop je de
// straat aan één kant uit en aan de andere kant terug, in plaats van steeds over te steken.
export function sorteerRoute(adressen: TauwAdres[]): TauwAdres[] {
  const kopie = [...adressen];
  kopie.sort((a, b) => {
    // Half ingevulde adressen (geen plaats) helemaal achteraan: die horen niet middenin een looproute,
    // en al helemaal niet aan het begin ervan.
    const plA = tekst(a.plaats), plB = tekst(b.plaats);
    if (!plA !== !plB) return plA ? -1 : 1;
    const plaats = plA.localeCompare(plB);
    if (plaats) return plaats;
    const pcA = pcNet(a.postcode), pcB = pcNet(b.postcode);
    // Adressen zónder postcode achteraan
    if (!pcA !== !pcB) return pcA ? -1 : 1;
    const pc = pcA.slice(0, 4).localeCompare(pcB.slice(0, 4));
    if (pc) return pc;
    const straat = tekst(a.straat).localeCompare(tekst(b.straat));
    if (straat) return straat;
    const na = nummerDelen(a.huisnummer), nb = nummerDelen(b.huisnummer);
    const evenA = na.nr % 2 === 0, evenB = nb.nr % 2 === 0;
    if (evenA !== evenB) return evenA ? -1 : 1;      // eerst de even kant …
    if (na.nr !== nb.nr) return evenA ? na.nr - nb.nr : nb.nr - na.nr; // … oplopend, oneven terug
    return na.rest.localeCompare(nb.rest);
  });
  return kopie;
}

// Waar hoort dit adres bij? Adressen met dezelfde sleutel liggen naast elkaar en horen bij dezelfde
// medewerker — anders staan twee mensen in dezelfde straat te bellen.
const blokSleutel = (a: TauwAdres) => `${tekst(a.plaats)}|${pcNet(a.postcode).slice(0, 4)}|${tekst(a.straat)}`;

export type Verdeling = { userId: string; adresIds: string[] };

// Verdeelt de adressen over de opgegeven medewerkers. De route blijft heel: we lopen de gesorteerde
// lijst af en knippen alleen tussen straten, zodat niemand halverwege een straat wordt afgekapt.
// `maxPerPersoon` (optioneel) begrenst hoeveel adressen iemand krijgt — de rest blijft onverdeeld en
// is dan zichtbaar voor de beheerder om later alsnog uit te delen.
export function verdeelOverTeam(
  adressen: TauwAdres[],
  teamIds: string[],
  opties?: { maxPerPersoon?: number },
): Verdeling[] {
  const team = teamIds.filter(Boolean);
  if (!team.length || !adressen.length) return [];
  const route = sorteerRoute(adressen);
  const max = opties?.maxPerPersoon && opties.maxPerPersoon > 0 ? opties.maxPerPersoon : Infinity;

  // Straten als hele blokken, zodat we die niet doorknippen.
  const blokken: TauwAdres[][] = [];
  for (const a of route) {
    const laatste = blokken[blokken.length - 1];
    if (laatste && blokSleutel(laatste[0]) === blokSleutel(a)) laatste.push(a);
    else blokken.push([a]);
  }

  // We lopen de route één keer af en knippen hem in even grote, AANEENGESLOTEN stukken — één per
  // medewerker. Zo houdt iedereen een compact eigen gebied (geen kris-kras door de wijk) én zijn de
  // aantallen eerlijk verdeeld. Het streefaantal wordt telkens opnieuw berekend over wat er nog
  // ligt en wie er nog moeten, zodat een grote straat de rest niet scheeftrekt.
  const uit: Verdeling[] = team.map((userId) => ({ userId, adresIds: [] }));
  let w = 0;
  let rest = route.length; // nog niet toegewezen
  for (const blok of blokken) {
    const nogWerkers = team.length - w;
    const streef = Math.min(max, Math.ceil((uit[w].adresIds.length + rest) / nogWerkers));
    // Zou dit blok deze medewerker ver over zijn deel heen duwen, en is er nog een collega over?
    // Dan begint het blok bij de volgende — nooit midden in een straat afkappen.
    if (uit[w].adresIds.length > 0 && uit[w].adresIds.length + blok.length > streef && nogWerkers > 1) {
      w++;
    }
    const ruimte = max - uit[w].adresIds.length;
    if (ruimte <= 0) {
      if (w >= team.length - 1) break; // iedereen zit vol → de rest blijft onverdeeld
      w++;
    }
    for (const a of blok.slice(0, Math.max(0, max - uit[w].adresIds.length))) {
      uit[w].adresIds.push(a.id);
      rest--;
    }
  }
  return uit;
}

// ── Voortgang ──
export type Voortgang = {
  totaal: number; afgerond: number; ja: number; nee: number;
  geenGehoor: number; weigert: number; later: number; ongeldig: number;
  open: number;      // nog helemaal niet aan de deur geweest
  behandeld: number; // alles wat een uitkomst heeft (voor de voortgangsbalk)
};

export function voortgangVan(adressen: TauwAdres[]): Voortgang {
  const v: Voortgang = { totaal: adressen.length, afgerond: 0, ja: 0, nee: 0, geenGehoor: 0, weigert: 0, later: 0, ongeldig: 0, open: 0, behandeld: 0 };
  for (const a of adressen) {
    // `uitkomst` is leidend; `afgerond`/`geenGehoor` blijven werken voor adressen van vóór deze versie.
    const u = a.uitkomst ?? (a.afgerond ? "afgerond" : a.geenGehoor ? "niet_thuis" : undefined);
    switch (u) {
      case "afgerond":
        v.afgerond++;
        if (a.aanwezig === "ja") v.ja++; else if (a.aanwezig === "nee") v.nee++;
        break;
      case "niet_thuis": v.geenGehoor++; break;
      case "weigert": v.weigert++; break;
      case "later": v.later++; break;
      case "ongeldig": v.ongeldig++; break;
      default: v.open++;
    }
  }
  // Niet-thuis en "later terugkomen" horen nog langs, dus die tellen niet als klaar.
  v.behandeld = v.afgerond + v.weigert + v.ongeldig;
  return v;
}

// Is dit adres klaar om af te ronden? Naam en telefoonnummer zijn altijd nodig; zegt de bewoner ja,
// dan moeten er ook een dag en een tijdslot gekozen zijn.
export function magAfronden(a: TauwAdres): { ok: boolean; reden: string } {
  if (!a.bewoner.trim()) return { ok: false, reden: "Vul de naam van de bewoner in." };
  if (!telefoonGeldig(a.telefoon)) return { ok: false, reden: "Vul een geldig telefoonnummer in." };
  if (a.aanwezig !== "ja" && a.aanwezig !== "nee") return { ok: false, reden: "Geef aan of de bewoner erbij wil zijn." };
  if (a.aanwezig === "ja") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.datum || "")) return { ok: false, reden: "Kies een dag voor de afspraak." };
    if (!a.tijdslot) return { ok: false, reden: "Kies een tijdslot." };
  }
  return { ok: true, reden: "" };
}

// Nederlands telefoonnummer, ruim opgevat: 10 cijfers (06…/070…) of +31-notatie. Spaties, streepjes
// en haakjes mogen — mensen typen aan de deur nu eenmaal van alles.
export function telefoonGeldig(t: string): boolean {
  const c = String(t ?? "").replace(/[\s\-()./]/g, "");
  if (/^\+31\d{9}$/.test(c)) return true;
  if (/^0031\d{9}$/.test(c)) return true;
  return /^0\d{9}$/.test(c);
}

// Netjes weergeven: "0612345678" → "06 12 34 56 78", vaste nummers → "070 123 45 67".
export function telefoonNet(t: string): string {
  const c = String(t ?? "").replace(/[\s\-()./]/g, "").replace(/^\+31/, "0").replace(/^0031/, "0");
  if (!/^0\d{9}$/.test(c)) return String(t ?? "").trim();
  if (c.startsWith("06")) return `${c.slice(0, 2)} ${c.slice(2, 4)} ${c.slice(4, 6)} ${c.slice(6, 8)} ${c.slice(8)}`;
  return `${c.slice(0, 3)} ${c.slice(3, 6)} ${c.slice(6, 8)} ${c.slice(8)}`;
}

// Hoeveel bewoners staan er al op deze dag + dit tijdslot? Aan de deur zie je zo meteen hoe druk een
// blok is, zodat je niet vijf mensen op hetzelfde uur zet.
export function bezetting(adressen: TauwAdres[], datum: string, slot: string): number {
  return adressen.filter((a) => a.aanwezig === "ja" && a.datum === datum && a.tijdslot === slot).length;
}

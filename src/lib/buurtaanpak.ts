import type { BuurtAdres, BuurtSoort } from "./types";

const NL_DAGEN = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const NL_MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

// "2025-06-05" -> "Donderdag 5 juni"
export function datumLabelNL(iso: string): string {
  const [j, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!j || !m || !d) return iso;
  const dt = new Date(Date.UTC(j, m - 1, d));
  const dag = NL_DAGEN[dt.getUTCDay()];
  return `${dag.charAt(0).toUpperCase()}${dag.slice(1)} ${d} ${NL_MAANDEN[m - 1]}`;
}

// "2025-06-05" -> { dag: "Donderdag", datum: "5 juni" }
export function dagEnDatumNL(iso: string): { dag: string; datum: string } {
  const [j, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!j || !m || !d) return { dag: "", datum: iso };
  const dag = NL_DAGEN[new Date(Date.UTC(j, m - 1, d)).getUTCDay()];
  return { dag: `${dag.charAt(0).toUpperCase()}${dag.slice(1)}`, datum: `${d} ${NL_MAANDEN[m - 1]}` };
}

// Eén adres-cel ("Klaverruiter 12 ok" / "Klaverruiter 16/spanningsonderbreking 18 en 20 ok") ontleden.
function parseAdresDeel(
  raw: string,
  postcode: string,
  soort: BuurtSoort,
  gedeeld: { datum: string; telefoon: string; bevestigd: boolean; uitgevoerd: boolean },
  id: string
): BuurtAdres | null {
  let s = (raw || "").trim();
  if (!s || /geen werkzaamheden/i.test(s)) return null;
  s = s.replace(/(\s*\bok\b)+\s*$/i, "").trim(); // afsluitende "ok" (ook herhaald: "ok ok") weghalen
  if (!s) return null;
  // Huisnummer = cijfers + evt. een direct aangeplakte toevoeging ("12A"); een spatie + woord
  // (bijv. "9 aggregaat") is een bijzonderheid en hoort NIET bij het huisnummer.
  const m = s.match(/^(.*?[A-Za-zÀ-ÿ.])\s*(\d+[A-Za-z]?)(?![A-Za-z])(.*)$/);
  let straat = s, huisnummer = "", bijzonderheid = "";
  if (m) {
    straat = m[1].trim();
    huisnummer = m[2].replace(/\s+/g, "");
    bijzonderheid = m[3].replace(/^[\s/,-]+/, "").trim();
  }
  return { id, straat, huisnummer, postcode: postcode.trim(), soort, datum: gedeeld.datum, telefoon: gedeeld.telefoon, bijzonderheid, bevestigd: gedeeld.bevestigd, uitgevoerd: gedeeld.uitgevoerd };
}

// Eén Excel-rij (kolommen al als strings; datum als ISO yyyy-mm-dd) -> 0..n adressen.
function parseRij(cols: string[], rijIndex: number): BuurtAdres[] {
  const datum = (cols[1] || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return []; // kop- of lege rij
  const gedeeld = {
    datum,
    telefoon: (cols[7] || "").trim(),
    bevestigd: /ja/i.test(cols[8] || ""),
    uitgevoerd: /ja/i.test(cols[9] || ""),
  };
  const out: BuurtAdres[] = [];
  const heledag: { straat: string; postcode: string }[] = [];
  let n = 0;
  // Hele-dag-adressen: kolom 2 (+pc 3) en kolom 4 (+pc 5)
  for (const [aCol, pCol] of [[2, 3], [4, 5]] as const) {
    const a = parseAdresDeel(cols[aCol] || "", cols[pCol] || "", "heledag", gedeeld, `${datum}-h${n}-${rijIndex}`);
    if (a) { out.push(a); heledag.push({ straat: a.straat, postcode: a.postcode }); n++; }
  }
  // Korte adressen (kolom 6, tot 09:30): "/"-gescheiden lijst
  for (const stuk of (cols[6] || "").split("/")) {
    const a = parseAdresDeel(stuk, "", "kort", gedeeld, `${datum}-k${n}-${rijIndex}`);
    if (a) {
      a.postcode = a.postcode || (heledag.find((h) => h.straat.toLowerCase() === a.straat.toLowerCase())?.postcode ?? "");
      out.push(a); n++;
    }
  }
  return out;
}

// Hele "Klantafspraaklijst" -> adressen. `rijen` = array van rijen, elke rij = array celwaarden (strings; datum ISO).
export function parseKlantafspraaklijst(rijen: string[][]): BuurtAdres[] {
  return rijen.flatMap((cols, i) => parseRij(cols, i));
}

// Adressen gegroepeerd per straat (straat één keer open), binnen de straat op huisnummer gesorteerd.
export function groepeerPerStraat(adressen: BuurtAdres[]): { straat: string; adressen: BuurtAdres[] }[] {
  const map = new Map<string, BuurtAdres[]>();
  for (const a of adressen) {
    const k = a.straat || "Onbekend";
    const arr = map.get(k) ?? [];
    arr.push(a);
    map.set(k, arr);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([straat, lijst]) => ({ straat, adressen: [...lijst].sort((x, y) => (parseInt(x.huisnummer) || 0) - (parseInt(y.huisnummer) || 0)) }));
}

// Adressen gegroepeerd per UITVOERDATUM. De planning werkt per dag (~3-5 adressen, vaak wisselende
// straten omdat bewoners soms niet beschikbaar zijn) — daarom is de dag het kopje, niet de straat.
export function groepeerPerDatum(adressen: BuurtAdres[]): { datum: string; label: string; adressen: BuurtAdres[] }[] {
  const map = new Map<string, BuurtAdres[]>();
  for (const a of adressen) {
    const k = a.datum || "";
    const arr = map.get(k) ?? [];
    arr.push(a);
    map.set(k, arr);
  }
  return [...map.entries()]
    .sort((a, b) => (a[0] || "9999-99-99").localeCompare(b[0] || "9999-99-99"))
    .map(([datum, lijst]) => ({
      datum,
      label: datum ? datumLabelNL(datum) : "Zonder datum",
      adressen: [...lijst].sort((x, y) => x.straat.localeCompare(y.straat) || (parseInt(x.huisnummer) || 0) - (parseInt(y.huisnummer) || 0)),
    }));
}

// Bevestigingstekst voor de WhatsApp-groep van de opdrachtgever: per dag, per straat de huisnummers + bijzonderheden.
// bv. "Loevestein nr 13 - nr 11 - nr 9 - nr 7 - nr 5 | Vrijdag 5 juni ✅ (nr 9 aggregaat vanwege medicatie)"
export function whatsappBevestiging(adressen: BuurtAdres[]): string {
  const perDatum = new Map<string, BuurtAdres[]>();
  for (const a of adressen) {
    if (!a.datum) continue;
    const arr = perDatum.get(a.datum) ?? [];
    arr.push(a);
    perDatum.set(a.datum, arr);
  }
  const regels: string[] = [];
  for (const datum of [...perDatum.keys()].sort()) {
    const perStraat = new Map<string, BuurtAdres[]>();
    for (const a of perDatum.get(datum)!) {
      const k = a.straat || "Onbekend";
      const arr = perStraat.get(k) ?? [];
      arr.push(a);
      perStraat.set(k, arr);
    }
    for (const [straat, lijst] of perStraat) {
      const gesorteerd = [...lijst].sort((x, y) => (parseInt(y.huisnummer) || 0) - (parseInt(x.huisnummer) || 0)); // aflopend, zoals in het voorbeeld
      const nrs = gesorteerd.map((a) => `nr ${a.huisnummer}`).join(" - ");
      const notes = gesorteerd.filter((a) => a.bijzonderheid.trim()).map((a) => `nr ${a.huisnummer} ${a.bijzonderheid.trim()}`).join("; ");
      regels.push(`${straat} ${nrs} | ${datumLabelNL(datum)} ✅${notes ? ` (${notes})` : ""}`);
    }
  }
  return regels.join("\n");
}

// Per dag een aparte bevestigingstekst — zodat je dagelijks/wekelijks een update kunt sturen
// en per dag kunt bijhouden of 'ie al verstuurd is.
export function whatsappPerDag(adressen: BuurtAdres[]): { datum: string; aantal: number; tekst: string }[] {
  const perDatum = new Map<string, BuurtAdres[]>();
  for (const a of adressen) {
    if (!a.datum) continue;
    const arr = perDatum.get(a.datum) ?? [];
    arr.push(a);
    perDatum.set(a.datum, arr);
  }
  return [...perDatum.keys()].sort().map((datum) => ({
    datum,
    aantal: perDatum.get(datum)!.length,
    tekst: whatsappBevestiging(perDatum.get(datum)!),
  }));
}

// SMS-herinnering naar de bewoner (dag van tevoren) — namens STEDIN, ondertekend door de afspraakmaker.
export function smsHerinneringTekst(a: BuurtAdres, afspraakmaker = "Tijn den Haan"): string {
  const { dag, datum } = dagEnDatumNL(a.datum);
  const wanneer = a.datum ? `${dag} ${datum}` : "Binnenkort";
  return `Beste bewoners van ${a.straat} ${a.huisnummer},\n\n${wanneer} komt STEDIN bij u langs. Dit is voor de werkzaamheden om een nieuwe elektra kabel aan te leggen. Zoals afgesproken komen wij bij u aanbellen tussen 08:00-08:30.\n\nMet vriendelijke groet,\n\n${afspraakmaker} - Afspraakmaker STEDIN Netbeheer.`;
}

export function smsLink(telefoon: string, tekst: string): string {
  return `sms:${(telefoon || "").replace(/\s/g, "")}?&body=${encodeURIComponent(tekst)}`;
}

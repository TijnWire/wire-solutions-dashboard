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
  s = s.replace(/\s*\bok\b\s*$/i, "").trim(); // afsluitende "ok" weghalen
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

// SMS-herinnering naar de bewoner (dag van tevoren).
export function smsHerinneringTekst(a: BuurtAdres, bedrijf = "Wire Solutions"): string {
  const wanneer = a.soort === "kort"
    ? "tussen 08:00 en 09:30 uur"
    : "tussen 08:00 en 16:00 uur (we starten tussen 08:00 en 08:30)";
  return `Beste bewoner van ${a.straat} ${a.huisnummer}, morgen voeren wij namens Stedin werkzaamheden uit aan uw aansluiting, ${wanneer}. Met vriendelijke groet, ${bedrijf}.`;
}

export function smsLink(telefoon: string, tekst: string): string {
  return `sms:${(telefoon || "").replace(/\s/g, "")}?&body=${encodeURIComponent(tekst)}`;
}

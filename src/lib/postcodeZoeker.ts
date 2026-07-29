// Ontbrekende postcodes opzoeken bij de officiële Nederlandse adresdatabase.
// ─────────────────────────────────────────────────────────────────────────────
// Opdrachtgevers leveren regelmatig een bestand aan zónder postcode. Dat is hier geen schoonheids-
// foutje: het groeperen gaat op de volledige postcode, dus zonder postcode weet niemand welke
// adressen bij elkaar horen en wie er op dezelfde dag thuis moet zijn.
//
// We vragen het aan PDOK Locatieserver — de adressenzoeker van de overheid, gevoed door de BAG. Geen
// sleutel nodig, gratis, en het is dezelfde bron als waar de gemeente zelf mee werkt.
//
// ── DE BELANGRIJKSTE REGEL HIER ──
// Een verkeerd opgezochte postcode is erger dan een ontbrekende. Een ontbrekende zie je meteen; een
// verkeerde zet een bewoner stilletjes in de verkeerde groep, en dan staat er op de dag zelf iemand
// voor een deur die nergens van weet. Daarom accepteren we alleen een treffer die op straatnaam,
// huisnummer én woonplaats klopt, en waarbij alle kandidaten het over dezelfde postcode eens zijn.
// Bij de minste twijfel geven we niets terug en blijft het adres gewoon ter correctie staan.

const BASIS = "https://api.pdok.nl/bzk/locatieserver/search/v3_1/free";
const CACHE_SLEUTEL = "wire.postcodes";

// Vergelijken zonder gedoe over hoofdletters, spaties, streepjes en accenten (Sint-/St., Ĳ, é).
const kaal = (s: string) =>
  String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

export const netPostcode = (s: string) => {
  const t = String(s ?? "").toUpperCase().replace(/\s+/g, "");
  return /^\d{4}[A-Z]{2}$/.test(t) ? `${t.slice(0, 4)} ${t.slice(4)}` : "";
};

export type Adresvraag = { straat: string; huisnummer: string; toevoeging?: string; plaats?: string };
export type Treffer = { postcode: string; plaats: string; zeker: boolean };

type Doc = {
  postcode?: string; straatnaam?: string; woonplaatsnaam?: string;
  huisnummer?: number; huisletter?: string; huis_nlt?: string;
};

// ── Onthouden wat we al hebben opgezocht ──
// Hetzelfde bestand wordt vaak twee keer aangeleverd, en straten hebben veel huizen. Zonder dit
// geheugen belt de app de overheid honderden keren voor antwoorden die hij al kent.
function leesCache(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(CACHE_SLEUTEL) ?? "{}"); } catch { return {}; }
}
function schrijfCache(c: Record<string, string>): void {
  try {
    // Niet eindeloos laten groeien: bij 5000 gooien we de oudste helft weg.
    const sleutels = Object.keys(c);
    if (sleutels.length > 5000) for (const k of sleutels.slice(0, 2500)) delete c[k];
    localStorage.setItem(CACHE_SLEUTEL, JSON.stringify(c));
  } catch { /* opslag vol of geblokkeerd — dan gewoon zonder geheugen */ }
}

const cacheSleutel = (v: Adresvraag) =>
  `${kaal(v.straat)}|${kaal(v.huisnummer)}${kaal(v.toevoeging ?? "")}|${kaal(v.plaats ?? "")}`;

// ── Eén adres opzoeken ──
export async function zoekPostcode(v: Adresvraag, signaal?: AbortSignal): Promise<Treffer | null> {
  const nummer = parseInt(String(v.huisnummer).replace(/\D/g, ""), 10);
  if (!v.straat.trim() || !Number.isFinite(nummer)) return null;

  const cache = leesCache();
  const sleutel = cacheSleutel(v);
  if (cache[sleutel] !== undefined) {
    const bewaard = cache[sleutel];
    return bewaard ? { postcode: bewaard, plaats: v.plaats ?? "", zeker: true } : null;
  }

  // Een gerichte vraag in plaats van vrij zoeken: vrij zoeken geeft bij "Kortenhoevendijk 18" ook
  // 18A en 18B terug, en soms een heel andere straat die er een beetje op lijkt.
  const delen = [`straatnaam:"${v.straat.replace(/"/g, "")}"`, `huisnummer:${nummer}`];
  if (v.plaats?.trim()) delen.push(`woonplaatsnaam:"${v.plaats.replace(/"/g, "")}"`);
  const url = `${BASIS}?q=${encodeURIComponent(delen.join(" and "))}`
    + "&fq=type:adres&rows=25&fl=postcode,straatnaam,woonplaatsnaam,huisnummer,huisletter,huis_nlt";

  let docs: Doc[];
  try {
    const r = await fetch(url, { signal: signaal ?? AbortSignal.timeout(12000) });
    if (!r.ok) return null;
    docs = ((await r.json()) as { response?: { docs?: Doc[] } }).response?.docs ?? [];
  } catch { return null; }   // geen internet of de dienst ligt eruit — dan gewoon niets

  // Alleen treffers die echt over dit adres gaan.
  const passend = docs.filter((d) =>
    d.postcode && d.huisnummer === nummer
    && kaal(d.straatnaam ?? "") === kaal(v.straat)
    && (!v.plaats?.trim() || kaal(d.woonplaatsnaam ?? "") === kaal(v.plaats)));
  if (passend.length === 0) { cache[sleutel] = ""; schrijfCache(cache); return null; }

  // Is er een toevoeging, dan telt de treffer met precies die letter; anders die zónder letter.
  const toev = kaal(v.toevoeging ?? "");
  const exact = toev
    ? passend.find((d) => kaal(d.huisletter ?? "") === toev || kaal(d.huis_nlt ?? "").endsWith(toev))
    : passend.find((d) => !(d.huisletter ?? "").trim());

  // Zonder exacte treffer mag het alleen als alle kandidaten dezelfde postcode hebben. Zijn ze het
  // oneens, dan weten we het simpelweg niet — en dan verzinnen we niets.
  const postcodes = new Set(passend.map((d) => netPostcode(d.postcode ?? "")).filter(Boolean));
  const gekozen = exact ? netPostcode(exact.postcode ?? "") : (postcodes.size === 1 ? [...postcodes][0] : "");
  if (!gekozen) { cache[sleutel] = ""; schrijfCache(cache); return null; }

  cache[sleutel] = gekozen;
  schrijfCache(cache);
  return {
    postcode: gekozen,
    plaats: (exact ?? passend[0]).woonplaatsnaam ?? v.plaats ?? "",
    zeker: !!exact,
  };
}

// ── Een hele lijst tegelijk ──
// Vijf tegelijk: snel genoeg voor honderden adressen, en het is een gratis overheidsdienst waar we
// niet overheen moeten walsen. Stoppen kan altijd — dan blijft staan wat al gevonden is.
export async function zoekPostcodes<T extends Adresvraag>(
  lijst: T[],
  onTreffer: (rij: T, treffer: Treffer) => void,
  onVoortgang?: (gedaan: number, totaal: number) => void,
  stop?: AbortSignal,
): Promise<{ gevonden: number; gezocht: number }> {
  let gedaan = 0;
  let gevonden = 0;
  const wachtrij = [...lijst];

  const werker = async () => {
    while (wachtrij.length > 0) {
      if (stop?.aborted) return;
      const rij = wachtrij.shift();
      if (!rij) return;
      const t = await zoekPostcode(rij, stop);
      if (t) { onTreffer(rij, t); gevonden++; }
      // Let op: eerst optellen, dán melden. Bij `onVoortgang?.(++gedaan, ...)` slaat JavaScript het
      // hele argument over als er geen meldfunctie is meegegeven — dan blijft de teller op nul staan
      // en klopt de uitkomst niet meer.
      gedaan++;
      onVoortgang?.(gedaan, lijst.length);
    }
  };
  await Promise.all(Array.from({ length: Math.min(5, lijst.length) }, werker));
  return { gevonden, gezocht: gedaan };
}

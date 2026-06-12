import type { Adres } from "./types";

let teller = Date.now();
const nieuwId = () => `a-${++teller}`;

// Sorteer op huisnummer, daarna op toevoeging.
function vergelijk(a: Adres, b: Adres): number {
  if (a.huisnummer !== b.huisnummer) return a.huisnummer - b.huisnummer;
  return a.toevoeging.localeCompare(b.toevoeging, "nl", { numeric: true });
}

// Beste looproute: klassieke postbode-route — oneven kant omhoog, even kant omlaag.
// Zo loop je één keer de straat op aan de ene kant en terug aan de andere kant.
export function looproute(adressen: Adres[]): Adres[] {
  const teLopen = adressen.filter((a) => !a.ontbreekt);
  const oneven = teLopen.filter((a) => a.huisnummer % 2 === 1).sort(vergelijk);
  const even = teLopen.filter((a) => a.huisnummer % 2 === 0).sort((a, b) => vergelijk(b, a));
  return [...oneven, ...even];
}

// Detecteert ontbrekende huisnummers: gaten in de nummering, per even/oneven kant.
// Reeds als 'ontbreekt' gemelde nummers tellen als bekend, zodat ze niet opnieuw als gat verschijnen.
export function ontbrekendeNummers(adressen: Adres[]): number[] {
  const bekend = new Set(adressen.map((a) => a.huisnummer)); // incl. gemelde (ontbreekt)
  const echt = adressen.filter((a) => !a.ontbreekt).map((a) => a.huisnummer);
  const gaten: number[] = [];

  for (const pariteit of [1, 0]) {
    const kant = echt.filter((n) => n % 2 === pariteit).sort((a, b) => a - b);
    if (kant.length < 2) continue;
    const min = kant[0];
    const max = kant[kant.length - 1];
    for (let n = min + 2; n < max; n += 2) {
      if (!bekend.has(n)) gaten.push(n);
    }
  }
  return gaten.sort((a, b) => a - b);
}

// Maakt adressen aan voor een reeks huisnummers (van–tot, gefilterd op kant).
export function maakReeks(
  van: number,
  tot: number,
  kant: "alle" | "oneven" | "even"
): Adres[] {
  const adressen: Adres[] = [];
  const lo = Math.min(van, tot);
  const hi = Math.max(van, tot);
  for (let n = lo; n <= hi; n++) {
    if (kant === "oneven" && n % 2 !== 1) continue;
    if (kant === "even" && n % 2 !== 0) continue;
    adressen.push({
      id: nieuwId(),
      huisnummer: n,
      toevoeging: "",
      type: "woning",
      status: "Te doen",
      ontbreekt: false,
      notitie: "",
    });
  }
  return adressen;
}

// ── Adres-opmaak ──
// Nette Nederlandse plaatsnaam: "OUDERKERK AAN DEN IJSSEL" → "Ouderkerk aan den IJssel"
// (tussenvoegsels klein, IJ-digraaf hoofdletter). Idempotent.
const TUSSENVOEGSELS = new Set(["aan", "de", "den", "der", "des", "het", "in", "op", "te", "ten", "ter", "tot", "van", "bij", "over", "'t", "'s"]);
export function netjesPlaats(plaats: string): string {
  const woorden = plaats.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return woorden
    .map((w, i) => {
      if (i > 0 && TUSSENVOEGSELS.has(w)) return w;
      if (w.startsWith("ij")) return "IJ" + w.slice(2); // IJssel, IJmuiden
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

// ── Google Maps ──
// Volledige adres-tekst, bruikbaar in Google Maps: "Heemraadsweg 4 TO, 2935 AW Ouderkerk aan den IJssel".
function adresTekst(straat: string, postcode: string, plaats: string, a: Adres): string {
  const nr = `${a.huisnummer}${a.toevoeging ? " " + a.toevoeging : ""}`;
  return `${straat} ${nr}, ${postcode} ${netjesPlaats(plaats)}`.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim();
}

// Bouwt een Google Maps wandelroute met de adressen in volgorde.
// Google Maps ondersteunt max. ~10 stops per route, dus langere routes worden afgekapt.
export function googleMapsRouteUrl(
  straat: string,
  postcode: string,
  plaats: string,
  adressen: Adres[],
  maxStops = 10
): { url: string; afgekapt: boolean; aantal: number } {
  const stops = adressen.map((a) => adresTekst(straat, postcode, plaats, a));
  const afgekapt = stops.length > maxStops;
  const gebruikt = stops.slice(0, maxStops);
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "walking");
  params.set("destination", gebruikt[gebruikt.length - 1] ?? `${straat}, ${plaats}`);
  const waypoints = gebruikt.slice(0, -1);
  if (waypoints.length) params.set("waypoints", waypoints.join("|"));
  return {
    url: `https://www.google.com/maps/dir/?${params.toString()}`,
    afgekapt,
    aantal: gebruikt.length,
  };
}

// Splits een lange looproute in delen van max. `maxStops` adressen — elk een losse Google Maps-route,
// zodat je bij veel adressen (bijv. 400) gewoon deel voor deel kunt lopen.
export function googleMapsRouteDelen(
  straat: string,
  postcode: string,
  plaats: string,
  adressen: Adres[],
  maxStops = 10
): { url: string; aantal: number; van: number; tot: number }[] {
  const delen: { url: string; aantal: number; van: number; tot: number }[] = [];
  for (let i = 0; i < adressen.length; i += maxStops) {
    const groep = adressen.slice(i, i + maxStops);
    const { url, aantal } = googleMapsRouteUrl(straat, postcode, plaats, groep, maxStops);
    delen.push({ url, aantal, van: i + 1, tot: i + groep.length });
  }
  return delen;
}

// Volledige adres-tekst (publiek) — voor een route over meerdere straten (hele import-map).
export function adresVolledig(straat: string, postcode: string, plaats: string, a: Adres): string {
  return adresTekst(straat, postcode, plaats, a);
}

// Bouwt Google Maps wandelroutes uit volledige adres-teksten (meerdere straten mogelijk), in delen
// van max. `maxStops`. Voor een hele map: alle adressen in looproute-volgorde, deel voor deel.
export function googleMapsRouteVanTeksten(stops: string[], maxStops = 10): { url: string; van: number; tot: number }[] {
  const delen: { url: string; van: number; tot: number }[] = [];
  for (let i = 0; i < stops.length; i += maxStops) {
    const groep = stops.slice(i, i + maxStops);
    if (groep.length === 0) continue;
    const params = new URLSearchParams();
    params.set("api", "1");
    params.set("travelmode", "walking");
    params.set("destination", groep[groep.length - 1]);
    const waypoints = groep.slice(0, -1);
    if (waypoints.length) params.set("waypoints", waypoints.join("|"));
    delen.push({ url: `https://www.google.com/maps/dir/?${params.toString()}`, van: i + 1, tot: i + groep.length });
  }
  return delen;
}

// Navigatie naar één adres.
export function googleMapsAdresUrl(
  straat: string,
  postcode: string,
  plaats: string,
  a: Adres
): string {
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "walking");
  params.set("destination", adresTekst(straat, postcode, plaats, a));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function nieuwAdres(huisnummer: number, toevoeging = ""): Adres {
  return {
    id: nieuwId(),
    huisnummer,
    toevoeging,
    type: "woning",
    status: "Te doen",
    ontbreekt: false,
    notitie: "",
  };
}

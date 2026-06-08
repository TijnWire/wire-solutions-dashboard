import type { Afspraak } from "./types";

export function adresVanAfspraak(a: Afspraak): string {
  const nr = `${a.straat} ${a.huisnummer}`.trim();
  return `${nr}, ${a.postcode} ${a.plaats}`.replace(/\s+/g, " ").trim();
}

export function datumLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

// Zet een Nederlands telefoonnummer om naar internationaal formaat voor wa.me.
function normaliseerTelefoon(tel: string): string {
  let d = tel.replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "31" + d.slice(1);
  return d;
}

// WhatsApp-bevestiging: opent WhatsApp met een kant-en-klaar bericht.
export function whatsappBevestiging(a: Afspraak): string {
  const datum = new Date(a.datum + "T00:00:00").toLocaleDateString("nl-NL", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const tekst =
    `Beste ${a.klantNaam || "klant"},\n\n` +
    `Hierbij bevestigen wij uw afspraak met Wire Solutions op ${datum}${a.tijd ? ` om ${a.tijd}` : ""}.\n` +
    `Adres: ${adresVanAfspraak(a)}.\n\n` +
    `Heeft u vragen? Reageer gerust op dit bericht.\n\n` +
    `Met vriendelijke groet,\nWire Solutions`;
  const nummer = normaliseerTelefoon(a.telefoon);
  return `https://wa.me/${nummer}?text=${encodeURIComponent(tekst)}`;
}

export function googleMapsAfspraak(a: Afspraak): string {
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", "driving");
  params.set("destination", adresVanAfspraak(a));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

// Eén representatief adres voor een hele groep (straat + postcode + plaats van het eerste adres).
export function adresVanGroep(rijen: Afspraak[]): string {
  const e = rijen[0];
  if (!e) return "";
  const straat = (e.straat || e.locatie || "").trim();
  const pcPlaats = `${e.postcode} ${e.plaats}`.replace(/\s+/g, " ").trim();
  return [straat, pcPlaats].filter(Boolean).join(", ");
}

// Google Maps beperkt een gedeelde route tot ongeveer dit aantal stops (tussenpunten + bestemming).
export const MAX_ROUTE_STOPS = 10;

// Bouwt een Google Maps-route langs meerdere adressen, in de aangeleverde volgorde. Zonder origin
// start Maps vanaf je huidige locatie; het laatste adres is de bestemming, de rest zijn tussenstops.
export function googleMapsRoute(adressen: string[], modus: "driving" | "walking" = "driving"): string | null {
  const stops = adressen
    .map((a) => a.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, MAX_ROUTE_STOPS);
  if (stops.length === 0) return null;
  const params = new URLSearchParams();
  params.set("api", "1");
  params.set("travelmode", modus);
  params.set("destination", stops[stops.length - 1]);
  if (stops.length > 1) params.set("waypoints", stops.slice(0, -1).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

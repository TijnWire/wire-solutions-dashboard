// Demo-data — later te vervangen door echte API's (Stedin-export, Maps, WhatsApp, etc.)

export const kpis = {
  afsprakenWeek: { value: 87, deltaPct: 12, trend: "up" as const },
  brievenGegooid: { value: 1248, deltaPct: 8, trend: "up" as const },
  openstaandeFacturen: { value: 14, bedrag: 21450, trend: "down" as const },
  actieveMonteurs: { value: 9, totaal: 11, trend: "flat" as const },
};

// Brieven bezorgd per dag (afgelopen 2 weken)
export const brievenPerDag = [
  { dag: "Ma", gegooid: 120, blanco: 14 },
  { dag: "Di", gegooid: 145, blanco: 9 },
  { dag: "Wo", gegooid: 98, blanco: 21 },
  { dag: "Do", gegooid: 167, blanco: 11 },
  { dag: "Vr", gegooid: 134, blanco: 18 },
  { dag: "Za", gegooid: 76, blanco: 6 },
  { dag: "Zo", gegooid: 0, blanco: 0 },
];

// Afspraak-status verdeling
export const afspraakStatus = [
  { naam: "Bevestigd", waarde: 52, kleur: "#ea580c" },
  { naam: "Open", waarde: 23, kleur: "#fdba74" },
  { naam: "Geannuleerd", waarde: 8, kleur: "#ef4444" },
  { naam: "Herpland", waarde: 4, kleur: "#94a3b8" },
];

// Buren-gesproken voortgang per wijk
export const wijken = [
  { wijk: "Rotterdam-Noord", gesproken: 5, totaal: 7 },
  { wijk: "Capelle a/d IJssel", gesproken: 6, totaal: 6 },
  { wijk: "Schiedam-Centrum", gesproken: 3, totaal: 8 },
  { wijk: "Vlaardingen-Oost", gesproken: 7, totaal: 9 },
];

export type Activiteit = {
  id: number;
  type: "mail" | "route" | "brief" | "factuur" | "whatsapp" | "foto";
  titel: string;
  detail: string;
  tijd: string;
};

export const activiteiten: Activiteit[] = [
  { id: 1, type: "mail", titel: "Nieuwe Stedin-batch ontvangen", detail: "342 adressen — Rotterdam-Noord", tijd: "2 min geleden" },
  { id: 2, type: "route", titel: "Looproute gegenereerd", detail: "Wijk 3088 — 4,2 km, 38 stops", tijd: "11 min geleden" },
  { id: 3, type: "whatsapp", titel: "Afspraak bevestigd via WhatsApp", detail: "Dhr. Yilmaz — di 3 jun, 14:00", tijd: "26 min geleden" },
  { id: 4, type: "brief", titel: "Brieven gegooid gemarkeerd", detail: "Capelle a/d IJssel — 6 blanco's", tijd: "1 uur geleden" },
  { id: 5, type: "factuur", titel: "Factuur automatisch aangemaakt", detail: "#2026-0418 — €1.240,00", tijd: "1 uur geleden" },
  { id: 6, type: "foto", titel: "Meterkast-foto toegevoegd", detail: "Dorpsstraat 12, Schiedam", tijd: "2 uur geleden" },
];

export type Taak = {
  id: number;
  monteur: string;
  initialen: string;
  taak: string;
  deadline: string;
  status: "Op schema" | "Vandaag" | "Te laat";
};

export const taken: Taak[] = [
  { id: 1, monteur: "Wim de Vries", initialen: "WV", taak: "Route Rotterdam-Noord afronden", deadline: "Vandaag 17:00", status: "Vandaag" },
  { id: 2, monteur: "Remon Bakker", initialen: "RB", taak: "Facturen week 22 controleren", deadline: "Morgen", status: "Op schema" },
  { id: 3, monteur: "Sven Janssen", initialen: "SJ", taak: "Bedrijfspanden persoonlijk afgeven", deadline: "Gisteren", status: "Te laat" },
  { id: 4, monteur: "Anna Smit", initialen: "AS", taak: "Meterkast-foto's uploaden Vlaardingen", deadline: "Vandaag 16:00", status: "Vandaag" },
];

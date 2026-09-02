import type { Opdrachtgever } from "./types";

// ── Standaard opdrachtgevers (contactpersonen) voor op facturen ──────────────────────────────────
// Deze lijst is éénmalig aangeleverd door de eigenaar en te importeren via Facturen → Opdrachtgevers →
// "Standaardlijst importeren". De import is IDEMPOTENT: elk record heeft een vast id (og-imp-…), dus
// nogmaals importeren voegt niets dubbel toe — alleen wat nog ontbreekt komt erbij. Bestaande, met de
// hand gewijzigde of toegevoegde opdrachtgevers blijven ongemoeid.
//
// LET OP: Rune Zwijnenburg (Stedin, Nijverheidsweg 15 Utrecht, 20200015) zit al in het systeem als
// 'og-stedin' (die id wordt elders in de code als standaard gebruikt). Daarom staat hij hier NIET nog
// eens in — anders zou je hem dubbel zien.
//
// Elke rij = één contactpersoon. Meerdere contacten kunnen dezelfde onderneming en hetzelfde adres
// delen; ze verschillen in de contactpersoon (tav) en soms het relatienummer. In de keuzelijst op een
// factuur wordt de contactpersoon getoond zodat je de juiste kunt kiezen.
export const STANDAARD_OPDRACHTGEVERS: Opdrachtgever[] = [
  // ── Stedin — Energieweg 20, 2627 AZ Delft ──
  { id: "og-imp-arjo-van-marion", naam: "Stedin Netbeheer B.V.", tav: "Arjo van Marion", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-b-yildiz", naam: "Stedin Netbeheer B.V.", tav: "B. Yildiz", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-carlos-van-de-leuv", naam: "Stedin Netbeheer B.V.", tav: "Carlos van de Leuv", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-egon-mercera", naam: "Stedin Netbeheer B.V.", tav: "Egon Mercera", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-eric-schmit", naam: "Stedin Netbeheer B.V.", tav: "Eric Schmit", relatienummer: "20200008", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-hilmar-wijnstra", naam: "Stedin Netbeheer B.V.", tav: "Hilmar Wijnstra", relatienummer: "20200008", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-marc-van-der-linden", naam: "Stedin Netbeheer B.V.", tav: "Marc van der Linden", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-marvin-van-loenen", naam: "Stedin Netbeheer B.V.", tav: "Marvin van Loenen", relatienummer: "20200008", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-michel-feller", naam: "Stedin Netbeheer B.V.", tav: "Michel Feller", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-sandra-weeland", naam: "Stedin Netbeheer B.V.", tav: "Sandra Weeland", relatienummer: "20200008", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  { id: "og-imp-sefa-yener", naam: "Stedin Netbeheer B.V.", tav: "Sefa Yener", relatienummer: "20200002", adres: "Energieweg 20", postcodePlaats: "2627 AZ Delft", email: "" },
  // ── Stedin — Reedijk 9, 3274 KE Heinenoord ──
  { id: "og-imp-chris", naam: "Stedin Netbeheer B.V.", tav: "Chris", relatienummer: "20200008", adres: "Reedijk 9", postcodePlaats: "3274 KE Heinenoord", email: "" },
  { id: "og-imp-dick-bakker", naam: "Stedin Netbeheer B.V.", tav: "Dick Bakker", relatienummer: "20200008", adres: "Reedijk 9", postcodePlaats: "3274 KE Heinenoord", email: "" },
  { id: "og-imp-gino-bogte", naam: "Stedin Netbeheer B.V.", tav: "Gino Bogte", relatienummer: "20200008", adres: "Reedijk 9", postcodePlaats: "3274 KE Heinenoord", email: "" },
  { id: "og-imp-j-doppenberg", naam: "Stedin Netbeheer B.V.", tav: "J. Doppenberg", relatienummer: "20200004", adres: "Reedijk 9", postcodePlaats: "3274 KE Heinenoord", email: "" },
  { id: "og-imp-sanne-de-ruiter", naam: "Stedin Netbeheer B.V.", tav: "Sanne de Ruiter", relatienummer: "20200008", adres: "Reedijk 9", postcodePlaats: "3274 KE Heinenoord", email: "" },
  // ── Overige opdrachtgevers ──
  { id: "og-imp-irma-van-der-does", naam: "Kees van der Does", tav: "Irma van der Does", relatienummer: "", adres: "Westgaag 56", postcodePlaats: "3155 DG Maasland", email: "" },
  { id: "og-imp-p-koster", naam: "Triggerscreens", tav: "P. Koster", relatienummer: "20200009", adres: "Jan van de Heijdenstraat 25", postcodePlaats: "3261 LE Oud-Beijerland", email: "" },
  // ── Stedin — Blaak 8, 3011 TA Rotterdam ──
  { id: "og-imp-alexander-schot", naam: "Stedin Netbeheer B.V.", tav: "Alexander Schot", relatienummer: "20200002", adres: "Blaak 8", postcodePlaats: "3011 TA Rotterdam", email: "" },
  { id: "og-imp-can-yigidim", naam: "Fues West B.V.", tav: "Can Yigidim", relatienummer: "", adres: "Driemanssteeweg 62", postcodePlaats: "3084 CB Rotterdam", email: "" },
  { id: "og-imp-l-kirkar", naam: "Stedin Netbeheer B.V.", tav: "L. Kirkar", relatienummer: "20200004", adres: "Blaak 8", postcodePlaats: "3011 TA Rotterdam", email: "" },
  { id: "og-imp-s-de-bruijn", naam: "Stedin Netbeheer B.V.", tav: "S. de Bruijn", relatienummer: "20200004", adres: "Blaak 8", postcodePlaats: "3011 TA Rotterdam", email: "" },
  // ── Stedin — Nijverheidsweg 15, 3534 AM Utrecht (Rune Zwijnenburg zit al als og-stedin) ──
  { id: "og-imp-anita-dekker", naam: "Stedin Netbeheer B.V.", tav: "Anita Dekker", relatienummer: "20200015", adres: "Nijverheidsweg 15", postcodePlaats: "3534 AM Utrecht", email: "" },
  { id: "og-imp-rens-rhode", naam: "Stedin Netbeheer B.V.", tav: "Rens Rhode", relatienummer: "20200004", adres: "Nijverheidsweg 15", postcodePlaats: "3534 AM Utrecht", email: "" },
];

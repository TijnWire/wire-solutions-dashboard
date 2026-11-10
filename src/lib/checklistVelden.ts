// GEGENEREERD uit het lege formulier "Checklist Consument Saneren" (public/Checklist Consument Saneren blanco.pdf).
// Coördinaten in PDF-punten met de oorsprong LINKSBOVEN (zoals pdftotext/pdf.js ze geven); A4 = 595,28 × 841,89.
// `cel` = het invulvak [x0, top, x1, bottom]; bij keuzevelden staat per optie waar het woord op het formulier staat,
// zodat we de gekozen optie kunnen omcirkelen en bij het inlezen kunnen zien welke optie is overgebleven.

export type ChecklistOptie = { label: string; x0: number; x1: number; y0: number; y1: number };
export type ChecklistVeld = { key: string; label: string; groep: "Adres" | "Planning" | "Techniek" | "Situatie"; soort: "tekst" | "datum" | "keuze"; cel: [number, number, number, number]; opties?: ChecklistOptie[] };

export const CHECKLIST_PAGINA = { breedte: 595.276, hoogte: 841.89 };

export const CHECKLIST_VELDEN: ChecklistVeld[] = [
  {"key": "postcode", "label": "Postcode", "groep": "Adres", "soort": "tekst", "cel": [138, 54, 238, 71]},
  {"key": "adres", "label": "Adres", "groep": "Adres", "soort": "tekst", "cel": [303, 54, 581, 71]},
  {"key": "primair", "label": "Primair", "groep": "Adres", "soort": "tekst", "cel": [138, 71, 238, 87]},
  {"key": "secundair", "label": "Secundair", "groep": "Adres", "soort": "tekst", "cel": [303, 71, 581, 87]},
  {"key": "aantalAansluitingen", "label": "Aantal aansluitingen (stuks)", "groep": "Adres", "soort": "tekst", "cel": [138, 87, 187, 103]},
  {"key": "cvz", "label": "CVZ", "groep": "Adres", "soort": "keuze", "cel": [303, 87, 354, 103], "opties": [{"label": "Ja", "x0": 314.1, "x1": 321.2, "y0": 91.2, "y1": 99.8}, {"label": "Nee", "x0": 328.8, "x1": 343.1, "y0": 91.2, "y1": 99.8}]},
  {"key": "meternrCvz", "label": "Meternr CVZ", "groep": "Adres", "soort": "tekst", "cel": [436, 87, 581, 103]},
  {"key": "datumUitvoering", "label": "Datum uitvoering", "groep": "Planning", "soort": "datum", "cel": [138, 109, 581, 127]},
  {"key": "werkvoorbereider", "label": "Werkvoorbereider", "groep": "Planning", "soort": "tekst", "cel": [138, 133, 303, 149]},
  {"key": "technischSchouwer", "label": "Technisch schouwer", "groep": "Planning", "soort": "tekst", "cel": [138, 149, 303, 165]},
  {"key": "datumSchouw", "label": "Datum schouw", "groep": "Planning", "soort": "datum", "cel": [138, 165, 303, 181]},
  {"key": "afsprakenmaker", "label": "Afsprakenmaker", "groep": "Planning", "soort": "tekst", "cel": [138, 181, 303, 198]},
  {"key": "datumAfgegeven", "label": "Datum afgegeven", "groep": "Planning", "soort": "datum", "cel": [138, 198, 303, 214]},
  {"key": "datumBevestigd", "label": "Datum bevestigd", "groep": "Planning", "soort": "datum", "cel": [138, 214, 303, 230]},
  {"key": "typeAanslKabel", "label": "Type aansl. kabel", "groep": "Techniek", "soort": "keuze", "cel": [416, 133, 482, 149], "opties": [{"label": "GPLK", "x0": 430.2, "x1": 448.6, "y0": 137.5, "y1": 146.1}, {"label": "VO", "x0": 456.2, "x1": 467.1, "y0": 137.5, "y1": 146.1}]},
  {"key": "typeAanslKabelNotitie", "label": "Type aansl. kabel (aanvulling)", "groep": "Techniek", "soort": "tekst", "cel": [482, 133, 581, 149]},
  {"key": "lengteAanslKabel", "label": "Lengte aansl. kabel", "groep": "Techniek", "soort": "tekst", "cel": [416, 149, 482, 165]},
  {"key": "centraleHakVanafGevel", "label": "Centrale HAK vanaf gevel", "groep": "Techniek", "soort": "tekst", "cel": [540, 149, 581, 165]},
  {"key": "typeLsKabel", "label": "Type LS-kabel", "groep": "Techniek", "soort": "tekst", "cel": [416, 165, 482, 181]},
  {"key": "aantalCoups", "label": "Aantal coups", "groep": "Techniek", "soort": "tekst", "cel": [540, 165, 581, 181]},
  {"key": "hoofdzekeringPrimair", "label": "Hoofdzekering primair", "groep": "Techniek", "soort": "tekst", "cel": [416, 181, 482, 198]},
  {"key": "asbest", "label": "Asbest", "groep": "Techniek", "soort": "tekst", "cel": [540, 181, 581, 198]},
  {"key": "typeCentraleHak", "label": "Type centrale HAK", "groep": "Techniek", "soort": "keuze", "cel": [416, 198, 581, 214], "opties": [{"label": "Staal", "x0": 450.4, "x1": 468.0, "y0": 202.2, "y1": 210.8}, {"label": "Kunststof", "x0": 475.6, "x1": 509.7, "y0": 202.2, "y1": 210.8}, {"label": "Bakeliet", "x0": 517.3, "x1": 546.4, "y0": 202.2, "y1": 210.8}]},
  {"key": "graafwerk", "label": "Graafwerk?", "groep": "Techniek", "soort": "keuze", "cel": [416, 214, 482, 230], "opties": [{"label": "Ja", "x0": 434.1, "x1": 441.2, "y0": 218.3, "y1": 226.9}, {"label": "Nee", "x0": 448.8, "x1": 463.1, "y0": 218.3, "y1": 226.9}]},
  {"key": "kraan", "label": "Kraan", "groep": "Techniek", "soort": "keuze", "cel": [482, 214, 581, 230], "opties": [{"label": "Kraan", "x0": 496.7, "x1": 517.5, "y0": 218.3, "y1": 226.9}, {"label": "Geen kraan", "x0": 525.1, "x1": 566.1, "y0": 218.3, "y1": 226.9}]},
  {"key": "typeSanering", "label": "Type sanering", "groep": "Techniek", "soort": "keuze", "cel": [138, 230, 581, 245], "opties": [{"label": "Jute", "x0": 221.4, "x1": 236.0, "y0": 233.9, "y1": 242.4}, {"label": "Rubber", "x0": 243.6, "x1": 269.4, "y0": 233.9, "y1": 242.4}, {"label": "Asbest", "x0": 276.9, "x1": 300.7, "y0": 233.9, "y1": 242.4}, {"label": "Weber", "x0": 308.3, "x1": 332.2, "y0": 233.9, "y1": 242.4}, {"label": "GY HAK", "x0": 339.7, "x1": 366.7, "y0": 233.9, "y1": 242.4}, {"label": "VO 4x4", "x0": 374.2, "x1": 399.6, "y0": 233.9, "y1": 242.4}, {"label": "Overig", "x0": 407.1, "x1": 430.3, "y0": 233.9, "y1": 242.4}, {"label": "Reeds gesaneerd", "x0": 437.9, "x1": 497.9, "y0": 233.9, "y1": 242.4}]},
  {"key": "klusbedrijf", "label": "Klusbedrijf nodig?", "groep": "Situatie", "soort": "keuze", "cel": [138, 245, 303, 261], "opties": [{"label": "Ja", "x0": 206.1, "x1": 213.2, "y0": 249.5, "y1": 258.1}, {"label": "Nee", "x0": 220.8, "x1": 235.1, "y0": 249.5, "y1": 258.1}]},
  {"key": "liftIntercom", "label": "Lift of intercom?", "groep": "Situatie", "soort": "keuze", "cel": [416, 245, 482, 261], "opties": [{"label": "Ja", "x0": 434.1, "x1": 441.2, "y0": 249.5, "y1": 258.1}, {"label": "Nee", "x0": 448.8, "x1": 463.1, "y0": 249.5, "y1": 258.1}]},
  {"key": "liftIntercomNotitie", "label": "Lift of intercom (toelichting)", "groep": "Situatie", "soort": "tekst", "cel": [482, 245, 581, 261]},
  {"key": "verkeerplan", "label": "Verkeerplan?", "groep": "Situatie", "soort": "keuze", "cel": [138, 261, 303, 277], "opties": [{"label": "Geen", "x0": 165.4, "x1": 180.5, "y0": 266.4, "y1": 273.3}, {"label": "Straat", "x0": 186.6, "x1": 204.1, "y0": 266.4, "y1": 273.3}, {"label": "Parkeervakken", "x0": 210.2, "x1": 253.1, "y0": 266.4, "y1": 273.3}, {"label": "Stoep", "x0": 259.3, "x1": 275.9, "y0": 266.4, "y1": 273.3}]},
  {"key": "winkelsGarages", "label": "Winkels of garages?", "groep": "Situatie", "soort": "keuze", "cel": [416, 261, 482, 277], "opties": [{"label": "Ja", "x0": 434.1, "x1": 441.2, "y0": 265.7, "y1": 274.3}, {"label": "Nee", "x0": 448.8, "x1": 463.1, "y0": 265.7, "y1": 274.3}]},
  {"key": "winkelsGaragesNotitie", "label": "Winkels of garages (toelichting)", "groep": "Situatie", "soort": "tekst", "cel": [482, 261, 581, 277]},
  {"key": "werkplan", "label": "Werkplan nodig?", "groep": "Situatie", "soort": "keuze", "cel": [138, 277, 303, 294], "opties": [{"label": "Ja", "x0": 206.1, "x1": 213.2, "y0": 282.0, "y1": 290.6}, {"label": "Nee", "x0": 220.8, "x1": 235.1, "y0": 282.0, "y1": 290.6}]},
  {"key": "trap", "label": "Trap nodig?", "groep": "Situatie", "soort": "keuze", "cel": [416, 277, 581, 294], "opties": [{"label": "Ja", "x0": 483.9, "x1": 491.0, "y0": 282.0, "y1": 290.6}, {"label": "Nee", "x0": 498.6, "x1": 512.9, "y0": 282.0, "y1": 290.6}]},
  {"key": "schakelplan", "label": "Schakelplan?", "groep": "Situatie", "soort": "keuze", "cel": [138, 294, 303, 310], "opties": [{"label": "Ja", "x0": 206.1, "x1": 213.2, "y0": 298.1, "y1": 306.7}, {"label": "Nee", "x0": 220.8, "x1": 235.1, "y0": 298.1, "y1": 306.7}]},
  {"key": "lasdozen", "label": "Lasdozen bereikbaar?", "groep": "Situatie", "soort": "keuze", "cel": [416, 294, 581, 310], "opties": [{"label": "Ja", "x0": 483.9, "x1": 491.0, "y0": 298.1, "y1": 306.7}, {"label": "Nee", "x0": 498.6, "x1": 512.9, "y0": 298.1, "y1": 306.7}]},
  {"key": "sleutel", "label": "Sleutel nodig?", "groep": "Situatie", "soort": "keuze", "cel": [138, 310, 187, 326], "opties": [{"label": "Ja", "x0": 148.1, "x1": 155.2, "y0": 314.2, "y1": 322.8}, {"label": "Nee", "x0": 162.8, "x1": 177.1, "y0": 314.2, "y1": 322.8}]},
  {"key": "sleutelNotitie", "label": "Sleutel (toelichting)", "groep": "Situatie", "soort": "tekst", "cel": [187, 310, 303, 326]},
  {"key": "secundaireStaal", "label": "Secundaire staal?", "groep": "Situatie", "soort": "keuze", "cel": [416, 310, 581, 326], "opties": [{"label": "Ja", "x0": 483.9, "x1": 491.0, "y0": 314.2, "y1": 322.8}, {"label": "Nee", "x0": 498.6, "x1": 512.9, "y0": 314.2, "y1": 322.8}]},
  {"key": "beheerderMakelaar", "label": "Beheerder / makelaar", "groep": "Situatie", "soort": "keuze", "cel": [138, 326, 187, 342], "opties": [{"label": "Ja", "x0": 148.1, "x1": 155.2, "y0": 330.3, "y1": 338.9}, {"label": "Nee", "x0": 162.8, "x1": 177.1, "y0": 330.3, "y1": 338.9}]},
  {"key": "beheerderNotitie", "label": "Beheerder / makelaar (naam/nummer)", "groep": "Situatie", "soort": "tekst", "cel": [187, 326, 303, 342]},
  {"key": "kruipluik", "label": "Kruipluik?", "groep": "Situatie", "soort": "keuze", "cel": [416, 326, 482, 342], "opties": [{"label": "Ja", "x0": 434.1, "x1": 441.2, "y0": 330.3, "y1": 338.9}, {"label": "Nee", "x0": 448.8, "x1": 463.1, "y0": 330.3, "y1": 338.9}]},
  {"key": "kruipluikToestand", "label": "Kruipluik droog / nat", "groep": "Situatie", "soort": "keuze", "cel": [482, 326, 581, 342], "opties": [{"label": "Droog", "x0": 510.2, "x1": 532.1, "y0": 330.3, "y1": 338.9}, {"label": "Nat", "x0": 539.6, "x1": 552.5, "y0": 330.3, "y1": 338.9}]},
];

// Bewonerstabel: 12 regels per blad; kolommen huisnr, naam, telefoon, opmerkingen.
export const CHECKLIST_TABEL = { top: 360.9, regelhoogte: 16.4, regels: 12, kolommen: { huisnr: [14, 46], naam: [46, 138], telefoon: [138, 303], opmerking: [303, 581] } as Record<"huisnr" | "naam" | "telefoon" | "opmerking", [number, number]> };
// Vak "Opmerkingen schouw / AVO tekening".
export const CHECKLIST_OPMERKINGEN: [number, number, number, number] = [14, 580, 581, 809];
// Ankerpunten om een ingevuld exemplaar (andere export, iets verschoven) op dit formulier te leggen.
export const CHECKLIST_ANKERS = {"Postcode": [16.6, 59.0], "Huisnr": [19.3, 351.1]} as Record<"Postcode" | "Huisnr", [number, number]>;

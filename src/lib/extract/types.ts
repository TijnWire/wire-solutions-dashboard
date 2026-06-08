// Gedeelde types voor het scannen/importeren van adresbestanden (PDF via Claude, Excel/CSV lokaal).

export type WoningType = "woning" | "bedrijf";

// Waar de geïmporteerde rijen naartoe gaan in het systeem.
export type ImportDoel = "brievenronde" | "klant" | "afspraak";

// Ruwe rij zoals die uit een bestand komt (alles string, huisnummer kan nog "12A" zijn).
export type RuweRij = {
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  plaats: string;
  naam: string;
  telefoon: string;
  type: string;
  notitie: string;
};

// Genormaliseerde, bewerkbare rij in de review-tabel.
export type ScanRij = {
  id: string;
  straat: string;
  huisnummer: string;
  toevoeging: string;
  postcode: string;
  plaats: string;
  naam: string;
  telefoon: string;
  type: WoningType;
  notitie: string;
  bron: number; // 1-gebaseerd regelnummer uit het bestand
  confidence: number; // 0..1 (PDF: van het model; Excel: 1)
  opnemen: boolean; // vink in de review
  dupVan?: string; // gemarkeerd als duplicaat
};

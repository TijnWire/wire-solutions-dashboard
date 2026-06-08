import type { Brievenronde, Factuur } from "./types";
import { ontbrekendeNummers } from "./brieven";

export type RondeTelling = {
  totaal: number; // adressen te bezorgen (zonder ontbrekende)
  gegooid: number;
  blanco: number;
  nietThuis: number;
  teDoen: number;
  gaten: number; // mogelijk overgeslagen huisnummers (gesuggereerd)
  gemeld: number; // als 'ontbreekt' gemarkeerd
};

export function rondeTellingen(r: Brievenronde): RondeTelling {
  const teBezorgen = r.adressen.filter((a) => !a.ontbreekt);
  return {
    totaal: teBezorgen.length,
    gegooid: teBezorgen.filter((a) => a.status === "Gegooid").length,
    blanco: teBezorgen.filter((a) => a.status === "Blanco").length,
    nietThuis: teBezorgen.filter((a) => a.status === "Niet thuis").length,
    teDoen: teBezorgen.filter((a) => a.status === "Te doen").length,
    gaten: ontbrekendeNummers(r.adressen).length,
    gemeld: r.adressen.filter((a) => a.ontbreekt).length,
  };
}

// Bouwt een mailto-link met een kant-en-klare bevestigingsmail (gebruiker kiest de ontvanger).
export function bevestigingsMail(r: Brievenronde): string {
  const t = rondeTellingen(r);
  const onderwerp = `Bevestiging bezorging — ${r.straat}${r.plaats ? ", " + r.plaats : ""}`;
  const lijnen: string[] = [
    "Beste,",
    "",
    "Hierbij de bevestiging dat de brievenronde is afgerond.",
    "",
    `Straat: ${r.straat}`,
    `Postcode / plaats: ${[r.postcode, r.plaats].filter(Boolean).join(" ")}`,
  ];
  if (r.regio) lijnen.push(`Regio: ${r.regio}`);
  lijnen.push(
    "",
    `Gegooid: ${t.gegooid}`,
    `Blanco: ${t.blanco}`,
    `Niet thuis: ${t.nietThuis}`,
    `Gemelde ontbrekende huisnummers: ${t.gemeld}`,
    `Totaal adressen: ${t.totaal}`,
    "",
    "Met vriendelijke groet,",
    "Wire Solutions"
  );
  return `mailto:?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(lijnen.join("\n"))}`;
}

// Maakt een concept-factuur op basis van het aantal gegooide brieven.
export function maakConceptFactuurVanRonde(r: Brievenronde, nummer: string, datumISO: string, prijsPerBrief = 0.85): Omit<Factuur, "id"> {
  const t = rondeTellingen(r);
  return {
    nummer,
    datum: datumISO,
    klantNaam: "Stedin Netbeheer B.V.",
    klantAdres: "",
    klantPostcodePlaats: "",
    regels: [
      {
        omschrijving: `Brieven bezorgd — ${r.straat}${r.plaats ? ", " + r.plaats : ""}`,
        aantal: t.gegooid,
        prijs: prijsPerBrief,
      },
    ],
    btwPercentage: 21,
    status: "Concept",
    notitie: "Betaling binnen 14 dagen o.v.v. het factuurnummer.",
  };
}

import type { User, Project, Taak, ProjectPost, Sanering, TauwOpdracht, Brievenronde, Afspraak, Factuur, Bedrijf, Loonstrook, Boete, Communicatie, Verlof, KennisArtikel, Instellingen, Klant } from "./types";

// Saneren-dossiers en TAUW-opdrachten starten leeg; aanmaken via de bijbehorende pagina.
export const SEED_SANERINGEN: Sanering[] = [];
export const SEED_TAUW: TauwOpdracht[] = [];

export const SEED_KLANTEN: Klant[] = [
  { id: "kl-1", naam: "Fam. Yilmaz", straat: "Dorpsstraat", huisnummer: "7", postcode: "3081 AB", plaats: "Rotterdam-Noord", telefoon: "06 12345678", notitie: "Meterkast achter de voordeur, links. Bedrijfspand — bij receptie melden.", fotos: [] },
  { id: "kl-2", naam: "Mw. Visser", straat: "Lindelaan", huisnummer: "22", postcode: "3132 BC", plaats: "Vlaardingen-Oost", telefoon: "06 34567890", notitie: "Belt aan via intercom.", fotos: [] },
];

export const SEED_INSTELLINGEN: Instellingen = {
  supabaseUrl: "",
  supabaseKey: "",
  googleMapsKey: "",
  whatsappToken: "",
  claudeKey: "",
};

export const SEED_KENNIS: KennisArtikel[] = [
  // Veelgestelde vragen
  { id: "kb-1", categorie: "Veelgestelde vragen", titel: "Valt de stroom of het gas uit tijdens de werkzaamheden?", inhoud: "Nee. Bij een voorschouw of het bezorgen van brieven raken wij niets aan de installatie. Alleen bij een daadwerkelijke meteraanpassing kan de levering heel kort onderbroken worden — dat melden we altijd vooraf aan de klant." },
  { id: "kb-2", categorie: "Veelgestelde vragen", titel: "Moet de klant thuis zijn?", inhoud: "Voor een voorschouw of afspraak is het fijn als er iemand thuis is, zodat de werknemer toegang heeft tot de meterkast. Voor het bezorgen van brieven hoeft niemand thuis te zijn." },
  { id: "kb-3", categorie: "Veelgestelde vragen", titel: "Hoe lang duurt het?", inhoud: "Een voorschouw of afspraak duurt gemiddeld 20 tot 30 minuten." },
  { id: "kb-4", categorie: "Veelgestelde vragen", titel: "Wat kost het de klant?", inhoud: "De werkzaamheden in opdracht van Stedin zijn voor de klant volledig kosteloos." },
  { id: "kb-5", categorie: "Veelgestelde vragen", titel: "Mag de klant legitimatie vragen?", inhoud: "Ja, altijd. Toon je Wire Solutions-pas en de opdracht/brief van Stedin. Twijfelt de klant? Verwijs naar het Stedin-nummer op de brief." },
  { id: "kb-6", categorie: "Veelgestelde vragen", titel: "Kan de afspraak verzet worden?", inhoud: "Ja. Noteer dit en geef het door aan de planner, of verwijs de klant naar de planner. Maak in de app eventueel een nieuwe afspraak aan." },

  // Werkinstructies
  { id: "kb-7", categorie: "Werkinstructies", titel: "Meterkast fotograferen", inhoud: "Maak een scherpe foto van de hele meterkast en losse foto's van de gasbordjes. Zorg dat de meternummers leesbaar zijn. Koppel de foto's aan het juiste adres in de Voorschouw." },
  { id: "kb-8", categorie: "Werkinstructies", titel: "Blanco's en ontbrekende huisnummers markeren", inhoud: "Een adres zonder naambordje of brievenbus = blanco. Markeer dit in Brieven & Routes. Ontbrekende huisnummers meld je via de knop 'Huisnummer ontbreekt' zodat het naar Stedin gaat." },
  { id: "kb-9", categorie: "Werkinstructies", titel: "Bedrijfspand: persoonlijk afgeven", inhoud: "Brieven voor bedrijfspanden gooi je niet in de bus. Geef ze persoonlijk af bij de receptie of eigenaar en noteer dit in de app (markeer als bedrijfspand)." },
  { id: "kb-10", categorie: "Werkinstructies", titel: "Buren spreken & statusupdate", inhoud: "Probeer per blok minimaal het afgesproken aantal buren te spreken. Houd de voortgang bij en stuur de klant via Communicatie een statusupdate (bijv. '5 van de 7 buren gesproken')." },

  // Veiligheid
  { id: "kb-11", categorie: "Veiligheid", titel: "Hond of agressie aan de deur", inhoud: "Vraag de bewoner de hond vast te zetten voordat je naar binnen gaat. Bij agressie of een onveilig gevoel: ga niet door, vertrek rustig en veilig, en meld het direct bij je leidinggevende." },
  { id: "kb-12", categorie: "Veiligheid", titel: "Gaslucht of onveilige situatie", inhoud: "Bij gaslucht: niet aanbellen, geen schakelaars/licht bedienen, laat ramen en deuren openzetten en verlaat de woning. Bel direct het Stedin-storingsnummer en je leidinggevende." },

  // Stedin-procedures
  { id: "kb-13", categorie: "Stedin-procedures", titel: "Klant spreekt geen Nederlands", inhoud: "Gebruik de Live vertaling in het menu Communicatie om met de klant te praten. Lukt het niet? Noteer het en laat de planner een collega inplannen die de taal spreekt." },
  { id: "kb-14", categorie: "Stedin-procedures", titel: "Geen toegang tot de meterkast (op slot)", inhoud: "Noteer 'geen toegang', maak een foto van de situatie en zet de afspraak op 'Niet thuis' of 'Herpland'. Laat de planner een nieuwe afspraak maken." },
];

export const SEED_VERLOF: Verlof[] = [
  { id: "vl-1", medewerkerId: "u-brandon", type: "Vakantie", van: "2026-06-15", tot: "2026-06-19", status: "Goedgekeurd", notitie: "Zomervakantie" },
  { id: "vl-2", medewerkerId: "u-melany", type: "Verlof", van: "2026-06-09", tot: "2026-06-09", status: "Aangevraagd", notitie: "Tandarts" },
  { id: "vl-3", medewerkerId: "u-remon", type: "Vakantie", van: "2026-06-22", tot: "2026-06-26", status: "Aangevraagd", notitie: "" },
];

export const SEED_COMM: Communicatie = {
  herinneringAan: true,
  fallbackTelefoon: "06 12345678",
  sjabloonBevestiging:
    "Beste {klant}, hierbij bevestigen wij uw afspraak met Wire Solutions op {datum} om {tijd} op {adres}. Heeft u vragen? Reageer gerust. Met vriendelijke groet, Wire Solutions.",
  sjabloonHerinnering:
    "Beste {klant}, een herinnering: morgen om {tijd} hebben wij een afspraak op {adres}. Tot dan! Wire Solutions.",
  sjabloonStatus:
    "Beste {klant}, een update: we hebben {x} van de {y} buren gesproken. We houden u op de hoogte. Wire Solutions.",
  faq: [
    { id: "fq1", vraag: "Hoe laat komen jullie?", antwoord: "U ontvangt 24 uur vooraf een herinnering met de exacte tijd van de afspraak." },
    { id: "fq2", vraag: "Moet ik thuis zijn?", antwoord: "Ja, het is fijn als er iemand thuis is zodat de werknemer toegang heeft tot de meterkast." },
    { id: "fq3", vraag: "Hoe lang duurt de afspraak?", antwoord: "Een afspraak duurt gemiddeld 20 tot 30 minuten." },
    { id: "fq4", vraag: "Wat kost het?", antwoord: "De werkzaamheden in opdracht van Stedin zijn voor u kosteloos." },
    { id: "fq5", vraag: "Kan ik verzetten?", antwoord: "Zeker, neem contact met ons op dan plannen we een nieuw moment." },
  ],
};

export const SEED_LOONSTROKEN: Loonstrook[] = [
  { id: "ls-1", medewerkerId: "u-brandon", periodeType: "Maand", refDatum: "2026-05-01", periode: "Mei 2026", bruto: 3200, bijtelling: 350, netto: 2480, boetes: 0, uren: 168, notitie: "" },
  { id: "ls-2", medewerkerId: "u-melany", periodeType: "Maand", refDatum: "2026-05-01", periode: "Mei 2026", bruto: 3100, bijtelling: 0, netto: 2410, boetes: 0, uren: 160, notitie: "" },
];

export const SEED_BOETES: Boete[] = [
  { id: "bo-1", medewerkerId: "u-brandon", datum: "2026-05-14", omschrijving: "Parkeerboete bedrijfsbus", bedrag: 65, status: "Open", notitie: "Centrum Rotterdam" },
];

export const SEED_BEDRIJF: Bedrijf = {
  naam: "Wire Solutions B.V.",
  adres: "Reedijk 7 T 16",
  postcodePlaats: "3274 KE Heinenoord",
  telefoon: "",
  email: "",
  kvk: "80190782",
  btw: "",
  iban: "",
};

export const SEED_FACTUREN: Factuur[] = [
  {
    id: "f-1",
    nummer: "2026-0001",
    datum: "2026-05-28",
    klantNaam: "Stedin Netbeheer B.V.",
    klantAdres: "Blaak 8",
    klantPostcodePlaats: "3011 TA Rotterdam",
    regels: [
      { omschrijving: "Voorschouwen wijk Rotterdam-Noord (per stuk)", aantal: 120, prijs: 12.5 },
      { omschrijving: "Brieven bezorgd incl. routeplanning", aantal: 340, prijs: 0.85 },
      { omschrijving: "Afspraken ingepland en bevestigd", aantal: 87, prijs: 4.0 },
    ],
    btwPercentage: 21,
    status: "Verstuurd",
    notitie: "Betaling binnen 14 dagen o.v.v. het factuurnummer.",
  },
];

// Echte teamaccounts. Wachtwoorden staan NOOIT in de code — alleen een PBKDF2-salted hash (zie lib/auth.ts).
// De platte wachtwoorden zijn eenmalig veilig doorgegeven aan de eigenaar.
export const SEED_USERS: User[] = [
  { id: "u-adi", naam: "Adelcao Mendes Moreira", initialen: "AM", email: "adi@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "ZDtztYqlMLDRNjkXBb4F09e8zN0x102HbFhRMYPfDFo=", wachtwoordSalt: "bSh6iuLJWnX/HwSTkpuMEQ==", wachtwoordIter: 150000 },
  { id: "u-brandon", naam: "Brandon Santos Cabral", initialen: "BC", email: "brandon@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "sU/316YDZ+4oU744ZNGxjVZEKhSpbz3puN90oqQvzhY=", wachtwoordSalt: "RkzUOiu6F+Xlg/xXdXOhoQ==", wachtwoordIter: 150000 },
  { id: "u-denilcao", naam: "Denilcao Mendes Moreira", initialen: "DM", email: "denilcao@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "7pYg3tnsvVJP2xelKGmc6NGDued2vpvDVkolyG6xtW8=", wachtwoordSalt: "9xQ+tvSn/ZcotRg1NcLP9w==", wachtwoordIter: 150000 },
  { id: "u-edilson", naam: "Edilson dos Santos", initialen: "ES", email: "edilson@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "1D2DQ3Ao8GYaqAFK24FiS4Ym2ZaKff9cOSeoU/eIwSA=", wachtwoordSalt: "J/kG0E3g6GCBrwpLadwbiA==", wachtwoordIter: 150000 },
  { id: "u-guus", naam: "Guus Zaal", initialen: "GZ", email: "guus@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "VsmwIyOhc/fu/wpFG2752LHwk5OirJFxwJ7euJBmtKo=", wachtwoordSalt: "zeBfOG48SsYJ9v4HNNKPTQ==", wachtwoordIter: 150000 },
  { id: "u-jackie", naam: "Jackie Klijnoot", initialen: "JK", email: "jackie@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "/ZLbk475qMV3ceXrhHJBoicAvw735ZSphGG+Pods7Xo=", wachtwoordSalt: "q+z7b/PDT6dzqlVXx4LcMA==", wachtwoordIter: 150000 },
  { id: "u-melany", naam: "Melany Bout", initialen: "MB", email: "melany@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "p5gVFKxCKH0rtfLxsA5BMJ4WbJRcip4AgQ6Ipfm+wME=", wachtwoordSalt: "R4kcL1yMIspW+i82lWyLsQ==", wachtwoordIter: 150000 },
  { id: "u-mitchell", naam: "Mitchell Korving", initialen: "MK", email: "mitchell@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "R+qxkQsg9nIMaPcQ0b4JPWfyPgVBkktQ3xOr20A/+RU=", wachtwoordSalt: "vqiyeFdATfY+y4vakhjdTA==", wachtwoordIter: 150000 },
  { id: "u-nathalie", naam: "Nathalie Kerdel", initialen: "NK", email: "nathalie@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "ko4IvMhJF8XOT2d0ZRj0wHLHA86fAJvbrJt2jdpsnwA=", wachtwoordSalt: "+lNQ1U4Hh3Ioa6w1ctNerQ==", wachtwoordIter: 150000 },
  { id: "u-patrick", naam: "Patrick Rüter", initialen: "PR", email: "patrick@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "sq8Y0f/mkoPY2HAclleDh8wa6calPMPhOdVhNRdcFFc=", wachtwoordSalt: "4CnuQNcNFyQWJu00DRiIKA==", wachtwoordIter: 150000 },
  { id: "u-stefano", naam: "Stefano Wareman", initialen: "SW", email: "stefano@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "AggMURwAZ430rHQO2MFSyPBUIJWmWxcQXtuEsMKfZtg=", wachtwoordSalt: "m1LrjH83jov19tofLo5ZGQ==", wachtwoordIter: 150000 },
  { id: "u-tijn", naam: "Tijn den Haan", initialen: "TH", email: "tijn@wiresolutions.nl", rol: "eigenaar", functie: "Eigenaar", wachtwoordHash: "XAe1EuzbzBga2X/VJb7aWDg1UPhwJhOPuLKux6TyPP4=", wachtwoordSalt: "bjdR2OMt5wi7q8BpGwZX9w==", wachtwoordIter: 150000 },
  { id: "u-wesley", naam: "Wesley Bout", initialen: "WB", email: "wesley@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "ItcI7q76T4GYJxg5Tcc6/1kklXLn9LoRshTjvyz/7/8=", wachtwoordSalt: "8tMH8SC2U42is/AZQXRspw==", wachtwoordIter: 150000 },
  { id: "u-roxanne", naam: "Roxanne van Heijst", initialen: "RH", email: "roxanne@wiresolutions.nl", rol: "monteur", functie: "Werknemer", wachtwoordHash: "66AUGsqNVFbaXYGu6n4IJjw6i3c6v3pH4+iVUPRH2cI=", wachtwoordSalt: "3NCOKrs7d7USOvZ1jDyV7g==", wachtwoordIter: 150000 },
  { id: "u-remon", naam: "Remon Klijnoot", initialen: "RK", email: "remon@wiresolutions.nl", rol: "beheer", functie: "Leiding", wachtwoordHash: "teD0Rbb+liUdpzwTMAOYh9/J08WuICBJw9bJs2hoFz8=", wachtwoordSalt: "4Mzk91zwutOaUEaCSensRQ==", wachtwoordIter: 150000 },
  { id: "u-willem", naam: "Willem Klijnoot", initialen: "WK", email: "willem@wiresolutions.nl", rol: "beheer", functie: "Leiding", wachtwoordHash: "tlMd5mFgJc/Q8wekatNTZsJGoZX/9U1rH36UwuFHKHE=", wachtwoordSalt: "u78SOQD9MzSD1bt0XsBTgw==", wachtwoordIter: 150000 },
];

export const SEED_PROJECTS: Project[] = [
  { id: "p-rotterdam", naam: "Stedin-batch Rotterdam-Noord", wijk: "Rotterdam-Noord", toegewezenAan: ["u-brandon"] },
  { id: "p-capelle", naam: "Stedin-batch Capelle a/d IJssel", wijk: "Capelle a/d IJssel", toegewezenAan: ["u-melany"] },
  { id: "p-schiedam", naam: "Stedin-batch Schiedam-Centrum", wijk: "Schiedam-Centrum", toegewezenAan: ["u-brandon"] },
  { id: "p-vlaardingen", naam: "Stedin-batch Vlaardingen-Oost", wijk: "Vlaardingen-Oost", toegewezenAan: ["u-melany"] },
  { id: "p-administratie", naam: "Administratie & facturatie", wijk: "Kantoor", toegewezenAan: ["u-remon", "u-willem"] },
];

export const SEED_TAKEN: Taak[] = [
  { id: "t-1", projectId: "p-rotterdam", titel: "Route lopen en brieven gooien", toegewezenAan: "u-brandon", deadline: "Vandaag 17:00", status: "Mee bezig", notitie: "" },
  { id: "t-2", projectId: "p-rotterdam", titel: "Blanco's markeren op de kaart", toegewezenAan: "u-brandon", deadline: "Vandaag 17:30", status: "Te doen", notitie: "" },
  { id: "t-3", projectId: "p-schiedam", titel: "Bedrijfspanden persoonlijk afgeven", toegewezenAan: "u-brandon", deadline: "Morgen 12:00", status: "Te doen", notitie: "Let op: nummer 14 is een kantoorpand." },
  { id: "t-4", projectId: "p-capelle", titel: "Meterkast-foto's uploaden", toegewezenAan: "u-melany", deadline: "Vandaag 16:00", status: "Mee bezig", notitie: "" },
  { id: "t-5", projectId: "p-capelle", titel: "Ontbrekende huisnummers noteren", toegewezenAan: "u-melany", deadline: "Vandaag", status: "Klaar", notitie: "Huisnr. 22 en 24 ontbreken." },
  { id: "t-6", projectId: "p-vlaardingen", titel: "Buren spreken (min. 7 per adres)", toegewezenAan: "u-melany", deadline: "Morgen 17:00", status: "Te doen", notitie: "" },
  { id: "t-7", projectId: "p-administratie", titel: "Facturen week 22 controleren", toegewezenAan: "u-remon", deadline: "Morgen", status: "Te doen", notitie: "" },
  { id: "t-8", projectId: "p-administratie", titel: "Planning volgende week rondzetten", toegewezenAan: "u-willem", deadline: "Vrijdag", status: "Mee bezig", notitie: "" },
];

// Voorbeeld-projectberichten: updates ("afgerond") en vragen die de leiding kan afhandelen.
export const SEED_PROJECT_POSTS: ProjectPost[] = [
  {
    id: "pp-1",
    projectId: "p-rotterdam",
    type: "update",
    auteurId: "u-brandon",
    tekst: "Dorpsstraat 1 t/m 5 afgerond — brieven gegooid en buren gesproken. Ga zo verder met de oneven kant.",
    aangemaakt: "2026-06-02T07:45:00.000Z",
    afgehandeld: false,
    reacties: [],
  },
  {
    id: "pp-2",
    projectId: "p-capelle",
    type: "vraag",
    auteurId: "u-melany",
    tekst: "Op nummer 22 en 24 ontbreekt het huisnummerbordje. Moet ik die alsnog proberen of meteen als 'ontbreekt' melden bij Stedin?",
    aangemaakt: "2026-06-02T08:10:00.000Z",
    afgehandeld: false,
    reacties: [
      { id: "pr-1", auteurId: "u-remon", tekst: "Probeer ze morgen nog één keer. Lukt het niet, dan melden als ontbreekt.", aangemaakt: "2026-06-02T08:25:00.000Z" },
    ],
  },
  {
    id: "pp-3",
    projectId: "p-vlaardingen",
    type: "update",
    auteurId: "u-melany",
    tekst: "Lindelaan volledig bezorgd. Alleen nr. 26 was niet thuis — afspraak ingepland.",
    aangemaakt: "2026-06-01T15:20:00.000Z",
    afgehandeld: true,
    afgehandeldDoor: "u-willem",
    afgehandeldOp: "2026-06-01T16:00:00.000Z",
    reacties: [],
  },
];

// Voorbeeld-brievenronde (toont looproute, ontbrekend huisnummer en bedrijfspand)
export const SEED_RONDES: Brievenronde[] = [
  {
    id: "r-dorpsstraat",
    straat: "Dorpsstraat",
    postcode: "3081 AB",
    plaats: "Rotterdam-Noord",
    projectId: "p-rotterdam",
    toegewezenAan: "u-brandon",
    aangemaakt: "2026-06-01T08:00:00.000Z",
    status: "toegewezen",
    toegewezenOp: "2026-06-01T08:00:00.000Z",
    adressen: [
      { id: "a-1", huisnummer: 1, toevoeging: "", type: "woning", status: "Gegooid", ontbreekt: false, notitie: "" },
      { id: "a-3", huisnummer: 3, toevoeging: "", type: "woning", status: "Gegooid", ontbreekt: false, notitie: "" },
      { id: "a-7", huisnummer: 7, toevoeging: "", type: "bedrijf", status: "Te doen", ontbreekt: false, notitie: "Kantoorpand — persoonlijk afgeven bij receptie." },
      { id: "a-9", huisnummer: 9, toevoeging: "", type: "woning", status: "Te doen", ontbreekt: false, notitie: "" },
      { id: "a-11", huisnummer: 11, toevoeging: "", type: "woning", status: "Niet thuis", ontbreekt: false, notitie: "" },
      { id: "a-2", huisnummer: 2, toevoeging: "", type: "woning", status: "Gegooid", ontbreekt: false, notitie: "" },
      { id: "a-4", huisnummer: 4, toevoeging: "", type: "woning", status: "Blanco", ontbreekt: false, notitie: "" },
      { id: "a-6", huisnummer: 6, toevoeging: "", type: "woning", status: "Te doen", ontbreekt: false, notitie: "" },
      { id: "a-8", huisnummer: 8, toevoeging: "", type: "woning", status: "Te doen", ontbreekt: false, notitie: "" },
      { id: "a-10", huisnummer: 10, toevoeging: "", type: "woning", status: "Te doen", ontbreekt: false, notitie: "" },
    ],
  },
];

export const SEED_AFSPRAKEN: Afspraak[] = [
  // Groep: straat "Lindelaan" (Anna)
  { id: "af-1", locatie: "Lindelaan", soort: "straat", klantNaam: "Mw. Visser", telefoon: "06 34567890", straat: "Lindelaan", huisnummer: "22", postcode: "3132 BC", plaats: "Vlaardingen-Oost", type: "woning", datum: "2026-06-04", tijd: "13:00", toegewezenAan: "u-melany", status: "Bevestigd", notitie: "" },
  { id: "af-2", locatie: "Lindelaan", soort: "straat", klantNaam: "Dhr. de Wit", telefoon: "06 23456789", straat: "Lindelaan", huisnummer: "24", postcode: "3132 BC", plaats: "Vlaardingen-Oost", type: "woning", datum: "2026-06-04", tijd: "13:30", toegewezenAan: "u-melany", status: "Open", notitie: "" },
  { id: "af-3", locatie: "Lindelaan", soort: "straat", klantNaam: "Fam. Bakker", telefoon: "06 99887766", straat: "Lindelaan", huisnummer: "26", postcode: "3132 BC", plaats: "Vlaardingen-Oost", type: "woning", datum: "2026-06-04", tijd: "14:00", toegewezenAan: "u-melany", status: "Open", notitie: "Belt aan via intercom." },
  // Groep: appartement "Flat De Es" (Sven)
  { id: "af-4", locatie: "Flat De Es", soort: "appartement", klantNaam: "Dhr. Yilmaz", telefoon: "06 12345678", straat: "Essenlaan", huisnummer: "12-1", postcode: "3081 AB", plaats: "Rotterdam-Noord", type: "woning", datum: "2026-06-03", tijd: "09:00", toegewezenAan: "u-brandon", status: "Bevestigd", notitie: "" },
  { id: "af-5", locatie: "Flat De Es", soort: "appartement", klantNaam: "Mw. Pietersen", telefoon: "06 56781234", straat: "Essenlaan", huisnummer: "12-2", postcode: "3081 AB", plaats: "Rotterdam-Noord", type: "woning", datum: "2026-06-03", tijd: "09:30", toegewezenAan: "u-brandon", status: "Open", notitie: "" },
  { id: "af-6", locatie: "Flat De Es", soort: "appartement", klantNaam: "Beheerder VvE", telefoon: "010 1234567", straat: "Essenlaan", huisnummer: "12-BG", postcode: "3081 AB", plaats: "Rotterdam-Noord", type: "bedrijf", datum: "2026-06-03", tijd: "08:30", toegewezenAan: "u-brandon", status: "Bevestigd", notitie: "Sleutel meterruimte ophalen." },
];

import type { User, Project, Taak, ProjectPost, Sanering, TauwOpdracht, Brievenronde, Afspraak, Factuur, Bedrijf, Loonstrook, Boete, Communicatie, Verlof, KennisArtikel, Instellingen, Klant, Opdrachtgever, Buurtaanpak, Schouwafspraak, AgendaItem, Todo } from "./types";

// Saneren-dossiers en TAUW-opdrachten starten leeg; aanmaken via de bijbehorende pagina.
export const SEED_SANERINGEN: Sanering[] = [];
export const SEED_TAUW: TauwOpdracht[] = [];

export const SEED_KLANTEN: Klant[] = [];

export const SEED_INSTELLINGEN: Instellingen = {
  supabaseUrl: "https://buauptxdaiuvqazhlrhk.supabase.co",
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ1YXVwdHhkYWl1dnFhemhscmhrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5MTQ0ODAsImV4cCI6MjA5NjQ5MDQ4MH0.OeQlHefazX6XLdAoOQtJEWs9lUqctjP3rC4_L7byn_4",
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

export const SEED_VERLOF: Verlof[] = [];

export const SEED_SCHOUW: Schouwafspraak[] = [];

export const SEED_AGENDA_ITEMS: AgendaItem[] = [];

export const SEED_TODOS: Todo[] = [];

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

export const SEED_LOONSTROKEN: Loonstrook[] = [];

export const SEED_BOETES: Boete[] = [];

export const SEED_BEDRIJF: Bedrijf = {
  naam: "Wire Solutions B.V.",
  adres: "Reedijk 7 T 16",
  postcodePlaats: "3274 KE Heinenoord",
  telefoon: "06-51611469",
  email: "info@wiresolutions.nl",
  kvk: "80190782",
  btw: "NL861583140B01",
  iban: "NL97RABO0366741535",
  bic: "RABONL2U",
};

// Vaste opdrachtgevers (klantgegevens voor op facturen). Stedin staat er alvast in.
export const SEED_OPDRACHTGEVERS: Opdrachtgever[] = [
  { id: "og-stedin", naam: "Stedin Netbeheer B.V.", relatienummer: "20200015", adres: "Nijverheidsweg 15", postcodePlaats: "3534 AM Utrecht", email: "", tav: "Rune Zwijnenburg" },
];

export const SEED_BUURTAANPAK: Buurtaanpak[] = [];

export const SEED_FACTUREN: Factuur[] = [];

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

export const SEED_PROJECTS: Project[] = [];

export const SEED_TAKEN: Taak[] = [];

// Voorbeeld-projectberichten: updates ("afgerond") en vragen die de leiding kan afhandelen.
export const SEED_PROJECT_POSTS: ProjectPost[] = [];

// Voorbeeld-brievenronde (toont looproute, ontbrekend huisnummer en bedrijfspand)
export const SEED_RONDES: Brievenronde[] = [];

export const SEED_AFSPRAKEN: Afspraak[] = [];

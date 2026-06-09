export type Role = "eigenaar" | "beheer" | "monteur";

export type User = {
  id: string;
  naam: string;
  initialen: string;
  email: string;
  // Wachtwoord wordt nooit als platte tekst bewaard — alleen een PBKDF2-salted hash (zie lib/auth.ts).
  wachtwoordHash: string;
  wachtwoordSalt: string;
  wachtwoordIter: number;
  rol: Role;
  functie: string;
  werknemer?: boolean; // beheerder die óók veldwerk doet
  beheerRechten?: string[]; // welke onderdelen een beheerder mag beheren (nav-keys); undefined = alles
};

// Onderdelen die een beheerder van de eigenaar mag beheren
export const BEHEER_GEBIEDEN: { key: string; label: string }[] = [
  { key: "overzicht", label: "Dashboard" },
  { key: "team", label: "Team" },
  { key: "projecten", label: "Projecten" },
  { key: "afspraken", label: "Afspraken" },
  { key: "brieven", label: "Brieven & Routes" },
  { key: "documenten", label: "Documenten" },
  { key: "communicatie", label: "Communicatie" },
  { key: "klanten", label: "Klanten & Database" },
  { key: "facturen", label: "Facturen" },
  { key: "loonstroken", label: "Loonstroken" },
  { key: "boetes", label: "Boetes" },
  { key: "agenda", label: "Agenda" },
  { key: "medewerkers", label: "Medewerkers" },
  { key: "beheer", label: "Gebruikersbeheer" },
];

export type TaakStatus = "Te doen" | "Mee bezig" | "Klaar";

export const TAAK_STATUSSEN: TaakStatus[] = ["Te doen", "Mee bezig", "Klaar"];

export type Taak = {
  id: string;
  projectId: string;
  titel: string;
  toegewezenAan: string; // user id
  deadline: string;
  status: TaakStatus;
  notitie: string;
};

// Status richting de boekhouding: doorgeschakeld om te factureren, of al gefactureerd.
export type BoekhoudStatus = "te_factureren" | "gefactureerd";
export type Project = {
  id: string;
  naam: string;
  wijk: string;
  toegewezenAan: string[]; // user ids
  pdNummer?: string; // Stedin PD-nummer dat aan dit project hangt
  boekhouding?: BoekhoudStatus; // leeg = nog niet doorgeschakeld naar de boekhouding
  doorgestuurdOp?: string; // ISO — wanneer als afgerond naar de boekhouding gestuurd
  gefactureerdOp?: string; // ISO
};

// ── Projectberichten: updates ("afgerond") en vragen, met reacties en afhandeling door de leiding ──
export type ProjectPostType = "update" | "vraag";
export const PROJECT_POST_TYPES: ProjectPostType[] = ["update", "vraag"];

export type ProjectReactie = {
  id: string;
  auteurId: string; // user id
  tekst: string;
  aangemaakt: string; // ISO
};

export type ProjectPost = {
  id: string;
  projectId: string;
  type: ProjectPostType; // "update" = iets gemeld/afgerond, "vraag" = vraag aan team/leiding
  auteurId: string; // user id
  tekst: string;
  aangemaakt: string; // ISO
  afgehandeld: boolean; // door de leiding afgehandeld
  afgehandeldDoor?: string; // user id
  afgehandeldOp?: string; // ISO
  reacties: ProjectReactie[];
};

// ── Mededelingen: prikbord van de beheerder naar de werknemers ──
export type Mededeling = {
  id: string;
  auteurId: string; // beheerder/eigenaar die de mededeling plaatste
  tekst: string;
  projectId?: string; // optioneel gekoppeld project
  gerichtAan?: string; // user id; leeg = hele team
  belangrijk: boolean; // "let op" — extra opvallend
  deadline?: string; // ISO yyyy-mm-dd — optionele deadline voor de taak
  vastgepind?: boolean; // bovenaan vastgezet
  aangemaakt: string; // ISO
  gezienDoor: string[]; // user ids die "gezien" hebben getikt
};

export const ROL_LABEL: Record<Role, string> = {
  eigenaar: "Eigenaar",
  beheer: "Beheer",
  monteur: "Werknemer",
};

// ── Voorschouw (Stedin "Informatie voorschouw" formulier) ──
export type JaNee = "JA" | "NEE" | "";

export type VoorschouwStatus = "Concept" | "Ingediend";

// Zelf-benoemde map om voorschouwen te groeperen (buurt, wijk, gemeente, postcode, …).
export type VoorschouwMap = {
  id: string;
  naam: string;
  gearchiveerd?: boolean; // naar de database verstuurd → uit de actieve lijst, bewaard onder "Voorschouwen"
  gearchiveerdOp?: string; // ISO
};

export type Voorschouw = {
  id: string;
  ingevuldDoor: string; // user id
  aangemaakt: string; // ISO datum
  status: VoorschouwStatus;
  mapId?: string; // optionele eigen map (VoorschouwMap)

  // Algemene informatie
  straatnaam: string;
  postcode: string;
  plaats: string;
  meerdereStraten: JaNee;
  aantalWoningen: string;
  aantalEntrees: string;
  namenHuisbaasVVE: string;
  adressenHuisbaasVVE: string;
  gasloos: JaNee;
  blokverwarming: JaNee;
  bijzondereLocatieZorg: string; // verzorgingstehuis / woon- of leefgroep
  bijzondereLocatieKeuken: string; // zelfvoorzienend / 1 centrale keuken

  // Technische informatie
  aantalStijgleidingen: string;
  fotos: string[]; // data-URL's (gecomprimeerd)
};

// ── Brieven & Routes ──
export type AdresType = "woning" | "bedrijf";
export type BriefStatus = "Te doen" | "Gegooid" | "Blanco" | "Niet thuis";

export const BRIEF_STATUSSEN: BriefStatus[] = ["Te doen", "Gegooid", "Blanco", "Niet thuis"];

export type Adres = {
  id: string;
  huisnummer: number;
  toevoeging: string; // bijv. "A", "bis", "1"
  type: AdresType;
  status: BriefStatus;
  ontbreekt: boolean; // huisnummer mist / onbekend (te melden aan Stedin)
  notitie: string;
};

// Fase in de Brieven-werkstroom (concept → gecontroleerd → bevestigd → gefactureerd).
export type RondeFase = "concept" | "gecontroleerd" | "bevestigd" | "gefactureerd";

export type Brievenronde = {
  id: string;
  straat: string;
  postcode: string;
  plaats: string;
  projectId?: string;
  toegewezenAan?: string; // user id — de medewerker die deze ronde moet lopen
  aangemaakt: string;
  adressen: Adres[];
  // ── Rol-gebaseerde levenscyclus (zelfde stappen als TAUW — zie TauwStatus) ──
  status: TauwStatus;
  toegewezenOp?: string; // ISO
  deadline?: string; // ISO yyyy-mm-dd — door de beheerder ingesteld
  gecontroleerdDoor?: string; // user id
  gecontroleerdOp?: string; // ISO
  verstuurdOp?: string; // ISO
  // ── Werkstroom-extra's (optioneel) ──
  regio?: string;
  fase?: RondeFase; // legacy — alleen nog voor migratie naar status
  parkeerNotitie?: string;
  bevestigdOp?: string; // ISO
  mailVerstuurdOp?: string; // ISO — bevestigingsmail verstuurd
  factuurId?: string; // gekoppelde concept-factuur
  gearchiveerd?: boolean; // naar de database verstuurd → uit de actieve lijst, bewaard onder "Brieven & Routes"
  gearchiveerdOp?: string; // ISO
};

// ── Afspraken ──
export type AfspraakStatus = "Open" | "Bevestigd" | "Afgerond" | "Geannuleerd";
export const AFSPRAAK_STATUSSEN: AfspraakStatus[] = [
  "Open",
  "Bevestigd",
  "Afgerond",
  "Geannuleerd",
];

export type AfspraakSoort = "woonwijk" | "straat" | "appartement";

export type Afspraak = {
  id: string;
  locatie: string; // naam van de woonwijk / straat / appartement (de groep)
  soort: AfspraakSoort;
  klantNaam: string;
  telefoon: string;
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  type: AdresType;
  datum: string; // "2026-06-03"
  tijd: string; // "14:00"
  toegewezenAan?: string; // monteur (user id)
  status: AfspraakStatus;
  notitie: string;
};

// ── Documenten / Facturen ──
export type Bedrijf = {
  naam: string;
  adres: string;
  postcodePlaats: string;
  telefoon: string;
  email: string;
  kvk: string;
  btw: string;
  iban: string;
  bic?: string;
};

export type FactuurRegel = {
  omschrijving: string;
  aantal: number;
  prijs: number; // per stuk, excl. btw
};

export type FactuurStatus = "Concept" | "Verstuurd" | "Betaald";

export type Factuur = {
  id: string;
  nummer: string;
  datum: string; // ISO "2026-06-01"
  klantNaam: string;
  klantAdres: string;
  klantPostcodePlaats: string;
  tav?: string; // t.a.v. contactpersoon
  relatienummer?: string; // relatienummer bij de klant (bv. Stedin)
  email?: string; // adres waar de factuur naartoe moet
  pdNummer?: string; // PD-nummer als kopregel op de factuur
  betaaltermijn?: number; // dagen (standaard 14)
  regels: FactuurRegel[];
  btwPercentage: number;
  status: FactuurStatus;
  notitie: string;
};

// Vaste opdrachtgever-gegevens — per factuur te kiezen zodat de klantvelden automatisch invullen.
export type Opdrachtgever = {
  id: string;
  naam: string;
  relatienummer: string;
  adres: string;
  postcodePlaats: string;
  email: string; // waar de factuur naartoe moet
  tav?: string;
};

// ── Loonstroken ──
export type PeriodeType = "Week" | "Maand" | "Jaar";
export const PERIODE_TYPES: PeriodeType[] = ["Week", "Maand", "Jaar"];

export type Loonstrook = {
  id: string;
  medewerkerId: string;
  periodeType: PeriodeType;
  refDatum: string; // ISO-datum binnen de periode (voor sorteren)
  periode: string; // label, bijv. "Mei 2026" / "Week 22 2026" / "2026"
  bruto: number;
  bijtelling: number; // bijtelling auto
  netto: number;
  boetes: number; // ingehouden boetes (€)
  uren: number;
  notitie: string;
  bestand?: string; // data-URL van geüploade loonstrook (PDF/afbeelding)
  bestandsnaam?: string;
};

// ── Boetes ──
export type BoeteStatus = "Open" | "Betaald" | "Kwijtgescholden";
export const BOETE_STATUSSEN: BoeteStatus[] = ["Open", "Betaald", "Kwijtgescholden"];

export type Boete = {
  id: string;
  medewerkerId: string;
  datum: string; // ISO
  omschrijving: string;
  bedrag: number;
  status: BoeteStatus;
  notitie: string;
};

// ── Communicatie ──
export type FaqItem = { id: string; vraag: string; antwoord: string };

export type Communicatie = {
  herinneringAan: boolean; // 24-uur automatische herinnering aan/uit
  fallbackTelefoon: string; // doorschakelnummer (afspraakmaker)
  sjabloonBevestiging: string;
  sjabloonHerinnering: string;
  sjabloonStatus: string;
  faq: FaqItem[];
};

// ── Agenda / Verlof ──
export type VerlofType = "Vakantie" | "Verlof" | "Ziek";
export const VERLOF_TYPES: VerlofType[] = ["Vakantie", "Verlof", "Ziek"];

export type VerlofStatus = "Aangevraagd" | "Goedgekeurd" | "Afgewezen";

export type Verlof = {
  id: string;
  medewerkerId: string;
  type: VerlofType;
  van: string; // ISO datum
  tot: string; // ISO datum
  status: VerlofStatus;
  notitie: string;
};

// ── Klanten & Database ──
export type Klant = {
  id: string;
  naam: string;
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  notitie: string;
  fotos: string[]; // meterkast-foto's (data-URL)
};

// ── Instellingen / integraties ──
export type Instellingen = {
  supabaseUrl: string;
  supabaseKey: string;
  googleMapsKey: string;
  whatsappToken: string;
  claudeKey: string;
};

// ── Kennisbank ──
export type KennisArtikel = {
  id: string;
  categorie: string;
  titel: string;
  inhoud: string;
};

export function legeVoorschouw(): Omit<Voorschouw, "id" | "ingevuldDoor" | "aangemaakt" | "status"> {
  return {
    straatnaam: "",
    postcode: "",
    plaats: "",
    meerdereStraten: "",
    aantalWoningen: "",
    aantalEntrees: "",
    namenHuisbaasVVE: "",
    adressenHuisbaasVVE: "",
    gasloos: "",
    blokverwarming: "",
    bijzondereLocatieZorg: "",
    bijzondereLocatieKeuken: "",
    aantalStijgleidingen: "",
    fotos: [],
  };
}

// ── Stedin-weekplanning (1 per project, in te vullen in de app en te exporteren naar .xlsx) ──
export type Straatwerk = "" | "tegels" | "klinkers";
export const STRAATWERK_OPTIES: Straatwerk[] = ["", "tegels", "klinkers"];

// Vaste tijdsloten uit de template (kolom "tijd"). Bepaalt de rij-volgorde in de editor én de export.
export const PLANNING_TIJDEN = ["8.00", "9.00", "10.00", "11.00", "12.00", "13.00", "14.00", "15.00"] as const;
export type PlanningTijd = (typeof PLANNING_TIJDEN)[number];

export type PlanningSlot = {
  id: string;
  tijd: PlanningTijd; // vast label, bepaalt de rij
  bijzonderheden: string; // kolom Bijzonderheden
  adres: string; // kolom Adres (straat)
  huisnummer: string; // kolom Huisnummer
  telefoon: string; // kolom Tel nr
  monteurId: string; // kolom Monteur — user id, "" = niet gekozen
  monteurVrij: string; // vrije-tekst alternatief (wint bij export als gevuld)
  straatwerk: Straatwerk; // kolom Straatwerk tegels/klinkers
  m2: string; // kolom aantal m2 (string zodat leeg echt leeg blijft)
};

export type PlanningDag = {
  id: string;
  datum: string; // ISO "2026-06-02"; dagnaam + label worden afgeleid
  dna: JaNee; // kolom Werkzaamheden DNA op de gele dagrij
  slots: PlanningSlot[]; // altijd 8, volgorde = PLANNING_TIJDEN
};

export type Weekplanning = {
  id: string;
  projectId: string; // 1:1 met een project
  jaar: number; // titelblok rechtsboven
  aangemaakt: string; // ISO
  bijgewerkt: string; // ISO
  dagen: PlanningDag[]; // chronologisch op datum
};

// Factories — id's via de meegegeven nextId, zodat de store de enige id-bron blijft.
export function legeSlots(maakId: (prefix: string) => string): PlanningSlot[] {
  return PLANNING_TIJDEN.map((tijd) => ({
    id: maakId("psl"),
    tijd,
    bijzonderheden: "",
    adres: "",
    huisnummer: "",
    telefoon: "",
    monteurId: "",
    monteurVrij: "",
    straatwerk: "" as Straatwerk,
    m2: "",
  }));
}

export function legeDag(datum: string, maakId: (prefix: string) => string): PlanningDag {
  return { id: maakId("pdag"), datum, dna: "", slots: legeSlots(maakId) };
}

// ── Gedeelde werkstroom-stappen (FlowBoard voor Saneren & TAUW) ──
export type StapStatus = "open" | "bezig" | "klaar";
export const STAP_STATUSSEN: StapStatus[] = ["open", "bezig", "klaar"];

export type FlowStap = {
  key: string; // matcht de StapDef-key uit lib/flow.ts
  status: StapStatus;
  notitie: string;
  bijgewerkt?: string; // ISO
};

// ── Saneren: één project per wijk/buurt/gemeente met een lijst adressen om afspraken mee te maken ──
// (geïmporteerd uit Excel, net als TAUW; per adres bel/WhatsApp je de bewoner en zet je datum/tijd).
export type SaneerAdres = {
  id: string;
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  naam: string; // bewoner / contactpersoon
  telefoon: string;
  datum: string; // afspraakdatum (ISO of leeg)
  tijd: string; // "HH:MM" of leeg
  bevestigd: boolean; // afspraak gemaakt/bevestigd
  notitie: string;
  herinnerVerstuurdOp?: string; // ISO — wanneer de bevestigings-sms (24u vooraf) is verstuurd
};

export type Sanering = {
  id: string;
  aangemaakt: string; // ISO
  naam: string; // projectnaam = wijk / buurt / gemeente
  regio: string;
  toegewezenAan?: string; // user id (werknemer die de afspraken maakt)
  // Rol-gebaseerde levenscyclus (zelfde stappen als TAUW — zie TauwStatus).
  status: TauwStatus;
  toegewezenOp?: string; // ISO — wanneer het project aan de werknemer is afgegeven
  deadline?: string; // ISO yyyy-mm-dd — door de beheerder gezet
  gecontroleerdDoor?: string; // user id (beheerder)
  gecontroleerdOp?: string; // ISO
  verstuurdOp?: string; // ISO
  adressen: SaneerAdres[];
  afgerondOp?: string; // ISO — wanneer alle afspraken gemaakt waren
  gearchiveerd?: boolean; // naar de database verstuurd → uit de actieve lijst, bewaard onder "Saneren"
  gearchiveerdOp?: string; // ISO
};

export function legeSaneerAdres(id: string): SaneerAdres {
  return { id, straat: "", huisnummer: "", postcode: "", plaats: "", naam: "", telefoon: "", datum: "", tijd: "", bevestigd: false, notitie: "" };
}

// ── TAUW (bodemonderzoek): meerdere adressen, route over lange afstanden, Excel-planning ──
export type TauwAdres = {
  id: string;
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  bewoner: string;
  telefoon: string;
  datum: string; // afspraakdatum (uit Stedin-planning of zelf ingepland), ISO of label
  tijd: string; // afspraaktijd in "HH:MM" (bv. "08:00"); in de Stedin-export getoond als "8.00"
  bevestigd: boolean; // bewoner heeft het bodemonderzoek bevestigd
  notitie: string; // Bijzonderheden
};

// Twee soorten TAUW-opdrachten — bepalen de werknemer-stappen én hoe het bestand wordt gescand.
export type TauwType = "bodemonderzoek" | "bezoekronde";
export const TAUW_TYPES: TauwType[] = ["bodemonderzoek", "bezoekronde"];
export const TAUW_TYPE_LABEL: Record<TauwType, string> = {
  bodemonderzoek: "Bodemonderzoek",
  bezoekronde: "Bezoekronde",
};

// Rol-gebaseerde levenscyclus: beheerder importeert → werknemer werkt af → beheerder controleert → doorsturen.
export type TauwStatus = "nieuw" | "toegewezen" | "ter_controle" | "gecontroleerd" | "verstuurd";
export const TAUW_STATUS_VOLGORDE: TauwStatus[] = ["nieuw", "toegewezen", "ter_controle", "gecontroleerd", "verstuurd"];
export const TAUW_STATUS_LABEL: Record<TauwStatus, string> = {
  nieuw: "Geïmporteerd",
  toegewezen: "Bij werknemer",
  ter_controle: "Klaar voor controle",
  gecontroleerd: "Goedgekeurd",
  verstuurd: "Verstuurd",
};

export type TauwOpdracht = {
  id: string;
  aangemaakt: string; // ISO
  type: TauwType;
  status: TauwStatus;
  referentie: string;
  regio: string;
  toegewezenAan?: string; // user id (werknemer)
  toegewezenOp?: string; // ISO — wanneer de map aan de werknemer is afgegeven
  deadline?: string; // ISO yyyy-mm-dd — door de beheerder gezet
  adressen: TauwAdres[];
  stappen: FlowStap[];
  gecontroleerdDoor?: string; // user id (beheerder)
  gecontroleerdOp?: string; // ISO
  verstuurdOp?: string; // ISO
  gearchiveerd?: boolean; // naar de database verstuurd → uit de actieve lijst, bewaard onder "TAUW"
  gearchiveerdOp?: string; // ISO
};

// ── Projectarchief (Klanten & Database): de 4 mappen waarin afgeronde projecten worden bewaard ──
export type ProjectCategorie = "brieven" | "saneren" | "voorschouwen" | "tauw";
export const PROJECT_CATEGORIE_LABEL: Record<ProjectCategorie, string> = {
  brieven: "Brieven & Routes",
  saneren: "Saneren",
  voorschouwen: "Voorschouwen",
  tauw: "TAUW",
};

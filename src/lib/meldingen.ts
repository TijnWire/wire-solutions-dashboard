import type { Bedrijf, Instellingen, Verlof, Taak, Brievenronde, Afspraak, Voorschouw, User, Project, ProjectPost, TauwOpdracht, Sanering } from "./types";
import { supabaseAan } from "./supabase";

const isISODatum = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const dezeISO = (offset = 0) => { const t = new Date(); t.setDate(t.getDate() + offset); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

export type Melding = {
  id: string;
  ernst: "info" | "waarschuwing";
  titel: string;
  tekst: string;
  navKey?: string; // waar de melding heen linkt
  target?: { ronde?: string; locatie?: string; project?: string; tauwId?: string; saneringId?: string };
};

// Systeemmeldingen voor de leiding (incomplete gegevens, integraties, openstaande aanvragen).
export function berekenMeldingen(bedrijf: Bedrijf, inst: Instellingen, verlof: Verlof[]): Melding[] {
  const m: Melding[] = [];
  if (!supabaseAan && !inst.supabaseUrl) m.push({ id: "db", ernst: "info", titel: "Geen centrale database", tekst: "Gegevens staan nu lokaal op elk apparaat. Koppel Supabase om alles te delen.", navKey: "instellingen" });
  if (!inst.whatsappToken) m.push({ id: "wa", ernst: "info", titel: "WhatsApp-API niet ingesteld", tekst: "Berichten worden nu handmatig geopend.", navKey: "instellingen" });
  if (!bedrijf.btw) m.push({ id: "btw", ernst: "waarschuwing", titel: "BTW-nummer ontbreekt", tekst: "Vul je BTW-nummer in bij Instellingen voor volledige facturen.", navKey: "instellingen" });
  if (!bedrijf.iban) m.push({ id: "iban", ernst: "waarschuwing", titel: "IBAN ontbreekt", tekst: "Vul je IBAN in zodat klanten weten waarheen te betalen.", navKey: "instellingen" });
  const open = verlof.filter((v) => v.status === "Aangevraagd").length;
  if (open > 0) m.push({ id: "verlof", ernst: "info", titel: `${open} verlofaanvraag${open > 1 ? "en" : ""} open`, tekst: "Beoordeel de openstaande verlofaanvragen in de Agenda.", navKey: "agenda" });
  return m;
}

type MeldingData = {
  taken: Taak[];
  rondes: Brievenronde[];
  afspraken: Afspraak[];
  voorschouwen: Voorschouw[];
  projects: Project[];
  projectPosts: ProjectPost[];
  tauwOpdrachten: TauwOpdracht[];
  saneringen: Sanering[];
  users: User[];
  bedrijf: Bedrijf;
  instellingen: Instellingen;
  verlof: Verlof[];
};

// Persoonlijke meldingen per gebruiker — wat moet deze persoon oppakken?
export function meldingenVoor(user: User, data: MeldingData): Melding[] {
  const { taken, rondes, afspraken, voorschouwen, projects, projectPosts, tauwOpdrachten, saneringen, users, bedrijf, instellingen, verlof } = data;
  const m: Melding[] = [];
  const isLeiding = user.rol === "eigenaar" || user.rol === "beheer";

  // Open taken
  const openTaken = taken.filter((t) => (t.toegewezenAan === user.id || t.toegewezenAan === "") && t.status !== "Klaar"); // "" = hele team
  if (openTaken.length) m.push({ id: "taken", ernst: "info", titel: `${openTaken.length} ${openTaken.length === 1 ? "taak" : "taken"} te doen`, tekst: "Bekijk je openstaande taken in Mijn werk.", navKey: "mijnwerk" });

  // Toegewezen brievenrondes met nog te gooien adressen
  for (const r of rondes.filter((r) => r.toegewezenAan === user.id)) {
    const open = r.adressen.filter((a) => !a.ontbreekt && a.status === "Te doen").length;
    if (open > 0) m.push({ id: "ronde-" + r.id, ernst: "info", titel: `Brieven: ${r.straat}`, tekst: `Nog ${open} adres${open === 1 ? "" : "sen"} te gooien.`, navKey: "brieven", target: { ronde: r.id } });
  }

  // Toegewezen afspraken (nog niet afgerond/geannuleerd), gegroepeerd per locatie
  const groepen = new Map<string, number>();
  for (const a of afspraken.filter((a) => a.toegewezenAan === user.id && a.status !== "Afgerond" && a.status !== "Geannuleerd")) {
    groepen.set(a.locatie, (groepen.get(a.locatie) ?? 0) + 1);
  }
  for (const [loc, n] of groepen) m.push({ id: "afspr-" + loc, ernst: "info", titel: `Afspraken: ${loc}`, tekst: `${n} afspraak${n === 1 ? "" : "en"} te doen.`, navKey: "afspraken", target: { locatie: loc } });

  // Saneren: bevestigings-sms 24u vóór de afspraak. Pas zodra bij élk adres een afspraak is gemaakt,
  // en alleen voor afspraken die vandaag of morgen plaatsvinden en nog geen bevestiging hebben gehad.
  const vandaag = dezeISO(0), morgen = dezeISO(1);
  for (const s of saneringen.filter((s) => !s.gearchiveerd && (isLeiding || s.toegewezenAan === user.id))) {
    if (s.adressen.length === 0 || !s.adressen.every((a) => a.bevestigd)) continue;
    const teVersturen = s.adressen.filter((a) => a.telefoon.trim() && isISODatum(a.datum) && !a.herinnerVerstuurdOp && a.datum >= vandaag && a.datum <= morgen).length;
    if (teVersturen > 0) m.push({ id: "san-sms-" + s.id, ernst: "waarschuwing", titel: `${teVersturen} bevestigings-sms te versturen`, tekst: `Stuur de bewoners van “${s.naam}” vandaag nog de afspraakbevestiging — hun afspraak is vandaag of morgen (24 uur vooraf).`, navKey: "saneren", target: { saneringId: s.id } });
  }

  // Concept-voorschouwen nog niet ingediend
  const concepten = voorschouwen.filter((v) => v.ingevuldDoor === user.id && v.status === "Concept");
  if (concepten.length) m.push({ id: "vs", ernst: "waarschuwing", titel: `${concepten.length} voorschouw${concepten.length === 1 ? "" : "en"} niet ingediend`, tekst: "Dien je concept-voorschouwen in.", navKey: "voorschouwen" });

  // Eigen verlof afgewezen
  const afgewezen = verlof.filter((v) => v.medewerkerId === user.id && v.status === "Afgewezen");
  if (afgewezen.length) m.push({ id: "verlof-afg", ernst: "waarschuwing", titel: "Verlofaanvraag afgewezen", tekst: "Bekijk je verlof in de Agenda.", navKey: "agenda" });

  // Projectberichten: open updates & vragen op projecten waar ik bij betrokken ben (de leiding ziet alles).
  const projectById = new Map(projects.map((p) => [p.id, p]));
  const voornaam = (id: string) => users.find((u) => u.id === id)?.naam.split(" ")[0] ?? "Iemand";
  const inProject = (p: Project) =>
    isLeiding || p.toegewezenAan.includes(user.id) || taken.some((t) => t.projectId === p.id && (t.toegewezenAan === user.id || t.toegewezenAan === ""));
  const projectNav = isLeiding ? "projecten" : "mijnwerk";
  for (const post of projectPosts) {
    if (post.afgehandeld) continue;
    const project = projectById.get(post.projectId);
    if (!project || !inProject(project)) continue;
    const kort = post.tekst.length > 70 ? post.tekst.slice(0, 67) + "…" : post.tekst;

    if (post.auteurId === user.id) {
      // Je eigen vraag is door iemand anders beantwoord
      if (post.type === "vraag" && post.reacties.some((r) => r.auteurId !== user.id)) {
        m.push({ id: "pp-ant-" + post.id, ernst: "info", titel: `Antwoord op je vraag · ${project.naam}`, tekst: kort, navKey: projectNav, target: { project: project.id } });
      }
      continue;
    }
    if (post.type === "vraag") {
      m.push({ id: "pp-" + post.id, ernst: "waarschuwing", titel: `Vraag · ${project.naam}`, tekst: `${voornaam(post.auteurId)}: ${kort}`, navKey: projectNav, target: { project: project.id } });
    } else {
      m.push({ id: "pp-" + post.id, ernst: "info", titel: `Update · ${project.naam}`, tekst: `${voornaam(post.auteurId)}: ${kort}`, navKey: projectNav, target: { project: project.id } });
    }
  }

  // TAUW: aan mij toegewezen mappen — herinnering met openstaande adressen, of een nudge "klaar voor controle"
  for (const o of tauwOpdrachten.filter((t) => t.toegewezenAan === user.id && (t.status === "toegewezen" || t.status === "nieuw"))) {
    const open = o.adressen.filter((a) => !a.bevestigd).length;
    m.push({ id: "tauw-" + o.id, ernst: "info", titel: `TAUW: ${o.referentie || o.regio || "opdracht"}`, tekst: open > 0 ? `Nog ${open} adres${open === 1 ? "" : "sen"} af te ronden.` : "Klaar om naar controle te sturen.", navKey: "tauw", target: { tauwId: o.id } });
  }

  // TAUW: klaar voor controle — de beheerder moet checken en doorsturen naar Stedin
  if (isLeiding) {
    const voornaamVan = (id?: string) => users.find((u) => u.id === id)?.naam.split(" ")[0] ?? "een werknemer";
    for (const o of tauwOpdrachten.filter((t) => t.status === "ter_controle")) {
      m.push({ id: "tauw-ctrl-" + o.id, ernst: "waarschuwing", titel: `TAUW klaar voor controle: ${o.referentie || o.regio || "opdracht"}`, tekst: `Afgerond door ${voornaamVan(o.toegewezenAan)} — controleer en stuur door naar Stedin.`, navKey: "tauw", target: { tauwId: o.id } });
    }
  }

  // Systeemmeldingen voor de leiding erbij
  if (isLeiding) m.push(...berekenMeldingen(bedrijf, instellingen, verlof));

  return m;
}

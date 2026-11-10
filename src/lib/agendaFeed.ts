// Agenda: wat staat er op welke dag, en hoe wordt dat een iCalendar-bestand (.ics) voor de telefoon.
// Eén bron voor allebei: de Agenda-pagina, het .ics-bestand dat je kunt downloaden én de agenda-link
// (abonnement) die de Worker serveert gebruiken exact deze functies. Daarom geen scherm- of browsercode hier.
//
// Wat erin hoort — en niets anders: verlof, meetings, mededelingen, verjaardagen van collega's en feestdagen.
import type { AgendaItem, Mededeling, User, Verlof } from "./types";
import { feestdagNaam } from "./feestdagen";
import { isMededelingVoor } from "./mededelingen";

export type AgendaSoort = "verlof" | "meeting" | "mededeling" | "verjaardag" | "feestdag";

export const AGENDA_SOORT_LABEL: Record<AgendaSoort, string> = {
  verlof: "Verlof",
  meeting: "Meetings",
  mededeling: "Mededelingen",
  verjaardag: "Verjaardagen",
  feestdag: "Feestdagen",
};
export const AGENDA_SOORTEN: AgendaSoort[] = ["verlof", "meeting", "mededeling", "verjaardag", "feestdag"];

export type AgendaGebeurtenis = {
  id: string;
  soort: AgendaSoort;
  titel: string;
  datum: string; // yyyy-mm-dd (eerste dag)
  totDatum?: string; // yyyy-mm-dd, laatste dag (inclusief) bij meerdaagse gebeurtenissen
  tijd?: string; // "HH:MM"; leeg = hele dag
  wie?: string; // user id waar het over gaat (verlof, meeting)
  omschrijving?: string;
  bronId?: string; // id van het onderliggende item (om te kunnen verwijderen)
};

export type AgendaBronnen = {
  users: User[];
  verlof: Verlof[];
  agendaItems: AgendaItem[];
  mededelingen: Mededeling[];
  // Beslissingen van de boekhouding gaan boven de status in het verlof zelf (zie useVerlofBeslissingen).
  verlofStatus?: Record<string, string>;
};

const pad = (n: number) => String(n).padStart(2, "0");
const isoVan = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isIso = (s: string | undefined): s is string => !!s && /^\d{4}-\d{2}-\d{2}/.test(s);

export function plusDagen(iso: string, n: number): string {
  const d = new Date(iso.slice(0, 10) + "T12:00:00");
  d.setDate(d.getDate() + n);
  return isoVan(d);
}

// De eerste woorden van een mededeling, genoeg om te herkennen in een kalendervakje.
function kort(tekst: string, max = 60): string {
  const t = tekst.replace(/\s+/g, " ").trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + "…" : t;
}

// ── Voor de Agenda-pagina: alles wat tussen twee data (inclusief) valt ──
// `leiding` bepaalt wat je van meetings en mededelingen ziet (leiding alles, een werknemer wat voor hem is).
// `mededelingen: false` laat ze helemaal weg: alleen eigenaren en beheerders zien mededelingen.
export function gebeurtenissenTussen(bron: AgendaBronnen, vanISO: string, totISO: string, ik: { id: string; leiding: boolean; mededelingen?: boolean }): AgendaGebeurtenis[] {
  const uit: AgendaGebeurtenis[] = [];
  const naam = (id?: string) => bron.users.find((u) => u.id === id)?.naam ?? "Onbekend";

  // Feestdagen en verjaardagen: per dag in het bereik.
  for (let d = vanISO; d <= totISO; d = plusDagen(d, 1)) {
    const fd = feestdagNaam(d);
    if (fd) uit.push({ id: `fd-${d}`, soort: "feestdag", titel: fd, datum: d });
    const md = d.slice(5);
    for (const u of bron.users) {
      if (isIso(u.geboortedatum) && u.geboortedatum.slice(5, 10) === md) {
        uit.push({ id: `vj-${u.id}-${d}`, soort: "verjaardag", titel: `Verjaardag ${u.naam}`, datum: d, wie: u.id });
      }
    }
  }

  // Verlof: alles wat het bereik raakt, behalve afgewezen aanvragen.
  for (const v of bron.verlof) {
    const status = bron.verlofStatus?.[v.id] ?? v.status;
    if (status === "Afgewezen") continue;
    if (v.tot < vanISO || v.van > totISO) continue;
    uit.push({
      id: `vl-${v.id}`, soort: "verlof", titel: `${naam(v.medewerkerId)} · ${v.type}${status === "Aangevraagd" ? " (aangevraagd)" : ""}`,
      datum: v.van, totDatum: v.tot, wie: v.medewerkerId, omschrijving: v.notitie || undefined, bronId: v.id,
    });
  }

  // Meetings (agenda-items): leiding ziet alles; anders wat aan jou is of voor iedereen.
  for (const a of bron.agendaItems) {
    if (!isIso(a.datum) || a.datum < vanISO || a.datum > totISO) continue;
    if (!ik.leiding && a.toegewezenAan && a.toegewezenAan !== ik.id) continue;
    uit.push({
      id: `mt-${a.id}`, soort: "meeting", titel: a.titel, datum: a.datum.slice(0, 10), tijd: a.tijd || undefined,
      wie: a.toegewezenAan || undefined, omschrijving: a.notitie || undefined, bronId: a.id,
    });
  }

  // Mededelingen: op de dag van plaatsen én op de deadline.
  for (const m of ik.mededelingen === false ? [] : bron.mededelingen) {
    if (!isMededelingVoor(m, ik.id, ik.leiding)) continue;
    const geplaatst = m.aangemaakt.slice(0, 10);
    if (geplaatst >= vanISO && geplaatst <= totISO) {
      uit.push({ id: `md-${m.id}`, soort: "mededeling", titel: kort(m.tekst), datum: geplaatst, omschrijving: m.tekst, bronId: m.id });
    }
    if (isIso(m.deadline) && m.deadline >= vanISO && m.deadline <= totISO) {
      uit.push({ id: `md-dl-${m.id}`, soort: "mededeling", titel: `Deadline: ${kort(m.tekst, 50)}`, datum: m.deadline.slice(0, 10), omschrijving: m.tekst, bronId: m.id });
    }
  }

  return uit.sort((a, b) => (a.tijd ?? "").localeCompare(b.tijd ?? "") || a.titel.localeCompare(b.titel, "nl"));
}

// Gebeurtenissen die over `iso` heen lopen (verlof van maandag t/m woensdag staat ook op dinsdag).
export const valtOp = (g: AgendaGebeurtenis, iso: string) => iso >= g.datum && iso <= (g.totDatum ?? g.datum);

// ───────────────────────── iCalendar (.ics) ─────────────────────────

// Tekstwaarden in iCalendar: \ ; , en regeleinden moeten worden ontsnapt.
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

// Regels langer dan 75 bytes worden "gevouwen" (CRLF + spatie), zonder een teken (UTF-8) door te knippen.
function vouw(regel: string): string {
  const enc = new TextEncoder();
  if (enc.encode(regel).length <= 75) return regel;
  const delen: string[] = [];
  let huidig = "";
  let bytes = 0;
  let max = 75;
  for (const ch of regel) {
    const b = enc.encode(ch).length;
    if (bytes + b > max) { delen.push(huidig); huidig = ""; bytes = 0; max = 74; } // vervolgregel begint met een spatie
    huidig += ch;
    bytes += b;
  }
  delen.push(huidig);
  return delen.join("\r\n ");
}

const stempel = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const dagStr = (iso: string) => iso.slice(0, 10).replace(/-/g, "");

// Eindtijd van een meeting: standaard één uur later (er is geen eindtijd opgeslagen).
function plusEenUur(iso: string, tijd: string): { iso: string; tijd: string } {
  const [h, m] = tijd.split(":").map(Number);
  if (h >= 23) return { iso: plusDagen(iso, 1), tijd: `${pad((h + 1) % 24)}:${pad(m || 0)}` };
  return { iso, tijd: `${pad(h + 1)}:${pad(m || 0)}` };
}
const tijdStr = (iso: string, tijd: string) => `${dagStr(iso)}T${tijd.replace(":", "")}00`;

export function maakIcs(gebeurtenissen: AgendaGebeurtenis[], kalenderNaam: string, nu: Date = new Date()): string {
  const r: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//WIRE Solutions//Agenda//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(kalenderNaam)}`,
    "X-WR-TIMEZONE:Europe/Amsterdam",
    // Agenda-apps die abonnementen ondersteunen, halen de agenda zo vaak opnieuw op.
    "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
    "X-PUBLISHED-TTL:PT1H",
  ];
  const ts = stempel(nu);
  for (const g of gebeurtenissen) {
    r.push("BEGIN:VEVENT");
    r.push(`UID:${g.id}@wire-solutions`);
    r.push(`DTSTAMP:${ts}`);
    if (g.tijd) {
      const eind = plusEenUur(g.datum, g.tijd);
      r.push(`DTSTART:${tijdStr(g.datum, g.tijd)}`); // zonder zone = lokale tijd van het toestel
      r.push(`DTEND:${tijdStr(eind.iso, eind.tijd)}`);
    } else {
      r.push(`DTSTART;VALUE=DATE:${dagStr(g.datum)}`);
      r.push(`DTEND;VALUE=DATE:${dagStr(plusDagen(g.totDatum ?? g.datum, 1))}`); // einddatum is exclusief
    }
    if (g.soort === "verjaardag") r.push("RRULE:FREQ=YEARLY");
    r.push(`SUMMARY:${esc(g.titel)}`);
    if (g.omschrijving) r.push(`DESCRIPTION:${esc(g.omschrijving)}`);
    r.push(`CATEGORIES:${esc(AGENDA_SOORT_LABEL[g.soort])}`);
    // Feestdagen en verjaardagen maken je niet "bezet" in de agenda.
    if (g.soort === "feestdag" || g.soort === "verjaardag" || g.soort === "mededeling") r.push("TRANSP:TRANSPARENT");
    if (g.soort === "meeting" && g.tijd) {
      r.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(g.titel)}`, "TRIGGER:-PT15M", "END:VALARM");
    }
    r.push("END:VEVENT");
  }
  r.push("END:VCALENDAR");
  return r.map(vouw).join("\r\n") + "\r\n";
}

// ── De persoonlijke agenda van één medewerker voor op de telefoon ──
// Bewust smaller dan de Agenda-pagina: alleen wat voor jou geldt, en geen ziekmeldingen van collega's
// (dat is gezondheidsinformatie die niet in andermans telefoon hoort).
export function bouwPersoonlijkeFeed(bron: AgendaBronnen, gebruiker: User, nu: Date = new Date()): { ics: string; aantal: number } {
  const jaar = nu.getFullYear();
  const van = `${jaar - 1}-01-01`;
  const tot = `${jaar + 2}-12-31`;
  const leiding = false; // persoonlijk: alleen wat voor jou is, ook voor de leiding
  const alles = gebeurtenissenTussen(bron, van, tot, { id: gebruiker.id, leiding });

  const verjaardagen = new Map<string, AgendaGebeurtenis>();
  const rest: AgendaGebeurtenis[] = [];
  for (const g of alles) {
    if (g.soort === "verjaardag") {
      // Eén terugkerende gebeurtenis per collega, niet één per jaar.
      if (g.wie && !verjaardagen.has(g.wie)) {
        let md = g.datum.slice(5);
        const schrikkel = (jaar % 4 === 0 && jaar % 100 !== 0) || jaar % 400 === 0;
        if (md === "02-29" && !schrikkel) md = "02-28"; // 29 februari bestaat niet elk jaar
        verjaardagen.set(g.wie, { ...g, id: `vj-${g.wie}`, datum: `${jaar}-${md}` });
      }
      continue;
    }
    if (g.soort === "verlof") {
      const v = bron.verlof.find((x) => x.id === g.bronId);
      if (!v) continue;
      const eigen = v.medewerkerId === gebruiker.id;
      const status = bron.verlofStatus?.[v.id] ?? v.status;
      if (!eigen && (status !== "Goedgekeurd" || v.type === "Ziek")) continue;
    }
    rest.push(g);
  }
  const lijst = [...rest, ...verjaardagen.values()];
  return { ics: maakIcs(lijst, `WIRE Solutions – ${gebruiker.naam}`, nu), aantal: lijst.length };
}

// Nieuwe, moeilijk te raden sleutel voor de agenda-link (128 bit).
export function nieuwAgendaToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

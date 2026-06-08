import type { Afspraak, Brievenronde, Voorschouw, Klant, Factuur, User, KennisArtikel, Project } from "./types";
import { factuurTotalen, euro } from "./factuurPdf";

export type ZoekItem = {
  id: string;
  titel: string;
  sub: string;
  categorie: string; // type-label, bijv. "Afspraak", "Klant" — getoond als chip
  navKey: string;
  projectId: string | null; // gekoppeld project (null = niet aan project gekoppeld)
  target?: { ronde?: string; locatie?: string; klantKey?: string };
};
// Eén groep per project; items zonder project belanden in de "Overig"-groep (projectId null).
export type ZoekGroep = { projectId: string | null; titel: string; wijk?: string; items: ZoekItem[] };

type ZoekData = {
  afspraken: Afspraak[];
  rondes: Brievenronde[];
  voorschouwen: Voorschouw[];
  klanten: Klant[];
  facturen: Factuur[];
  users: User[];
  kennis: KennisArtikel[];
  projects: Project[];
};

const MAX = 8;
const norm = (s: string | number | undefined) => String(s ?? "").trim().toLowerCase();
const normKey = (straat: string, huisnummer: string) => `${straat.trim()} ${String(huisnummer).trim()}`.toLowerCase();

// Koppel een plaats/wijk-tekst aan een project: eerst exact, daarna "bevat" (bijv. "Schiedam" ↔ "Schiedam-Centrum").
function projectVoorPlaats(plaats: string | undefined, projects: Project[]): string | null {
  const p = norm(plaats);
  if (!p) return null;
  const exact = projects.find((pr) => norm(pr.wijk) === p);
  if (exact) return exact.id;
  const bevat = projects.find((pr) => {
    const w = norm(pr.wijk);
    return w.length > 2 && (p.includes(w) || w.includes(p));
  });
  return bevat ? bevat.id : null;
}

// Verdeel platte resultaten over projectgroepen (meeste treffers eerst; "Overig" altijd onderaan).
function groepeerPerProject(items: ZoekItem[], projects: Project[]): ZoekGroep[] {
  const perProject = new Map<string, ZoekItem[]>();
  const overig: ZoekItem[] = [];
  for (const it of items) {
    if (!it.projectId) {
      overig.push(it);
      continue;
    }
    const lijst = perProject.get(it.projectId);
    if (lijst) lijst.push(it);
    else perProject.set(it.projectId, [it]);
  }

  const groepen: ZoekGroep[] = [];
  const gebruikt = new Set<string>();
  for (const pr of projects) {
    const lijst = perProject.get(pr.id);
    if (lijst && lijst.length) {
      groepen.push({ projectId: pr.id, titel: pr.naam, wijk: pr.wijk, items: lijst });
      gebruikt.add(pr.id);
    }
  }
  // Wees-treffers (verwijderd project) vallen terug naar "Overig".
  for (const [pid, lijst] of perProject) if (!gebruikt.has(pid)) overig.push(...lijst);

  groepen.sort((a, b) => b.items.length - a.items.length);
  if (overig.length) groepen.push({ projectId: null, titel: "Overig", items: overig });
  return groepen;
}

export function zoekResultaten(query: string, data: ZoekData, user: User | null): ZoekGroep[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2 || !user) return [];
  const isLeiding = user.rol === "eigenaar" || user.rol === "beheer";
  const hit = (...delen: (string | number | undefined)[]) => delen.map((d) => String(d ?? "")).join(" ").toLowerCase().includes(q);
  const { projects } = data;
  const items: ZoekItem[] = [];

  // Afspraken
  data.afspraken
    .filter((a) => (isLeiding || a.toegewezenAan === user.id) && hit(a.klantNaam, a.straat, a.huisnummer, a.locatie, a.plaats, a.postcode))
    .slice(0, MAX)
    .forEach((a) =>
      items.push({
        id: "af-" + a.id,
        titel: `${a.straat} ${a.huisnummer}`.trim() || a.klantNaam || a.locatie,
        sub: `${a.locatie} · ${a.plaats}${a.tijd ? " · " + a.tijd : ""}`,
        categorie: "Afspraak",
        navKey: "afspraken",
        projectId: projectVoorPlaats(a.plaats, projects),
        target: { locatie: a.locatie },
      })
    );

  // Brieven & Routes
  const rondeHit = (r: Brievenronde) => hit(r.straat, r.plaats, r.postcode) || r.adressen.some((ad) => hit(r.straat, ad.huisnummer));
  data.rondes
    .filter((r) => (isLeiding || r.toegewezenAan === user.id) && rondeHit(r))
    .slice(0, MAX)
    .forEach((r) => {
      const te = r.adressen.filter((ad) => !ad.ontbreekt);
      const gegooid = te.filter((ad) => ad.status === "Gegooid").length;
      items.push({
        id: "rn-" + r.id,
        titel: r.straat,
        sub: `${r.plaats} · ${gegooid}/${te.length} gegooid`,
        categorie: "Brievenronde",
        navKey: "brieven",
        projectId: r.projectId ?? projectVoorPlaats(r.plaats, projects),
        target: { ronde: r.id },
      });
    });

  // Voorschouwen
  data.voorschouwen
    .filter((v) => (isLeiding || v.ingevuldDoor === user.id) && hit(v.straatnaam, v.plaats, v.postcode))
    .slice(0, MAX)
    .forEach((v) =>
      items.push({
        id: "vs-" + v.id,
        titel: v.straatnaam || "Voorschouw",
        sub: `${v.plaats || "—"} · ${v.status}`,
        categorie: "Voorschouw",
        navKey: "voorschouwen",
        projectId: projectVoorPlaats(v.plaats, projects),
      })
    );

  // Klanten, Facturen & Medewerkers (alleen leiding)
  if (isLeiding) {
    data.klanten
      .filter((k) => hit(k.naam, k.straat, k.huisnummer, k.postcode, k.plaats))
      .slice(0, MAX)
      .forEach((k) =>
        items.push({
          id: "kl-" + k.id,
          titel: `${k.straat} ${k.huisnummer}`.trim() || k.naam,
          sub: `${k.naam || "—"} · ${k.plaats}`,
          categorie: "Klant",
          navKey: "klanten",
          projectId: projectVoorPlaats(k.plaats, projects),
          target: { klantKey: normKey(k.straat, k.huisnummer) },
        })
      );

    data.facturen
      .filter((f) => hit(f.nummer, f.klantNaam))
      .slice(0, MAX)
      .forEach((f) =>
        items.push({
          id: "fa-" + f.id,
          titel: f.nummer,
          sub: `${f.klantNaam} · ${euro(factuurTotalen(f).totaal)}`,
          categorie: "Factuur",
          navKey: "facturen",
          projectId: projectVoorPlaats(f.klantPostcodePlaats, projects),
        })
      );

    data.users
      .filter((u) => hit(u.naam, u.functie, u.email))
      .slice(0, MAX)
      .forEach((u) =>
        items.push({
          id: "md-" + u.id,
          titel: u.naam,
          sub: u.functie,
          categorie: "Medewerker",
          navKey: "medewerkers",
          projectId: null,
        })
      );
  }

  // Kennisbank (iedereen)
  data.kennis
    .filter((a) => hit(a.titel, a.inhoud, a.categorie))
    .slice(0, MAX)
    .forEach((a) =>
      items.push({
        id: "kb-" + a.id,
        titel: a.titel,
        sub: a.categorie,
        categorie: "Kennisbank",
        navKey: "kennisbank",
        projectId: null,
      })
    );

  return groepeerPerProject(items, projects);
}

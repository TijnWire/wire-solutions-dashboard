import type { Afspraak, Brievenronde, Voorschouw, Klant, Factuur, User, KennisArtikel, Project, Schouwafspraak, Buurtaanpak, Sanering } from "./types";
import type { FlowAdres } from "./saneerflowWerk";
import { factuurTotalen, euro } from "./factuurPdf";
import { isToegewezen } from "./toewijzing";

export type ZoekItem = {
  id: string;
  titel: string;
  sub: string;
  categorie: string; // type-label, bijv. "Afspraak", "Klant" — getoond als chip
  navKey: string;
  projectId: string | null; // gekoppeld project (null = niet aan project gekoppeld)
  target?: { ronde?: string; locatie?: string; klantKey?: string; buurtaanpakId?: string; saneringId?: string; saneerPd?: string };
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
  schouwafspraken?: Schouwafspraak[];
  buurtaanpak?: Buurtaanpak[];
  saneringen?: Sanering[];
  saneerAdressen?: FlowAdres[]; // adressen uit Saneren (centrale database), vooraf opgehaald
};

// ── Adressen: elk adres dat ergens in de omgeving is opgeslagen, samengevoegd per adres ──
type AdresBron = { label: string; navKey: string; target?: ZoekItem["target"] };
type AdresRegel = { straat: string; nr: string; postcode: string; plaats: string; naam: string[]; tel: string[]; bronnen: AdresBron[] };

function adresIndex(data: ZoekData, user: User, isLeiding: boolean): AdresRegel[] {
  const map = new Map<string, AdresRegel>();
  const voeg = (straat: string, nr: string | number, toev: string | undefined, postcode: string | undefined, plaats: string | undefined, naam: string | undefined, tel: string | undefined, bron: AdresBron) => {
    const s = (straat ?? "").trim();
    if (!s) return;
    const n = `${String(nr ?? "").trim()}${toev ? ` ${toev.trim()}` : ""}`.trim();
    const pc = (postcode ?? "").replace(/\s+/g, "").toUpperCase();
    const key = `${s.toLowerCase()}|${n.toLowerCase().replace(/[\s-]+/g, "")}|${pc || (plaats ?? "").trim().toLowerCase()}`;
    const r = map.get(key) ?? { straat: s, nr: n, postcode: pc, plaats: (plaats ?? "").trim(), naam: [], tel: [], bronnen: [] };
    if (!r.plaats && plaats) r.plaats = plaats.trim();
    if (!r.postcode && pc) r.postcode = pc;
    const nm = (naam ?? "").trim();
    if (nm && !r.naam.some((x) => x.toLowerCase() === nm.toLowerCase())) r.naam.push(nm);
    const t = (tel ?? "").trim();
    if (t && !r.tel.some((x) => x.replace(/\D/g, "") === t.replace(/\D/g, ""))) r.tel.push(t);
    if (!r.bronnen.some((b) => b.label === bron.label)) r.bronnen.push(bron);
    map.set(key, r);
  };

  // Saneren (centrale database; de server geeft medewerkers alleen hun eigen adressen)
  for (const a of data.saneerAdressen ?? []) {
    if (a.verwijderd) continue;
    voeg(a.straat, a.huisnummer, a.toevoeging, a.postcode, a.plaats, a.bewoner, a.telefoon, { label: "Saneren", navKey: "saneren", target: { saneerPd: a.pd_nummer } });
  }
  for (const a of data.afspraken) {
    if (!isLeiding && !isToegewezen(a, user.id)) continue;
    voeg(a.straat, a.huisnummer, "", a.postcode, a.plaats, a.klantNaam, a.telefoon, { label: "Afspraak", navKey: "afspraken", target: { locatie: a.locatie } });
  }
  for (const r of data.rondes) {
    if (!isLeiding && !isToegewezen(r, user.id)) continue;
    for (const ad of r.adressen) if (!ad.ontbreekt) voeg(r.straat, ad.huisnummer, ad.toevoeging, r.postcode, r.plaats, "", "", { label: "Brieven", navKey: "brieven", target: { ronde: r.id } });
  }
  if (isLeiding) {
    for (const a of data.schouwafspraken ?? []) {
      if (a.gearchiveerd) continue;
      voeg(a.straat, a.huisnummer, "", a.postcode, a.plaats, a.contactNaam, a.telefoon, a.soort === "bodem" ? { label: "Bodemonderzoek", navKey: "tauw" } : { label: "Schouwafspraak", navKey: "schouwafspraken" });
    }
    for (const b of data.buurtaanpak ?? []) for (const a of b.adressen) voeg(a.straat, a.huisnummer, "", a.postcode, b.naam, "", a.telefoon, { label: "Buurtaanpak", navKey: "buurtaanpak", target: { buurtaanpakId: b.id } });
    for (const s of data.saneringen ?? []) for (const a of s.adressen) voeg(a.straat, a.huisnummer, "", a.postcode, a.plaats, a.naam, a.telefoon, { label: "Saneren", navKey: "saneren", target: { saneringId: s.id } });
    for (const k of data.klanten) voeg(k.straat, k.huisnummer, "", k.postcode, k.plaats, k.naam, k.telefoon, { label: "Klant", navKey: "klanten", target: { klantKey: normKey(k.straat, k.huisnummer) } });
  }
  return [...map.values()];
}

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
  const isLeiding = user.rol === "eigenaar" || user.rol === "beheer" || user.rol === "hr";
  const hit = (...delen: (string | number | undefined)[]) => delen.map((d) => String(d ?? "")).join(" ").toLowerCase().includes(q);
  const { projects } = data;
  const items: ZoekItem[] = [];

  // Adressen: alles wat ergens is opgeslagen, met naam en telefoonnummer als die bekend zijn.
  const qCijfers = q.replace(/\D/g, "");
  adresIndex(data, user, isLeiding)
    .filter((r) => {
      const tekst = `${r.straat} ${r.nr} ${r.postcode} ${r.plaats} ${r.naam.join(" ")} ${r.tel.join(" ")}`.toLowerCase();
      if (tekst.includes(q) || `${r.postcode} ${r.nr}`.toLowerCase().includes(q.replace(/\s+/g, " "))) return true;
      // Telefoonnummer zonder spaties/streepjes zoeken
      return qCijfers.length >= 4 && qCijfers.length === q.replace(/[\s-]/g, "").length && r.tel.some((t) => t.replace(/\D/g, "").includes(qCijfers));
    })
    .sort((x, y) => (y.naam.length + y.tel.length > 0 ? 1 : 0) - (x.naam.length + x.tel.length > 0 ? 1 : 0) || `${x.straat} ${x.nr}`.localeCompare(`${y.straat} ${y.nr}`, "nl", { numeric: true }))
    .slice(0, 25)
    .forEach((r, i) => {
      const hoofd = r.bronnen[0];
      items.push({
        id: `ad-${i}-${r.straat}-${r.nr}-${r.postcode}`,
        titel: `${r.straat} ${r.nr}`.trim() + (r.plaats ? `, ${r.plaats}` : ""),
        sub: [r.naam.join(" / ") || "Geen naam bekend", r.tel.join(" / ") || "geen telefoonnummer", r.bronnen.map((x) => x.label).join(", ")].join(" · "),
        categorie: "Adres",
        navKey: hoofd.navKey,
        projectId: projectVoorPlaats(r.plaats, projects),
        target: hoofd.target,
      });
    });

  // Brieven & Routes
  const rondeHit = (r: Brievenronde) => hit(r.straat, r.plaats, r.postcode) || r.adressen.some((ad) => hit(r.straat, ad.huisnummer));
  data.rondes
    .filter((r) => (isLeiding || isToegewezen(r, user.id)) && rondeHit(r))
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

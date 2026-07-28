// Bodemonderzoek — adressen ophalen en bijwerken, met een lokale kopie voor onderweg.
// ─────────────────────────────────────────────────────────────────────────────
// De adressen staan als losse rijen in de database (zie cloudflare/schema-bodem-adressen.sql). Dat lost
// twee dingen op: er is geen grens meer aan hoeveel adressen een project mag hebben, en een wijziging
// aan de deur is een berichtje van tientallen bytes in plaats van de hele lijst.
//
// De buitendienst moet ook zónder bereik kunnen doorwerken. Daarom:
//   • de lijst staat altijd óók lokaal (IndexedDB) en wordt daaruit getoond;
//   • wijzigingen gaan meteen in de lokale lijst en daarna naar de server;
//   • lukt dat niet, dan blijven ze in een wachtrij staan en gaan ze mee zodra er weer verbinding is.
// Zo verdwijnt er nooit werk doordat iemand in een kelder stond.

import { cloudGet, cloudPost } from "./supabase";
import { idbGet, idbSet } from "../store/db";
import type { TauwAdres } from "./types";

// ── Vorm zoals de database hem kent (kleine letters, 0/1 in plaats van true/false) ──
type RijDb = {
  id: string; project_id: string; volgorde: number;
  straat: string; huisnummer: string; postcode: string; plaats: string; wijk: string; perceel: string;
  bewoner: string; telefoon: string; email: string; notitie: string;
  toegewezen_aan: string | null; aanwezig: string; datum: string; tijdslot: string;
  toestemming_tuin: number; uitkomst: string; pogingen: number;
  afgerond: number; afgerond_op: string; afgerond_door: string;
  verwijderd: number; bijgewerkt_op: string;
};

export function naarApp(r: RijDb): TauwAdres {
  return {
    id: r.id,
    straat: r.straat, huisnummer: r.huisnummer, postcode: r.postcode, plaats: r.plaats,
    wijk: r.wijk || undefined, perceel: r.perceel || undefined,
    bewoner: r.bewoner, telefoon: r.telefoon, email: r.email || undefined,
    notitie: r.notitie, datum: r.datum, tijd: "", bevestigd: !!r.afgerond,
    toegewezenAan: r.toegewezen_aan || undefined,
    aanwezig: (r.aanwezig || "") as TauwAdres["aanwezig"],
    tijdslot: r.tijdslot || undefined,
    toestemmingTuin: !!r.toestemming_tuin,
    uitkomst: (r.uitkomst || undefined) as TauwAdres["uitkomst"],
    pogingen: r.pogingen || undefined,
    afgerond: !!r.afgerond, afgerondOp: r.afgerond_op || undefined, afgerondDoor: r.afgerond_door || undefined,
    geenGehoor: r.uitkomst === "niet_thuis",
    bijgewerktOp: r.bijgewerkt_op,
  };
}

export function naarDb(a: TauwAdres, volgorde: number): Record<string, unknown> {
  return {
    id: a.id, volgorde,
    straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats,
    wijk: a.wijk ?? "", perceel: a.perceel ?? "",
    bewoner: a.bewoner, telefoon: a.telefoon, email: a.email ?? "", notitie: a.notitie,
    toegewezen_aan: a.toegewezenAan ?? null,
    aanwezig: a.aanwezig ?? "", datum: a.datum ?? "", tijdslot: a.tijdslot ?? "",
    toestemming_tuin: a.toestemmingTuin ? 1 : 0,
    uitkomst: a.uitkomst ?? "", pogingen: a.pogingen ?? 0,
    afgerond: a.afgerond ? 1 : 0, afgerond_op: a.afgerondOp ?? "", afgerond_door: a.afgerondDoor ?? "",
    verwijderd: 0,
  };
}

// Alleen de gewijzigde velden, in de vorm die de server verwacht.
const VELD_NAAR_DB: Record<string, string> = {
  straat: "straat", huisnummer: "huisnummer", postcode: "postcode", plaats: "plaats",
  wijk: "wijk", perceel: "perceel", bewoner: "bewoner", telefoon: "telefoon", email: "email",
  notitie: "notitie", toegewezenAan: "toegewezen_aan", aanwezig: "aanwezig", datum: "datum",
  tijdslot: "tijdslot", toestemmingTuin: "toestemming_tuin", uitkomst: "uitkomst",
  pogingen: "pogingen", afgerond: "afgerond", afgerondOp: "afgerond_op", afgerondDoor: "afgerond_door",
};
export function patchNaarDb(patch: Partial<TauwAdres>): Record<string, unknown> {
  const uit: Record<string, unknown> = {};
  for (const [appVeld, dbVeld] of Object.entries(VELD_NAAR_DB)) {
    if (!(appVeld in patch)) continue;
    const v = (patch as Record<string, unknown>)[appVeld];
    uit[dbVeld] = dbVeld === "toestemming_tuin" || dbVeld === "afgerond" ? (v ? 1 : 0) : v ?? "";
  }
  return uit;
}

// ── Lokale kopie ──
const cacheSleutel = (projectId: string) => `bodem:${projectId}`;
type Cache = { adressen: TauwAdres[]; stempel: string };

export async function leesLokaal(projectId: string): Promise<Cache> {
  return (await idbGet<Cache>(cacheSleutel(projectId))) ?? { adressen: [], stempel: "" };
}
async function schrijfLokaal(projectId: string, cache: Cache): Promise<void> {
  await idbSet(cacheSleutel(projectId), cache);
}

// ── Wachtrij voor wijzigingen die nog niet weg konden ──
type Wachtend = { id: string; projectId: string; patch: Record<string, unknown> };
const WACHTRIJ = "bodem:wachtrij";

async function leesWachtrij(): Promise<Wachtend[]> {
  return (await idbGet<Wachtend[]>(WACHTRIJ)) ?? [];
}
async function zetInWachtrij(w: Wachtend): Promise<void> {
  const rij = await leesWachtrij();
  // Per adres maar één regel: latere wijzigingen aan hetzelfde adres worden erin samengevoegd, zodat
  // de wachtrij niet volloopt als iemand een tijdje geen bereik heeft.
  const bestaand = rij.find((x) => x.id === w.id);
  if (bestaand) Object.assign(bestaand.patch, w.patch);
  else rij.push(w);
  await idbSet(WACHTRIJ, rij);
}

// Probeer alles wat nog openstaat alsnog te versturen. Wordt aangeroepen bij het openen van een map,
// zodra het apparaat weer online komt, en na elke geslaagde wijziging.
export async function verwerkWachtrij(): Promise<{ verstuurd: number; over: number }> {
  const rij = await leesWachtrij();
  if (!rij.length) return { verstuurd: 0, over: 0 };
  const over: Wachtend[] = [];
  let verstuurd = 0;
  for (const w of rij) {
    try {
      await cloudPost("/bodem/adres", { id: w.id, projectId: w.projectId, patch: w.patch });
      verstuurd++;
    } catch {
      over.push(w); // nog steeds geen verbinding — blijft staan
    }
  }
  await idbSet(WACHTRIJ, over);
  return { verstuurd, over: over.length };
}

export async function aantalWachtend(): Promise<number> {
  return (await leesWachtrij()).length;
}

// ── Ophalen ── eerst uit de lokale kopie (meteen in beeld), daarna bijwerken met wat er centraal is
// veranderd. Zonder verbinding blijft de lokale kopie gewoon staan.
export async function haalAdressen(projectId: string): Promise<{ adressen: TauwAdres[]; online: boolean }> {
  const cache = await leesLokaal(projectId);
  try {
    const pad = `/bodem/adressen?projectId=${encodeURIComponent(projectId)}${cache.stempel ? `&sinds=${encodeURIComponent(cache.stempel)}` : ""}`;
    const r = await cloudGet<{ adressen: RijDb[]; tijd: string }>(pad);
    const binnen = r.adressen.map((x) => ({ rij: x, adres: naarApp(x) }));

    let lijst = cache.stempel ? [...cache.adressen] : [];
    for (const { rij, adres } of binnen) {
      const i = lijst.findIndex((a) => a.id === adres.id);
      if (rij.verwijderd) { if (i >= 0) lijst.splice(i, 1); continue; }
      if (i >= 0) lijst[i] = adres; else lijst.push(adres);
    }
    // Zonder stempel was dit een volledige lees: dan is de server de waarheid.
    if (!cache.stempel) lijst = binnen.filter((b) => !b.rij.verwijderd).map((b) => b.adres);

    await schrijfLokaal(projectId, { adressen: lijst, stempel: r.tijd });
    return { adressen: lijst, online: true };
  } catch {
    return { adressen: cache.adressen, online: false };
  }
}

// ── Eén adres bijwerken ── lokaal meteen, daarna naar de server; mislukt dat, dan in de wachtrij.
export async function wijzigAdres(projectId: string, id: string, patch: Partial<TauwAdres>): Promise<{ online: boolean }> {
  const cache = await leesLokaal(projectId);
  const i = cache.adressen.findIndex((a) => a.id === id);
  if (i >= 0) cache.adressen[i] = { ...cache.adressen[i], ...patch, bijgewerktOp: new Date().toISOString() };
  await schrijfLokaal(projectId, cache);

  const dbPatch = patchNaarDb(patch);
  try {
    await cloudPost("/bodem/adres", { id, projectId, patch: dbPatch });
    return { online: true };
  } catch {
    await zetInWachtrij({ id, projectId, patch: dbPatch });
    return { online: false };
  }
}

// ── In bulk wegschrijven ── import en het verdelen over het team.
export async function zetAdressen(projectId: string, adressen: TauwAdres[]): Promise<{ ok: boolean; fout?: string }> {
  try {
    const rijen = adressen.map((a, i) => naarDb(a, i));
    // In stukken van 400: groot genoeg om snel te zijn, klein genoeg voor een matige verbinding.
    for (let i = 0; i < rijen.length; i += 400) {
      await cloudPost("/bodem/adressen", { projectId, adressen: rijen.slice(i, i + 400) });
    }
    await schrijfLokaal(projectId, { adressen, stempel: "" }); // volgende lees haalt alles opnieuw op
    return { ok: true };
  } catch (e) {
    return { ok: false, fout: e instanceof Error ? e.message : String(e) };
  }
}

// Adressen verwijderen. Zacht, met een vlag: een harde verwijdering zou onzichtbaar blijven voor een
// toestel dat offline was, en het adres later gewoon weer terugbrengen.
export async function verwijderAdressen(projectId: string, ids: string[]): Promise<{ online: boolean }> {
  const cache = await leesLokaal(projectId);
  await schrijfLokaal(projectId, { adressen: cache.adressen.filter((a) => !ids.includes(a.id)), stempel: cache.stempel });
  try {
    await cloudPost("/bodem/adressen", { projectId, adressen: ids.map((id) => ({ id, verwijderd: 1 })) });
    return { online: true };
  } catch {
    for (const id of ids) await zetInWachtrij({ id, projectId, patch: { verwijderd: 1 } });
    return { online: false };
  }
}

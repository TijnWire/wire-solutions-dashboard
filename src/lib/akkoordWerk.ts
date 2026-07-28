// Bewonersakkoord — clientlaag voor alles ná het dossier (fase B t/m H).
// ─────────────────────────────────────────────────────────────────────────────
// akkoord.ts gaat over het dossier zelf. Hier staat het werk: adressen inlezen, clusteren, langs de
// deuren, één datum rond krijgen, de poster en het afronden.
//
// Het rekenwerk (stand van een cluster, welke datum kansrijk is) staat bewust hier en niet op de
// server: zo werkt het ook zonder bereik en is het te controleren zonder database. Bij het echt
// vastleggen van een datum rekent de server alles nog eens na — dat is de controle die telt.

import { cloudGet, cloudPost } from "./supabase";
import { netPd, type Dossier } from "./akkoord";
import type { Antwoord, Beschikbaar } from "./akkoordRekenen";

export type { Antwoord, Beschikbaar } from "./akkoordRekenen";

export type AkkoordAdres = {
  id: string; pd_nummer: string; cluster_id: string; volgorde: number;
  straat: string; huisnummer: string; toevoeging: string; postcode: string; plaats: string;
  bewoner: string; telefoon: string; email: string; opmerking: string;
  telefoon_bij_import: number; belstatus: string; belpogingen: number;
  cluster_naam?: string; definitieve_datum?: string;
};

export type Cluster = {
  id: string; pd_nummer: string; postcode: string; naam: string;
  toegewezen_aan: string | null; definitieve_datum: string; starttijd: string; handmatig: number;
};

export type Ronde = { id: string; cluster_id: string; nummer: number; voorgestelde_datum: string; uitkomst: string; gestart_op: string; afgesloten_op: string; actief?: number };
export type Respons = { id: string; ronde_id: string; adres_id: string; antwoord: Antwoord; via: string; opmerking: string; door: string; tijdstip: string; na_afsluiten: number };
export type Taak = { id: string; pd_nummer: string; cluster_id: string; soort: string; deadline: string; afgevinkt_op: string; afgevinkt_door: string; notitie: string; cluster_naam?: string; definitieve_datum?: string; gebouw?: string };

export const ANTWOORD_INFO: Record<Antwoord, { label: string; kort: string; kleur: string }> = {
  akkoord:      { label: "Gaat akkoord",        kort: "Akkoord",    kleur: "green" },
  niet_akkoord: { label: "Kan niet op die dag", kort: "Kan niet",   kleur: "amber" },
  niet_thuis:   { label: "Niemand thuis",       kort: "Niet thuis", kleur: "slate" },
  weigert:      { label: "Werkt niet mee",      kort: "Weigert",    kleur: "red" },
};

export const BELSTATUS_INFO: Record<string, { label: string; kleur: string }> = {
  "":          { label: "Nog niet gebeld", kleur: "slate" },
  gebeld:      { label: "Gebeld",          kleur: "sky" },
  geen_gehoor: { label: "Geen gehoor",     kleur: "amber" },
  terugbellen: { label: "Terugbellen",     kleur: "red" },
  akkoord:     { label: "Akkoord",         kleur: "green" },
};

type Uit<T> = { ok: true; data: T } | { ok: false; fout: string };
async function probeer<T>(p: Promise<T>): Promise<Uit<T>> {
  try { return { ok: true, data: await p }; }
  catch (e) { return { ok: false, fout: e instanceof Error ? e.message : String(e) }; }
}

// ── Fase B — import ──
export async function haalMapping(opdrachtgever: string): Promise<{ mapping: Record<string, number> | null; kopIndex?: number }> {
  const r = await probeer(cloudGet<{ mapping: Record<string, number> | null; kopIndex?: number }>(`/akkoord/mapping?opdrachtgever=${encodeURIComponent(opdrachtgever)}`));
  return r.ok ? r.data : { mapping: null };
}

export type ImportUitslag = { toegevoegd: number; overgeslagen: number; afgekeurd: number };

export async function stuurAdressen(v: {
  pd_nummer: string; opdrachtgever?: string; mapping?: unknown; kopIndex?: number;
  adressen: Partial<AkkoordAdres>[];
  afgekeurd?: { id: string; bron_regel: number; ruw: unknown; reden: string }[];
}): Promise<{ ok: boolean; fout?: string; uitslag?: ImportUitslag }> {
  const r = await probeer(cloudPost<ImportUitslag>("/akkoord/adressen", v));
  return r.ok ? { ok: true, uitslag: r.data } : { ok: false, fout: r.fout };
}

export async function haalAkkoordAdressen(pd: string): Promise<{ adressen: AkkoordAdres[]; alleenEigen: boolean }> {
  const r = await probeer(cloudGet<{ adressen: AkkoordAdres[]; alleenEigen: boolean }>(`/akkoord/adressen?pd=${encodeURIComponent(netPd(pd))}`));
  return r.ok ? { adressen: r.data.adressen ?? [], alleenEigen: !!r.data.alleenEigen } : { adressen: [], alleenEigen: false };
}

export type AfgekeurdeRegel = { id: string; bron_regel: number; ruw: string; reden: string };
export async function haalAfgekeurd(pd: string): Promise<AfgekeurdeRegel[]> {
  const r = await probeer(cloudGet<{ regels: AfgekeurdeRegel[] }>(`/akkoord/afgekeurd?pd=${encodeURIComponent(netPd(pd))}`));
  return r.ok ? r.data.regels ?? [] : [];
}

// ── Fase C — clusters ──
export type ClusterUitslag = {
  clusters: { id: string; postcode: string; naam: string; aantal: number }[];
  teGroot: { id: string; naam: string; aantal: number }[];
  grens: number;
};
export async function maakClusters(pd: string): Promise<{ ok: boolean; fout?: string; uitslag?: ClusterUitslag }> {
  const r = await probeer(cloudPost<ClusterUitslag>("/akkoord/clusters/maak", { pd_nummer: netPd(pd) }));
  return r.ok ? { ok: true, uitslag: r.data } : { ok: false, fout: r.fout };
}
export async function wijzigCluster(id: string, patch: Partial<Pick<Cluster, "naam" | "starttijd" | "toegewezen_aan">>): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudPost("/akkoord/cluster", { id, ...patch }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}
export async function splitsCluster(pd: string, adresIds: string[], naam: string): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudPost("/akkoord/cluster/splits", { pd_nummer: netPd(pd), adres_ids: adresIds, naam }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}

export type ClusterDetail = {
  cluster: Cluster; dossier: Dossier; adressen: AkkoordAdres[];
  ronde: Ronde | null; responsen: Respons[]; beschikbaarheid: Beschikbaar[]; ronden: Ronde[];
};
export async function haalCluster(id: string): Promise<ClusterDetail | null> {
  const r = await probeer(cloudGet<ClusterDetail>(`/akkoord/cluster?id=${encodeURIComponent(id)}`));
  return r.ok ? r.data : null;
}

// ── Fase D/E — ronden en antwoorden ──
export async function startRonde(clusterId: string, datum: string): Promise<{ ok: boolean; fout?: string; nummer?: number; naarLeiding?: boolean }> {
  const r = await probeer(cloudPost<{ nummer: number; naarLeiding: boolean }>("/akkoord/ronde", { cluster_id: clusterId, voorgestelde_datum: datum }));
  return r.ok ? { ok: true, nummer: r.data.nummer, naarLeiding: r.data.naarLeiding } : { ok: false, fout: r.fout };
}

export async function zetDefinitieveDatum(clusterId: string, datum: string): Promise<{ ok: boolean; fout?: string; posterDeadline?: string }> {
  const r = await probeer(cloudPost<{ poster_deadline: string }>("/akkoord/cluster/datum", { cluster_id: clusterId, datum }));
  return r.ok ? { ok: true, posterDeadline: r.data.poster_deadline } : { ok: false, fout: r.fout };
}

export async function wijzigAkkoordAdres(id: string, patch: Partial<AkkoordAdres>): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudPost("/akkoord/adres", { id, patch }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}

// ── Fase F — bellijst ──
export async function haalBellijst(pd: string): Promise<AkkoordAdres[]> {
  const r = await probeer(cloudGet<{ adressen: AkkoordAdres[] }>(`/akkoord/bellijst?pd=${encodeURIComponent(netPd(pd))}`));
  return r.ok ? r.data.adressen ?? [] : [];
}

// ── Fase G — poster ──
export async function haalTaken(pd?: string): Promise<Taak[]> {
  const r = await probeer(cloudGet<{ taken: Taak[] }>(`/akkoord/taken${pd ? `?pd=${encodeURIComponent(netPd(pd))}` : ""}`));
  return r.ok ? r.data.taken ?? [] : [];
}
export async function vinkTaak(id: string, v: { afvinken?: boolean; notitie?: string; foto?: string } = {}): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudPost("/akkoord/taak", { id, afvinken: v.afvinken !== false, notitie: v.notitie, foto: v.foto }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}

// ── Fase H — afronden en export ──
export async function rondDossierAf(pd: string, v: { afboeken?: boolean; toch?: boolean } = {}): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudPost("/akkoord/afronden", { pd_nummer: netPd(pd), ...v }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}

export type ExportData = {
  dossier: Dossier; clusters: Cluster[]; adressen: AkkoordAdres[];
  ronden: Ronde[]; responsen: Respons[]; taken: Taak[];
  log: { gebeurtenis: string; oud: string; nieuw: string; door: string; tijdstip: string }[];
};
export async function haalExport(pd: string): Promise<ExportData | null> {
  const r = await probeer(cloudGet<ExportData>(`/akkoord/export?pd=${encodeURIComponent(netPd(pd))}`));
  return r.ok ? r.data : null;
}

// ── Rekenwerk ── staat in een eigen bestand zonder imports, zodat npm test het kan draaien.
export { standVan, datumVoorstellen } from "./akkoordRekenen";
export type { Stand, DatumKans } from "./akkoordRekenen";

// ═════════════════════════════════════════════════════════════════════════════
// ONDERWEG — antwoorden die zonder bereik zijn ingevuld
// Een antwoord aan de deur mag nooit verdwijnen omdat er net geen bereik was. Het gaat daarom eerst
// in een wachtrij op het apparaat zelf en pas daarna naar de server.
// ═════════════════════════════════════════════════════════════════════════════

export type ResponsInvoer = {
  adres_id: string; ronde_id: string; antwoord: Antwoord; via?: "deur" | "telefoon";
  bewoner?: string; telefoon?: string; email?: string; opmerking?: string;
  kan_wel?: string[]; kan_niet?: string[];
};

const WACHTRIJ = "akkoord_wachtrij";

function leesWachtrij(): (ResponsInvoer & { gezetOp: string })[] {
  try { return JSON.parse(localStorage.getItem(WACHTRIJ) ?? "[]"); } catch { return []; }
}
function schrijfWachtrij(v: unknown[]): void {
  try { localStorage.setItem(WACHTRIJ, JSON.stringify(v)); } catch { /* vol of geblokkeerd */ }
}
export const aantalWachtendAkkoord = () => leesWachtrij().length;

// Vastleggen: eerst lokaal, dan versturen. Lukt versturen niet, dan blijft het staan en probeert
// verwerkWachtrijAkkoord het later opnieuw. Hetzelfde adres in dezelfde ronde overschrijft zichzelf,
// zodat een correctie geen tweede regel oplevert.
export async function legAntwoordVast(v: ResponsInvoer): Promise<{ ok: boolean; wacht: boolean; fout?: string }> {
  const rij = leesWachtrij().filter((r) => !(r.adres_id === v.adres_id && r.ronde_id === v.ronde_id));
  schrijfWachtrij([...rij, { ...v, gezetOp: new Date().toISOString() }]);
  const uit = await verwerkWachtrijAkkoord();
  return uit.rest === 0 ? { ok: true, wacht: false } : { ok: true, wacht: true, fout: uit.fout };
}

// De wachtrij leegwerken. Een antwoord dat de server inhoudelijk weigert (adres bestaat niet meer,
// geen rechten) blijft niet eeuwig hangen: dat halen we eruit, met de melding erbij.
export async function verwerkWachtrijAkkoord(): Promise<{ verstuurd: number; rest: number; fout?: string }> {
  const rij = leesWachtrij();
  if (rij.length === 0) return { verstuurd: 0, rest: 0 };
  const over: typeof rij = [];
  let verstuurd = 0;
  let fout: string | undefined;
  for (const r of rij) {
    try {
      await cloudPost("/akkoord/respons", r);
      verstuurd++;
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      fout = m;
      // 4xx-meldingen komen niet vanzelf goed; alleen netwerkproblemen zijn opnieuw proberen waard.
      const kansloos = /niet gevonden|niet aan jou|geen ronde|Onbekend antwoord|afgeboekt/i.test(m);
      if (!kansloos) over.push(r);
    }
  }
  schrijfWachtrij(over);
  return { verstuurd, rest: over.length, fout };
}

// Saneren — clientlaag voor het dossier.
// ─────────────────────────────────────────────────────────────────────────────
// Losstaande module naast bodemonderzoek. De flow is wezenlijk anders: hier plan je geen losse
// tijdsloten, maar moet iedereen in een cluster op dezelfde dag thuis zijn. Eén bewoner die niet kan,
// maakt de hele datum ongeldig.

import { cloudGet, cloudPost, cloudDelete } from "./supabase";

export const REGIOS = ["Zuid", "Noord"] as const;
export type Regio = (typeof REGIOS)[number];

export const DOSSIER_STATUSSEN = [
  "nieuw", "geimporteerd", "verdeeld", "in_uitvoering",
  "datum_akkoord", "poster_geplaatst", "afgerond", "afgeboekt",
] as const;
export type DossierStatus = (typeof DOSSIER_STATUSSEN)[number];

// Wat de gebruiker leest, en wat er in die stand als volgende actie te doen valt. Elk dossier heeft
// altijd één duidelijke volgende stap — dat is het hele idee van deze module.
export const STATUS_INFO: Record<DossierStatus, { label: string; kleur: string; volgende: string }> = {
  nieuw:            { label: "Nieuw",             kleur: "slate",  volgende: "Adressenbestand inlezen" },
  geimporteerd:     { label: "Ingelezen",         kleur: "indigo", volgende: "Clusters verdelen over medewerkers" },
  verdeeld:         { label: "Verdeeld",          kleur: "indigo", volgende: "Langs de deuren" },
  in_uitvoering:    { label: "In uitvoering",     kleur: "amber",  volgende: "Akkoord ophalen bij de bewoners" },
  datum_akkoord:    { label: "Datum akkoord",     kleur: "green",  volgende: "Poster ophangen in het gebouw" },
  poster_geplaatst: { label: "Poster geplaatst",  kleur: "green",  volgende: "Dossier afronden" },
  afgerond:         { label: "Afgerond",          kleur: "green",  volgende: "Afboeken op het PD-nummer" },
  afgeboekt:        { label: "Afgeboekt",         kleur: "slate",  volgende: "Klaar — alleen-lezen" },
};

export type Dossier = {
  pd_nummer: string;
  regio: string;
  opdrachtgever: string;
  gebouw: string;
  omschrijving: string;
  uitvoering_van: string;
  uitvoering_tot: string;
  starttijd: string;
  status: DossierStatus;
  poster_weken_voor: number;
  escalatie_ronden: number;
  cluster_grens: number;
  aangemaakt_door: string;
  aangemaakt_op: string;
  afgerond_op: string;
  afgeboekt_op: string;
  bijgewerkt_op: string;
  adressen?: number;
  clusters?: number;
};

// PD-nummer zoals de server het opslaat: hoofdletters, geen spaties.
export const netPd = (s: string) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");
export const pdGeldig = (s: string) => /^PD\d+$/.test(netPd(s));

export type Uitkomst<T> = { ok: true; data: T } | { ok: false; fout: string; extra?: Record<string, unknown> };

async function probeer<T>(p: Promise<T>): Promise<Uitkomst<T>> {
  try { return { ok: true, data: await p }; }
  catch (e) { return { ok: false, fout: e instanceof Error ? e.message : String(e) }; }
}

export async function haalDossiers(): Promise<Dossier[]> {
  const r = await probeer(cloudGet<{ dossiers: Dossier[] }>("/saneer/dossiers"));
  return r.ok ? r.data.dossiers ?? [] : [];
}

export type DossierDetail = {
  dossier: Dossier;
  clusters: { id: string; postcode: string; naam: string; adressen: number; definitieve_datum: string; toegewezen_aan: string | null }[];
  aantallen: { totaal?: number; met_telefoon?: number; zonder_telefoon?: number };
};

export async function haalDossier(pd: string): Promise<DossierDetail | null> {
  const r = await probeer(cloudGet<DossierDetail>(`/saneer/dossier?pd=${encodeURIComponent(netPd(pd))}`));
  return r.ok ? r.data : null;
}

// Aanmaken of bijwerken. Geeft de melding van de server ongewijzigd terug — die is al in het
// Nederlands en zegt precies wat er aan de hand is (bijvoorbeeld dat het dossier verwijderd was).
export async function bewaarDossier(v: Partial<Dossier> & { pd_nummer: string; bijwerken?: boolean }): Promise<{ ok: boolean; fout?: string; verwijderd?: boolean }> {
  try {
    await cloudPost("/saneer/dossier", v);
    return { ok: true };
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e);
    return { ok: false, fout: melding, verwijderd: /verwijderd/i.test(melding) };
  }
}

export async function zetStatus(pd: string, status: DossierStatus): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudPost("/saneer/dossier/status", { pd_nummer: netPd(pd), status }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}

export async function verwijderDossier(pd: string, herstel = false): Promise<{ ok: boolean; fout?: string }> {
  const r = await probeer(cloudDelete("/saneer/dossier", { pd_nummer: netPd(pd), herstel }));
  return r.ok ? { ok: true } : { ok: false, fout: r.fout };
}

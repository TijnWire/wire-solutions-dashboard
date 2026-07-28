// Wire Solutions — Bewonersakkoord: routes voor het dossier (fase A)
// ─────────────────────────────────────────────────────────────────────────────
// Aparte module naast de bodemonderzoek-routes in worker.ts. Bewust gescheiden: de flow is wezenlijk
// anders (één datum voor een hele groep in plaats van losse tijdsloten), en door het uit elkaar te
// houden kan een wijziging in de ene module de andere niet raken.
//
// ROUTES (alle met een geldige token; wijzigen alleen door de leiding):
//   GET    /akkoord/dossiers                  -> { dossiers: [...] }
//   GET    /akkoord/dossier?pd=PD123456       -> { dossier, clusters, aantallen }
//   POST   /akkoord/dossier                   -> { ok, pd_nummer }   (aanmaken of bijwerken)
//   POST   /akkoord/dossier/status            -> { ok, status }
//   DELETE /akkoord/dossier                   -> { ok }              (zacht verwijderen)

export type AkkoordEnv = { DB: D1Database };

// PD-nummer: de letters PD gevolgd door cijfers. Lengte bewust vrij — een afwijkend nummer mag niet
// onterecht geweigerd worden, maar een typefout als "P123" of "PD" valt zo wel op.
export const PD_PATROON = /^PD\d+$/i;
export const netPd = (s: string) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, "");

// De statussen die een dossier doorloopt, in volgorde.
export const DOSSIER_STATUSSEN = [
  "nieuw", "geimporteerd", "verdeeld", "in_uitvoering",
  "datum_akkoord", "poster_geplaatst", "afgerond", "afgeboekt",
] as const;
export type DossierStatus = (typeof DOSSIER_STATUSSEN)[number];

export const REGIOS = ["Zuid", "Noord"] as const;

// Velden die de gebruiker mag zetten bij aanmaken of bijwerken.
const INVOER = [
  "regio", "opdrachtgever", "gebouw", "omschrijving",
  "uitvoering_van", "uitvoering_tot", "starttijd",
  "poster_weken_voor", "escalatie_ronden", "cluster_grens",
] as const;

const getal = (v: unknown, standaard: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : standaard;
};

export type AkkoordContext = {
  env: AkkoordEnv;
  ikEmail: string;
  magBeheren: boolean;   // eigenaar, HR of beheer
  nuISO: string;
  json: (obj: unknown, status?: number) => Response;
  log: (v: { pd: string; clusterId?: string; adresId?: string; gebeurtenis: string; oud?: string; nieuw?: string }) => void;
};

// Geeft null terug als het pad niet bij deze module hoort, zodat worker.ts verder kan zoeken.
export async function akkoordRoutes(
  pad: string, methode: string, url: URL, body: Record<string, unknown>, c: AkkoordContext,
): Promise<Response | null> {
  const { env, json, nuISO } = c;

  // ── Lijst van dossiers ──
  if (pad === "/akkoord/dossiers" && methode === "GET") {
    const { results } = await env.DB.prepare(
      "select d.*, " +
      "(select count(*) from akkoord_adressen a where a.pd_nummer = d.pd_nummer and a.verwijderd = 0) as adressen, " +
      "(select count(*) from akkoord_clusters k where k.pd_nummer = d.pd_nummer and k.verwijderd = 0) as clusters " +
      "from akkoord_dossiers d where d.verwijderd = 0 order by d.aangemaakt_op desc"
    ).all();
    return json({ dossiers: results ?? [] });
  }

  // ── Eén dossier met zijn clusters ──
  if (pad === "/akkoord/dossier" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    if (!pd) return json({ error: "pd ontbreekt." }, 400);
    const dossier = await env.DB.prepare("select * from akkoord_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first();
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);
    const { results: clusters } = await env.DB.prepare(
      "select k.*, (select count(*) from akkoord_adressen a where a.cluster_id = k.id and a.verwijderd = 0) as adressen " +
      "from akkoord_clusters k where k.pd_nummer = ? and k.verwijderd = 0 order by k.postcode"
    ).bind(pd).all();
    const tellingen = await env.DB.prepare(
      "select count(*) as totaal, " +
      "sum(case when telefoon_bij_import = 1 then 1 else 0 end) as met_telefoon, " +
      "sum(case when telefoon_bij_import = 0 then 1 else 0 end) as zonder_telefoon " +
      "from akkoord_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).first();
    return json({ dossier, clusters: clusters ?? [], aantallen: tellingen ?? {} });
  }

  // ── Aanmaken of bijwerken ──
  if (pad === "/akkoord/dossier" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag dossiers aanmaken of wijzigen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    if (!pd) return json({ error: "Vul een PD-nummer in." }, 400);
    if (!PD_PATROON.test(pd)) return json({ error: `"${pd}" is geen geldig PD-nummer. Verwacht: PD gevolgd door cijfers, bijvoorbeeld PD123456.` }, 400);

    const bestaand = await env.DB.prepare("select pd_nummer, verwijderd from akkoord_dossiers where pd_nummer = ?").bind(pd).first<{ verwijderd: number }>();
    const bijwerken = body.bijwerken === true;
    // Een tweede dossier op hetzelfde PD-nummer is bijna altijd een vergissing; expliciet melden in
    // plaats van er stilzwijgend overheen schrijven.
    if (bestaand && !bijwerken) {
      // Een verwijderd dossier staat nergens meer in beeld. "Bestaat al" is dan een raadsel; zeg wat er
      // aan de hand is en bied aan het terug te halen, inclusief alles wat eraan hing.
      if (bestaand.verwijderd) {
        return json({
          error: `Dossier ${pd} bestaat al, maar is verwijderd. Wil je het terughalen? Alle adressen en afspraken die eraan hingen komen dan mee.`,
          bestaat: true, verwijderd: true,
        }, 409);
      }
      return json({ error: `Er bestaat al een dossier met nummer ${pd}.`, bestaat: true }, 409);
    }
    if (!bestaand && bijwerken) return json({ error: "Dossier niet gevonden." }, 404);

    const regio = String(body.regio ?? "");
    if (!bijwerken && !REGIOS.includes(regio as (typeof REGIOS)[number])) {
      return json({ error: "Kies een regio: Zuid of Noord." }, 400);
    }
    const van = String(body.uitvoering_van ?? ""), tot = String(body.uitvoering_tot ?? "");
    if (van && tot && van > tot) return json({ error: "De uitvoeringsperiode eindigt vóór hij begint." }, 400);

    const waarden: Record<string, unknown> = {};
    for (const veld of INVOER) if (veld in body) waarden[veld] = body[veld];
    waarden.poster_weken_voor = getal(body.poster_weken_voor, 2);
    waarden.escalatie_ronden = getal(body.escalatie_ronden, 3);
    waarden.cluster_grens = getal(body.cluster_grens, 25);

    if (bestaand) {
      const velden = Object.keys(waarden);
      const zet = velden.map((v, i) => `${v} = ?${i + 3}`).join(", ");
      await env.DB.prepare(`update akkoord_dossiers set ${zet}, bijgewerkt_op = ?2 where pd_nummer = ?1`)
        .bind(pd, nuISO, ...velden.map((v) => String(waarden[v] ?? ""))).run();
      c.log({ pd, gebeurtenis: "dossier_bijgewerkt" });
    } else {
      await env.DB.prepare(
        "insert into akkoord_dossiers (pd_nummer, regio, opdrachtgever, gebouw, omschrijving, uitvoering_van, uitvoering_tot, " +
        "starttijd, poster_weken_voor, escalatie_ronden, cluster_grens, status, aangemaakt_door, aangemaakt_op, bijgewerkt_op) " +
        "values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'nieuw', ?12, ?13, ?13)"
      ).bind(
        pd, regio, String(body.opdrachtgever ?? ""), String(body.gebouw ?? ""), String(body.omschrijving ?? ""),
        van, tot, String(body.starttijd ?? "08:00"),
        waarden.poster_weken_voor, waarden.escalatie_ronden, waarden.cluster_grens,
        c.ikEmail, nuISO,
      ).run();
      c.log({ pd, gebeurtenis: "dossier_aangemaakt", nieuw: regio });
    }
    return json({ ok: true, pd_nummer: pd });
  }

  // ── Status verzetten ──
  if (pad === "/akkoord/dossier/status" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag de status wijzigen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const status = String(body.status ?? "");
    if (!DOSSIER_STATUSSEN.includes(status as DossierStatus)) return json({ error: "Onbekende status." }, 400);
    const nu = await env.DB.prepare("select status from akkoord_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first<{ status: string }>();
    if (!nu) return json({ error: "Dossier niet gevonden." }, 404);
    // Een afgeboekt dossier is alleen-lezen; corrigeren kan alleen via een gelogde heropening.
    if (nu.status === "afgeboekt" && status !== "afgerond") {
      return json({ error: "Dit dossier is afgeboekt. Heropen het eerst om nog iets te wijzigen." }, 409);
    }
    await env.DB.prepare("update akkoord_dossiers set status = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1").bind(pd, status, nuISO).run();
    c.log({ pd, gebeurtenis: nu.status === "afgeboekt" ? "dossier_heropend" : "status", oud: nu.status, nieuw: status });
    return json({ ok: true, status });
  }

  // ── Zacht verwijderen ── nooit echt weg, zodat een vergissing terug te draaien is.
  if (pad === "/akkoord/dossier" && methode === "DELETE") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag een dossier verwijderen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const terug = body.herstel === true;
    const r = await env.DB.prepare("update akkoord_dossiers set verwijderd = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1")
      .bind(pd, terug ? 0 : 1, nuISO).run();
    if (!r.meta.changes) return json({ error: "Dossier niet gevonden." }, 404);
    c.log({ pd, gebeurtenis: terug ? "dossier_hersteld" : "dossier_verwijderd" });
    return json({ ok: true });
  }

  return null; // geen route van deze module
}

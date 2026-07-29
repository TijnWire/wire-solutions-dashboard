// Wire Solutions — Saneren: routes voor het dossier (fase A)
// ─────────────────────────────────────────────────────────────────────────────
// Aparte module naast de bodemonderzoek-routes in worker.ts. Bewust gescheiden: de flow is wezenlijk
// anders (één datum voor een hele groep in plaats van losse tijdsloten), en door het uit elkaar te
// houden kan een wijziging in de ene module de andere niet raken.
//
// ROUTES (alle met een geldige token; wijzigen alleen door de leiding):
//   GET    /saneer/dossiers                  -> { dossiers: [...] }
//   GET    /saneer/dossier?pd=PD123456       -> { dossier, clusters, aantallen }
//   POST   /saneer/dossier                   -> { ok, pd_nummer }   (aanmaken of bijwerken)
//   POST   /saneer/dossier/status            -> { ok, status }
//   DELETE /saneer/dossier                   -> { ok }              (zacht verwijderen)

import { saneerUitvoeringRoutes } from "./saneerflow-uitvoering";

export type SaneerEnv = { DB: D1Database };

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

export type SaneerContext = {
  env: SaneerEnv;
  ikEmail: string;
  magBeheren: boolean;   // eigenaar, HR of beheer
  mijnUserId: string | null; // gebruikers-id uit de app; nodig om op toewijzing te filteren
  nuISO: string;
  json: (obj: unknown, status?: number) => Response;
  log: (v: { pd: string; clusterId?: string; adresId?: string; gebeurtenis: string; oud?: string; nieuw?: string }) => void;
};

// Geeft null terug als het pad niet bij deze module hoort, zodat worker.ts verder kan zoeken.
export async function saneerRoutes(
  pad: string, methode: string, url: URL, body: Record<string, unknown>, c: SaneerContext,
): Promise<Response | null> {
  const { env, json, nuISO } = c;

  // ── Lijst van dossiers ──
  if (pad === "/saneer/dossiers" && methode === "GET") {
    const { results } = await env.DB.prepare(
      "select d.*, " +
      "(select count(*) from saneer_adressen a where a.pd_nummer = d.pd_nummer and a.verwijderd = 0) as adressen, " +
      "(select count(*) from saneer_clusters k where k.pd_nummer = d.pd_nummer and k.verwijderd = 0) as clusters " +
      "from saneer_dossiers d where d.verwijderd = 0 order by d.aangemaakt_op desc"
    ).all();
    return json({ dossiers: results ?? [] });
  }

  // ── Eén dossier met zijn clusters ──
  if (pad === "/saneer/dossier" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    if (!pd) return json({ error: "pd ontbreekt." }, 400);
    const dossier = await env.DB.prepare("select * from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first();
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);
    const { results: clusters } = await env.DB.prepare(
      "select k.*, (select count(*) from saneer_adressen a where a.cluster_id = k.id and a.verwijderd = 0) as adressen " +
      "from saneer_clusters k where k.pd_nummer = ? and k.verwijderd = 0 order by k.postcode"
    ).bind(pd).all();
    const tellingen = await env.DB.prepare(
      "select count(*) as totaal, " +
      "sum(case when telefoon_bij_import = 1 then 1 else 0 end) as met_telefoon, " +
      "sum(case when telefoon_bij_import = 0 then 1 else 0 end) as zonder_telefoon " +
      "from saneer_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).first();
    return json({ dossier, clusters: clusters ?? [], aantallen: tellingen ?? {} });
  }

  // ── Aanmaken of bijwerken ──
  if (pad === "/saneer/dossier" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag dossiers aanmaken of wijzigen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    if (!pd) return json({ error: "Vul een PD-nummer in." }, 400);
    if (!PD_PATROON.test(pd)) return json({ error: `"${pd}" is geen geldig PD-nummer. Verwacht: PD gevolgd door cijfers, bijvoorbeeld PD123456.` }, 400);

    const bestaand = await env.DB.prepare("select pd_nummer, verwijderd from saneer_dossiers where pd_nummer = ?").bind(pd).first<{ verwijderd: number }>();
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
      await env.DB.prepare(`update saneer_dossiers set ${zet}, bijgewerkt_op = ?2 where pd_nummer = ?1`)
        .bind(pd, nuISO, ...velden.map((v) => String(waarden[v] ?? ""))).run();
      c.log({ pd, gebeurtenis: "dossier_bijgewerkt" });
    } else {
      await env.DB.prepare(
        "insert into saneer_dossiers (pd_nummer, regio, opdrachtgever, gebouw, omschrijving, uitvoering_van, uitvoering_tot, " +
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
  if (pad === "/saneer/dossier/status" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag de status wijzigen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const status = String(body.status ?? "");
    if (!DOSSIER_STATUSSEN.includes(status as DossierStatus)) return json({ error: "Onbekende status." }, 400);
    const nu = await env.DB.prepare("select status from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first<{ status: string }>();
    if (!nu) return json({ error: "Dossier niet gevonden." }, 404);
    // Een afgeboekt dossier is alleen-lezen; corrigeren kan alleen via een gelogde heropening.
    if (nu.status === "afgeboekt" && status !== "afgerond") {
      return json({ error: "Dit dossier is afgeboekt. Heropen het eerst om nog iets te wijzigen." }, 409);
    }
    await env.DB.prepare("update saneer_dossiers set status = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1").bind(pd, status, nuISO).run();
    c.log({ pd, gebeurtenis: nu.status === "afgeboekt" ? "dossier_heropend" : "status", oud: nu.status, nieuw: status });
    return json({ ok: true, status });
  }

  // ── Zacht verwijderen ── nooit echt weg, zodat een vergissing terug te draaien is.
  if (pad === "/saneer/dossier" && methode === "DELETE") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag een dossier verwijderen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const terug = body.herstel === true;
    const r = await env.DB.prepare("update saneer_dossiers set verwijderd = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1")
      .bind(pd, terug ? 0 : 1, nuISO).run();
    if (!r.meta.changes) return json({ error: "Dossier niet gevonden." }, 404);
    c.log({ pd, gebeurtenis: terug ? "dossier_hersteld" : "dossier_verwijderd" });
    return json({ ok: true });
  }

  // ═══ FASE B — IMPORT ═══

  // Kolomindeling van een opdrachtgever ophalen als voorstel voor de volgende aanlevering.
  if (pad === "/saneer/mapping" && methode === "GET") {
    const og = String(url.searchParams.get("opdrachtgever") ?? "").trim().toLowerCase();
    if (!og) return json({ mapping: null });
    const r = await env.DB.prepare("select mapping, kop_index from saneer_mappings where opdrachtgever = ?").bind(og).first<{ mapping: string; kop_index: number }>();
    if (!r) return json({ mapping: null });
    try { return json({ mapping: JSON.parse(r.mapping), kopIndex: r.kop_index }); }
    catch { return json({ mapping: null }); }
  }

  // Adressen wegschrijven. AANVULLEN, nooit overschrijven: een tweede aanlevering mag nooit
  // veldwerk wissen. Adressen die er al staan blijven exact zoals ze zijn.
  if (pad === "/saneer/adressen" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag adressen inlezen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const lijst = Array.isArray(body.adressen) ? (body.adressen as Record<string, unknown>[]) : [];
    const afgekeurd = Array.isArray(body.afgekeurd) ? (body.afgekeurd as Record<string, unknown>[]) : [];
    if (!pd) return json({ error: "pd_nummer ontbreekt." }, 400);
    if (lijst.length > 5000) return json({ error: "Te veel adressen in één keer (maximaal 5000)." }, 400);

    const dossier = await env.DB.prepare("select status from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first<{ status: string }>();
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);
    if (dossier.status === "afgeboekt") return json({ error: "Dit dossier is afgeboekt." }, 409);

    // Welke adressen staan er al? Sleutel op postcode + huisnummer + toevoeging.
    const { results: bestaandeRijen } = await env.DB.prepare(
      "select postcode, huisnummer, toevoeging from saneer_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).all<{ postcode: string; huisnummer: string; toevoeging: string }>();
    const sleutel = (p: string, h: string, t: string) => `${String(p).replace(/\s+/g, "").toUpperCase()}|${String(h).trim()}|${String(t).trim().toLowerCase()}`;
    const bestaat = new Set((bestaandeRijen ?? []).map((r) => sleutel(r.postcode, r.huisnummer, r.toevoeging)));

    let toegevoegd = 0, overgeslagen = 0;
    const nieuweRijen = lijst.filter((a) => {
      const k = sleutel(String(a.postcode ?? ""), String(a.huisnummer ?? ""), String(a.toevoeging ?? ""));
      if (bestaat.has(k)) { overgeslagen++; return false; }
      bestaat.add(k);
      return true;
    });

    for (let i = 0; i < nieuweRijen.length; i += 30) {
      const stuk = nieuweRijen.slice(i, i + 30).map((a) =>
        env.DB.prepare(
          "insert into saneer_adressen (id, pd_nummer, cluster_id, volgorde, straat, huisnummer, toevoeging, postcode, plaats, " +
          "bewoner, telefoon, email, opmerking, telefoon_bij_import, bijgewerkt_op) " +
          "values (?1, ?2, '', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) on conflict(id) do nothing"
        ).bind(
          String(a.id ?? ""), pd, Number(a.volgorde ?? 0),
          String(a.straat ?? ""), String(a.huisnummer ?? ""), String(a.toevoeging ?? ""),
          String(a.postcode ?? ""), String(a.plaats ?? ""),
          String(a.bewoner ?? ""), String(a.telefoon ?? ""), String(a.email ?? ""), String(a.opmerking ?? ""),
          String(a.telefoon ?? "").trim() ? 1 : 0, nuISO,
        )
      );
      await env.DB.batch(stuk);
      toegevoegd += stuk.length;
    }

    // Afgekeurde regels bewaren met de reden erbij.
    for (let i = 0; i < afgekeurd.length; i += 30) {
      const stuk = afgekeurd.slice(i, i + 30).map((r) =>
        env.DB.prepare(
          "insert into saneer_afgekeurd (id, pd_nummer, bron_regel, ruw, reden, aangemaakt_op) values (?1, ?2, ?3, ?4, ?5, ?6) on conflict(id) do nothing"
        ).bind(String(r.id ?? ""), pd, Number(r.bron_regel ?? 0), JSON.stringify(r.ruw ?? {}), String(r.reden ?? ""), nuISO)
      );
      await env.DB.batch(stuk);
    }

    // Kolomindeling onthouden voor de volgende keer.
    const og = String(body.opdrachtgever ?? "").trim().toLowerCase();
    if (og && body.mapping) {
      await env.DB.prepare(
        "insert into saneer_mappings (opdrachtgever, mapping, kop_index, gebruikt_op) values (?1, ?2, ?3, ?4) " +
        "on conflict(opdrachtgever) do update set mapping = ?2, kop_index = ?3, gebruikt_op = ?4"
      ).bind(og, JSON.stringify(body.mapping), Number(body.kopIndex ?? 0), nuISO).run();
    }

    if (toegevoegd > 0 && dossier.status === "nieuw") {
      await env.DB.prepare("update saneer_dossiers set status = 'geimporteerd', bijgewerkt_op = ?2 where pd_nummer = ?1").bind(pd, nuISO).run();
    }
    c.log({ pd, gebeurtenis: "geimporteerd", nieuw: `${toegevoegd} toegevoegd, ${overgeslagen} bestonden al, ${afgekeurd.length} afgekeurd` });
    return json({ ok: true, toegevoegd, overgeslagen, afgekeurd: afgekeurd.length });
  }

  // Adressen ophalen. Een medewerker ziet alleen de clusters die aan hem zijn toegewezen.
  if (pad === "/saneer/adressen" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    if (!pd) return json({ error: "pd ontbreekt." }, 400);
    const { results } = c.magBeheren
      ? await env.DB.prepare("select * from saneer_adressen where pd_nummer = ?1 and verwijderd = 0 order by volgorde").bind(pd).all()
      : await env.DB.prepare(
          "select a.* from saneer_adressen a join saneer_clusters k on k.id = a.cluster_id " +
          "where a.pd_nummer = ?1 and a.verwijderd = 0 and k.toegewezen_aan = ?2 order by a.volgorde"
        ).bind(pd, c.mijnUserId ?? "__geen__").all();
    return json({ adressen: results ?? [], alleenEigen: !c.magBeheren });
  }

  // Afgekeurde regels bekijken, zodat ze gecorrigeerd kunnen worden.
  if (pad === "/saneer/afgekeurd" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const { results } = await env.DB.prepare(
      "select * from saneer_afgekeurd where pd_nummer = ? and opgelost = 0 order by bron_regel"
    ).bind(pd).all();
    return json({ regels: results ?? [] });
  }

  // Clusters, ronden, antwoorden, poster en afronden staan in een eigen bestand.
  const vervolg = await saneerUitvoeringRoutes(pad, methode, url, body, c);
  if (vervolg) return vervolg;

  return null; // geen route van deze module
}

// Wire Solutions — Bewonersakkoord: clusters, ronden, antwoorden, poster en afronden (fase C t/m H)
// ─────────────────────────────────────────────────────────────────────────────
// Vervolg op akkoord.ts. Daar staan het dossier en de import; hier staat alles wat daarna gebeurt.
// Gesplitst omdat het anders één bestand van duizend regels wordt waarin niemand meer iets vindt.
//
// ── DE REGEL DIE DEZE MODULE ANDERS MAAKT ──
// Een cluster krijgt één uitvoeringsdatum. Eén bewoner die niet kan, maakt die datum ongeldig — dus
// "18 van de 22 akkoord" is geen 82%, dat is NIET akkoord. Die regel staat hieronder in SQL, niet in
// de knop op het scherm: dan kan geen enkele weg door de app hem omzeilen.
//
// ROUTES
//   POST /akkoord/clusters/maak     clusters afleiden uit de postcodes
//   POST /akkoord/cluster           cluster bijwerken (toewijzen, naam, starttijd)
//   POST /akkoord/cluster/splits    handmatig afsplitsen naar een nieuw cluster
//   POST /akkoord/cluster/datum     definitieve datum vastleggen (alleen bij volledig akkoord)
//   GET  /akkoord/cluster?id=       alles van één cluster: adressen, ronde, antwoorden, beschikbaarheid
//   POST /akkoord/ronde             nieuwe ronde starten voor een cluster
//   POST /akkoord/respons           antwoord van één bewoner vastleggen (deur of telefoon)
//   POST /akkoord/adres             naam, telefoon, belstatus of opmerking bijwerken
//   GET  /akkoord/bellijst?pd=      adressen mét telefoonnummer, met belstatus
//   GET  /akkoord/taken?pd=         posters en andere taken
//   POST /akkoord/taak              taak afvinken of aanmaken
//   POST /akkoord/afronden          dossier afronden of afboeken
//   GET  /akkoord/export?pd=        alles van een dossier voor Excel en PDF

import type { AkkoordContext } from "./akkoord";
import { netPd } from "./akkoord";

const ANTWOORDEN = ["akkoord", "niet_akkoord", "niet_thuis", "weigert"] as const;
const BELSTATUSSEN = ["", "gebeld", "geen_gehoor", "terugbellen", "akkoord"] as const;

// Postcode als sleutel: "3011 ab" en "3011AB" zijn hetzelfde cluster.
const netPostcode = (s: string) => String(s ?? "").replace(/\s+/g, "").toUpperCase();

// Huisnummers sorteren op getal, niet op tekst: anders komt 10 vóór 2.
function adresSleutel(a: { postcode?: string; huisnummer?: string; toevoeging?: string }) {
  const nr = parseInt(String(a.huisnummer ?? "").replace(/\D/g, ""), 10);
  return [netPostcode(a.postcode ?? ""), Number.isFinite(nr) ? nr : 0, String(a.toevoeging ?? "").toLowerCase()] as const;
}

function sorteerAdressen<T extends { postcode?: string; huisnummer?: string; toevoeging?: string }>(lijst: T[]): T[] {
  return [...lijst].sort((x, y) => {
    const a = adresSleutel(x), b = adresSleutel(y);
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  });
}

// Een id dat op elk apparaat te maken is en nergens mee botst.
const maakId = (voorvoegsel: string, sleutel: string) =>
  `${voorvoegsel}-${sleutel.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}-${Math.random().toString(36).slice(2, 8)}`;

export async function akkoordUitvoeringRoutes(
  pad: string, methode: string, url: URL, body: Record<string, unknown>, c: AkkoordContext,
): Promise<Response | null> {
  const { env, json, nuISO } = c;

  const dossierVan = (pd: string) =>
    env.DB.prepare("select * from akkoord_dossiers where pd_nummer = ? and verwijderd = 0")
      .bind(pd).first<Record<string, unknown>>();

  // Mag deze gebruiker aan dit cluster komen? Beheer mag alles, een medewerker alleen wat van hem is.
  async function magBijCluster(clusterId: string) {
    // Vlak na de import zit een adres nog in geen enkel cluster. De beheerder moet er dan wel bij
    // kunnen — anders is een tikfout in een straatnaam pas te herstellen ná het verdelen.
    if (!clusterId) {
      return c.magBeheren ? { cluster: undefined } : { fout: json({ error: "Dit adres is nog niet verdeeld." }, 403) };
    }
    const k = await env.DB.prepare("select * from akkoord_clusters where id = ? and verwijderd = 0")
      .bind(clusterId).first<Record<string, unknown>>();
    if (!k) return { fout: json({ error: "Cluster niet gevonden." }, 404) };
    if (!c.magBeheren && k.toegewezen_aan !== c.mijnUserId) {
      return { fout: json({ error: "Dit cluster is niet aan jou toegewezen." }, 403) };
    }
    return { cluster: k };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE C — CLUSTEREN EN VERDELEN
  // ═══════════════════════════════════════════════════════════════════════════

  // Clusters afleiden uit de volledige postcode. Draaien mag zo vaak als je wilt: bestaande clusters
  // worden hergebruikt en handmatig afgesplitste clusters blijven met rust.
  if (pad === "/akkoord/clusters/maak" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag clusters maken." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const dossier = await dossierVan(pd);
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);

    const { results: adressen } = await env.DB.prepare(
      "select id, postcode, huisnummer, toevoeging, straat, plaats, cluster_id from akkoord_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).all<Record<string, string>>();
    if (!adressen?.length) return json({ error: "Er staan nog geen adressen in dit dossier." }, 400);

    const { results: bestaande } = await env.DB.prepare(
      "select id, postcode, handmatig from akkoord_clusters where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).all<{ id: string; postcode: string; handmatig: number }>();
    const perPostcode = new Map<string, string>();
    const handmatig = new Set<string>();
    for (const k of bestaande ?? []) {
      if (k.handmatig) handmatig.add(k.id);
      else if (!perPostcode.has(k.postcode)) perPostcode.set(k.postcode, k.id);
    }

    // Adressen die de beheerder zelf heeft afgesplitst laten we staan.
    const teVerdelen = adressen.filter((a) => !handmatig.has(a.cluster_id ?? ""));
    const groepen = new Map<string, typeof teVerdelen>();
    for (const a of teVerdelen) {
      const pc = netPostcode(a.postcode) || "ONBEKEND";
      if (!groepen.has(pc)) groepen.set(pc, []);
      groepen.get(pc)!.push(a);
    }

    const nieuweClusters: { id: string; postcode: string; naam: string; aantal: number }[] = [];
    const updates: D1PreparedStatement[] = [];
    let volgorde = 0;

    for (const pc of [...groepen.keys()].sort()) {
      const groep = sorteerAdressen(groepen.get(pc)!);
      let clusterId = perPostcode.get(pc);
      // Naam die een monteur herkent: "Kerkstraat 1 t/m 40".
      const straat = groep[0]?.straat ?? "";
      const eerste = groep[0]?.huisnummer ?? "";
      const laatste = groep[groep.length - 1]?.huisnummer ?? "";
      const naam = straat ? `${straat} ${eerste}${laatste && laatste !== eerste ? ` t/m ${laatste}` : ""}` : pc;
      if (!clusterId) {
        clusterId = maakId("kl", `${pd}${pc}`);
        updates.push(env.DB.prepare(
          "insert into akkoord_clusters (id, pd_nummer, postcode, naam, bijgewerkt_op) values (?1, ?2, ?3, ?4, ?5)"
        ).bind(clusterId, pd, pc, naam, nuISO));
      } else {
        updates.push(env.DB.prepare("update akkoord_clusters set naam = ?2, bijgewerkt_op = ?3 where id = ?1 and naam = ''")
          .bind(clusterId, naam, nuISO));
      }
      nieuweClusters.push({ id: clusterId, postcode: pc, naam, aantal: groep.length });
      for (const a of groep) {
        updates.push(env.DB.prepare("update akkoord_adressen set cluster_id = ?2, volgorde = ?3, bijgewerkt_op = ?4 where id = ?1")
          .bind(a.id, clusterId, volgorde++, nuISO));
      }
    }

    for (let i = 0; i < updates.length; i += 30) await env.DB.batch(updates.slice(i, i + 30));

    const grens = Number(dossier.cluster_grens ?? 25);
    const teGroot = nieuweClusters.filter((k) => k.aantal > grens);
    c.log({ pd, gebeurtenis: "geclusterd", nieuw: `${nieuweClusters.length} clusters` });
    return json({ ok: true, clusters: nieuweClusters, teGroot, grens });
  }

  // Cluster bijwerken: toewijzen aan een medewerker, naam of starttijd aanpassen.
  if (pad === "/akkoord/cluster" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag clusters verdelen." }, 403);
    const id = String(body.id ?? "");
    const k = await env.DB.prepare("select * from akkoord_clusters where id = ? and verwijderd = 0").bind(id).first<Record<string, unknown>>();
    if (!k) return json({ error: "Cluster niet gevonden." }, 404);

    const zetten: string[] = [];
    const waarden: unknown[] = [];
    for (const veld of ["naam", "starttijd", "toegewezen_aan"] as const) {
      if (body[veld] !== undefined) { zetten.push(`${veld} = ?${zetten.length + 2}`); waarden.push(String(body[veld] ?? "")); }
    }
    if (!zetten.length) return json({ ok: true });
    await env.DB.prepare(`update akkoord_clusters set ${zetten.join(", ")}, bijgewerkt_op = ?${zetten.length + 2} where id = ?1`)
      .bind(id, ...waarden, nuISO).run();

    if (body.toegewezen_aan !== undefined) {
      c.log({ pd: String(k.pd_nummer), clusterId: id, gebeurtenis: "toegewezen", oud: String(k.toegewezen_aan ?? ""), nieuw: String(body.toegewezen_aan ?? "") });
      // Zodra er iets verdeeld is, staat het dossier op verdeeld.
      await env.DB.prepare("update akkoord_dossiers set status = 'verdeeld', bijgewerkt_op = ?2 where pd_nummer = ?1 and status in ('nieuw','geimporteerd')")
        .bind(String(k.pd_nummer), nuISO).run();
    }
    return json({ ok: true });
  }

  // Handmatig afsplitsen: de beheerder kiest adressen die een eigen cluster worden. Nodig als één
  // postcode een heel flatgebouw is en die groep te groot wordt om op één datum te krijgen.
  if (pad === "/akkoord/cluster/splits" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag clusters splitsen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const ids = Array.isArray(body.adres_ids) ? (body.adres_ids as unknown[]).map(String) : [];
    const naam = String(body.naam ?? "").trim();
    if (!pd || ids.length === 0) return json({ error: "Kies eerst adressen om af te splitsen." }, 400);

    const nieuwId = maakId("kl", `${pd}handmatig`);
    const eerste = await env.DB.prepare("select postcode from akkoord_adressen where id = ?").bind(ids[0]).first<{ postcode: string }>();
    await env.DB.prepare(
      "insert into akkoord_clusters (id, pd_nummer, postcode, naam, handmatig, bijgewerkt_op) values (?1, ?2, ?3, ?4, 1, ?5)"
    ).bind(nieuwId, pd, netPostcode(eerste?.postcode ?? ""), naam || "Afgesplitst", nuISO).run();

    for (let i = 0; i < ids.length; i += 30) {
      await env.DB.batch(ids.slice(i, i + 30).map((id) =>
        env.DB.prepare("update akkoord_adressen set cluster_id = ?2, bijgewerkt_op = ?3 where id = ?1 and pd_nummer = ?4")
          .bind(id, nieuwId, nuISO, pd)));
    }
    c.log({ pd, clusterId: nieuwId, gebeurtenis: "gesplitst", nieuw: `${ids.length} adressen` });
    return json({ ok: true, cluster_id: nieuwId });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE D/E/F — RONDEN, ANTWOORDEN EN DE BELLIJST
  // ═══════════════════════════════════════════════════════════════════════════

  // Alles van één cluster in één keer: dat is precies wat de monteur onderweg nodig heeft, en het
  // scheelt hem vier losse verzoeken op een slechte verbinding.
  if (pad === "/akkoord/cluster" && methode === "GET") {
    const id = String(url.searchParams.get("id") ?? "");
    const toegang = await magBijCluster(id);
    if (toegang.fout) return toegang.fout;
    if (!toegang.cluster) return json({ error: "Cluster niet gevonden." }, 404);
    const cluster = toegang.cluster;
    const pd = String(cluster.pd_nummer);

    const dossier = await dossierVan(pd);
    const { results: adressen } = await env.DB.prepare(
      "select * from akkoord_adressen where cluster_id = ? and verwijderd = 0 order by volgorde"
    ).bind(id).all();
    const ronde = await env.DB.prepare(
      "select * from akkoord_ronden where cluster_id = ? and actief = 1 order by nummer desc limit 1"
    ).bind(id).first<Record<string, unknown>>();
    const { results: responsen } = ronde
      ? await env.DB.prepare("select * from akkoord_responsen where ronde_id = ?").bind(String(ronde.id)).all()
      : { results: [] as unknown[] };
    const { results: beschikbaarheid } = await env.DB.prepare(
      "select b.* from akkoord_beschikbaarheid b join akkoord_adressen a on a.id = b.adres_id where a.cluster_id = ?"
    ).bind(id).all();
    const { results: ronden } = await env.DB.prepare(
      "select id, nummer, voorgestelde_datum, uitkomst, gestart_op, afgesloten_op from akkoord_ronden where cluster_id = ? order by nummer"
    ).bind(id).all();

    return json({ cluster, dossier, adressen: adressen ?? [], ronde: ronde ?? null, responsen: responsen ?? [], beschikbaarheid: beschikbaarheid ?? [], ronden: ronden ?? [] });
  }

  // Nieuwe ronde. De vorige wordt afgesloten maar blijft staan: naam, telefoonnummer en wat een
  // bewoner over data zei blijven gewoon bestaan, want die hangen niet aan de ronde.
  if (pad === "/akkoord/ronde" && methode === "POST") {
    const clusterId = String(body.cluster_id ?? "");
    const toegang = await magBijCluster(clusterId);
    if (toegang.fout) return toegang.fout;
    if (!toegang.cluster) return json({ error: "Cluster niet gevonden." }, 404);
    const cluster = toegang.cluster;
    const pd = String(cluster.pd_nummer);
    const dossier = await dossierVan(pd);
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);
    if (dossier.status === "afgeboekt") return json({ error: "Dit dossier is afgeboekt." }, 409);

    const vorige = await env.DB.prepare("select id, nummer from akkoord_ronden where cluster_id = ? order by nummer desc limit 1")
      .bind(clusterId).first<{ id: string; nummer: number }>();
    const nummer = (vorige?.nummer ?? 0) + 1;
    const datum = String(body.voorgestelde_datum ?? "");

    if (vorige) {
      await env.DB.prepare("update akkoord_ronden set actief = 0, afgesloten_op = ?2, uitkomst = case when uitkomst = '' then 'afgebroken' else uitkomst end where id = ?1")
        .bind(vorige.id, nuISO).run();
    }
    const rondeId = maakId("rd", `${clusterId}${nummer}`);
    await env.DB.prepare(
      "insert into akkoord_ronden (id, cluster_id, pd_nummer, nummer, voorgestelde_datum, gestart_op, gestart_door, actief) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)"
    ).bind(rondeId, clusterId, pd, nummer, datum, nuISO, c.ikEmail).run();
    await env.DB.prepare("update akkoord_dossiers set status = 'in_uitvoering', bijgewerkt_op = ?2 where pd_nummer = ?1 and status in ('nieuw','geimporteerd','verdeeld')")
      .bind(pd, nuISO).run();

    c.log({ pd, clusterId, gebeurtenis: "ronde_gestart", nieuw: `ronde ${nummer}${datum ? ` — voorstel ${datum}` : ""}` });
    // Boven het ingestelde aantal ronden gaat dit cluster naar de leiding. Dat leiden we af uit het
    // rondenummer; een apart vlaggetje in de database zou alleen maar uit de pas kunnen gaan lopen.
    const naarLeiding = nummer > Number(dossier.escalatie_ronden ?? 3);
    return json({ ok: true, ronde_id: rondeId, nummer, naarLeiding });
  }

  // Het antwoord van één bewoner. Werkt zowel aan de deur als aan de telefoon; het verschil zit in
  // "via", zodat later te zien is hoe een akkoord tot stand kwam.
  if (pad === "/akkoord/respons" && methode === "POST") {
    const adresId = String(body.adres_id ?? "");
    const adres = await env.DB.prepare("select * from akkoord_adressen where id = ? and verwijderd = 0").bind(adresId).first<Record<string, unknown>>();
    if (!adres) return json({ error: "Adres niet gevonden." }, 404);
    const toegang = await magBijCluster(String(adres.cluster_id ?? ""));
    if (toegang.fout) return toegang.fout;
    const pd = String(adres.pd_nummer);

    const antwoord = String(body.antwoord ?? "");
    if (!ANTWOORDEN.includes(antwoord as never)) return json({ error: "Onbekend antwoord." }, 400);

    // Bij welke ronde hoort dit? De meegestuurde ronde wint, zodat een antwoord dat offline is
    // ingevuld bij de juiste ronde terechtkomt en niet stiekem bij een nieuwere.
    const meegestuurd = String(body.ronde_id ?? "");
    const ronde = meegestuurd
      ? await env.DB.prepare("select * from akkoord_ronden where id = ?").bind(meegestuurd).first<Record<string, unknown>>()
      : await env.DB.prepare("select * from akkoord_ronden where cluster_id = ? and actief = 1 order by nummer desc limit 1").bind(String(adres.cluster_id)).first<Record<string, unknown>>();
    if (!ronde) return json({ error: "Er loopt nog geen ronde voor dit cluster." }, 409);
    const naAfsluiten = Number(ronde.actief ?? 0) === 1 ? 0 : 1;

    const responsId = maakId("rs", `${ronde.id}${adresId}`);
    await env.DB.prepare(
      "insert into akkoord_responsen (id, ronde_id, adres_id, antwoord, via, opmerking, door, tijdstip, na_afsluiten) " +
      "values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) " +
      "on conflict(ronde_id, adres_id) do update set antwoord = ?4, via = ?5, opmerking = ?6, door = ?7, tijdstip = ?8"
    ).bind(responsId, String(ronde.id), adresId, antwoord, String(body.via ?? "deur"), String(body.opmerking ?? ""), c.ikEmail, nuISO, naAfsluiten).run();

    // Naam en telefoonnummer alleen aanvullen, nooit leegmaken: aan de deur wordt weleens niets
    // ingevuld, en dat mag geen eerder verzameld nummer wissen.
    const aanvul: string[] = [];
    const w: unknown[] = [];
    for (const veld of ["bewoner", "telefoon", "email", "opmerking"] as const) {
      const v = String(body[veld] ?? "").trim();
      if (v) { aanvul.push(`${veld} = ?${aanvul.length + 2}`); w.push(v); }
    }
    if (aanvul.length) {
      await env.DB.prepare(`update akkoord_adressen set ${aanvul.join(", ")}, bijgewerkt_op = ?${aanvul.length + 2} where id = ?1`)
        .bind(adresId, ...w, nuISO).run();
    }

    // Data die de bewoner wél of niet kan. Hangt aan het adres, dus dit telt in elke volgende ronde mee.
    const kanWel = Array.isArray(body.kan_wel) ? (body.kan_wel as unknown[]).map(String) : [];
    const kanNiet = Array.isArray(body.kan_niet) ? (body.kan_niet as unknown[]).map(String) : [];
    const datums = [...kanWel.map((d) => [d, 1] as const), ...kanNiet.map((d) => [d, 0] as const)]
      .filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    for (let i = 0; i < datums.length; i += 30) {
      await env.DB.batch(datums.slice(i, i + 30).map(([d, kan]) =>
        env.DB.prepare(
          "insert into akkoord_beschikbaarheid (id, adres_id, datum, kan, ronde_id, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7) " +
          "on conflict(adres_id, datum) do update set kan = ?4, ronde_id = ?5, door = ?6, tijdstip = ?7"
        ).bind(maakId("bs", `${adresId}${d}`), adresId, d, kan, String(ronde.id), c.ikEmail, nuISO)));
    }

    c.log({ pd, clusterId: String(adres.cluster_id), adresId, gebeurtenis: "antwoord", nieuw: `${antwoord} via ${String(body.via ?? "deur")}` });

    // Hoe staat het cluster ervoor? Dat rekenen we hier uit, zodat de app het meteen kan tonen zonder
    // nog een keer alles op te halen.
    const stand = await env.DB.prepare(
      "select count(*) as totaal, " +
      "sum(case when r.antwoord = 'akkoord' then 1 else 0 end) as akkoord, " +
      "sum(case when r.antwoord in ('niet_akkoord','weigert') then 1 else 0 end) as tegen " +
      "from akkoord_adressen a left join akkoord_responsen r on r.adres_id = a.id and r.ronde_id = ?2 " +
      "where a.cluster_id = ?1 and a.verwijderd = 0"
    ).bind(String(adres.cluster_id), String(ronde.id)).first<{ totaal: number; akkoord: number; tegen: number }>();

    return json({ ok: true, na_afsluiten: naAfsluiten === 1, stand });
  }

  // Losse gegevens van een adres bijwerken: bellijst, naam die later doorkomt, notitie.
  if (pad === "/akkoord/adres" && methode === "POST") {
    const id = String(body.id ?? "");
    const adres = await env.DB.prepare("select * from akkoord_adressen where id = ? and verwijderd = 0").bind(id).first<Record<string, unknown>>();
    if (!adres) return json({ error: "Adres niet gevonden." }, 404);
    const toegang = await magBijCluster(String(adres.cluster_id ?? ""));
    if (toegang.fout) return toegang.fout;

    const patch = (body.patch ?? {}) as Record<string, unknown>;
    const zetten: string[] = [];
    const w: unknown[] = [];
    for (const veld of ["bewoner", "telefoon", "email", "opmerking", "belstatus"] as const) {
      if (patch[veld] === undefined) continue;
      const v = String(patch[veld] ?? "");
      if (veld === "belstatus" && !BELSTATUSSEN.includes(v as never)) return json({ error: "Onbekende belstatus." }, 400);
      zetten.push(`${veld} = ?${zetten.length + 2}`); w.push(v);
    }
    if (patch.belpogingen !== undefined) { zetten.push(`belpogingen = ?${zetten.length + 2}`); w.push(Number(patch.belpogingen) || 0); }
    if (!zetten.length) return json({ ok: true });
    await env.DB.prepare(`update akkoord_adressen set ${zetten.join(", ")}, bijgewerkt_op = ?${zetten.length + 2} where id = ?1`)
      .bind(id, ...w, nuISO).run();
    if (patch.belstatus !== undefined) {
      c.log({ pd: String(adres.pd_nummer), adresId: id, gebeurtenis: "belstatus", oud: String(adres.belstatus ?? ""), nieuw: String(patch.belstatus) });
    }
    return json({ ok: true });
  }

  // De bellijst: adressen die bij de import al een telefoonnummer hadden. Die hoeven niet langsgereden
  // te worden. Terugbellen staat bovenaan — dat is een afspraak met een bewoner, geen wenslijst.
  if (pad === "/akkoord/bellijst" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const { results } = await env.DB.prepare(
      "select a.*, k.naam as cluster_naam, k.definitieve_datum from akkoord_adressen a " +
      "left join akkoord_clusters k on k.id = a.cluster_id " +
      "where a.pd_nummer = ?1 and a.verwijderd = 0 and trim(a.telefoon) <> '' " +
      "order by case a.belstatus when 'terugbellen' then 0 when '' then 1 when 'geen_gehoor' then 2 else 3 end, a.volgorde"
    ).bind(pd).all();
    return json({ adressen: results ?? [] });
  }

  // Definitieve datum. De controle staat in de SQL: alleen als ELK adres in het cluster akkoord is
  // in de lopende ronde komt de datum erin. "Bijna iedereen" bestaat niet in deze module.
  if (pad === "/akkoord/cluster/datum" && methode === "POST") {
    const clusterId = String(body.cluster_id ?? "");
    const toegang = await magBijCluster(clusterId);
    if (toegang.fout) return toegang.fout;
    if (!toegang.cluster) return json({ error: "Cluster niet gevonden." }, 404);
    const cluster = toegang.cluster;
    const datum = String(body.datum ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json({ error: "Ongeldige datum." }, 400);

    const ronde = await env.DB.prepare("select id, nummer from akkoord_ronden where cluster_id = ? and actief = 1 order by nummer desc limit 1")
      .bind(clusterId).first<{ id: string; nummer: number }>();
    if (!ronde) return json({ error: "Er loopt geen ronde voor dit cluster." }, 409);

    const stand = await env.DB.prepare(
      "select count(*) as totaal, sum(case when r.antwoord = 'akkoord' then 1 else 0 end) as akkoord " +
      "from akkoord_adressen a left join akkoord_responsen r on r.adres_id = a.id and r.ronde_id = ?2 " +
      "where a.cluster_id = ?1 and a.verwijderd = 0"
    ).bind(clusterId, ronde.id).first<{ totaal: number; akkoord: number }>();
    const totaal = Number(stand?.totaal ?? 0), akkoord = Number(stand?.akkoord ?? 0);
    if (totaal === 0) return json({ error: "Dit cluster heeft geen adressen." }, 400);
    if (akkoord < totaal) {
      return json({ error: `Nog niet iedereen is akkoord: ${akkoord} van de ${totaal}. Eén bewoner die niet kan, maakt de datum ongeldig.`, akkoord, totaal }, 409);
    }

    await env.DB.prepare("update akkoord_clusters set definitieve_datum = ?2, bijgewerkt_op = ?3 where id = ?1").bind(clusterId, datum, nuISO).run();
    await env.DB.prepare("update akkoord_ronden set uitkomst = 'akkoord', voorgestelde_datum = ?2 where id = ?1").bind(ronde.id, datum).run();

    const pd = String(cluster.pd_nummer);
    const dossier = await dossierVan(pd);

    // FASE G — de postertaak ontstaat hier vanzelf. Deadline = de datum min het aantal weken uit het
    // dossier. Dit is geen los lijstje: zonder poster mag het dossier straks niet afgerond worden.
    const weken = Number(dossier?.poster_weken_voor ?? 2);
    const deadline = new Date(`${datum}T12:00:00Z`);
    deadline.setUTCDate(deadline.getUTCDate() - weken * 7);
    await env.DB.prepare(
      "insert into akkoord_taken (id, pd_nummer, cluster_id, soort, deadline, bijgewerkt_op) values (?1, ?2, ?3, 'poster', ?4, ?5) " +
      "on conflict(id) do update set deadline = ?4, bijgewerkt_op = ?5"
    ).bind(`tk-poster-${clusterId}`, pd, clusterId, deadline.toISOString().slice(0, 10), nuISO).run();

    // Staat er nog een cluster zonder datum, dan is het dossier nog niet rond.
    const open = await env.DB.prepare("select count(*) as n from akkoord_clusters where pd_nummer = ? and verwijderd = 0 and definitieve_datum = ''")
      .bind(pd).first<{ n: number }>();
    if (Number(open?.n ?? 0) === 0) {
      await env.DB.prepare("update akkoord_dossiers set status = 'datum_akkoord', bijgewerkt_op = ?2 where pd_nummer = ?1 and status not in ('afgerond','afgeboekt')")
        .bind(pd, nuISO).run();
    }
    c.log({ pd, clusterId, gebeurtenis: "datum_vast", nieuw: datum });
    return json({ ok: true, datum, poster_deadline: deadline.toISOString().slice(0, 10), dossierRond: Number(open?.n ?? 0) === 0 });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE G — POSTER EN HERINNERING
  // ═══════════════════════════════════════════════════════════════════════════

  if (pad === "/akkoord/taken" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const { results } = pd
      ? await env.DB.prepare(
          "select t.*, k.naam as cluster_naam, k.definitieve_datum, k.toegewezen_aan from akkoord_taken t " +
          "left join akkoord_clusters k on k.id = t.cluster_id where t.pd_nummer = ?1 order by t.deadline"
        ).bind(pd).all()
      // Zonder pd: alle openstaande taken, voor de herinnering bij het openen van de app.
      : await env.DB.prepare(
          "select t.*, k.naam as cluster_naam, k.definitieve_datum, k.toegewezen_aan, d.gebouw from akkoord_taken t " +
          "left join akkoord_clusters k on k.id = t.cluster_id " +
          "left join akkoord_dossiers d on d.pd_nummer = t.pd_nummer " +
          "where t.afgevinkt_op = '' and d.verwijderd = 0 and d.status not in ('afgeboekt') order by t.deadline limit 100"
        ).all();
    return json({ taken: results ?? [] });
  }

  if (pad === "/akkoord/taak" && methode === "POST") {
    const id = String(body.id ?? "");
    const taak = await env.DB.prepare("select * from akkoord_taken where id = ?").bind(id).first<Record<string, unknown>>();
    if (!taak) return json({ error: "Taak niet gevonden." }, 404);
    const afvinken = body.afvinken !== false;
    await env.DB.prepare(
      "update akkoord_taken set afgevinkt_op = ?2, afgevinkt_door = ?3, foto = ?4, notitie = ?5, bijgewerkt_op = ?6 where id = ?1"
    ).bind(id, afvinken ? nuISO : "", afvinken ? c.ikEmail : "", String(body.foto ?? taak.foto ?? ""), String(body.notitie ?? taak.notitie ?? ""), nuISO).run();

    const pd = String(taak.pd_nummer);
    const open = await env.DB.prepare("select count(*) as n from akkoord_taken where pd_nummer = ? and afgevinkt_op = ''").bind(pd).first<{ n: number }>();
    if (afvinken && Number(open?.n ?? 0) === 0) {
      await env.DB.prepare("update akkoord_dossiers set status = 'poster_geplaatst', bijgewerkt_op = ?2 where pd_nummer = ?1 and status = 'datum_akkoord'")
        .bind(pd, nuISO).run();
    }
    c.log({ pd, clusterId: String(taak.cluster_id ?? ""), gebeurtenis: afvinken ? "poster_geplaatst" : "poster_teruggezet" });
    return json({ ok: true });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FASE H — AFRONDEN, AFBOEKEN EN EXPORT
  // ═══════════════════════════════════════════════════════════════════════════

  // Afronden mag alleen als het werk echt af is. De server rekent dat na — anders is de knop een
  // meningsuiting en geen controle.
  if (pad === "/akkoord/afronden" && methode === "POST") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag een dossier afronden." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const dossier = await dossierVan(pd);
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);
    const afboeken = body.afboeken === true;

    const gaten = await env.DB.prepare(
      "select " +
      "(select count(*) from akkoord_clusters where pd_nummer = ?1 and verwijderd = 0) as clusters, " +
      "(select count(*) from akkoord_clusters where pd_nummer = ?1 and verwijderd = 0 and definitieve_datum = '') as zonder_datum, " +
      "(select count(*) from akkoord_clusters where pd_nummer = ?1 and verwijderd = 0 and ifnull(toegewezen_aan,'') = '') as onverdeeld, " +
      "(select count(*) from akkoord_taken where pd_nummer = ?1 and afgevinkt_op = '') as taken_open, " +
      "(select count(*) from akkoord_afgekeurd where pd_nummer = ?1 and opgelost = 0) as afgekeurd"
    ).bind(pd).first<Record<string, number>>();

    const belet: string[] = [];
    if (Number(gaten?.clusters ?? 0) === 0) belet.push("Er zijn nog geen clusters gemaakt.");
    if (Number(gaten?.zonder_datum ?? 0) > 0) belet.push(`${gaten!.zonder_datum} cluster(s) hebben nog geen definitieve datum.`);
    if (Number(gaten?.taken_open ?? 0) > 0) belet.push(`${gaten!.taken_open} poster(s) zijn nog niet opgehangen.`);

    if (afboeken && dossier.status !== "afgerond") belet.push("Rond het dossier eerst af voordat je het afboekt.");
    if (belet.length && body.toch !== true) return json({ error: "Nog niet klaar om af te ronden.", belet, gaten }, 409);

    if (afboeken) {
      await env.DB.prepare("update akkoord_dossiers set status = 'afgeboekt', afgeboekt_op = ?2, bijgewerkt_op = ?2 where pd_nummer = ?1").bind(pd, nuISO).run();
      c.log({ pd, gebeurtenis: "afgeboekt" });
    } else {
      await env.DB.prepare("update akkoord_dossiers set status = 'afgerond', afgerond_op = ?2, bijgewerkt_op = ?2 where pd_nummer = ?1").bind(pd, nuISO).run();
      c.log({ pd, gebeurtenis: "afgerond", nieuw: belet.length ? `met ${belet.length} openstaand punt(en)` : "" });
    }
    return json({ ok: true, belet });
  }

  // Alles van een dossier in één keer. De app maakt hier het Excel-bestand en de PDF van; het bestand
  // opbouwen op de server zou betekenen dat er persoonsgegevens door een derde partij gaan.
  if (pad === "/akkoord/export" && methode === "GET") {
    if (!c.magBeheren) return json({ error: "Alleen een beheerder mag exporteren." }, 403);
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const dossier = await dossierVan(pd);
    if (!dossier) return json({ error: "Dossier niet gevonden." }, 404);
    const [clusters, adressen, ronden, responsen, taken, log] = await Promise.all([
      env.DB.prepare("select * from akkoord_clusters where pd_nummer = ? and verwijderd = 0 order by postcode").bind(pd).all(),
      env.DB.prepare("select * from akkoord_adressen where pd_nummer = ? and verwijderd = 0 order by volgorde").bind(pd).all(),
      env.DB.prepare("select * from akkoord_ronden where pd_nummer = ? order by cluster_id, nummer").bind(pd).all(),
      env.DB.prepare("select r.* from akkoord_responsen r join akkoord_adressen a on a.id = r.adres_id where a.pd_nummer = ?").bind(pd).all(),
      env.DB.prepare("select * from akkoord_taken where pd_nummer = ?").bind(pd).all(),
      env.DB.prepare("select * from akkoord_log where pd_nummer = ? order by id").bind(pd).all(),
    ]);
    return json({
      dossier, clusters: clusters.results ?? [], adressen: adressen.results ?? [],
      ronden: ronden.results ?? [], responsen: responsen.results ?? [], taken: taken.results ?? [], log: log.results ?? [],
    });
  }

  return null;
}

var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// cloudflare/spiegel.ts
function spiegelAan(env) {
  return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);
}
__name(spiegelAan, "spiegelAan");
function koppen(env, extra = {}) {
  return {
    apikey: env.SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra
  };
}
__name(koppen, "koppen");
async function roep(env, pad, init, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${pad}`, { ...init, signal: ctrl.signal });
    const tekst = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, tekst };
  } catch (e) {
    return { ok: false, status: 0, tekst: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}
__name(roep, "roep");
function spiegelUpsert(env, ctx, tabel, rijen, conflictKolom, timeoutMs = 25e3) {
  if (!spiegelAan(env) || !rijen.length) return;
  const nu = (/* @__PURE__ */ new Date()).toISOString();
  const metStempel = rijen.map((r) => ({ ...r, gespiegeld_op: nu }));
  ctx.waitUntil(
    roep(
      env,
      `${tabel}?on_conflict=${encodeURIComponent(conflictKolom)}`,
      {
        method: "POST",
        headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(metStempel)
      },
      timeoutMs
    ).then((r) => {
      if (!r.ok) console.log(`[spiegel] upsert ${tabel} mislukt (${r.status}): ${r.tekst.slice(0, 200)}`);
    })
  );
}
__name(spiegelUpsert, "spiegelUpsert");
function spiegelVerwijder(env, ctx, tabel, kolom, waarde, timeoutMs = 15e3) {
  if (!spiegelAan(env)) return;
  ctx.waitUntil(
    roep(
      env,
      `${tabel}?${encodeURIComponent(kolom)}=eq.${encodeURIComponent(waarde)}`,
      { method: "DELETE", headers: koppen(env, { Prefer: "return=minimal" }) },
      timeoutMs
    ).then((r) => {
      if (!r.ok) console.log(`[spiegel] delete ${tabel} mislukt (${r.status}): ${r.tekst.slice(0, 200)}`);
    })
  );
}
__name(spiegelVerwijder, "spiegelVerwijder");
function spiegelInsert(env, ctx, tabel, rij, timeoutMs = 15e3) {
  if (!spiegelAan(env)) return;
  ctx.waitUntil(
    roep(env, tabel, { method: "POST", headers: koppen(env, { Prefer: "return=minimal" }), body: JSON.stringify([rij]) }, timeoutMs).then((r) => {
      if (!r.ok) console.log(`[spiegel] insert ${tabel} mislukt (${r.status}): ${r.tekst.slice(0, 200)}`);
    })
  );
}
__name(spiegelInsert, "spiegelInsert");
async function spiegelSelect(env, tabel, query, timeoutMs = 3e4) {
  if (!spiegelAan(env)) return null;
  const r = await roep(env, `${tabel}?${query}`, { method: "GET", headers: koppen(env) }, timeoutMs);
  if (!r.ok) return null;
  try {
    return JSON.parse(r.tekst);
  } catch {
    return null;
  }
}
__name(spiegelSelect, "spiegelSelect");
async function spiegelStatus(env) {
  if (!spiegelAan(env)) {
    return { aan: false, gezond: false, melding: "Spiegel staat uit (SUPABASE_URL / SUPABASE_SERVICE_KEY niet ingesteld)." };
  }
  const versies = await spiegelSelect(
    env,
    "wire_state_versies",
    "select=key,gespiegeld_op&order=gespiegeld_op.desc.nullslast",
    12e3
  );
  if (!versies) {
    return { aan: true, gezond: false, melding: "Supabase antwoordt niet (database gepauzeerd of storing). Cloudflare draait gewoon door." };
  }
  const accounts = await spiegelSelect(env, "users_auth", "select=email", 12e3);
  return {
    aan: true,
    gezond: true,
    melding: "Supabase-spiegel is bij \u2014 beide databases lopen gelijk.",
    onderdelen: versies.length,
    accounts: accounts?.length ?? 0,
    laatstGespiegeld: versies.find((v) => v.gespiegeld_op)?.gespiegeld_op ?? null
  };
}
__name(spiegelStatus, "spiegelStatus");
async function herspiegelAlles(env, d1) {
  if (!spiegelAan(env)) return { ok: false, onderdelen: 0, accounts: 0, rollen: 0, fout: "Spiegel staat uit." };
  const nu = (/* @__PURE__ */ new Date()).toISOString();
  let onderdelen = 0, accounts = 0, rollen = 0;
  try {
    const { results: staat } = await d1.prepare("select key, data, updated_at from wire_state").all();
    const PAKKET_BYTES = 3e6;
    let pakket = [];
    let pakketBytes = 0;
    const stuur = /* @__PURE__ */ __name(async () => {
      if (!pakket.length) return;
      const res = await roep(
        env,
        "wire_state?on_conflict=key",
        { method: "POST", headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(pakket) },
        45e3
      );
      if (res.ok) onderdelen += pakket.length;
      else console.log(`[spiegel] herspiegelen mislukt (${res.status}): ${res.tekst.slice(0, 200)}`);
      pakket = [];
      pakketBytes = 0;
    }, "stuur");
    for (const r of staat ?? []) {
      let data;
      try {
        data = JSON.parse(r.data);
      } catch {
        continue;
      }
      if (r.data.length >= PAKKET_BYTES) {
        await stuur();
        pakket = [{ key: r.key, data, updated_at: r.updated_at, gespiegeld_op: nu }];
        pakketBytes = r.data.length;
        await stuur();
        continue;
      }
      if (pakketBytes + r.data.length > PAKKET_BYTES) await stuur();
      pakket.push({ key: r.key, data, updated_at: r.updated_at, gespiegeld_op: nu });
      pakketBytes += r.data.length;
    }
    await stuur();
    const { results: auth } = await d1.prepare("select email, pw_hash, created_at from users_auth").all();
    if (auth?.length) {
      const res = await roep(
        env,
        "users_auth?on_conflict=email",
        {
          method: "POST",
          headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(auth.map((a) => ({ ...a, updated_at: nu })))
        },
        3e4
      );
      if (res.ok) accounts = auth.length;
    }
    const { results: rol } = await d1.prepare("select email, rol, boekhouding, bijgewerkt_op from app_roles").all();
    if (rol?.length) {
      const res = await roep(
        env,
        "app_roles?on_conflict=email",
        {
          method: "POST",
          headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(rol.map((r) => ({ email: r.email, rol: r.rol, boekhouding: !!r.boekhouding, bijgewerkt_op: r.bijgewerkt_op, gespiegeld_op: nu })))
        },
        3e4
      );
      if (res.ok) rollen = rol.length;
    }
    return { ok: true, onderdelen, accounts, rollen };
  } catch (e) {
    return { ok: false, onderdelen, accounts, rollen, fout: e instanceof Error ? e.message : String(e) };
  }
}
__name(herspiegelAlles, "herspiegelAlles");

// cloudflare/delen.ts
var DEEL_TEKENS = 4e5;
var SPLITS_BOVEN = 12e5;
var MARKERING = "__wire_delen";
var SCHEIDING = " deel ";
var OUDE_SCHEIDING = "\0deel\0";
var deelSleutel = /* @__PURE__ */ __name((key, gen, i, oud = false) => oud ? `${key}${OUDE_SCHEIDING}${gen}\0${i}` : `${key}${SCHEIDING}${gen} ${i}`, "deelSleutel");
var isDeelSleutel = /* @__PURE__ */ __name((key) => key.includes(SCHEIDING) || key.includes(OUDE_SCHEIDING), "isDeelSleutel");
var basisSleutel = /* @__PURE__ */ __name((key) => key.split(SCHEIDING)[0].split(OUDE_SCHEIDING)[0], "basisSleutel");
var isMarkering = /* @__PURE__ */ __name((v) => !!v && typeof v === "object" && v[MARKERING] === 1, "isMarkering");
async function schrijfGesplitst(env, key, data, nuISO) {
  const tekst = JSON.stringify(data ?? null);
  if (tekst.length <= SPLITS_BOVEN) {
    await env.DB.prepare(
      "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
    ).bind(key, tekst, nuISO).run();
    try {
      await ruimOudeDelenOp(env, key, "");
    } catch (e) {
      console.log("[delen] opruimen mislukt", String(e).slice(0, 120));
    }
    return { rijen: [{ key, data: data ?? null, updated_at: nuISO }], gesplitst: false };
  }
  const gen = nuISO.replace(/[^0-9]/g, "");
  const stukken = [];
  for (let i = 0; i < tekst.length; i += DEEL_TEKENS) stukken.push(tekst.slice(i, i + DEEL_TEKENS));
  const rijen = [];
  for (let i = 0; i < stukken.length; i += 3) {
    const groep = stukken.slice(i, i + 3);
    await env.DB.batch(groep.map((stuk, j) => {
      const k = deelSleutel(key, gen, i + j);
      rijen.push({ key: k, data: stuk, updated_at: nuISO });
      return env.DB.prepare(
        "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
      ).bind(k, JSON.stringify(stuk), nuISO);
    }));
  }
  const markering = { [MARKERING]: 1, delen: stukken.length, gen, tekens: tekst.length };
  await env.DB.prepare(
    "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
  ).bind(key, JSON.stringify(markering), nuISO).run();
  rijen.push({ key, data: markering, updated_at: nuISO });
  try {
    const opgeruimd = await ruimOudeDelenOp(env, key, gen);
    if (opgeruimd) console.log("[delen]", key, "\u2192", opgeruimd, "oude stukken opgeruimd");
  } catch (e) {
    console.log("[delen] opruimen mislukt", String(e).slice(0, 120));
  }
  return { rijen, gesplitst: true };
}
__name(schrijfGesplitst, "schrijfGesplitst");
async function ruimOudeDelenOp(env, key, behoudGen) {
  const voorvoegsels = [`${key}${SCHEIDING}`, `${key}${OUDE_SCHEIDING}`];
  const houden = behoudGen ? [`${key}${SCHEIDING}${behoudGen} `, `${key}${OUDE_SCHEIDING}${behoudGen}\0`] : null;
  const { results } = await env.DB.prepare("select key from wire_state").all();
  const weg = (results ?? []).map((r) => r.key).filter((k) => voorvoegsels.some((v) => k.startsWith(v)) && (!houden || !houden.some((h) => k.startsWith(h))));
  if (weg.length === 0) return 0;
  for (let i = 0; i < weg.length; i += 20) {
    await env.DB.batch(weg.slice(i, i + 20).map((k) => env.DB.prepare("delete from wire_state where key = ?").bind(k)));
  }
  return weg.length;
}
__name(ruimOudeDelenOp, "ruimOudeDelenOp");
async function zetWeerInElkaar(env, key, waarde) {
  if (!isMarkering(waarde)) return waarde;
  const { delen, gen, tekens } = waarde;
  let sleutels = Array.from({ length: delen }, (_, i) => deelSleutel(key, gen, i));
  const proef = await env.DB.prepare("select 1 as x from wire_state where key = ?").bind(sleutels[0]).first();
  if (!proef) sleutels = Array.from({ length: delen }, (_, i) => deelSleutel(key, gen, i, true));
  const ph = sleutels.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`select key, data from wire_state where key in (${ph})`).bind(...sleutels).all();
  const perSleutel = new Map((results ?? []).map((r) => [r.key, r.data]));
  let tekst = "";
  for (const s of sleutels) {
    const rij = perSleutel.get(s);
    if (rij === void 0) {
      console.log("[delen] ontbrekend stuk", s.slice(0, 60));
      return void 0;
    }
    try {
      tekst += JSON.parse(rij);
    } catch {
      return void 0;
    }
  }
  if (tekens && tekst.length !== tekens) {
    console.log("[delen] lengte klopt niet", key, tekst.length, tekens);
    return void 0;
  }
  try {
    return JSON.parse(tekst);
  } catch {
    return void 0;
  }
}
__name(zetWeerInElkaar, "zetWeerInElkaar");
async function herstelAllemaal(env, uit) {
  const gesplitst = Object.keys(uit).filter((k) => isMarkering(uit[k]));
  if (gesplitst.length === 0) return uit;
  for (const k of gesplitst) {
    const heel = await zetWeerInElkaar(env, k, uit[k]);
    if (heel === void 0) delete uit[k];
    else uit[k] = heel;
  }
  return uit;
}
__name(herstelAllemaal, "herstelAllemaal");

// cloudflare/fotos.ts
var MAX_BYTES = 12e6;
var TOEGESTAAN = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];
function nieuweNaam(soort, map = "voorschouw") {
  const ext = soort.includes("pdf") ? "pdf" : soort.includes("png") ? "png" : soort.includes("webp") ? "webp" : soort.includes("heic") ? "heic" : "jpg";
  const willekeurig = crypto.randomUUID().replace(/-/g, "");
  const dag = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
  return `${map}/${dag}/${willekeurig}.${ext}`;
}
__name(nieuweNaam, "nieuweNaam");
async function fotoRoutes(pad, methode, req, env, json2) {
  if (!pad.startsWith("/foto")) return null;
  if (!env.FOTOS) return json2({ error: "Fotoruimte staat nog niet aan op deze omgeving." }, 503);
  if (pad === "/foto" && methode === "POST") {
    const soort = req.headers.get("content-type") ?? "";
    if (!TOEGESTAAN.some((t) => soort.startsWith(t))) {
      return json2({ error: `Dit bestandstype kan niet: ${soort || "onbekend"}.` }, 400);
    }
    const lengte = Number(req.headers.get("content-length") ?? 0);
    if (lengte > MAX_BYTES) return json2({ error: "Deze foto is te groot (meer dan 12 MB)." }, 413);
    const naam = nieuweNaam(soort, soort.includes("pdf") ? "archief" : "voorschouw");
    await env.FOTOS.put(naam, req.body, {
      httpMetadata: { contentType: soort, cacheControl: "public, max-age=31536000, immutable" }
    });
    return json2({ ok: true, naam });
  }
  if (pad.startsWith("/foto/") && (methode === "GET" || methode === "HEAD")) {
    const naam = decodeURIComponent(pad.slice("/foto/".length));
    if (!naam || naam.includes("..")) return json2({ error: "Onbekende foto." }, 400);
    const obj = await env.FOTOS.get(naam);
    if (!obj) return json2({ error: "Deze foto bestaat niet (meer)." }, 404);
    const kop = new Headers();
    obj.writeHttpMetadata(kop);
    kop.set("etag", obj.httpEtag);
    kop.set("cache-control", "public, max-age=31536000, immutable");
    kop.set("access-control-allow-origin", "*");
    return new Response(methode === "HEAD" ? null : obj.body, { headers: kop });
  }
  if (pad.startsWith("/foto/") && methode === "DELETE") {
    const naam = decodeURIComponent(pad.slice("/foto/".length));
    if (!naam || naam.includes("..")) return json2({ error: "Onbekende foto." }, 400);
    await env.FOTOS.delete(naam);
    return json2({ ok: true });
  }
  return null;
}
__name(fotoRoutes, "fotoRoutes");
async function verhuisFotos(env, lees, schrijf, key) {
  if (!env.FOTOS) return { verplaatst: 0, bespaard: 0 };
  const lijst = await lees(key);
  if (!Array.isArray(lijst)) return { verplaatst: 0, bespaard: 0 };
  let verplaatst = 0;
  let bespaard = 0;
  for (const v of lijst) {
    if (!v || !Array.isArray(v.fotos)) continue;
    for (let i = 0; i < v.fotos.length; i++) {
      const f = v.fotos[i];
      if (typeof f !== "string" || !f.startsWith("data:")) continue;
      const m = /^data:([^;,]+)[^,]*,(.*)$/s.exec(f);
      if (!m) continue;
      try {
        const ruw = atob(m[2]);
        const bytes = new Uint8Array(ruw.length);
        for (let j = 0; j < ruw.length; j++) bytes[j] = ruw.charCodeAt(j);
        const naam = nieuweNaam(m[1] || "image/jpeg");
        await env.FOTOS.put(naam, bytes, {
          httpMetadata: { contentType: m[1] || "image/jpeg", cacheControl: "public, max-age=31536000, immutable" }
        });
        bespaard += f.length;
        v.fotos[i] = `r2:${naam}`;
        verplaatst++;
      } catch {
      }
    }
  }
  if (verplaatst > 0) await schrijf(key, lijst);
  return { verplaatst, bespaard };
}
__name(verhuisFotos, "verhuisFotos");

// cloudflare/saneerflow-uitvoering.ts
var ANTWOORDEN = ["akkoord", "niet_akkoord", "niet_thuis", "weigert"];
var BELSTATUSSEN = ["", "gebeld", "geen_gehoor", "terugbellen", "akkoord"];
var netPostcode = /* @__PURE__ */ __name((s) => String(s ?? "").replace(/\s+/g, "").toUpperCase(), "netPostcode");
function adresSleutel(a) {
  const nr = parseInt(String(a.huisnummer ?? "").replace(/\D/g, ""), 10);
  return [netPostcode(a.postcode ?? ""), Number.isFinite(nr) ? nr : 0, String(a.toevoeging ?? "").toLowerCase()];
}
__name(adresSleutel, "adresSleutel");
function sorteerAdressen(lijst) {
  return [...lijst].sort((x, y) => {
    const a = adresSleutel(x), b = adresSleutel(y);
    return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  });
}
__name(sorteerAdressen, "sorteerAdressen");
var maakId = /* @__PURE__ */ __name((voorvoegsel, sleutel) => `${voorvoegsel}-${sleutel.replace(/[^a-zA-Z0-9]/g, "").slice(0, 32)}-${Math.random().toString(36).slice(2, 8)}`, "maakId");
async function saneerUitvoeringRoutes(pad, methode, url, body, c) {
  const { env, json: json2, nuISO } = c;
  const dossierVan = /* @__PURE__ */ __name((pd) => env.DB.prepare("select * from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first(), "dossierVan");
  async function magBijCluster(clusterId) {
    if (!clusterId) {
      return c.magBeheren ? { cluster: void 0 } : { fout: json2({ error: "Dit adres is nog niet verdeeld." }, 403) };
    }
    const k = await env.DB.prepare("select * from saneer_clusters where id = ? and verwijderd = 0").bind(clusterId).first();
    if (!k) return { fout: json2({ error: "Cluster niet gevonden." }, 404) };
    if (!c.magBeheren && k.toegewezen_aan !== c.mijnUserId) {
      return { fout: json2({ error: "Dit cluster is niet aan jou toegewezen." }, 403) };
    }
    return { cluster: k };
  }
  __name(magBijCluster, "magBijCluster");
  if (pad === "/saneer/clusters/maak" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag clusters maken." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const dossier = await dossierVan(pd);
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    const { results: adressen } = await env.DB.prepare(
      "select id, postcode, huisnummer, toevoeging, straat, plaats, cluster_id from saneer_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).all();
    if (!adressen?.length) return json2({ error: "Er staan nog geen adressen in dit dossier." }, 400);
    const { results: bestaande } = await env.DB.prepare(
      "select id, postcode, handmatig from saneer_clusters where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).all();
    const perPostcode = /* @__PURE__ */ new Map();
    const handmatig = /* @__PURE__ */ new Set();
    for (const k of bestaande ?? []) {
      if (k.handmatig) handmatig.add(k.id);
      else if (!perPostcode.has(k.postcode)) perPostcode.set(k.postcode, k.id);
    }
    const teVerdelen = adressen.filter((a) => !handmatig.has(a.cluster_id ?? ""));
    const groepen = /* @__PURE__ */ new Map();
    for (const a of teVerdelen) {
      const pc = netPostcode(a.postcode) || "ONBEKEND";
      if (!groepen.has(pc)) groepen.set(pc, []);
      groepen.get(pc).push(a);
    }
    const nieuweClusters = [];
    const updates = [];
    let volgorde = 0;
    for (const pc of [...groepen.keys()].sort()) {
      const groep = sorteerAdressen(groepen.get(pc));
      let clusterId = perPostcode.get(pc);
      const straat = groep[0]?.straat ?? "";
      const eerste = groep[0]?.huisnummer ?? "";
      const laatste = groep[groep.length - 1]?.huisnummer ?? "";
      const naam = straat ? `${straat} ${eerste}${laatste && laatste !== eerste ? ` t/m ${laatste}` : ""}` : pc;
      if (!clusterId) {
        clusterId = maakId("kl", `${pd}${pc}`);
        updates.push(env.DB.prepare(
          "insert into saneer_clusters (id, pd_nummer, postcode, naam, bijgewerkt_op) values (?1, ?2, ?3, ?4, ?5)"
        ).bind(clusterId, pd, pc, naam, nuISO));
      } else {
        updates.push(env.DB.prepare("update saneer_clusters set naam = ?2, bijgewerkt_op = ?3 where id = ?1 and naam = ''").bind(clusterId, naam, nuISO));
      }
      nieuweClusters.push({ id: clusterId, postcode: pc, naam, aantal: groep.length });
      for (const a of groep) {
        updates.push(env.DB.prepare("update saneer_adressen set cluster_id = ?2, volgorde = ?3, bijgewerkt_op = ?4 where id = ?1").bind(a.id, clusterId, volgorde++, nuISO));
      }
    }
    for (let i = 0; i < updates.length; i += 30) await env.DB.batch(updates.slice(i, i + 30));
    const grens = Number(dossier.cluster_grens ?? 25);
    const teGroot = nieuweClusters.filter((k) => k.aantal > grens);
    c.log({ pd, gebeurtenis: "geclusterd", nieuw: `${nieuweClusters.length} clusters` });
    return json2({ ok: true, clusters: nieuweClusters, teGroot, grens });
  }
  if (pad === "/saneer/clusters/toewijzen" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag werk verdelen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const aan = String(body.toegewezen_aan ?? "");
    const dossier = await dossierVan(pd);
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    const r = await env.DB.prepare(
      "update saneer_clusters set toegewezen_aan = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1 and verwijderd = 0"
    ).bind(pd, aan, nuISO).run();
    const aantal = Number(r.meta?.changes ?? 0);
    if (aan) {
      await env.DB.prepare("update saneer_dossiers set status = 'verdeeld', bijgewerkt_op = ?2 where pd_nummer = ?1 and status in ('nieuw','geimporteerd')").bind(pd, nuISO).run();
    }
    c.log({ pd, gebeurtenis: "verdeeld", nieuw: aan ? `${aantal} groepen naar ${aan}` : `${aantal} groepen vrijgegeven` });
    return json2({ ok: true, aantal });
  }
  if (pad === "/saneer/cluster" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag clusters verdelen." }, 403);
    const id = String(body.id ?? "");
    const k = await env.DB.prepare("select * from saneer_clusters where id = ? and verwijderd = 0").bind(id).first();
    if (!k) return json2({ error: "Cluster niet gevonden." }, 404);
    const zetten = [];
    const waarden = [];
    for (const veld of ["naam", "starttijd", "toegewezen_aan"]) {
      if (body[veld] !== void 0) {
        zetten.push(`${veld} = ?${zetten.length + 2}`);
        waarden.push(String(body[veld] ?? ""));
      }
    }
    if (!zetten.length) return json2({ ok: true });
    await env.DB.prepare(`update saneer_clusters set ${zetten.join(", ")}, bijgewerkt_op = ?${zetten.length + 2} where id = ?1`).bind(id, ...waarden, nuISO).run();
    if (body.toegewezen_aan !== void 0) {
      c.log({ pd: String(k.pd_nummer), clusterId: id, gebeurtenis: "toegewezen", oud: String(k.toegewezen_aan ?? ""), nieuw: String(body.toegewezen_aan ?? "") });
      await env.DB.prepare("update saneer_dossiers set status = 'verdeeld', bijgewerkt_op = ?2 where pd_nummer = ?1 and status in ('nieuw','geimporteerd')").bind(String(k.pd_nummer), nuISO).run();
    }
    return json2({ ok: true });
  }
  if (pad === "/saneer/cluster/splits" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag clusters splitsen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const ids = Array.isArray(body.adres_ids) ? body.adres_ids.map(String) : [];
    const naam = String(body.naam ?? "").trim();
    if (!pd || ids.length === 0) return json2({ error: "Kies eerst adressen om af te splitsen." }, 400);
    const nieuwId = maakId("kl", `${pd}handmatig`);
    const eerste = await env.DB.prepare("select postcode from saneer_adressen where id = ?").bind(ids[0]).first();
    await env.DB.prepare(
      "insert into saneer_clusters (id, pd_nummer, postcode, naam, handmatig, bijgewerkt_op) values (?1, ?2, ?3, ?4, 1, ?5)"
    ).bind(nieuwId, pd, netPostcode(eerste?.postcode ?? ""), naam || "Afgesplitst", nuISO).run();
    for (let i = 0; i < ids.length; i += 30) {
      await env.DB.batch(ids.slice(i, i + 30).map((id) => env.DB.prepare("update saneer_adressen set cluster_id = ?2, bijgewerkt_op = ?3 where id = ?1 and pd_nummer = ?4").bind(id, nieuwId, nuISO, pd)));
    }
    c.log({ pd, clusterId: nieuwId, gebeurtenis: "gesplitst", nieuw: `${ids.length} adressen` });
    return json2({ ok: true, cluster_id: nieuwId });
  }
  if (pad === "/saneer/cluster" && methode === "GET") {
    const id = String(url.searchParams.get("id") ?? "");
    const toegang = await magBijCluster(id);
    if (toegang.fout) return toegang.fout;
    if (!toegang.cluster) return json2({ error: "Cluster niet gevonden." }, 404);
    const cluster = toegang.cluster;
    const pd = String(cluster.pd_nummer);
    const dossier = await dossierVan(pd);
    const { results: adressen } = await env.DB.prepare(
      "select * from saneer_adressen where cluster_id = ? and verwijderd = 0 order by volgorde"
    ).bind(id).all();
    const ronde = await env.DB.prepare(
      "select * from saneer_ronden where cluster_id = ? and actief = 1 order by nummer desc limit 1"
    ).bind(id).first();
    const { results: responsen } = ronde ? await env.DB.prepare("select * from saneer_responsen where ronde_id = ?").bind(String(ronde.id)).all() : { results: [] };
    const { results: beschikbaarheid } = await env.DB.prepare(
      "select b.* from saneer_beschikbaarheid b join saneer_adressen a on a.id = b.adres_id where a.cluster_id = ?"
    ).bind(id).all();
    const { results: ronden } = await env.DB.prepare(
      "select id, nummer, voorgestelde_datum, uitkomst, gestart_op, afgesloten_op from saneer_ronden where cluster_id = ? order by nummer"
    ).bind(id).all();
    return json2({ cluster, dossier, adressen: adressen ?? [], ronde: ronde ?? null, responsen: responsen ?? [], beschikbaarheid: beschikbaarheid ?? [], ronden: ronden ?? [] });
  }
  if (pad === "/saneer/ronde" && methode === "POST") {
    const clusterId = String(body.cluster_id ?? "");
    const toegang = await magBijCluster(clusterId);
    if (toegang.fout) return toegang.fout;
    if (!toegang.cluster) return json2({ error: "Cluster niet gevonden." }, 404);
    const cluster = toegang.cluster;
    const pd = String(cluster.pd_nummer);
    const dossier = await dossierVan(pd);
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    if (dossier.status === "afgeboekt") return json2({ error: "Dit dossier is afgeboekt." }, 409);
    const vorige = await env.DB.prepare("select id, nummer from saneer_ronden where cluster_id = ? order by nummer desc limit 1").bind(clusterId).first();
    const nummer = (vorige?.nummer ?? 0) + 1;
    const datum = String(body.voorgestelde_datum ?? "");
    if (vorige) {
      await env.DB.prepare("update saneer_ronden set actief = 0, afgesloten_op = ?2, uitkomst = case when uitkomst = '' then 'afgebroken' else uitkomst end where id = ?1").bind(vorige.id, nuISO).run();
    }
    const rondeId = maakId("rd", `${clusterId}${nummer}`);
    await env.DB.prepare(
      "insert into saneer_ronden (id, cluster_id, pd_nummer, nummer, voorgestelde_datum, gestart_op, gestart_door, actief) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1)"
    ).bind(rondeId, clusterId, pd, nummer, datum, nuISO, c.ikEmail).run();
    await env.DB.prepare("update saneer_dossiers set status = 'in_uitvoering', bijgewerkt_op = ?2 where pd_nummer = ?1 and status in ('nieuw','geimporteerd','verdeeld')").bind(pd, nuISO).run();
    const terug = await env.DB.prepare(
      "update saneer_adressen set belstatus = '', bijgewerkt_op = ?2 where cluster_id = ?1 and verwijderd = 0 and belstatus <> ''"
    ).bind(clusterId, nuISO).run();
    await env.DB.prepare(
      "update saneer_clusters set definitieve_datum = '' where id = ?1 and definitieve_datum <> ''"
    ).bind(clusterId).run();
    c.log({ pd, clusterId, gebeurtenis: "ronde_gestart", nieuw: `ronde ${nummer}${datum ? ` \u2014 voorstel ${datum}` : ""}, ${Number(terug.meta?.changes ?? 0)} adressen weer te bellen` });
    const naarLeiding = nummer > Number(dossier.escalatie_ronden ?? 3);
    return json2({ ok: true, ronde_id: rondeId, nummer, naarLeiding, opnieuwTeBellen: Number(terug.meta?.changes ?? 0) });
  }
  if (pad === "/saneer/respons" && methode === "POST") {
    const adresId = String(body.adres_id ?? "");
    const adres = await env.DB.prepare("select * from saneer_adressen where id = ? and verwijderd = 0").bind(adresId).first();
    if (!adres) return json2({ error: "Adres niet gevonden." }, 404);
    const toegang = await magBijCluster(String(adres.cluster_id ?? ""));
    if (toegang.fout) return toegang.fout;
    const pd = String(adres.pd_nummer);
    const antwoord = String(body.antwoord ?? "");
    if (!ANTWOORDEN.includes(antwoord)) return json2({ error: "Onbekend antwoord." }, 400);
    const meegestuurd = String(body.ronde_id ?? "");
    const ronde = meegestuurd ? await env.DB.prepare("select * from saneer_ronden where id = ?").bind(meegestuurd).first() : await env.DB.prepare("select * from saneer_ronden where cluster_id = ? and actief = 1 order by nummer desc limit 1").bind(String(adres.cluster_id)).first();
    if (!ronde) return json2({ error: "Er loopt nog geen ronde voor dit cluster." }, 409);
    const naAfsluiten = Number(ronde.actief ?? 0) === 1 ? 0 : 1;
    const responsId = maakId("rs", `${ronde.id}${adresId}`);
    await env.DB.prepare(
      "insert into saneer_responsen (id, ronde_id, adres_id, antwoord, via, opmerking, door, tijdstip, na_afsluiten) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) on conflict(ronde_id, adres_id) do update set antwoord = ?4, via = ?5, opmerking = ?6, door = ?7, tijdstip = ?8"
    ).bind(responsId, String(ronde.id), adresId, antwoord, String(body.via ?? "deur"), String(body.opmerking ?? ""), c.ikEmail, nuISO, naAfsluiten).run();
    const aanvul = [];
    const w = [];
    for (const veld of ["bewoner", "telefoon", "email", "opmerking"]) {
      const v = String(body[veld] ?? "").trim();
      if (v) {
        aanvul.push(`${veld} = ?${aanvul.length + 2}`);
        w.push(v);
      }
    }
    if (aanvul.length) {
      await env.DB.prepare(`update saneer_adressen set ${aanvul.join(", ")}, bijgewerkt_op = ?${aanvul.length + 2} where id = ?1`).bind(adresId, ...w, nuISO).run();
    }
    const kanWel = Array.isArray(body.kan_wel) ? body.kan_wel.map(String) : [];
    const kanNiet = Array.isArray(body.kan_niet) ? body.kan_niet.map(String) : [];
    const datums = [...kanWel.map((d) => [d, 1]), ...kanNiet.map((d) => [d, 0])].filter(([d]) => /^\d{4}-\d{2}-\d{2}$/.test(d));
    for (let i = 0; i < datums.length; i += 30) {
      await env.DB.batch(datums.slice(i, i + 30).map(([d, kan]) => env.DB.prepare(
        "insert into saneer_beschikbaarheid (id, adres_id, datum, kan, ronde_id, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7) on conflict(adres_id, datum) do update set kan = ?4, ronde_id = ?5, door = ?6, tijdstip = ?7"
      ).bind(maakId("bs", `${adresId}${d}`), adresId, d, kan, String(ronde.id), c.ikEmail, nuISO)));
    }
    c.log({ pd, clusterId: String(adres.cluster_id), adresId, gebeurtenis: "antwoord", nieuw: `${antwoord} via ${String(body.via ?? "deur")}` });
    const stand = await env.DB.prepare(
      "select count(*) as totaal, sum(case when r.antwoord = 'akkoord' then 1 else 0 end) as akkoord, sum(case when r.antwoord in ('niet_akkoord','weigert') then 1 else 0 end) as tegen from saneer_adressen a left join saneer_responsen r on r.adres_id = a.id and r.ronde_id = ?2 where a.cluster_id = ?1 and a.verwijderd = 0"
    ).bind(String(adres.cluster_id), String(ronde.id)).first();
    return json2({ ok: true, na_afsluiten: naAfsluiten === 1, stand });
  }
  if (pad === "/saneer/adres" && methode === "POST") {
    const id = String(body.id ?? "");
    const adres = await env.DB.prepare("select * from saneer_adressen where id = ? and verwijderd = 0").bind(id).first();
    if (!adres) return json2({ error: "Adres niet gevonden." }, 404);
    const toegang = await magBijCluster(String(adres.cluster_id ?? ""));
    if (toegang.fout) return toegang.fout;
    const patch = body.patch ?? {};
    const zetten = [];
    const w = [];
    for (const veld of ["bewoner", "telefoon", "email", "opmerking", "belstatus"]) {
      if (patch[veld] === void 0) continue;
      const v = String(patch[veld] ?? "");
      if (veld === "belstatus" && !BELSTATUSSEN.includes(v)) return json2({ error: "Onbekende belstatus." }, 400);
      zetten.push(`${veld} = ?${zetten.length + 2}`);
      w.push(v);
    }
    if (patch.belpogingen !== void 0) {
      zetten.push(`belpogingen = ?${zetten.length + 2}`);
      w.push(Number(patch.belpogingen) || 0);
    }
    if (patch.kaartje_op !== void 0) {
      zetten.push(`kaartje_op = ?${zetten.length + 2}`);
      w.push(String(patch.kaartje_op ?? ""));
    }
    if (patch.bezoeken !== void 0) {
      zetten.push(`bezoeken = ?${zetten.length + 2}`);
      w.push(Number(patch.bezoeken) || 0);
    }
    if (patch.verwijderd !== void 0) {
      zetten.push(`verwijderd = ?${zetten.length + 2}`);
      w.push(patch.verwijderd ? 1 : 0);
    }
    if (!zetten.length) return json2({ ok: true });
    await env.DB.prepare(`update saneer_adressen set ${zetten.join(", ")}, bijgewerkt_op = ?${zetten.length + 2} where id = ?1`).bind(id, ...w, nuISO).run();
    if (patch.belstatus !== void 0) {
      c.log({ pd: String(adres.pd_nummer), adresId: id, gebeurtenis: "belstatus", oud: String(adres.belstatus ?? ""), nieuw: String(patch.belstatus) });
    }
    if (patch.verwijderd) {
      c.log({
        pd: String(adres.pd_nummer),
        adresId: id,
        gebeurtenis: "adres_verwijderd",
        oud: `${adres.straat} ${adres.huisnummer}${adres.toevoeging ?? ""}`,
        nieuw: "uit de lijst gehaald"
      });
    }
    return json2({ ok: true });
  }
  if (pad === "/saneer/bellijst" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const { results } = await env.DB.prepare(
      "select a.*, k.naam as cluster_naam, k.definitieve_datum from saneer_adressen a left join saneer_clusters k on k.id = a.cluster_id where a.pd_nummer = ?1 and a.verwijderd = 0 and trim(a.telefoon) <> '' order by case a.belstatus when 'terugbellen' then 0 when '' then 1 when 'geen_gehoor' then 2 else 3 end, a.volgorde"
    ).bind(pd).all();
    return json2({ adressen: results ?? [] });
  }
  if (pad === "/saneer/cluster/datum" && methode === "POST") {
    const clusterId = String(body.cluster_id ?? "");
    const toegang = await magBijCluster(clusterId);
    if (toegang.fout) return toegang.fout;
    if (!toegang.cluster) return json2({ error: "Cluster niet gevonden." }, 404);
    const cluster = toegang.cluster;
    const datum = String(body.datum ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json2({ error: "Ongeldige datum." }, 400);
    const ronde = await env.DB.prepare("select id, nummer from saneer_ronden where cluster_id = ? and actief = 1 order by nummer desc limit 1").bind(clusterId).first();
    if (!ronde) return json2({ error: "Er loopt geen ronde voor dit cluster." }, 409);
    const stand = await env.DB.prepare(
      "select count(*) as totaal, sum(case when r.antwoord = 'akkoord' then 1 else 0 end) as akkoord from saneer_adressen a left join saneer_responsen r on r.adres_id = a.id and r.ronde_id = ?2 where a.cluster_id = ?1 and a.verwijderd = 0"
    ).bind(clusterId, ronde.id).first();
    const totaal = Number(stand?.totaal ?? 0), akkoord = Number(stand?.akkoord ?? 0);
    if (totaal === 0) return json2({ error: "Dit cluster heeft geen adressen." }, 400);
    if (akkoord < totaal) {
      return json2({ error: `Nog niet iedereen is akkoord: ${akkoord} van de ${totaal}. E\xE9n bewoner die niet kan, maakt de datum ongeldig.`, akkoord, totaal }, 409);
    }
    await env.DB.prepare("update saneer_clusters set definitieve_datum = ?2, bijgewerkt_op = ?3 where id = ?1").bind(clusterId, datum, nuISO).run();
    await env.DB.prepare("update saneer_ronden set uitkomst = 'akkoord', voorgestelde_datum = ?2 where id = ?1").bind(ronde.id, datum).run();
    const pd = String(cluster.pd_nummer);
    const dossier = await dossierVan(pd);
    const weken = Number(dossier?.poster_weken_voor ?? 2);
    const deadline = new Date(nuISO);
    deadline.setUTCDate(deadline.getUTCDate() + weken * 7);
    const dagVoorUitvoering = /* @__PURE__ */ new Date(`${datum}T12:00:00Z`);
    dagVoorUitvoering.setUTCDate(dagVoorUitvoering.getUTCDate() - 1);
    if (dagVoorUitvoering < deadline) deadline.setTime(dagVoorUitvoering.getTime());
    await env.DB.prepare(
      "insert into saneer_taken (id, pd_nummer, cluster_id, soort, deadline, bijgewerkt_op) values (?1, ?2, ?3, 'poster', ?4, ?5) on conflict(id) do update set deadline = ?4, bijgewerkt_op = ?5"
    ).bind(`tk-poster-${clusterId}`, pd, clusterId, deadline.toISOString().slice(0, 10), nuISO).run();
    const open = await env.DB.prepare("select count(*) as n from saneer_clusters where pd_nummer = ? and verwijderd = 0 and definitieve_datum = ''").bind(pd).first();
    if (Number(open?.n ?? 0) === 0) {
      await env.DB.prepare("update saneer_dossiers set status = 'datum_akkoord', bijgewerkt_op = ?2 where pd_nummer = ?1 and status not in ('afgerond','afgeboekt')").bind(pd, nuISO).run();
    }
    c.log({ pd, clusterId, gebeurtenis: "datum_vast", nieuw: datum });
    return json2({ ok: true, datum, poster_deadline: deadline.toISOString().slice(0, 10), dossierRond: Number(open?.n ?? 0) === 0 });
  }
  if (pad === "/saneer/taken" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const { results } = pd ? await env.DB.prepare(
      "select t.*, k.naam as cluster_naam, k.definitieve_datum, k.toegewezen_aan from saneer_taken t left join saneer_clusters k on k.id = t.cluster_id where t.pd_nummer = ?1 order by t.deadline"
    ).bind(pd).all() : await env.DB.prepare(
      "select t.*, k.naam as cluster_naam, k.definitieve_datum, k.toegewezen_aan, d.gebouw from saneer_taken t left join saneer_clusters k on k.id = t.cluster_id left join saneer_dossiers d on d.pd_nummer = t.pd_nummer where t.afgevinkt_op = '' and d.verwijderd = 0 and d.status not in ('afgeboekt') order by t.deadline limit 100"
    ).all();
    return json2({ taken: results ?? [] });
  }
  if (pad === "/saneer/taak" && methode === "POST") {
    const id = String(body.id ?? "");
    const taak = await env.DB.prepare("select * from saneer_taken where id = ?").bind(id).first();
    if (!taak) return json2({ error: "Taak niet gevonden." }, 404);
    const afvinken = body.afvinken !== false;
    await env.DB.prepare(
      "update saneer_taken set afgevinkt_op = ?2, afgevinkt_door = ?3, foto = ?4, notitie = ?5, bijgewerkt_op = ?6 where id = ?1"
    ).bind(id, afvinken ? nuISO : "", afvinken ? c.ikEmail : "", String(body.foto ?? taak.foto ?? ""), String(body.notitie ?? taak.notitie ?? ""), nuISO).run();
    const pd = String(taak.pd_nummer);
    const open = await env.DB.prepare("select count(*) as n from saneer_taken where pd_nummer = ? and afgevinkt_op = ''").bind(pd).first();
    if (afvinken && Number(open?.n ?? 0) === 0) {
      await env.DB.prepare("update saneer_dossiers set status = 'poster_geplaatst', bijgewerkt_op = ?2 where pd_nummer = ?1 and status = 'datum_akkoord'").bind(pd, nuISO).run();
    }
    c.log({ pd, clusterId: String(taak.cluster_id ?? ""), gebeurtenis: afvinken ? "poster_geplaatst" : "poster_teruggezet" });
    return json2({ ok: true });
  }
  if (pad === "/saneer/afronden" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag een dossier afronden." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const dossier = await dossierVan(pd);
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    const afboeken = body.afboeken === true;
    const gaten = await env.DB.prepare(
      "select (select count(*) from saneer_clusters where pd_nummer = ?1 and verwijderd = 0) as clusters, (select count(*) from saneer_clusters where pd_nummer = ?1 and verwijderd = 0 and definitieve_datum = '') as zonder_datum, (select count(*) from saneer_clusters where pd_nummer = ?1 and verwijderd = 0 and ifnull(toegewezen_aan,'') = '') as onverdeeld, (select count(*) from saneer_taken where pd_nummer = ?1 and afgevinkt_op = '') as taken_open, (select count(*) from saneer_afgekeurd where pd_nummer = ?1 and opgelost = 0) as afgekeurd, (select count(*) from saneer_adressen where pd_nummer = ?1 and verwijderd = 0 and trim(telefoon) = '' and belstatus <> 'weigert') as zonder_nummer"
    ).bind(pd).first();
    const belet = [];
    if (Number(gaten?.clusters ?? 0) === 0) belet.push("Er zijn nog geen clusters gemaakt.");
    if (Number(gaten?.zonder_datum ?? 0) > 0) belet.push(`${gaten.zonder_datum} cluster(s) hebben nog geen definitieve datum.`);
    if (Number(gaten?.taken_open ?? 0) > 0) belet.push(`${gaten.taken_open} poster(s) zijn nog niet opgehangen.`);
    if (Number(gaten?.zonder_nummer ?? 0) > 0) {
      belet.push(`Van ${gaten.zonder_nummer} adres(sen) is geen telefoonnummer bekend \u2014 daar is niemand te bereiken.`);
    }
    if (afboeken && dossier.status !== "afgerond") belet.push("Rond het dossier eerst af voordat je het afboekt.");
    if (belet.length && body.toch !== true) {
      return json2({ error: `Nog niet klaar om af te ronden. ${belet.join(" ")}`, belet, gaten }, 409);
    }
    if (afboeken) {
      await env.DB.prepare("update saneer_dossiers set status = 'afgeboekt', afgeboekt_op = ?2, bijgewerkt_op = ?2 where pd_nummer = ?1").bind(pd, nuISO).run();
      c.log({ pd, gebeurtenis: "afgeboekt" });
    } else {
      await env.DB.prepare("update saneer_dossiers set status = 'afgerond', afgerond_op = ?2, bijgewerkt_op = ?2 where pd_nummer = ?1").bind(pd, nuISO).run();
      c.log({ pd, gebeurtenis: "afgerond", nieuw: belet.length ? `met ${belet.length} openstaand punt(en)` : "" });
    }
    return json2({ ok: true, belet });
  }
  if (pad === "/saneer/export" && methode === "GET") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag exporteren." }, 403);
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const dossier = await dossierVan(pd);
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    const [clusters, adressen, ronden, responsen, taken, log] = await Promise.all([
      env.DB.prepare("select * from saneer_clusters where pd_nummer = ? and verwijderd = 0 order by postcode").bind(pd).all(),
      env.DB.prepare("select * from saneer_adressen where pd_nummer = ? and verwijderd = 0 order by volgorde").bind(pd).all(),
      env.DB.prepare("select * from saneer_ronden where pd_nummer = ? order by cluster_id, nummer").bind(pd).all(),
      env.DB.prepare("select r.* from saneer_responsen r join saneer_adressen a on a.id = r.adres_id where a.pd_nummer = ?").bind(pd).all(),
      env.DB.prepare("select * from saneer_taken where pd_nummer = ?").bind(pd).all(),
      env.DB.prepare("select * from saneer_log where pd_nummer = ? order by id").bind(pd).all()
    ]);
    return json2({
      dossier,
      clusters: clusters.results ?? [],
      adressen: adressen.results ?? [],
      ronden: ronden.results ?? [],
      responsen: responsen.results ?? [],
      taken: taken.results ?? [],
      log: log.results ?? []
    });
  }
  return null;
}
__name(saneerUitvoeringRoutes, "saneerUitvoeringRoutes");

// cloudflare/saneerflow.ts
var PD_PATROON = /^PD\d+$/i;
var netPd = /* @__PURE__ */ __name((s) => String(s ?? "").trim().toUpperCase().replace(/\s+/g, ""), "netPd");
var DOSSIER_STATUSSEN = [
  "nieuw",
  "geimporteerd",
  "verdeeld",
  "in_uitvoering",
  "datum_akkoord",
  "poster_geplaatst",
  "afgerond",
  "afgeboekt"
];
var REGIOS = ["Zuid", "Noord"];
var INVOER = [
  "regio",
  "opdrachtgever",
  "gebouw",
  "omschrijving",
  "uitvoering_van",
  "uitvoering_tot",
  "starttijd",
  "poster_weken_voor",
  "escalatie_ronden",
  "cluster_grens"
];
var getal = /* @__PURE__ */ __name((v, standaard) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : standaard;
}, "getal");
async function saneerRoutes(pad, methode, url, body, c) {
  const { env, json: json2, nuISO } = c;
  if (pad === "/saneer/dossiers" && methode === "GET") {
    const { results } = await env.DB.prepare(
      "select d.*, (select count(*) from saneer_adressen a where a.pd_nummer = d.pd_nummer and a.verwijderd = 0) as adressen, (select count(*) from saneer_clusters k where k.pd_nummer = d.pd_nummer and k.verwijderd = 0) as clusters from saneer_dossiers d where d.verwijderd = 0 order by d.aangemaakt_op desc"
    ).all();
    return json2({ dossiers: results ?? [] });
  }
  if (pad === "/saneer/dossier" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    if (!pd) return json2({ error: "pd ontbreekt." }, 400);
    const dossier = await env.DB.prepare("select * from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first();
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    const { results: clusters } = await env.DB.prepare(
      "select k.*, (select count(*) from saneer_adressen a where a.cluster_id = k.id and a.verwijderd = 0) as adressen from saneer_clusters k where k.pd_nummer = ? and k.verwijderd = 0 order by k.postcode"
    ).bind(pd).all();
    const tellingen = await env.DB.prepare(
      "select count(*) as totaal, sum(case when telefoon_bij_import = 1 then 1 else 0 end) as met_telefoon, sum(case when telefoon_bij_import = 0 then 1 else 0 end) as zonder_telefoon from saneer_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).first();
    return json2({ dossier, clusters: clusters ?? [], aantallen: tellingen ?? {} });
  }
  if (pad === "/saneer/dossier" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag dossiers aanmaken of wijzigen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    if (!pd) return json2({ error: "Vul een PD-nummer in." }, 400);
    if (!PD_PATROON.test(pd)) return json2({ error: `"${pd}" is geen geldig PD-nummer. Verwacht: PD gevolgd door cijfers, bijvoorbeeld PD123456.` }, 400);
    const bestaand = await env.DB.prepare("select pd_nummer, verwijderd from saneer_dossiers where pd_nummer = ?").bind(pd).first();
    const bijwerken = body.bijwerken === true;
    if (bestaand && !bijwerken) {
      if (bestaand.verwijderd) {
        return json2({
          error: `Dossier ${pd} bestaat al, maar is verwijderd. Wil je het terughalen? Alle adressen en afspraken die eraan hingen komen dan mee.`,
          bestaat: true,
          verwijderd: true
        }, 409);
      }
      return json2({ error: `Er bestaat al een dossier met nummer ${pd}.`, bestaat: true }, 409);
    }
    if (!bestaand && bijwerken) return json2({ error: "Dossier niet gevonden." }, 404);
    const regio = String(body.regio ?? "");
    if (!bijwerken && !REGIOS.includes(regio)) {
      return json2({ error: "Kies een regio: Zuid of Noord." }, 400);
    }
    const van = String(body.uitvoering_van ?? ""), tot = String(body.uitvoering_tot ?? "");
    if (van && tot && van > tot) return json2({ error: "De uitvoeringsperiode eindigt v\xF3\xF3r hij begint." }, 400);
    const waarden = {};
    for (const veld of INVOER) if (veld in body) waarden[veld] = body[veld];
    waarden.poster_weken_voor = getal(body.poster_weken_voor, 2);
    waarden.escalatie_ronden = getal(body.escalatie_ronden, 3);
    waarden.cluster_grens = getal(body.cluster_grens, 25);
    if (bestaand) {
      const velden = Object.keys(waarden);
      const zet = velden.map((v, i) => `${v} = ?${i + 3}`).join(", ");
      await env.DB.prepare(`update saneer_dossiers set ${zet}, bijgewerkt_op = ?2 where pd_nummer = ?1`).bind(pd, nuISO, ...velden.map((v) => String(waarden[v] ?? ""))).run();
      c.log({ pd, gebeurtenis: "dossier_bijgewerkt" });
    } else {
      await env.DB.prepare(
        "insert into saneer_dossiers (pd_nummer, regio, opdrachtgever, gebouw, omschrijving, uitvoering_van, uitvoering_tot, starttijd, poster_weken_voor, escalatie_ronden, cluster_grens, status, aangemaakt_door, aangemaakt_op, bijgewerkt_op) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, 'nieuw', ?12, ?13, ?13)"
      ).bind(
        pd,
        regio,
        String(body.opdrachtgever ?? ""),
        String(body.gebouw ?? ""),
        String(body.omschrijving ?? ""),
        van,
        tot,
        String(body.starttijd ?? "08:00"),
        waarden.poster_weken_voor,
        waarden.escalatie_ronden,
        waarden.cluster_grens,
        c.ikEmail,
        nuISO
      ).run();
      c.log({ pd, gebeurtenis: "dossier_aangemaakt", nieuw: regio });
    }
    return json2({ ok: true, pd_nummer: pd });
  }
  if (pad === "/saneer/dossier/status" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag de status wijzigen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const status = String(body.status ?? "");
    if (!DOSSIER_STATUSSEN.includes(status)) return json2({ error: "Onbekende status." }, 400);
    const nu = await env.DB.prepare("select status from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first();
    if (!nu) return json2({ error: "Dossier niet gevonden." }, 404);
    if (nu.status === "afgeboekt" && status !== "afgerond") {
      return json2({ error: "Dit dossier is afgeboekt. Heropen het eerst om nog iets te wijzigen." }, 409);
    }
    await env.DB.prepare("update saneer_dossiers set status = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1").bind(pd, status, nuISO).run();
    c.log({ pd, gebeurtenis: nu.status === "afgeboekt" ? "dossier_heropend" : "status", oud: nu.status, nieuw: status });
    return json2({ ok: true, status });
  }
  if (pad === "/saneer/dossier" && methode === "DELETE") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag een dossier verwijderen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const terug = body.herstel === true;
    const r = await env.DB.prepare("update saneer_dossiers set verwijderd = ?2, bijgewerkt_op = ?3 where pd_nummer = ?1").bind(pd, terug ? 0 : 1, nuISO).run();
    if (!r.meta.changes) return json2({ error: "Dossier niet gevonden." }, 404);
    c.log({ pd, gebeurtenis: terug ? "dossier_hersteld" : "dossier_verwijderd" });
    return json2({ ok: true });
  }
  if (pad === "/saneer/mapping" && methode === "GET") {
    const og = String(url.searchParams.get("opdrachtgever") ?? "").trim().toLowerCase();
    if (!og) return json2({ mapping: null });
    const r = await env.DB.prepare("select mapping, kop_index from saneer_mappings where opdrachtgever = ?").bind(og).first();
    if (!r) return json2({ mapping: null });
    try {
      return json2({ mapping: JSON.parse(r.mapping), kopIndex: r.kop_index });
    } catch {
      return json2({ mapping: null });
    }
  }
  if (pad === "/saneer/adressen" && methode === "POST") {
    if (!c.magBeheren) return json2({ error: "Alleen een beheerder mag adressen inlezen." }, 403);
    const pd = netPd(String(body.pd_nummer ?? ""));
    const lijst = Array.isArray(body.adressen) ? body.adressen : [];
    const afgekeurd = Array.isArray(body.afgekeurd) ? body.afgekeurd : [];
    if (!pd) return json2({ error: "pd_nummer ontbreekt." }, 400);
    if (lijst.length > 5e3) return json2({ error: "Te veel adressen in \xE9\xE9n keer (maximaal 5000)." }, 400);
    const dossier = await env.DB.prepare("select status from saneer_dossiers where pd_nummer = ? and verwijderd = 0").bind(pd).first();
    if (!dossier) return json2({ error: "Dossier niet gevonden." }, 404);
    if (dossier.status === "afgeboekt") return json2({ error: "Dit dossier is afgeboekt." }, 409);
    const { results: bestaandeRijen } = await env.DB.prepare(
      "select postcode, huisnummer, toevoeging from saneer_adressen where pd_nummer = ? and verwijderd = 0"
    ).bind(pd).all();
    const sleutel = /* @__PURE__ */ __name((p, h, t) => `${String(p).replace(/\s+/g, "").toUpperCase()}|${String(h).trim()}|${String(t).trim().toLowerCase()}`, "sleutel");
    const bestaat = new Set((bestaandeRijen ?? []).map((r) => sleutel(r.postcode, r.huisnummer, r.toevoeging)));
    let toegevoegd = 0, overgeslagen = 0;
    const nieuweRijen = lijst.filter((a) => {
      const k = sleutel(String(a.postcode ?? ""), String(a.huisnummer ?? ""), String(a.toevoeging ?? ""));
      if (bestaat.has(k)) {
        overgeslagen++;
        return false;
      }
      bestaat.add(k);
      return true;
    });
    for (let i = 0; i < nieuweRijen.length; i += 30) {
      const stuk = nieuweRijen.slice(i, i + 30).map(
        (a) => env.DB.prepare(
          "insert into saneer_adressen (id, pd_nummer, cluster_id, volgorde, straat, huisnummer, toevoeging, postcode, plaats, bewoner, telefoon, email, opmerking, telefoon_bij_import, bijgewerkt_op) values (?1, ?2, '', ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) on conflict(id) do nothing"
        ).bind(
          String(a.id ?? ""),
          pd,
          Number(a.volgorde ?? 0),
          String(a.straat ?? ""),
          String(a.huisnummer ?? ""),
          String(a.toevoeging ?? ""),
          String(a.postcode ?? ""),
          String(a.plaats ?? ""),
          String(a.bewoner ?? ""),
          String(a.telefoon ?? ""),
          String(a.email ?? ""),
          String(a.opmerking ?? ""),
          String(a.telefoon ?? "").trim() ? 1 : 0,
          nuISO
        )
      );
      await env.DB.batch(stuk);
      toegevoegd += stuk.length;
    }
    for (let i = 0; i < afgekeurd.length; i += 30) {
      const stuk = afgekeurd.slice(i, i + 30).map(
        (r) => env.DB.prepare(
          "insert into saneer_afgekeurd (id, pd_nummer, bron_regel, ruw, reden, aangemaakt_op) values (?1, ?2, ?3, ?4, ?5, ?6) on conflict(id) do nothing"
        ).bind(String(r.id ?? ""), pd, Number(r.bron_regel ?? 0), JSON.stringify(r.ruw ?? {}), String(r.reden ?? ""), nuISO)
      );
      await env.DB.batch(stuk);
    }
    const og = String(body.opdrachtgever ?? "").trim().toLowerCase();
    if (og && body.mapping) {
      await env.DB.prepare(
        "insert into saneer_mappings (opdrachtgever, mapping, kop_index, gebruikt_op) values (?1, ?2, ?3, ?4) on conflict(opdrachtgever) do update set mapping = ?2, kop_index = ?3, gebruikt_op = ?4"
      ).bind(og, JSON.stringify(body.mapping), Number(body.kopIndex ?? 0), nuISO).run();
    }
    if (toegevoegd > 0 && dossier.status === "nieuw") {
      await env.DB.prepare("update saneer_dossiers set status = 'geimporteerd', bijgewerkt_op = ?2 where pd_nummer = ?1").bind(pd, nuISO).run();
    }
    c.log({ pd, gebeurtenis: "geimporteerd", nieuw: `${toegevoegd} toegevoegd, ${overgeslagen} bestonden al, ${afgekeurd.length} afgekeurd` });
    return json2({ ok: true, toegevoegd, overgeslagen, afgekeurd: afgekeurd.length });
  }
  if (pad === "/saneer/adressen" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    if (!pd) return json2({ error: "pd ontbreekt." }, 400);
    const { results } = c.magBeheren ? await env.DB.prepare("select * from saneer_adressen where pd_nummer = ?1 and verwijderd = 0 order by volgorde").bind(pd).all() : await env.DB.prepare(
      "select a.* from saneer_adressen a join saneer_clusters k on k.id = a.cluster_id where a.pd_nummer = ?1 and a.verwijderd = 0 and k.toegewezen_aan = ?2 order by a.volgorde"
    ).bind(pd, c.mijnUserId ?? "__geen__").all();
    return json2({ adressen: results ?? [], alleenEigen: !c.magBeheren });
  }
  if (pad === "/saneer/afgekeurd" && methode === "GET") {
    const pd = netPd(url.searchParams.get("pd") ?? "");
    const { results } = await env.DB.prepare(
      "select * from saneer_afgekeurd where pd_nummer = ? and opgelost = 0 order by bron_regel"
    ).bind(pd).all();
    return json2({ regels: results ?? [] });
  }
  const vervolg = await saneerUitvoeringRoutes(pad, methode, url, body, c);
  if (vervolg) return vervolg;
  return null;
}
__name(saneerRoutes, "saneerRoutes");

// cloudflare/worker.ts
var SyncHub = class {
  static {
    __name(this, "SyncHub");
  }
  state;
  constructor(state) {
    this.state = state;
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/broadcast")) {
      const msg = await request.text();
      for (const ws of this.state.getWebSockets()) {
        try {
          ws.send(msg);
        } catch {
        }
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("not found", { status: 404 });
  }
  // Client stuurt af en toe "ping" om de verbinding warm te houden → wij antwoorden "pong".
  webSocketMessage(ws, message) {
    if (message === "ping") {
      try {
        ws.send("pong");
      } catch {
      }
    }
  }
  webSocketClose(ws) {
    try {
      ws.close();
    } catch {
    }
  }
  webSocketError() {
  }
};
function broadcast(env, ctx, msg) {
  try {
    const stub = env.SYNC_HUB.get(env.SYNC_HUB.idFromName("global"));
    ctx.waitUntil(stub.fetch("https://hub/broadcast", { method: "POST", body: JSON.stringify(msg) }));
  } catch {
  }
}
__name(broadcast, "broadcast");
var CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
  "Vary": "Origin"
};
function kiesOrigin(req, env) {
  const toegestaan = (env.ALLOWED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!toegestaan.length) return "*";
  const origin = req.headers.get("Origin") ?? "";
  return toegestaan.includes(origin) ? origin : toegestaan[0];
}
__name(kiesOrigin, "kiesOrigin");
function corsVoor(req, env) {
  return { ...CORS, "Access-Control-Allow-Origin": kiesOrigin(req, env) };
}
__name(corsVoor, "corsVoor");
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
__name(json, "json");
function anthropicTekstUit(system) {
  if (typeof system === "string") return system;
  if (Array.isArray(system)) return system.map((b) => b?.text ?? "").join("\n");
  return "";
}
__name(anthropicTekstUit, "anthropicTekstUit");
function blokNaarOpenAI(blok) {
  const b = blok;
  if (b?.type === "text") return { type: "text", text: b.text ?? "" };
  if (b?.type === "image") {
    const url = `data:${b.source?.media_type ?? "image/jpeg"};base64,${b.source?.data ?? ""}`;
    return { type: "image_url", image_url: { url } };
  }
  if (b?.type === "document") {
    const url = `data:${b.source?.media_type ?? "application/pdf"};base64,${b.source?.data ?? ""}`;
    return { type: "file", file: { filename: "document.pdf", file_data: url } };
  }
  return { type: "text", text: "" };
}
__name(blokNaarOpenAI, "blokNaarOpenAI");
function naarOpenAIVerzoek(body, model) {
  const berichten = [];
  const sys = anthropicTekstUit(body.system);
  if (sys) berichten.push({ role: "system", content: sys });
  for (const m of Array.isArray(body.messages) ? body.messages : []) {
    const inhoud = Array.isArray(m.content) ? m.content.map(blokNaarOpenAI) : m.content;
    berichten.push({ role: m.role ?? "user", content: inhoud });
  }
  const uit = {
    model,
    messages: berichten,
    max_tokens: body.max_tokens ?? 4e3
  };
  if (typeof body.temperature === "number") uit.temperature = body.temperature;
  if (Array.isArray(body.tools)) {
    uit.tools = body.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description ?? "", parameters: t.input_schema ?? { type: "object", properties: {} } }
    }));
  }
  const tc = body.tool_choice;
  if (tc?.type === "tool" && tc.name) uit.tool_choice = { type: "function", function: { name: tc.name } };
  else if (tc?.type === "any") uit.tool_choice = "required";
  else if (tc?.type === "auto") uit.tool_choice = "auto";
  return uit;
}
__name(naarOpenAIVerzoek, "naarOpenAIVerzoek");
function naarAnthropicAntwoord(data) {
  const msg = data?.choices?.[0]?.message;
  const content = [];
  if (msg?.content) content.push({ type: "text", text: msg.content });
  for (const tc of msg?.tool_calls ?? []) {
    let input = {};
    try {
      input = JSON.parse(tc.function?.arguments ?? "{}");
    } catch {
      input = {};
    }
    content.push({ type: "tool_use", name: tc.function?.name ?? "", input });
  }
  return { content };
}
__name(naarAnthropicAntwoord, "naarAnthropicAntwoord");
function bufToB64url(buf) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
__name(bufToB64url, "bufToB64url");
function b64urlToBuf(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
__name(b64urlToBuf, "b64urlToBuf");
var PBKDF2_ITER = 1e5;
async function hashWachtwoord(wachtwoord, saltIn, iteraties = PBKDF2_ITER) {
  const salt = saltIn ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(wachtwoord), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iteraties, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${iteraties}$${bufToB64url(salt)}$${bufToB64url(bits)}`;
}
__name(hashWachtwoord, "hashWachtwoord");
function tijdveiligGelijk(a, b) {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
__name(tijdveiligGelijk, "tijdveiligGelijk");
async function verifieerWachtwoord(wachtwoord, opgeslagen) {
  const delen = opgeslagen.split("$");
  if (delen.length !== 4 || delen[0] !== "pbkdf2") return false;
  const iteraties = Number(delen[1]);
  if (!Number.isFinite(iteraties) || iteraties < 1e3 || iteraties > 1e6) return false;
  const salt = b64urlToBuf(delen[2]);
  const opnieuw = await hashWachtwoord(wachtwoord, salt, iteraties);
  return tijdveiligGelijk(opnieuw, opgeslagen);
}
__name(verifieerWachtwoord, "verifieerWachtwoord");
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
__name(hmac, "hmac");
var JWT_GELDIG_SEC = 60 * 60 * 24 * 30;
async function maakToken(email, secret, nu) {
  const header = bufToB64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = bufToB64url(new TextEncoder().encode(JSON.stringify({ email, iat: nu, exp: nu + JWT_GELDIG_SEC })));
  const data = `${header}.${payload}`;
  return `${data}.${bufToB64url(await hmac(secret, data))}`;
}
__name(maakToken, "maakToken");
async function leesToken(token, secret, nu) {
  const p = token.split(".");
  if (p.length !== 3) return null;
  const verwacht = bufToB64url(await hmac(secret, `${p[0]}.${p[1]}`));
  if (!tijdveiligGelijk(p[2], verwacht)) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64urlToBuf(p[1])));
    if (!body.email || !body.exp || body.exp < nu) return null;
    return { email: String(body.email).toLowerCase(), iat: Number(body.iat) || 0 };
  } catch {
    return null;
  }
}
__name(leesToken, "leesToken");
var _revocatieCache = null;
async function geldigVanafKaart(env) {
  const nu = Date.now();
  if (_revocatieCache && nu - _revocatieCache.op < 6e4) return _revocatieCache.kaart;
  const kaart = /* @__PURE__ */ new Map();
  try {
    const { results } = await env.DB.prepare("select email, geldig_vanaf from token_revocaties").all();
    for (const r of results ?? []) kaart.set(r.email, Number(r.geldig_vanaf) || 0);
  } catch {
  }
  _revocatieCache = { op: nu, kaart };
  return kaart;
}
__name(geldigVanafKaart, "geldigVanafKaart");
async function tokenIngetrokken(env, email, iat) {
  const vanaf = (await geldigVanafKaart(env)).get(email);
  return !!vanaf && iat < vanaf;
}
__name(tokenIngetrokken, "tokenIngetrokken");
async function trekTokensIn(env, email, nuSec) {
  try {
    await env.DB.prepare(
      "insert into token_revocaties (email, geldig_vanaf) values (?1, ?2) on conflict(email) do update set geldig_vanaf = ?2"
    ).bind(email, nuSec).run();
  } catch {
  }
  _revocatieCache = null;
}
__name(trekTokensIn, "trekTokensIn");
function htmlEscape(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
__name(htmlEscape, "htmlEscape");
async function stuurWachtwoordMail(env, email, wachtwoord, appUrl) {
  if (!env.RESEND_API_KEY) return false;
  const from = env.RESEND_FROM || "Wire Solutions <onboarding@resend.dev>";
  const url = appUrl || "https://wire-solutions-dashboard.vercel.app";
  const ww = htmlEscape(wachtwoord);
  const veiligeUrl = htmlEscape(url);
  const html = `<!DOCTYPE html><html lang="nl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background-color:#f1f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f1f5f9;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:560px;max-width:560px;background-color:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(16,24,40,.1);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <tr><td style="background-color:#ea580c;padding:28px 32px;">
    <span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:.3px;">Wire Solutions</span>
    <div style="font-size:12px;font-weight:600;color:#ffffff;opacity:.85;letter-spacing:1px;text-transform:uppercase;margin-top:4px;">Wachtwoord opnieuw ingesteld</div>
  </td></tr>
  <tr><td style="padding:32px 32px 8px 32px;">
    <p style="margin:0;font-size:16px;color:#1e293b;font-weight:700;">Nieuw wachtwoord aangevraagd</p>
    <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#1e293b;">Je hebt een nieuw wachtwoord aangevraagd voor het Wire Solutions dashboard. Hiermee log je direct weer in.</p>
  </td></tr>
  <tr><td style="padding:20px 32px 8px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#fff7ed;border:1px solid #e2e8f0;border-radius:12px;"><tr><td style="padding:18px 20px;">
      <p style="margin:0 0 14px 0;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#c2410c;">Jouw nieuwe inloggegevens</p>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px;color:#1e293b;">
        <tr><td style="padding:6px 0;color:#64748b;width:120px;">Website</td><td style="padding:6px 0;"><a href="${veiligeUrl}" style="color:#c2410c;text-decoration:none;font-weight:600;">${veiligeUrl}</a></td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">E-mailadres</td><td style="padding:6px 0;font-weight:600;">${htmlEscape(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Wachtwoord</td><td style="padding:6px 0;"><span style="display:inline-block;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;padding:6px 12px;font-family:'Courier New',Courier,monospace;font-size:15px;font-weight:700;color:#1e293b;letter-spacing:.5px;">${ww}</span></td></tr>
      </table>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:12px 32px 8px 32px;">
    <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background-color:#ea580c;">
      <a href="${veiligeUrl}" style="display:inline-block;padding:13px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">Inloggen op het dashboard &rarr;</a>
    </td></tr></table>
  </td></tr>
  <tr><td style="padding:16px 32px 8px 32px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;line-height:1.6;color:#1e293b;">
      <tr><td style="padding:3px 0;"><span style="color:#ea580c;font-weight:800;">&#9656;</span>&nbsp; Wijzig dit wachtwoord na je login naar iets persoonlijks.</td></tr>
      <tr><td style="padding:3px 0;"><span style="color:#ea580c;font-weight:800;">&#9656;</span>&nbsp; Heb jij dit niet aangevraagd? Neem dan contact op met je leidinggevende.</td></tr>
    </table>
  </td></tr>
  <tr><td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;">
    <p style="margin:0;font-size:11px;line-height:1.5;color:#94a3b8;">Deze mail is automatisch verstuurd vanuit het Wire Solutions dashboard.</p>
  </td></tr>
</table></td></tr></table></body></html>`;
  const tekst = [
    "Wire Solutions \u2014 nieuw wachtwoord",
    "",
    "Je hebt een nieuw wachtwoord aangevraagd voor het Wire Solutions dashboard.",
    "",
    `Website:    ${url}`,
    `E-mail:     ${email}`,
    `Wachtwoord: ${wachtwoord}`,
    "",
    "Wijzig dit wachtwoord na je login. Heb jij dit niet aangevraagd? Neem contact op met je leidinggevende."
  ].join("\n");
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [email], subject: "Je nieuwe wachtwoord voor het Wire Solutions dashboard", html, text: tekst })
    });
    return r.ok;
  } catch {
    return false;
  }
}
__name(stuurWachtwoordMail, "stuurWachtwoordMail");
async function rolVan(env, email) {
  const r = await env.DB.prepare("select rol, boekhouding from app_roles where email = ?").bind(email).first();
  return r ? { rol: r.rol, boekhouding: !!r.boekhouding } : null;
}
__name(rolVan, "rolVan");
function magAlles(rol) {
  return rol === "eigenaar" || rol === "hr" || rol === "beheer";
}
__name(magAlles, "magAlles");
async function hoortBijHetTeam(env, email) {
  const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first();
  if (!rij) return true;
  let lijst;
  try {
    lijst = JSON.parse(rij.data);
  } catch {
    return false;
  }
  if (!Array.isArray(lijst) || !lijst.length) return true;
  return lijst.some(
    (u) => String(u?.email ?? "").trim().toLowerCase() === email
  );
}
__name(hoortBijHetTeam, "hoortBijHetTeam");
var BEWAARMAANDEN = 6;
async function wisPersoonsgegevens(env, projectId, nuISO) {
  const a = await env.DB.prepare(
    "update bodem_adressen set bewoner = '', telefoon = '', email = '', bijgewerkt_op = ?2 where project_id = ?1 and (bewoner <> '' or telefoon <> '' or email <> '')"
  ).bind(projectId, nuISO).run();
  const b = await env.DB.prepare(
    "update bodem_afspraken set naam = '', telefoon = '', email = '' where project_id = ?1 and (naam <> '' or telefoon <> '' or email <> '')"
  ).bind(projectId).run();
  await env.DB.prepare("update bodem_projecten set gewist_op = ?2 where project_id = ?1").bind(projectId, nuISO).run();
  return { adressen: a.meta.changes ?? 0, afspraken: b.meta.changes ?? 0 };
}
__name(wisPersoonsgegevens, "wisPersoonsgegevens");
function logBodem(env, ctx, v) {
  ctx.waitUntil(
    env.DB.prepare(
      "insert into bodem_log (project_id, adres_id, gebeurtenis, oud, nieuw, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(v.projectId, v.adresId ?? "", v.gebeurtenis, v.oud ?? "", v.nieuw ?? "", v.door, v.tijd).run().then(() => void 0).catch((e) => console.log("[log] wegschrijven mislukt:", String(e).slice(0, 120)))
  );
  spiegelInsert(env, ctx, "bodem_log", {
    project_id: v.projectId,
    adres_id: v.adresId ?? "",
    gebeurtenis: v.gebeurtenis,
    oud: v.oud ?? "",
    nieuw: v.nieuw ?? "",
    door: v.door,
    tijdstip: v.tijd
  });
}
__name(logBodem, "logBodem");
async function mijnUserId(env, email) {
  const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first();
  if (!rij) return null;
  try {
    const lijst = JSON.parse(rij.data);
    if (!Array.isArray(lijst)) return null;
    const ik = lijst.find((u) => String(u?.email ?? "").trim().toLowerCase() === email);
    return ik ? String(ik.id) : null;
  } catch {
    return null;
  }
}
__name(mijnUserId, "mijnUserId");
var ROLLEN = /* @__PURE__ */ new Set(["eigenaar", "hr", "beheer", "monteur"]);
async function zeefRollen(env, binnen) {
  if (!Array.isArray(binnen)) return binnen;
  const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first();
  if (!rij) return binnen;
  let oud;
  try {
    oud = JSON.parse(rij.data);
  } catch {
    return binnen;
  }
  if (!Array.isArray(oud)) return binnen;
  const bekend = /* @__PURE__ */ new Map();
  for (const u of oud) {
    const e = String(u?.email ?? "").trim().toLowerCase();
    if (e) bekend.set(e, { rol: u?.rol, beheerRechten: u?.beheerRechten });
  }
  return binnen.map((u) => {
    const e = String(u?.email ?? "").trim().toLowerCase();
    const was = bekend.get(e);
    if (!was) return { ...u, rol: "monteur", beheerRechten: void 0 };
    return { ...u, rol: was.rol, beheerRechten: was.beheerRechten };
  });
}
__name(zeefRollen, "zeefRollen");
var BOEKHOUD_ONDERDELEN = ["loonstroken", "facturen", "boetes"];
function afgeschermdVoor(rol) {
  if (magAlles(rol?.rol)) return /* @__PURE__ */ new Set();
  if (rol?.boekhouding) return /* @__PURE__ */ new Set();
  return new Set(BOEKHOUD_ONDERDELEN);
}
__name(afgeschermdVoor, "afgeschermdVoor");
async function seedRollenUitUsers(env, users, nuISO, ctx) {
  if (!Array.isArray(users)) return;
  const stmts = [];
  const spiegelRijen = [];
  for (const u of users) {
    const email = String(u?.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const gevraagd = String(u?.rol ?? "monteur");
    const rol = ROLLEN.has(gevraagd) ? gevraagd : "monteur";
    const rechten = Array.isArray(u?.beheerRechten) ? u.beheerRechten : null;
    const boekhouding = magAlles(rol) || rol === "beheer" && (rechten === null || rechten.some((r) => ["facturen", "loonstroken", "boetes", "medewerkers"].includes(r)));
    stmts.push(
      env.DB.prepare(
        "insert into app_roles (email, rol, boekhouding, bijgewerkt_op) values (?1, ?2, ?3, ?4) on conflict(email) do update set rol = ?2, boekhouding = ?3, bijgewerkt_op = ?4"
      ).bind(email, rol, boekhouding ? 1 : 0, nuISO)
    );
    spiegelRijen.push({ email, rol, boekhouding, bijgewerkt_op: nuISO });
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (ctx && spiegelRijen.length) spiegelUpsert(env, ctx, "app_roles", spiegelRijen, "email");
}
__name(seedRollenUitUsers, "seedRollenUitUsers");
var worker_default = {
  // Dagelijkse opruiming: projecten die langer dan de bewaartermijn geleden zijn afgerond, verliezen
  // hun persoonsgegevens. Draait via een cron-trigger (zie wrangler.toml), zodat het ook gebeurt als
  // er niemand inlogt — een bewaartermijn die afhangt van wie er toevallig het dashboard opent, is er geen.
  async scheduled(_event, env, ctx) {
    const nuISO = (/* @__PURE__ */ new Date()).toISOString();
    if (env.FOTOS) {
      ctx.waitUntil((async () => {
        try {
          const { results } = await env.DB.prepare(
            "select key, instr(data, 'data:image') as foto from wire_state"
          ).all();
          const nogTeDoen = /* @__PURE__ */ new Set();
          for (const r of results ?? []) {
            if (!r.foto) continue;
            const basis = basisSleutel(r.key);
            if (basis.startsWith("voorschouwen")) nogTeDoen.add(basis);
          }
          const kandidaten = [...nogTeDoen].sort().slice(0, 4);
          for (const key of kandidaten) {
            const uit = await verhuisFotos(
              env,
              async (k) => {
                const rij = await env.DB.prepare("select data from wire_state where key = ?").bind(k).first();
                if (!rij) return null;
                try {
                  return (await herstelAllemaal(env, { [k]: JSON.parse(rij.data) }))[k];
                } catch {
                  return null;
                }
              },
              async (k, data) => {
                await schrijfGesplitst(env, k, data, nuISO);
              },
              key
            );
            if (uit.verplaatst) console.log("[fotos]", key, uit.verplaatst, "foto's naar de fotoruimte");
          }
        } catch (e) {
          console.log("[fotos] nachtelijke verhuizing mislukt", String(e).slice(0, 140));
        }
      })());
    }
    const grens = /* @__PURE__ */ new Date();
    grens.setMonth(grens.getMonth() - BEWAARMAANDEN);
    const grensISO = grens.toISOString();
    ctx.waitUntil((async () => {
      try {
        const { results } = await env.DB.prepare(
          "select project_id from bodem_projecten where afgerond_op <> '' and afgerond_op < ?1 and gewist_op = ''"
        ).bind(grensISO).all();
        for (const r of results ?? []) {
          const uit = await wisPersoonsgegevens(env, r.project_id, nuISO);
          console.log(`[bewaartermijn] ${r.project_id}: ${uit.adressen} adressen, ${uit.afspraken} afspraken gewist`);
          await env.DB.prepare(
            "insert into bodem_log (project_id, adres_id, gebeurtenis, oud, nieuw, door, tijdstip) values (?1, '', 'gegevens_gewist', '', ?2, 'automatisch', ?3)"
          ).bind(r.project_id, `${uit.adressen} adressen, ${uit.afspraken} afspraken`, nuISO).run();
        }
      } catch (e) {
        console.log("[bewaartermijn] opruiming mislukt:", String(e).slice(0, 200));
      }
    })());
  },
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsVoor(req, env) });
    const nu = Math.floor(Date.now() / 1e3);
    const nuISO = (/* @__PURE__ */ new Date()).toISOString();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    if (path.startsWith("/foto")) {
      const uitHeader = (req.headers.get("Authorization") ?? "").startsWith("Bearer ") ? (req.headers.get("Authorization") ?? "").slice(7) : "";
      const t = uitHeader || (url.searchParams.get("token") ?? "");
      const s = t ? await leesToken(t, env.JWT_SECRET, nu) : null;
      if (!s || await tokenIngetrokken(env, s.email, s.iat)) {
        return json({ error: "Geen geldige sessie." }, 401);
      }
      const uit = await fotoRoutes(path, req.method, req, env, json);
      if (uit) return uit;
    }
    const body = req.method === "POST" || req.method === "DELETE" ? await req.json().catch(() => ({})) : {};
    try {
      if (path === "/auth/signup" && req.method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        const ww = String(body.wachtwoord ?? "");
        if (!email.includes("@") || ww.length < 8) return json({ error: "Ongeldige invoer." }, 400);
        const bestaand = await env.DB.prepare("select pw_hash from users_auth where email = ?").bind(email).first();
        if (bestaand) {
          if (!await verifieerWachtwoord(ww, bestaand.pw_hash)) return json({ error: "Onjuiste inloggegevens." }, 401);
          return json({ token: await maakToken(email, env.JWT_SECRET, nu), email });
        }
        if (!await hoortBijHetTeam(env, email)) {
          return json({ error: "Dit e-mailadres hoort niet bij het team. Vraag de beheerder een account aan te maken." }, 403);
        }
        const hash = await hashWachtwoord(ww);
        await env.DB.prepare("insert into users_auth (email, pw_hash, created_at) values (?, ?, ?)").bind(email, hash, nuISO).run();
        spiegelUpsert(env, ctx, "users_auth", [{ email, pw_hash: hash, created_at: nuISO, updated_at: nuISO }], "email");
        return json({ token: await maakToken(email, env.JWT_SECRET, nu), email });
      }
      if (path === "/auth/login" && req.method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        const ww = String(body.wachtwoord ?? "");
        let hash = null;
        try {
          const rij = await env.DB.prepare("select pw_hash from users_auth where email = ?").bind(email).first();
          hash = rij?.pw_hash ?? null;
        } catch {
          const rijen = await spiegelSelect(env, "users_auth", `select=pw_hash&email=eq.${encodeURIComponent(email)}`, 12e3);
          hash = rijen?.[0]?.pw_hash ?? null;
        }
        if (!hash || !await verifieerWachtwoord(ww, hash)) return json({ error: "Onjuiste inloggegevens." }, 401);
        return json({ token: await maakToken(email, env.JWT_SECRET, nu), email });
      }
      if (path === "/auth/wachtwoord-vergeten" && req.method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        const neutraal = { ok: true, melding: "Als dit e-mailadres bij ons bekend is, ontvang je binnen enkele minuten een mail met een nieuw wachtwoord." };
        if (!email || !email.includes("@")) return json(neutraal);
        if (!env.RESEND_API_KEY) {
          return json({ ok: false, melding: "Wachtwoord-herstel per mail is nog niet ingesteld. Vraag je leidinggevende om een nieuw wachtwoord." }, 503);
        }
        let bestaat = false;
        try {
          const rij = await env.DB.prepare("select email from users_auth where email = ?").bind(email).first();
          bestaat = !!rij;
        } catch {
          bestaat = false;
        }
        if (!bestaat) return json(neutraal);
        const nieuw = genereerWachtwoord();
        const hash = await hashWachtwoord(nieuw);
        try {
          await env.DB.prepare(
            "insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do update set pw_hash = ?2"
          ).bind(email, hash, new Date(nu * 1e3).toISOString()).run();
          await trekTokensIn(env, email, nu);
          spiegelUpsert(env, ctx, "users_auth", [{ email, pw_hash: hash, updated_at: new Date(nu * 1e3).toISOString() }], "email");
        } catch {
          return json({ ok: false, melding: "Het lukte even niet. Probeer het zo nog eens." }, 500);
        }
        const appUrl = env.APP_URL || (req.headers.get("Origin") ?? "");
        const verstuurd = await stuurWachtwoordMail(env, email, nieuw, appUrl);
        if (!verstuurd) return json({ ok: false, melding: "Het nieuwe wachtwoord is klaargezet, maar de mail kon niet worden verstuurd. Neem contact op met je leidinggevende." }, 502);
        return json(neutraal);
      }
      if (path === "/ws") {
        const t = url.searchParams.get("token") ?? "";
        const s = t ? await leesToken(t, env.JWT_SECRET, nu) : null;
        if (!s || await tokenIngetrokken(env, s.email, s.iat)) return new Response("unauthorized", { status: 401, headers: CORS });
        return env.SYNC_HUB.get(env.SYNC_HUB.idFromName("global")).fetch(req);
      }
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const sessie = token ? await leesToken(token, env.JWT_SECRET, nu) : null;
      if (!sessie) return json({ error: "Geen geldige sessie." }, 401);
      if (await tokenIngetrokken(env, sessie.email, sessie.iat)) {
        return json({ error: "Je sessie is ingetrokken. Log opnieuw in." }, 401);
      }
      const ikEmail = sessie.email;
      if (path === "/auth/wachtwoord" && req.method === "POST") {
        const ww = String(body.nieuwWachtwoord ?? "");
        if (ww.length < 8) return json({ error: "Wachtwoord te kort." }, 400);
        const hash = await hashWachtwoord(ww);
        await env.DB.prepare(
          "insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do update set pw_hash = ?2"
        ).bind(ikEmail, hash, nuISO).run();
        spiegelUpsert(env, ctx, "users_auth", [{ email: ikEmail, pw_hash: hash, created_at: nuISO, updated_at: nuISO }], "email");
        return json({ ok: true });
      }
      if (path === "/auth/verleng" && req.method === "POST") {
        return json({ token: await maakToken(ikEmail, env.JWT_SECRET, nu), email: ikEmail });
      }
      if (path === "/ai/claude" && req.method === "POST") {
        if (!env.OPENROUTER_KEY) return json({ error: "AI staat niet aan op de server (OPENROUTER_KEY ontbreekt)." }, 503);
        if (!Array.isArray(body.messages)) return json({ error: "Ongeldige AI-aanvraag." }, 400);
        const model = env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
        const openaiVerzoek = naarOpenAIVerzoek(body, model);
        let upstream;
        try {
          upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "authorization": `Bearer ${env.OPENROUTER_KEY}`,
              // OpenRouter-attributie (optioneel maar netjes) — helpt bij het herkennen van het verkeer.
              "http-referer": "https://wire-solutions-dashboard.vercel.app",
              "x-title": "Wire Solutions Dashboard"
            },
            body: JSON.stringify(openaiVerzoek)
          });
        } catch {
          return json({ error: "Kon de AI-dienst niet bereiken." }, 502);
        }
        if (!upstream.ok) {
          const foutTekst = await upstream.text();
          return new Response(foutTekst, { status: upstream.status, headers: { ...corsVoor(req, env), "Content-Type": "application/json" } });
        }
        const openaiData = await upstream.json().catch(() => ({}));
        return json(naarAnthropicAntwoord(openaiData));
      }
      const mijnRechten = await rolVan(env, ikEmail).catch(() => null);
      const afgeschermd = afgeschermdVoor(mijnRechten);
      const zietAlles = magAlles(mijnRechten?.rol) || mijnRechten?.rol === "beheer";
      const mijnId = zietAlles ? null : await mijnUserId(env, ikEmail);
      if (path === "/rechten" && req.method === "GET") {
        return json({ rol: mijnRechten?.rol ?? "monteur", boekhouding: !!mijnRechten?.boekhouding, afgeschermd: [...afgeschermd] });
      }
      if (path === "/state" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, data from wire_state").all();
          const out = {};
          for (const r of results ?? []) {
            if (afgeschermd.has(r.key) || isDeelSleutel(r.key)) continue;
            try {
              out[r.key] = JSON.parse(r.data);
            } catch {
            }
          }
          return json(await herstelAllemaal(env, out));
        } catch (e) {
          const rijen = await spiegelSelect(env, "wire_state", "select=key,data");
          if (!rijen) throw e;
          const out = {};
          for (const r of rijen) {
            if (!afgeschermd.has(r.key) && !isDeelSleutel(r.key)) out[r.key] = r.data;
          }
          return json(await herstelAllemaal(env, out));
        }
      }
      if (path === "/state/versions" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, updated_at from wire_state").all();
          const out = {};
          for (const r of results ?? []) if (!isDeelSleutel(r.key)) out[r.key] = r.updated_at;
          return json(out);
        } catch (e) {
          const rijen = await spiegelSelect(env, "wire_state", "select=key,updated_at");
          if (!rijen) throw e;
          const out = {};
          for (const r of rijen) if (!isDeelSleutel(r.key)) out[r.key] = r.updated_at;
          return json(out);
        }
      }
      if (path === "/state/keys" && req.method === "POST") {
        const keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === "string") : [];
        const out = {};
        const mag = keys.filter((k) => !afgeschermd.has(k) && !isDeelSleutel(k));
        if (mag.length) {
          try {
            const ph = mag.map(() => "?").join(",");
            const { results } = await env.DB.prepare(`select key, data from wire_state where key in (${ph})`).bind(...mag).all();
            for (const r of results ?? []) {
              try {
                out[r.key] = JSON.parse(r.data);
              } catch {
              }
            }
          } catch (e) {
            const lijst = mag.map((k) => `"${k.replace(/"/g, "")}"`).join(",");
            const rijen = await spiegelSelect(env, "wire_state", `select=key,data&key=in.(${encodeURIComponent(lijst)})`);
            if (!rijen) throw e;
            for (const r of rijen) out[r.key] = r.data;
          }
        }
        return json(await herstelAllemaal(env, out));
      }
      if (path === "/state/opruimen" && req.method === "POST") {
        if (!magAlles(mijnRechten?.rol)) return json({ error: "Alleen de leiding mag opruimen." }, 403);
        const { results } = await env.DB.prepare("select key, data from wire_state").all();
        const alles = results ?? [];
        const houden = /* @__PURE__ */ new Map();
        for (const r of alles) {
          if (isDeelSleutel(r.key)) continue;
          try {
            const m = JSON.parse(r.data);
            if (m && m.__wire_delen === 1 && m.gen) houden.set(r.key, m.gen);
          } catch {
          }
        }
        const weg = alles.map((r) => r.key).filter((k) => {
          if (!isDeelSleutel(k)) return false;
          const basis = k.slice(0, k.indexOf(" deel "));
          const gen = houden.get(basis);
          return !gen || !k.startsWith(`${basis} deel ${gen} `);
        });
        for (let i = 0; i < weg.length; i += 20) {
          await env.DB.batch(weg.slice(i, i + 20).map((k) => env.DB.prepare("delete from wire_state where key = ?").bind(k)));
        }
        const na = await env.DB.prepare("select count(*) as n, sum(length(data)) as bytes from wire_state").first();
        return json({ ok: true, verwijderd: weg.length, rijenOver: na?.n ?? 0, tekensOver: na?.bytes ?? 0 });
      }
      if (path === "/state/fotos-naar-r2" && req.method === "POST") {
        if (!magAlles(mijnRechten?.rol)) return json({ error: "Alleen de leiding mag dit." }, 403);
        if (!env.FOTOS) return json({ error: "De fotoruimte staat nog niet aan." }, 503);
        const key = String(body.key ?? "");
        if (!key) return json({ error: "key ontbreekt." }, 400);
        const uit = await verhuisFotos(
          env,
          async (k) => {
            const rij = await env.DB.prepare("select data from wire_state where key = ?").bind(k).first();
            if (!rij) return null;
            try {
              return await herstelAllemaal(env, { [k]: JSON.parse(rij.data) }).then((o) => o[k]);
            } catch {
              return null;
            }
          },
          async (k, data) => {
            await schrijfGesplitst(env, k, data, nuISO);
          },
          key
        );
        return json({ ok: true, ...uit });
      }
      if (path === "/state" && req.method === "POST") {
        const key = String(body.key ?? "");
        if (!key) return json({ error: "key ontbreekt." }, 400);
        if (afgeschermd.has(key)) return json({ error: `Je hebt geen toegang tot '${key}'.` }, 403);
        if (key === "users" && !magAlles(mijnRechten?.rol)) body.data = await zeefRollen(env, body.data);
        if (isDeelSleutel(key)) return json({ error: "Deze naam is voor intern gebruik." }, 400);
        const { rijen: geschreven, gesplitst } = await schrijfGesplitst(env, key, body.data ?? null, nuISO);
        if (gesplitst) console.log("[delen]", key, "in", geschreven.length - 1, "stukken");
        spiegelUpsert(env, ctx, "wire_state", geschreven, "key");
        if (key === "users") await seedRollenUitUsers(env, body.data, nuISO, ctx);
        broadcast(env, ctx, { type: "changed", keys: [key], updated_at: nuISO });
        return json({ updated_at: nuISO });
      }
      if (path === "/verlof" && req.method === "GET") {
        const { results } = await env.DB.prepare("select * from verlof_beslissingen").all();
        return json({ rows: results ?? [] });
      }
      if (path === "/verlof" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!rol?.boekhouding) return json({ error: "Alleen boekhouding mag verlof beslissen." }, 403);
        const id = String(body.verlof_id ?? "");
        if (!id) return json({ error: "verlof_id ontbreekt." }, 400);
        await env.DB.prepare(
          "insert into verlof_beslissingen (verlof_id, status, beslist_door_email, beslist_door_naam, beslist_op) values (?1, ?2, ?3, ?4, ?5) on conflict(verlof_id) do update set status = ?2, beslist_door_email = ?3, beslist_door_naam = ?4, beslist_op = ?5"
        ).bind(id, String(body.status ?? ""), String(body.beslist_door_email ?? ""), String(body.beslist_door_naam ?? ""), String(body.beslist_op ?? nuISO)).run();
        spiegelUpsert(env, ctx, "verlof_beslissingen", [{
          verlof_id: id,
          status: String(body.status ?? ""),
          beslist_door_email: String(body.beslist_door_email ?? ""),
          beslist_door_naam: String(body.beslist_door_naam ?? ""),
          beslist_op: String(body.beslist_op ?? nuISO)
        }], "verlof_id");
        return json({ ok: true });
      }
      if (path === "/roles" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol)) return json({ error: "Alleen de eigenaar en HR mogen rollen wijzigen." }, 403);
        const email = String(body.email ?? "").trim().toLowerCase();
        if (!email) return json({ error: "email ontbreekt." }, 400);
        const gevraagdeRol = String(body.rol ?? "monteur");
        if (!ROLLEN.has(gevraagdeRol)) return json({ error: "Onbekende rol." }, 400);
        await env.DB.prepare(
          "insert into app_roles (email, rol, boekhouding, bijgewerkt_op) values (?1, ?2, ?3, ?4) on conflict(email) do update set rol = ?2, boekhouding = ?3, bijgewerkt_op = ?4"
        ).bind(email, gevraagdeRol, body.boekhouding ? 1 : 0, nuISO).run();
        spiegelUpsert(env, ctx, "app_roles", [{ email, rol: gevraagdeRol, boekhouding: !!body.boekhouding, bijgewerkt_op: nuISO }], "email");
        return json({ ok: true });
      }
      if (path === "/roles" && req.method === "DELETE") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol)) return json({ error: "Alleen de eigenaar en HR mogen rollen verwijderen." }, 403);
        const weg = String(body.email ?? "").trim().toLowerCase();
        await env.DB.prepare("delete from app_roles where email = ?").bind(weg).run();
        spiegelVerwijder(env, ctx, "app_roles", "email", weg);
        return json({ ok: true });
      }
      if (path === "/audit" && req.method === "POST") {
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, door_naam, doel_user_id, doel_email, doel_naam, details) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        ).bind(
          nuISO,
          String(body.actie ?? ""),
          body.door_email ?? null,
          body.door_naam ?? null,
          body.doel_user_id ?? null,
          body.doel_email ?? null,
          body.doel_naam ?? null,
          JSON.stringify(body.details ?? {})
        ).run();
        spiegelInsert(env, ctx, "admin_audit", {
          gemaakt_op: nuISO,
          actie: String(body.actie ?? ""),
          door_email: body.door_email ?? null,
          door_naam: body.door_naam ?? null,
          doel_user_id: body.doel_user_id ?? null,
          doel_email: body.doel_email ?? null,
          doel_naam: body.doel_naam ?? null,
          details: body.details ?? {}
        });
        return json({ ok: true });
      }
      if (path === "/admin/reset-wachtwoord" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol) && rol?.rol !== "beheer") return json({ error: "Alleen een beheerder mag dit uitvoeren." }, 403);
        const doel = String(body.doelEmail ?? "").trim().toLowerCase();
        const nieuw = String(body.nieuwWachtwoord ?? "");
        if (!doel.includes("@") || nieuw.length < 8) return json({ error: "Ongeldige invoer." }, 400);
        const nieuweHash = await hashWachtwoord(nieuw);
        await env.DB.prepare(
          "insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do update set pw_hash = ?2"
        ).bind(doel, nieuweHash, nuISO).run();
        spiegelUpsert(env, ctx, "users_auth", [{ email: doel, pw_hash: nieuweHash, created_at: nuISO, updated_at: nuISO }], "email");
        await trekTokensIn(env, doel, nu);
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, doel_email, details) values (?1, 'wachtwoord_reset', ?2, ?3, ?4)"
        ).bind(nuISO, ikEmail, doel, JSON.stringify({ via: "worker" })).run();
        return json({ ok: true });
      }
      if (path === "/admin/wijzig-email" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol) && rol?.rol !== "beheer") return json({ error: "Alleen een beheerder mag dit uitvoeren." }, 403);
        const oud = String(body.oudEmail ?? "").trim().toLowerCase();
        const nieuw = String(body.nieuwEmail ?? "").trim().toLowerCase();
        if (!oud || !nieuw.includes("@")) return json({ error: "Ongeldige invoer." }, 400);
        const rij = await env.DB.prepare("select pw_hash from users_auth where email = ?").bind(oud).first();
        if (!rij) return json({ error: "Doelaccount niet gevonden." }, 404);
        await env.DB.batch([
          env.DB.prepare("insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do update set pw_hash = ?2").bind(nieuw, rij.pw_hash, nuISO),
          env.DB.prepare("delete from users_auth where email = ?").bind(oud)
        ]);
        spiegelUpsert(env, ctx, "users_auth", [{ email: nieuw, pw_hash: rij.pw_hash, created_at: nuISO, updated_at: nuISO }], "email");
        spiegelVerwijder(env, ctx, "users_auth", "email", oud);
        const oudeRol = await env.DB.prepare("select rol, boekhouding from app_roles where email = ?").bind(oud).first();
        if (oudeRol) {
          await env.DB.batch([
            env.DB.prepare("insert into app_roles (email, rol, boekhouding, bijgewerkt_op) values (?1, ?2, ?3, ?4) on conflict(email) do update set rol = ?2, boekhouding = ?3, bijgewerkt_op = ?4").bind(nieuw, oudeRol.rol, oudeRol.boekhouding, nuISO),
            env.DB.prepare("delete from app_roles where email = ?").bind(oud)
          ]);
          spiegelUpsert(env, ctx, "app_roles", [{ email: nieuw, rol: oudeRol.rol, boekhouding: !!oudeRol.boekhouding, bijgewerkt_op: nuISO }], "email");
          spiegelVerwijder(env, ctx, "app_roles", "email", oud);
        }
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, doel_email, details) values (?1, 'email_gewijzigd', ?2, ?3, ?4)"
        ).bind(nuISO, ikEmail, oud, JSON.stringify({ nieuw })).run();
        await trekTokensIn(env, oud, nu);
        return json({ ok: true });
      }
      if (path === "/admin/verwijder-account" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol) && rol?.rol !== "beheer") return json({ error: "Alleen een beheerder mag dit uitvoeren." }, 403);
        const doel = String(body.doelEmail ?? "").trim().toLowerCase();
        if (!doel.includes("@")) return json({ error: "Ongeldige invoer." }, 400);
        if (doel === ikEmail) return json({ error: "Je kunt je eigen account niet verwijderen." }, 400);
        await env.DB.batch([
          env.DB.prepare("delete from users_auth where email = ?").bind(doel),
          env.DB.prepare("delete from app_roles where email = ?").bind(doel)
        ]);
        spiegelVerwijder(env, ctx, "users_auth", "email", doel);
        spiegelVerwijder(env, ctx, "app_roles", "email", doel);
        await trekTokensIn(env, doel, nu);
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, doel_email, details) values (?1, 'account_verwijderd', ?2, ?3, ?4)"
        ).bind(nuISO, ikEmail, doel, JSON.stringify({ via: "worker" })).run();
        return json({ ok: true });
      }
      if (path === "/bodem/project" && req.method === "POST") {
        if (!magAlles(mijnRechten?.rol) && mijnRechten?.rol !== "beheer") {
          return json({ error: "Alleen een beheerder mag de planning instellen." }, 403);
        }
        const projectId = String(body.projectId ?? "");
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const config = JSON.stringify(body.config ?? {});
        await env.DB.prepare(
          "insert into bodem_projecten (project_id, config, bijgewerkt_op) values (?1, ?2, ?3) on conflict(project_id) do update set config = ?2, bijgewerkt_op = ?3"
        ).bind(projectId, config, nuISO).run();
        spiegelUpsert(env, ctx, "bodem_projecten", [{ project_id: projectId, config: body.config ?? {}, bijgewerkt_op: nuISO }], "project_id");
        return json({ ok: true });
      }
      if (path === "/bodem/project" && req.method === "GET") {
        const projectId = url.searchParams.get("id") ?? "";
        if (!projectId) return json({ error: "id ontbreekt." }, 400);
        const cfg = await env.DB.prepare("select config from bodem_projecten where project_id = ?").bind(projectId).first();
        const { results: afspraken } = zietAlles ? await env.DB.prepare(
          "select adres_id, datum, tijdslot, naam, telefoon, email, notitie, ingevuld_door, ingevuld_op from bodem_afspraken where project_id = ? order by datum, tijdslot"
        ).bind(projectId).all() : await env.DB.prepare(
          "select a.adres_id, a.datum, a.tijdslot, a.naam, a.telefoon, a.email, a.notitie, a.ingevuld_door, a.ingevuld_op from bodem_afspraken a join bodem_adressen d on d.id = a.adres_id where a.project_id = ?1 and d.toegewezen_aan = ?2 order by a.datum, a.tijdslot"
        ).bind(projectId, mijnId ?? "__geen__").all();
        const { results: bezet } = await env.DB.prepare(
          "select datum, tijdslot, count(*) as n from bodem_afspraken where project_id = ? group by datum, tijdslot"
        ).bind(projectId).all();
        let config = null;
        if (cfg) {
          try {
            config = JSON.parse(cfg.config);
          } catch {
            config = null;
          }
        }
        return json({ config, afspraken: afspraken ?? [], bezetting: bezet ?? [] });
      }
      if (path === "/bodem/afspraak" && req.method === "POST") {
        const projectId = String(body.projectId ?? "");
        const adresId = String(body.adresId ?? "");
        const datum = String(body.datum ?? "");
        const tijdslot = String(body.tijdslot ?? "");
        if (!projectId || !adresId) return json({ error: "projectId en adresId zijn verplicht." }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json({ error: "Ongeldige datum." }, 400);
        if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(tijdslot)) return json({ error: "Ongeldig tijdslot." }, 400);
        if (!zietAlles) {
          const van = await env.DB.prepare("select toegewezen_aan from bodem_adressen where id = ?").bind(adresId).first();
          if (van && van.toegewezen_aan !== mijnId) return json({ error: "Dit adres is niet aan jou toegewezen." }, 403);
        }
        const cfgRij = await env.DB.prepare("select config from bodem_projecten where project_id = ?").bind(projectId).first();
        let max = Number.MAX_SAFE_INTEGER;
        if (cfgRij) {
          let cfg = {};
          try {
            cfg = JSON.parse(cfgRij.config);
          } catch {
          }
          if (cfg.periodeStart && datum < cfg.periodeStart) return json({ error: "Deze dag valt v\xF3\xF3r de afgesproken periode." }, 409);
          if (cfg.periodeEind && datum > cfg.periodeEind) return json({ error: "Deze dag valt n\xE1 de afgesproken periode." }, 409);
          if (Array.isArray(cfg.werkdagen) && cfg.werkdagen.length) {
            const [j, m, d] = datum.split("-").map(Number);
            const dag = new Date(Date.UTC(j, m - 1, d)).getUTCDay();
            if (!cfg.werkdagen.includes(dag)) return json({ error: "Op deze dag wordt niet gewerkt." }, 409);
          }
          const slot = cfg.sloten?.find((s) => s.slot === tijdslot);
          if (slot && slot.actief === false) return json({ error: "Dit tijdblok staat uit." }, 409);
          if (slot && typeof slot.max === "number" && slot.max >= 0) max = slot.max;
        }
        const bestaandeAfspraak = await env.DB.prepare("select datum, tijdslot from bodem_afspraken where adres_id = ?").bind(adresId).first();
        const res = await env.DB.prepare(
          "insert into bodem_afspraken (adres_id, project_id, datum, tijdslot, naam, telefoon, email, notitie, ingevuld_door, ingevuld_op) select ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 where (select count(*) from bodem_afspraken where project_id = ?2 and datum = ?3 and tijdslot = ?4 and adres_id <> ?1) < ?11 on conflict(adres_id) do update set project_id = ?2, datum = ?3, tijdslot = ?4, naam = ?5, telefoon = ?6, email = ?7, notitie = ?8, ingevuld_door = ?9, ingevuld_op = ?10"
        ).bind(
          adresId,
          projectId,
          datum,
          tijdslot,
          String(body.naam ?? ""),
          String(body.telefoon ?? ""),
          String(body.email ?? ""),
          String(body.notitie ?? ""),
          ikEmail,
          nuISO,
          max
        ).run();
        if (res.meta.changes) {
          logBodem(env, ctx, {
            projectId,
            adresId,
            door: ikEmail,
            tijd: nuISO,
            gebeurtenis: bestaandeAfspraak ? "afspraak_verplaatst" : "afspraak_gemaakt",
            oud: bestaandeAfspraak ? `${bestaandeAfspraak.datum} ${bestaandeAfspraak.tijdslot}` : "",
            nieuw: `${datum} ${tijdslot}`
          });
        }
        if (!res.meta.changes) {
          const vol = await env.DB.prepare("select count(*) as n from bodem_afspraken where project_id = ? and datum = ? and tijdslot = ?").bind(projectId, datum, tijdslot).first();
          return json({ error: "Dit tijdblok is inmiddels vol.", bezet: vol?.n ?? 0, max }, 409);
        }
        spiegelUpsert(env, ctx, "bodem_afspraken", [{
          adres_id: adresId,
          project_id: projectId,
          datum,
          tijdslot,
          naam: String(body.naam ?? ""),
          telefoon: String(body.telefoon ?? ""),
          email: String(body.email ?? ""),
          notitie: String(body.notitie ?? ""),
          ingevuld_door: ikEmail,
          ingevuld_op: nuISO
        }], "adres_id");
        return json({ ok: true, datum, tijdslot });
      }
      if (path === "/bodem/afspraak" && req.method === "DELETE") {
        const adresId = String(body.adresId ?? "");
        if (!adresId) return json({ error: "adresId ontbreekt." }, 400);
        const weg = await env.DB.prepare("select project_id, datum, tijdslot from bodem_afspraken where adres_id = ?").bind(adresId).first();
        await env.DB.prepare("delete from bodem_afspraken where adres_id = ?").bind(adresId).run();
        spiegelVerwijder(env, ctx, "bodem_afspraken", "adres_id", adresId);
        if (weg) {
          logBodem(env, ctx, {
            projectId: weg.project_id,
            adresId,
            gebeurtenis: "afspraak_ingetrokken",
            oud: `${weg.datum} ${weg.tijdslot}`,
            door: ikEmail,
            tijd: nuISO
          });
        }
        return json({ ok: true });
      }
      if (path === "/bodem/bezoek" && req.method === "POST") {
        const projectId = String(body.projectId ?? "");
        const adresId = String(body.adresId ?? "");
        const uitkomst = String(body.uitkomst ?? "");
        if (!projectId || !adresId) return json({ error: "projectId en adresId zijn verplicht." }, 400);
        if (!["niet_thuis", "weigert", "later", "ongeldig"].includes(uitkomst)) return json({ error: "Onbekende uitkomst." }, 400);
        const eerder = await env.DB.prepare("select count(*) as n from bodem_bezoeken where project_id = ? and adres_id = ?").bind(projectId, adresId).first();
        const poging = (eerder?.n ?? 0) + 1;
        await env.DB.prepare(
          "insert into bodem_bezoeken (project_id, adres_id, poging, uitkomst, notitie, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).bind(projectId, adresId, poging, uitkomst, String(body.notitie ?? ""), ikEmail, nuISO).run();
        spiegelInsert(env, ctx, "bodem_bezoeken", {
          project_id: projectId,
          adres_id: adresId,
          poging,
          uitkomst,
          notitie: String(body.notitie ?? ""),
          door: ikEmail,
          tijdstip: nuISO
        });
        return json({ ok: true, poging });
      }
      if (path === "/bodem/afronden" && req.method === "POST") {
        if (!zietAlles) return json({ error: "Alleen een beheerder mag een project afronden." }, 403);
        const projectId = String(body.projectId ?? "");
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const terug = body.ongedaan === true;
        await env.DB.prepare(
          "insert into bodem_projecten (project_id, config, bijgewerkt_op, afgerond_op) values (?1, '{}', ?2, ?3) on conflict(project_id) do update set afgerond_op = ?3, bijgewerkt_op = ?2"
        ).bind(projectId, nuISO, terug ? "" : nuISO).run();
        logBodem(env, ctx, { projectId, gebeurtenis: terug ? "heropend" : "afgerond", door: ikEmail, tijd: nuISO });
        return json({ ok: true, afgerondOp: terug ? "" : nuISO });
      }
      if (path === "/bodem/wis-persoonsgegevens" && req.method === "POST") {
        if (!magAlles(mijnRechten?.rol)) return json({ error: "Alleen de eigenaar en HR mogen persoonsgegevens wissen." }, 403);
        const projectId = String(body.projectId ?? "");
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const r = await wisPersoonsgegevens(env, projectId, nuISO);
        logBodem(env, ctx, { projectId, gebeurtenis: "gegevens_gewist", nieuw: `${r.adressen} adressen, ${r.afspraken} afspraken`, door: ikEmail, tijd: nuISO });
        return json({ ok: true, ...r });
      }
      if (path === "/bodem/bewaartermijn" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const r = await env.DB.prepare("select afgerond_op, gewist_op from bodem_projecten where project_id = ?").bind(projectId).first();
        let wistOp = "";
        if (r?.afgerond_op) {
          const d = new Date(r.afgerond_op);
          d.setMonth(d.getMonth() + BEWAARMAANDEN);
          wistOp = d.toISOString().slice(0, 10);
        }
        return json({ afgerondOp: r?.afgerond_op ?? "", gewistOp: r?.gewist_op ?? "", wistOp, maanden: BEWAARMAANDEN });
      }
      if (path === "/bodem/log" && req.method === "GET") {
        if (!magAlles(mijnRechten?.rol) && mijnRechten?.rol !== "beheer") {
          return json({ error: "Alleen een beheerder mag het wijzigingslog inzien." }, 403);
        }
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const { results } = await env.DB.prepare(
          "select id, adres_id, gebeurtenis, oud, nieuw, door, tijdstip from bodem_log where project_id = ? order by id desc limit 500"
        ).bind(projectId).all();
        return json({ regels: results ?? [] });
      }
      if (path.startsWith("/saneer/")) {
        const uit = await saneerRoutes(path, req.method, url, body, {
          env,
          ikEmail,
          nuISO,
          json,
          magBeheren: magAlles(mijnRechten?.rol) || mijnRechten?.rol === "beheer",
          mijnUserId: mijnId ?? await mijnUserId(env, ikEmail),
          log: /* @__PURE__ */ __name((v) => {
            ctx.waitUntil(
              env.DB.prepare(
                "insert into saneer_log (pd_nummer, cluster_id, adres_id, gebeurtenis, oud, nieuw, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
              ).bind(v.pd, v.clusterId ?? "", v.adresId ?? "", v.gebeurtenis, v.oud ?? "", v.nieuw ?? "", ikEmail, nuISO).run().then(() => void 0).catch((e) => console.log("[saneer-log]", String(e).slice(0, 120)))
            );
          }, "log")
        });
        if (uit) return uit;
      }
      const ADRES_VELDEN = [
        "id",
        "project_id",
        "volgorde",
        "straat",
        "huisnummer",
        "postcode",
        "plaats",
        "wijk",
        "perceel",
        "bewoner",
        "telefoon",
        "email",
        "notitie",
        "toegewezen_aan",
        "aanwezig",
        "datum",
        "tijdslot",
        "toestemming_tuin",
        "uitkomst",
        "pogingen",
        "afgerond",
        "afgerond_op",
        "afgerond_door",
        "verwijderd",
        "bijgewerkt_op"
      ];
      if (path === "/bodem/adressen" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const sinds = url.searchParams.get("sinds") ?? "";
        const kolommen = ADRES_VELDEN.join(", ");
        const mij = mijnId ?? "__geen__";
        const { results } = sinds ? zietAlles ? await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and bijgewerkt_op > ?2 order by volgorde`).bind(projectId, sinds).all() : await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and bijgewerkt_op > ?2 and toegewezen_aan = ?3 order by volgorde`).bind(projectId, sinds, mij).all() : zietAlles ? await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and verwijderd = 0 order by volgorde`).bind(projectId).all() : await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and verwijderd = 0 and toegewezen_aan = ?2 order by volgorde`).bind(projectId, mij).all();
        return json({ adressen: results ?? [], tijd: nuISO, alleenEigen: !zietAlles });
      }
      if (path === "/bodem/adressen" && req.method === "POST") {
        const projectId = String(body.projectId ?? "");
        const lijst = Array.isArray(body.adressen) ? body.adressen : [];
        if (!zietAlles) return json({ error: "Alleen een beheerder mag adressen importeren of verdelen." }, 403);
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        if (!lijst.length) return json({ ok: true, aantal: 0 });
        if (lijst.length > 5e3) return json({ error: "Te veel adressen in \xE9\xE9n keer (maximaal 5000)." }, 400);
        const plaatsen = ADRES_VELDEN.map((_, i) => `?${i + 1}`).join(", ");
        const bijwerken = ADRES_VELDEN.filter((v) => v !== "id").map((v, i) => `${v} = ?${i + 2}`).join(", ");
        const sql = `insert into bodem_adressen (${ADRES_VELDEN.join(", ")}) values (${plaatsen}) on conflict(id) do update set ${bijwerken}`;
        let aantal = 0;
        for (let i = 0; i < lijst.length; i += 40) {
          const stuk = lijst.slice(i, i + 40).map(
            (a) => env.DB.prepare(sql).bind(
              String(a.id ?? ""),
              projectId,
              Number(a.volgorde ?? 0),
              String(a.straat ?? ""),
              String(a.huisnummer ?? ""),
              String(a.postcode ?? ""),
              String(a.plaats ?? ""),
              String(a.wijk ?? ""),
              String(a.perceel ?? ""),
              String(a.bewoner ?? ""),
              String(a.telefoon ?? ""),
              String(a.email ?? ""),
              String(a.notitie ?? ""),
              a.toegewezen_aan ? String(a.toegewezen_aan) : null,
              String(a.aanwezig ?? ""),
              String(a.datum ?? ""),
              String(a.tijdslot ?? ""),
              a.toestemming_tuin ? 1 : 0,
              String(a.uitkomst ?? ""),
              Number(a.pogingen ?? 0),
              a.afgerond ? 1 : 0,
              String(a.afgerond_op ?? ""),
              String(a.afgerond_door ?? ""),
              a.verwijderd ? 1 : 0,
              nuISO
            )
          );
          await env.DB.batch(stuk);
          aantal += stuk.length;
        }
        spiegelUpsert(env, ctx, "bodem_adressen", lijst.map((a) => ({
          id: String(a.id ?? ""),
          project_id: projectId,
          volgorde: Number(a.volgorde ?? 0),
          straat: String(a.straat ?? ""),
          huisnummer: String(a.huisnummer ?? ""),
          postcode: String(a.postcode ?? ""),
          plaats: String(a.plaats ?? ""),
          wijk: String(a.wijk ?? ""),
          perceel: String(a.perceel ?? ""),
          bewoner: String(a.bewoner ?? ""),
          telefoon: String(a.telefoon ?? ""),
          email: String(a.email ?? ""),
          notitie: String(a.notitie ?? ""),
          toegewezen_aan: a.toegewezen_aan ?? null,
          aanwezig: String(a.aanwezig ?? ""),
          datum: String(a.datum ?? ""),
          tijdslot: String(a.tijdslot ?? ""),
          toestemming_tuin: !!a.toestemming_tuin,
          uitkomst: String(a.uitkomst ?? ""),
          pogingen: Number(a.pogingen ?? 0),
          afgerond: !!a.afgerond,
          afgerond_op: String(a.afgerond_op ?? ""),
          afgerond_door: String(a.afgerond_door ?? ""),
          verwijderd: !!a.verwijderd,
          bijgewerkt_op: nuISO
        })), "id");
        logBodem(env, ctx, {
          projectId,
          gebeurtenis: lijst.some((a) => a.toegewezen_aan !== void 0) ? "verdeeld" : "geimporteerd",
          nieuw: `${aantal} adressen`,
          door: ikEmail,
          tijd: nuISO
        });
        broadcast(env, ctx, { type: "bodem", projectId, updated_at: nuISO });
        return json({ ok: true, aantal, tijd: nuISO });
      }
      if (path === "/bodem/adres" && req.method === "POST") {
        const id = String(body.id ?? "");
        const projectId = String(body.projectId ?? "");
        if (!id || !projectId) return json({ error: "id en projectId zijn verplicht." }, 400);
        const patch = body.patch ?? {};
        const teZetten = Object.keys(patch).filter((k) => ADRES_VELDEN.includes(k) && k !== "id" && k !== "project_id");
        if (!teZetten.length) return json({ error: "Niets om bij te werken." }, 400);
        if (!zietAlles) {
          const van = await env.DB.prepare("select toegewezen_aan from bodem_adressen where id = ?").bind(id).first();
          if (van && van.toegewezen_aan !== mijnId) return json({ error: "Dit adres is niet aan jou toegewezen." }, 403);
          if ("toegewezen_aan" in patch) return json({ error: "Alleen een beheerder mag adressen toewijzen." }, 403);
        }
        const vorige = await env.DB.prepare("select uitkomst, toegewezen_aan, verwijderd from bodem_adressen where id = ?").bind(id).first();
        const zet = teZetten.map((k, i) => `${k} = ?${i + 3}`).join(", ");
        const waarden = teZetten.map((k) => {
          const v = patch[k];
          if (k === "toestemming_tuin" || k === "afgerond" || k === "verwijderd") return v ? 1 : 0;
          if (k === "volgorde" || k === "pogingen") return Number(v ?? 0);
          if (k === "toegewezen_aan") return v ? String(v) : null;
          return String(v ?? "");
        });
        const res = await env.DB.prepare(`update bodem_adressen set ${zet}, bijgewerkt_op = ?2 where id = ?1`).bind(id, nuISO, ...waarden).run();
        if (!res.meta.changes) {
          await env.DB.prepare("insert into bodem_adressen (id, project_id, bijgewerkt_op) values (?1, ?2, ?3) on conflict(id) do nothing").bind(id, projectId, nuISO).run();
          await env.DB.prepare(`update bodem_adressen set ${zet}, bijgewerkt_op = ?2 where id = ?1`).bind(id, nuISO, ...waarden).run();
        }
        if (spiegelAan(env)) {
          const rij = await env.DB.prepare(`select ${ADRES_VELDEN.join(", ")} from bodem_adressen where id = ?`).bind(id).first();
          if (rij) {
            const r = rij;
            spiegelUpsert(env, ctx, "bodem_adressen", [{
              ...r,
              toestemming_tuin: !!r.toestemming_tuin,
              afgerond: !!r.afgerond,
              verwijderd: !!r.verwijderd
            }], "id");
          }
        }
        const vorigeWaarden = vorige ?? {};
        for (const [veld, gebeurtenis] of [["uitkomst", "uitkomst"], ["toegewezen_aan", "toegewezen"], ["verwijderd", "verwijderd"]]) {
          if (!(veld in patch)) continue;
          logBodem(env, ctx, {
            projectId,
            adresId: id,
            gebeurtenis,
            oud: String(vorigeWaarden[veld] ?? ""),
            nieuw: String(patch[veld] ?? ""),
            door: ikEmail,
            tijd: nuISO
          });
        }
        broadcast(env, ctx, { type: "bodem", projectId, updated_at: nuISO });
        return json({ ok: true, tijd: nuISO });
      }
      if (path === "/admin/koppel-accounts" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol)) return json({ error: "Alleen de eigenaar en HR mogen accounts koppelen." }, 403);
        const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first();
        if (!rij) return json({ error: "Geen teamlijst gevonden." }, 404);
        let lijst;
        try {
          lijst = JSON.parse(rij.data);
        } catch {
          return json({ error: "Teamlijst onleesbaar." }, 500);
        }
        if (!Array.isArray(lijst)) return json({ error: "Teamlijst heeft een onverwacht formaat." }, 500);
        const { results: bestaand } = await env.DB.prepare("select email from users_auth").all();
        const heeftAl = new Set((bestaand ?? []).map((r) => r.email));
        const naarB64url = /* @__PURE__ */ __name((s) => String(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""), "naarB64url");
        const stmts = [];
        const spiegelRijen = [];
        const overgeslagen = [];
        for (const u of lijst) {
          const email = String(u?.email ?? "").trim().toLowerCase();
          if (!email || heeftAl.has(email)) continue;
          const h = String(u?.wachtwoordHash ?? ""), s = String(u?.wachtwoordSalt ?? "");
          const it = Number(u?.wachtwoordIter ?? 0);
          if (!h || !s || !Number.isFinite(it) || it < 1e3) {
            overgeslagen.push(email);
            continue;
          }
          const pwHash = `pbkdf2$${it}$${naarB64url(s)}$${naarB64url(h)}`;
          stmts.push(
            env.DB.prepare("insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do nothing").bind(email, pwHash, nuISO)
          );
          spiegelRijen.push({ email, pw_hash: pwHash, created_at: nuISO, updated_at: nuISO });
        }
        if (stmts.length) await env.DB.batch(stmts);
        if (spiegelRijen.length) spiegelUpsert(env, ctx, "users_auth", spiegelRijen, "email");
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, details) values (?1, 'accounts_gekoppeld', ?2, ?3)"
        ).bind(nuISO, ikEmail, JSON.stringify({ gekoppeld: stmts.length, overgeslagen })).run();
        return json({ ok: true, gekoppeld: stmts.length, aanwezig: heeftAl.size, overgeslagen });
      }
      if (path === "/status" && req.method === "GET") {
        let d1Ok = false, d1Onderdelen = 0, d1Accounts = 0, d1Fout = "";
        try {
          const a = await env.DB.prepare("select count(*) as n from wire_state").first();
          const b = await env.DB.prepare("select count(*) as n from users_auth").first();
          d1Onderdelen = a?.n ?? 0;
          d1Accounts = b?.n ?? 0;
          d1Ok = true;
        } catch (e) {
          d1Fout = e instanceof Error ? e.message : String(e);
        }
        const spiegel = await spiegelStatus(env);
        return json({
          cloudflare: { gezond: d1Ok, onderdelen: d1Onderdelen, accounts: d1Accounts, fout: d1Fout },
          supabase: spiegel,
          gelijk: d1Ok && spiegel.gezond && spiegel.onderdelen === d1Onderdelen && spiegel.accounts === d1Accounts,
          tijd: nuISO
        });
      }
      if (path === "/spiegel/herstel" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol)) return json({ error: "Alleen de eigenaar en HR mogen de spiegel herstellen." }, 403);
        if (!spiegelAan(env)) return json({ error: "De Supabase-spiegel staat uit (secrets niet ingesteld)." }, 400);
        const r = await herspiegelAlles(env, env.DB);
        return json(r, r.ok ? 200 : 500);
      }
      return json({ error: "Onbekende route." }, 404);
    } catch (e) {
      return json({ error: e instanceof Error ? e.message : String(e) }, 500);
    }
  }
};
export {
  SyncHub,
  worker_default as default
};
//# sourceMappingURL=worker.js.map

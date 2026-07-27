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
  "Access-Control-Max-Age": "86400"
};
function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}
__name(json, "json");
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
    return { email: String(body.email).toLowerCase() };
  } catch {
    return null;
  }
}
__name(leesToken, "leesToken");
async function rolVan(env, email) {
  const r = await env.DB.prepare("select rol, boekhouding from app_roles where email = ?").bind(email).first();
  return r ? { rol: r.rol, boekhouding: !!r.boekhouding } : null;
}
__name(rolVan, "rolVan");
function magAlles(rol) {
  return rol === "eigenaar" || rol === "hr";
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
  async fetch(req, env, ctx) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const nu = Math.floor(Date.now() / 1e3);
    const nuISO = (/* @__PURE__ */ new Date()).toISOString();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
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
      if (path === "/ws") {
        const t = url.searchParams.get("token") ?? "";
        const s = t ? await leesToken(t, env.JWT_SECRET, nu) : null;
        if (!s) return new Response("unauthorized", { status: 401, headers: CORS });
        return env.SYNC_HUB.get(env.SYNC_HUB.idFromName("global")).fetch(req);
      }
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const sessie = token ? await leesToken(token, env.JWT_SECRET, nu) : null;
      if (!sessie) return json({ error: "Geen geldige sessie." }, 401);
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
      const mijnRechten = await rolVan(env, ikEmail).catch(() => null);
      const afgeschermd = afgeschermdVoor(mijnRechten);
      if (path === "/rechten" && req.method === "GET") {
        return json({ rol: mijnRechten?.rol ?? "monteur", boekhouding: !!mijnRechten?.boekhouding, afgeschermd: [...afgeschermd] });
      }
      if (path === "/state" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, data from wire_state").all();
          const out = {};
          for (const r of results ?? []) {
            if (afgeschermd.has(r.key)) continue;
            try {
              out[r.key] = JSON.parse(r.data);
            } catch {
            }
          }
          return json(out);
        } catch (e) {
          const rijen = await spiegelSelect(env, "wire_state", "select=key,data");
          if (!rijen) throw e;
          const out = {};
          for (const r of rijen) {
            if (!afgeschermd.has(r.key)) out[r.key] = r.data;
          }
          return json(out);
        }
      }
      if (path === "/state/versions" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, updated_at from wire_state").all();
          const out = {};
          for (const r of results ?? []) out[r.key] = r.updated_at;
          return json(out);
        } catch (e) {
          const rijen = await spiegelSelect(env, "wire_state", "select=key,updated_at");
          if (!rijen) throw e;
          const out = {};
          for (const r of rijen) out[r.key] = r.updated_at;
          return json(out);
        }
      }
      if (path === "/state/keys" && req.method === "POST") {
        const keys = Array.isArray(body.keys) ? body.keys.filter((k) => typeof k === "string") : [];
        const out = {};
        const mag = keys.filter((k) => !afgeschermd.has(k));
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
        return json(out);
      }
      if (path === "/state" && req.method === "POST") {
        const key = String(body.key ?? "");
        if (!key) return json({ error: "key ontbreekt." }, 400);
        if (afgeschermd.has(key)) return json({ error: `Je hebt geen toegang tot '${key}'.` }, 403);
        if (key === "users" && !magAlles(mijnRechten?.rol)) body.data = await zeefRollen(env, body.data);
        const dataText = JSON.stringify(body.data ?? null);
        await env.DB.prepare(
          "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
        ).bind(key, dataText, nuISO).run();
        spiegelUpsert(env, ctx, "wire_state", [{ key, data: body.data ?? null, updated_at: nuISO }], "key");
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
        const { results: afspraken } = await env.DB.prepare(
          "select adres_id, datum, tijdslot, naam, telefoon, email, notitie, ingevuld_door, ingevuld_op from bodem_afspraken where project_id = ? order by datum, tijdslot"
        ).bind(projectId).all();
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
        await env.DB.prepare("delete from bodem_afspraken where adres_id = ?").bind(adresId).run();
        spiegelVerwijder(env, ctx, "bodem_afspraken", "adres_id", adresId);
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

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-y6b3lY/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-y6b3lY/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  SyncHub,
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

// Wire Solutions — centrale database op Cloudflare (Workers + D1)
// ─────────────────────────────────────────────────────────────────────────────
// Vervangt Supabase. Eén Worker met eigen JWT-auth (HMAC) + wachtwoord-hashing (PBKDF2 via Web Crypto),
// en een D1-database (SQLite) met dezelfde tabellen als voorheen. De frontend praat via fetch met de routes
// hieronder; de datalaag (src/lib/supabase.ts) heeft exact dezelfde functies als eerst, dus de rest van de
// app verandert niet. Realtime is vervangen door de bestaande 2s-poll (was al het vangnet).
//
// ROUTES (alles behalve /auth/* vereist een geldige Bearer-token):
//   POST /auth/signup            { email, wachtwoord }              -> { token, email }   (maakt account aan als nodig)
//   POST /auth/login             { email, wachtwoord }              -> { token, email }   (401 bij fout)
//   POST /auth/wachtwoord        { nieuwWachtwoord }                -> { ok }             (eigen wachtwoord wijzigen)
//   GET  /state                                                     -> { <key>: <data> }
//   GET  /state/versions                                            -> { <key>: <updated_at> }
//   POST /state/keys             { keys: [...] }                    -> { <key>: <data> }
//   POST /state                  { key, data }                      -> { updated_at }
//   GET  /verlof                                                    -> { rows: [...] }
//   POST /verlof                 { verlof_id, status, ... }         -> { ok }             (alleen boekhouding)
//   POST /roles                  { email, rol, boekhouding }        -> { ok }             (eigenaar of HR)
//   DELETE /roles                { email }                          -> { ok }             (eigenaar of HR)
//   POST /audit                  { actie, door_email, ... }         -> { ok }
//   POST /admin/reset-wachtwoord { doelEmail, nieuwWachtwoord }     -> { ok }             (eigenaar, HR of beheer)
//   POST /admin/wijzig-email     { oudEmail, nieuwEmail }           -> { ok }             (eigenaar, HR of beheer)
//   POST /admin/verwijder-account { doelEmail }                     -> { ok }             (eigenaar, HR of beheer)
//   GET  /status                                                    -> { cloudflare, supabase, gelijk }
//   POST /spiegel/herstel                                           -> { ok, onderdelen, ... } (eigenaar of HR)
//
// SECRET (verplicht):  wrangler secret put JWT_SECRET    (willekeurige lange string)
// BINDING (wrangler.toml): D1 als env.DB
//
// ── TWEEDE DATABASE (Supabase-spiegel) ──
// D1 blijft de baas. Staat SUPABASE_URL + SUPABASE_SERVICE_KEY ingesteld, dan schrijft de Worker elke
// wijziging óók naar Supabase (in de achtergrond, dus zonder vertraging) en leest hij daaruit zodra D1
// een fout geeft. Zie cloudflare/spiegel.ts en supabase/spiegel.sql. Staan de secrets niet ingesteld,
// dan slaapt de spiegel en werkt alles precies als voorheen.

import {
  spiegelAan, spiegelUpsert, spiegelVerwijder, spiegelInsert, spiegelSelect,
  spiegelStatus, herspiegelAlles, type SpiegelEnv,
} from "./spiegel";

export interface Env extends SpiegelEnv {
  DB: D1Database;
  JWT_SECRET: string;
  SYNC_HUB: DurableObjectNamespace;
}

// ── Realtime-hub (Durable Object) ──
// Eén globale instantie houdt alle open WebSockets van de apparaten vast (met hibernation, zodat idle
// verbindingen niets kosten). Na elke schrijfactie stuurt de Worker hierheen een broadcast, die de hub
// meteen naar álle verbonden apparaten doorstuurt → wijzigingen verschijnen binnen een fractie van een sec.
export class SyncHub {
  state: DurableObjectState;
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/broadcast")) {
      const msg = await request.text();
      for (const ws of this.state.getWebSockets()) {
        try { ws.send(msg); } catch { /* dode socket — hibernation ruimt op */ }
      }
      return new Response("ok");
    }
    if (request.headers.get("Upgrade") === "websocket") {
      const pair = new WebSocketPair();
      this.state.acceptWebSocket(pair[1]); // hibernation API: overleeft idle-periodes gratis
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    return new Response("not found", { status: 404 });
  }
  // Client stuurt af en toe "ping" om de verbinding warm te houden → wij antwoorden "pong".
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (message === "ping") { try { ws.send("pong"); } catch { /* noop */ } }
  }
  webSocketClose(ws: WebSocket): void {
    try { ws.close(); } catch { /* noop */ }
  }
  webSocketError(): void { /* niets — hibernation ruimt de socket op */ }
}

// Stuurt een bericht naar alle verbonden apparaten (fire-and-forget; vertraagt de schrijf niet).
function broadcast(env: Env, ctx: ExecutionContext, msg: unknown): void {
  try {
    const stub = env.SYNC_HUB.get(env.SYNC_HUB.idFromName("global"));
    ctx.waitUntil(stub.fetch("https://hub/broadcast", { method: "POST", body: JSON.stringify(msg) }));
  } catch { /* realtime is een extra bovenop de poll — nooit de schrijf laten falen */ }
}

// ── CORS ── auth loopt via de Authorization-header (geen cookies), dus '*' mag.
const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

// ── base64url helpers ──
function bufToB64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlToBuf(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Wachtwoord hashen/verifiëren (PBKDF2-SHA256, 100k iteraties) ──
const PBKDF2_ITER = 100_000;
async function hashWachtwoord(wachtwoord: string, saltIn?: Uint8Array, iteraties = PBKDF2_ITER): Promise<string> {
  const salt = saltIn ?? crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(wachtwoord), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: iteraties, hash: "SHA-256" }, key, 256);
  return `pbkdf2$${iteraties}$${bufToB64url(salt)}$${bufToB64url(bits)}`;
}
function tijdveiligGelijk(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let v = 0;
  for (let i = 0; i < a.length; i++) v |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return v === 0;
}
async function verifieerWachtwoord(wachtwoord: string, opgeslagen: string): Promise<boolean> {
  const delen = opgeslagen.split("$");
  if (delen.length !== 4 || delen[0] !== "pbkdf2") return false;
  // Het AANTAL ITERATIES uit de opgeslagen hash gebruiken, niet de huidige standaard. Deden we dat niet,
  // dan mislukt elke hash die met een ander aantal is gemaakt — en de app zelf rekent met 150.000
  // (src/lib/auth.ts), tegen 100.000 hier. Zonder dit kan een overgezet account nooit inloggen.
  const iteraties = Number(delen[1]);
  if (!Number.isFinite(iteraties) || iteraties < 1000 || iteraties > 1_000_000) return false;
  const salt = b64urlToBuf(delen[2]);
  const opnieuw = await hashWachtwoord(wachtwoord, salt, iteraties);
  return tijdveiligGelijk(opnieuw, opgeslagen);
}

// ── JWT (HS256) ──
async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
const JWT_GELDIG_SEC = 60 * 60 * 24 * 30; // 30 dagen; self-healing login verlengt vanzelf
async function maakToken(email: string, secret: string, nu: number): Promise<string> {
  const header = bufToB64url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = bufToB64url(new TextEncoder().encode(JSON.stringify({ email, iat: nu, exp: nu + JWT_GELDIG_SEC })));
  const data = `${header}.${payload}`;
  return `${data}.${bufToB64url(await hmac(secret, data))}`;
}
async function leesToken(token: string, secret: string, nu: number): Promise<{ email: string } | null> {
  const p = token.split(".");
  if (p.length !== 3) return null;
  const verwacht = bufToB64url(await hmac(secret, `${p[0]}.${p[1]}`));
  if (!tijdveiligGelijk(p[2], verwacht)) return null;
  try {
    const body = JSON.parse(new TextDecoder().decode(b64urlToBuf(p[1]))) as { email?: string; exp?: number };
    if (!body.email || !body.exp || body.exp < nu) return null;
    return { email: String(body.email).toLowerCase() };
  } catch {
    return null;
  }
}

// ── Rol-helpers (lezen app_roles, net als de RLS-functies is_owner/is_boekhouding) ──
async function rolVan(env: Env, email: string): Promise<{ rol: string; boekhouding: boolean } | null> {
  const r = await env.DB.prepare("select rol, boekhouding from app_roles where email = ?").bind(email).first<{ rol: string; boekhouding: number }>();
  return r ? { rol: r.rol, boekhouding: !!r.boekhouding } : null;
}

// HR (personeelszaken) heeft dezelfde rechten als de eigenaar — zelfde regel als magAlles in
// src/lib/rechten.ts. Zonder dit kan HR in het dashboard wél een rol of wachtwoord wijzigen,
// maar weigert de Worker de bijbehorende schrijfactie.
function magAlles(rol: string | null | undefined): boolean {
  return rol === "eigenaar" || rol === "hr";
}

// Staat dit e-mailadres in de teamlijst (wire_state key 'users')? Alleen mensen die de beheerder in het
// dashboard heeft aangemaakt mogen een account krijgen. Zonder deze check was /auth/signup vrije
// registratie: elk willekeurig adres kreeg een token met lees- én schrijfrecht op álle bedrijfsdata.
//
// Uitzondering: is er nog GEEN teamlijst (lege database, allereerste start), dan mag de eerste
// aanmelding er wel in — anders kan niemand ooit beginnen.
async function hoortBijHetTeam(env: Env, email: string): Promise<boolean> {
  const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first<{ data: string }>();
  if (!rij) return true; // nog geen teamlijst → bootstrap toestaan
  let lijst: unknown;
  try { lijst = JSON.parse(rij.data); } catch { return false; }
  if (!Array.isArray(lijst) || !lijst.length) return true; // lege lijst → ook bootstrap
  return (lijst as Array<Record<string, unknown>>).some(
    (u) => String(u?.email ?? "").trim().toLowerCase() === email
  );
}

// Toegestane rollen — voorkomt dat er via een push een verzonnen rol in app_roles belandt.
const ROLLEN = new Set(["eigenaar", "hr", "beheer", "monteur"]);

// Zeeft de rollen uit een binnenkomende gebruikerslijst: elk record krijgt de rol en beheerrechten
// terug die AL in de database stonden. Zo kan een gewone medewerker via een gewone datapush nooit
// zijn eigen rol (of die van een ander) verhogen — daarvoor is de beveiligde route POST /roles, of een
// push door de eigenaar/HR. Onbekende e-mailadressen worden hoe dan ook 'monteur'.
async function zeefRollen(env: Env, binnen: unknown): Promise<unknown> {
  if (!Array.isArray(binnen)) return binnen;
  const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first<{ data: string }>();
  if (!rij) return binnen; // nog geen lijst → niets om tegen af te zetten (bootstrap)
  let oud: unknown;
  try { oud = JSON.parse(rij.data); } catch { return binnen; }
  if (!Array.isArray(oud)) return binnen;

  const bekend = new Map<string, { rol: unknown; beheerRechten: unknown }>();
  for (const u of oud as Array<Record<string, unknown>>) {
    const e = String(u?.email ?? "").trim().toLowerCase();
    if (e) bekend.set(e, { rol: u?.rol, beheerRechten: u?.beheerRechten });
  }
  return (binnen as Array<Record<string, unknown>>).map((u) => {
    const e = String(u?.email ?? "").trim().toLowerCase();
    const was = bekend.get(e);
    if (!was) return { ...u, rol: "monteur", beheerRechten: undefined };
    return { ...u, rol: was.rol, beheerRechten: was.beheerRechten };
  });
}

// NOG OPEN (bewust, zie het verslag): /state kent geen rechten PER ONDERDEEL. Een ingelogde monteur kan
// dus rechtstreeks bij de Worker 'loonstroken' of 'facturen' opvragen, ook al verbergt de app die schermen.
// Dat afschermen kan niet zomaar hier: de app haalt álle onderdelen op en voegt ze samen, dus een geweigerd
// of ontbrekend onderdeel zou de sync in de war sturen en data kunnen wissen. Dat vraagt een aanpassing aan
// beide kanten tegelijk — apart uitvoeren, niet tussendoor.

// Leidt de rol-spiegel af uit de users-blob (poort van de bootstrap in fase2.sql), zodat is_owner/is_boekhouding
// meteen kloppen zonder aparte schrijfactie vanuit de frontend.
async function seedRollenUitUsers(env: Env, users: unknown, nuISO: string, ctx?: ExecutionContext): Promise<void> {
  if (!Array.isArray(users)) return;
  const stmts: D1PreparedStatement[] = [];
  const spiegelRijen: Record<string, unknown>[] = [];
  for (const u of users as Array<Record<string, unknown>>) {
    const email = String(u?.email ?? "").trim().toLowerCase();
    if (!email) continue;
    const gevraagd = String(u?.rol ?? "monteur");
    const rol = ROLLEN.has(gevraagd) ? gevraagd : "monteur"; // onbekende rol → laagste rechten
    const rechten = Array.isArray(u?.beheerRechten) ? (u.beheerRechten as string[]) : null;
    const boekhouding =
      magAlles(rol) ||
      (rol === "beheer" && (rechten === null || rechten.some((r) => ["facturen", "loonstroken", "boetes", "medewerkers"].includes(r))));
    stmts.push(
      env.DB.prepare(
        "insert into app_roles (email, rol, boekhouding, bijgewerkt_op) values (?1, ?2, ?3, ?4) " +
        "on conflict(email) do update set rol = ?2, boekhouding = ?3, bijgewerkt_op = ?4"
      ).bind(email, rol, boekhouding ? 1 : 0, nuISO)
    );
    spiegelRijen.push({ email, rol, boekhouding, bijgewerkt_op: nuISO });
  }
  if (stmts.length) await env.DB.batch(stmts);
  if (ctx && spiegelRijen.length) spiegelUpsert(env, ctx, "app_roles", spiegelRijen, "email");
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const nu = Math.floor(Date.now() / 1000);
    const nuISO = new Date().toISOString();
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    const body: Record<string, unknown> =
      req.method === "POST" || req.method === "DELETE" ? await req.json().catch(() => ({})) : {};

    try {
      // ── AUTH (geen token nodig) ──
      if (path === "/auth/signup" && req.method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        const ww = String(body.wachtwoord ?? "");
        if (!email.includes("@") || ww.length < 8) return json({ error: "Ongeldige invoer." }, 400);
        const bestaand = await env.DB.prepare("select pw_hash from users_auth where email = ?").bind(email).first<{ pw_hash: string }>();
        if (bestaand) {
          // Account bestaat al → dit is gewoon een inlogpoging. Zonder het juiste wachtwoord geen token:
          // anders kon iedereen die een e-mailadres kende zich als die persoon voordoen.
          if (!(await verifieerWachtwoord(ww, bestaand.pw_hash))) return json({ error: "Onjuiste inloggegevens." }, 401);
          return json({ token: await maakToken(email, env.JWT_SECRET, nu), email });
        }
        // Nieuw account → alleen voor iemand die de beheerder in het dashboard heeft aangemaakt.
        if (!(await hoortBijHetTeam(env, email))) {
          return json({ error: "Dit e-mailadres hoort niet bij het team. Vraag de beheerder een account aan te maken." }, 403);
        }
        const hash = await hashWachtwoord(ww);
        await env.DB.prepare("insert into users_auth (email, pw_hash, created_at) values (?, ?, ?)")
          .bind(email, hash, nuISO).run();
        spiegelUpsert(env, ctx, "users_auth", [{ email, pw_hash: hash, created_at: nuISO, updated_at: nuISO }], "email");
        return json({ token: await maakToken(email, env.JWT_SECRET, nu), email });
      }

      if (path === "/auth/login" && req.method === "POST") {
        const email = String(body.email ?? "").trim().toLowerCase();
        const ww = String(body.wachtwoord ?? "");
        let hash: string | null = null;
        try {
          const rij = await env.DB.prepare("select pw_hash from users_auth where email = ?").bind(email).first<{ pw_hash: string }>();
          hash = rij?.pw_hash ?? null;
        } catch {
          // D1 hapert → probeer in te loggen via de spiegel, zodat een storing niemand buitensluit.
          const rijen = await spiegelSelect<{ pw_hash: string }>(env, "users_auth", `select=pw_hash&email=eq.${encodeURIComponent(email)}`, 12000);
          hash = rijen?.[0]?.pw_hash ?? null;
        }
        if (!hash || !(await verifieerWachtwoord(ww, hash))) return json({ error: "Onjuiste inloggegevens." }, 401);
        return json({ token: await maakToken(email, env.JWT_SECRET, nu), email });
      }

      // ── WebSocket-verbinding voor realtime (token via query, want browsers kunnen geen header meesturen) ──
      if (path === "/ws") {
        const t = url.searchParams.get("token") ?? "";
        const s = t ? await leesToken(t, env.JWT_SECRET, nu) : null;
        if (!s) return new Response("unauthorized", { status: 401, headers: CORS });
        return env.SYNC_HUB.get(env.SYNC_HUB.idFromName("global")).fetch(req);
      }

      // ── Vanaf hier: geldige token vereist ──
      const auth = req.headers.get("Authorization") ?? "";
      const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const sessie = token ? await leesToken(token, env.JWT_SECRET, nu) : null;
      if (!sessie) return json({ error: "Geen geldige sessie." }, 401);
      const ikEmail = sessie.email;

      // Eigen wachtwoord wijzigen
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

      // ── STATE (gedeelde JSON-store; elke ingelogde gebruiker mag lezen/schrijven, net als is_team) ──
      if (path === "/state" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, data from wire_state").all<{ key: string; data: string }>();
          const out: Record<string, unknown> = {};
          // Eén kapotte rij mag niet de héle lees laten mislukken — dan synct er niets meer.
          for (const r of results ?? []) { try { out[r.key] = JSON.parse(r.data); } catch { /* rij overslaan */ } }
          return json(out);
        } catch (e) {
          // D1 hapert → lees uit de Supabase-spiegel zodat het team gewoon doorwerkt.
          const rijen = await spiegelSelect<{ key: string; data: unknown }>(env, "wire_state", "select=key,data");
          if (!rijen) throw e;
          const out: Record<string, unknown> = {};
          for (const r of rijen) out[r.key] = r.data; // in Supabase is 'data' jsonb → al geparsed
          return json(out);
        }
      }

      if (path === "/state/versions" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, updated_at from wire_state").all<{ key: string; updated_at: string }>();
          const out: Record<string, string> = {};
          for (const r of results ?? []) out[r.key] = r.updated_at;
          return json(out);
        } catch (e) {
          const rijen = await spiegelSelect<{ key: string; updated_at: string }>(env, "wire_state", "select=key,updated_at");
          if (!rijen) throw e;
          const out: Record<string, string> = {};
          for (const r of rijen) out[r.key] = r.updated_at;
          return json(out);
        }
      }

      if (path === "/state/keys" && req.method === "POST") {
        const keys = Array.isArray(body.keys) ? (body.keys as string[]).filter((k) => typeof k === "string") : [];
        const out: Record<string, unknown> = {};
        if (keys.length) {
          try {
            const ph = keys.map(() => "?").join(",");
            const { results } = await env.DB.prepare(`select key, data from wire_state where key in (${ph})`).bind(...keys).all<{ key: string; data: string }>();
            for (const r of results ?? []) { try { out[r.key] = JSON.parse(r.data); } catch { /* rij overslaan */ } }
          } catch (e) {
            const lijst = keys.map((k) => `"${k.replace(/"/g, '')}"`).join(",");
            const rijen = await spiegelSelect<{ key: string; data: unknown }>(env, "wire_state", `select=key,data&key=in.(${encodeURIComponent(lijst)})`);
            if (!rijen) throw e;
            for (const r of rijen) out[r.key] = r.data;
          }
        }
        return json(out);
      }

      if (path === "/state" && req.method === "POST") {
        const key = String(body.key ?? "");
        if (!key) return json({ error: "key ontbreekt." }, 400);
        // De gebruikerslijst bepaalt wie wat mag. Zonder deze zeef kon iedereen met een token zichzelf
        // in die lijst tot eigenaar promoveren en daarna wachtwoorden van collega's resetten.
        // Wie geen eigenaar/HR is, mag alles aan de lijst wijzigen (naam, contract, eigen wachtwoordhash)
        // BEHALVE de rollen — die worden teruggezet op wat er al stond.
        if (key === "users") {
          const mijnRol = await rolVan(env, ikEmail);
          if (!magAlles(mijnRol?.rol)) body.data = await zeefRollen(env, body.data);
        }
        const dataText = JSON.stringify(body.data ?? null);
        await env.DB.prepare(
          "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
        ).bind(key, dataText, nuISO).run();
        // Tweede kopie naar Supabase (achtergrond — vertraagt of blokkeert deze schrijf nooit).
        spiegelUpsert(env, ctx, "wire_state", [{ key, data: body.data ?? null, updated_at: nuISO }], "key");
        // Rol-spiegel bijwerken zodra de gebruikerslijst verandert (zodat is_owner/is_boekhouding kloppen).
        if (key === "users") await seedRollenUitUsers(env, body.data, nuISO, ctx);
        broadcast(env, ctx, { type: "changed", keys: [key], updated_at: nuISO }); // alle apparaten meteen op de hoogte
        return json({ updated_at: nuISO });
      }

      // ── VERLOF-BESLISSINGEN (iedereen leest; alleen boekhouding schrijft) ──
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
          "insert into verlof_beslissingen (verlof_id, status, beslist_door_email, beslist_door_naam, beslist_op) values (?1, ?2, ?3, ?4, ?5) " +
          "on conflict(verlof_id) do update set status = ?2, beslist_door_email = ?3, beslist_door_naam = ?4, beslist_op = ?5"
        ).bind(id, String(body.status ?? ""), String(body.beslist_door_email ?? ""), String(body.beslist_door_naam ?? ""), String(body.beslist_op ?? nuISO)).run();
        spiegelUpsert(env, ctx, "verlof_beslissingen", [{
          verlof_id: id, status: String(body.status ?? ""), beslist_door_email: String(body.beslist_door_email ?? ""),
          beslist_door_naam: String(body.beslist_door_naam ?? ""), beslist_op: String(body.beslist_op ?? nuISO),
        }], "verlof_id");
        return json({ ok: true });
      }

      // ── APP_ROLES (eigenaar/HR schrijven) ──
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

      // ── AUDIT (append-only; elke ingelogde gebruiker mag loggen) ──
      if (path === "/audit" && req.method === "POST") {
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, door_naam, doel_user_id, doel_email, doel_naam, details) values (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"
        ).bind(
          nuISO, String(body.actie ?? ""), body.door_email ?? null, body.door_naam ?? null,
          body.doel_user_id ?? null, body.doel_email ?? null, body.doel_naam ?? null,
          JSON.stringify(body.details ?? {})
        ).run();
        spiegelInsert(env, ctx, "admin_audit", {
          gemaakt_op: nuISO, actie: String(body.actie ?? ""), door_email: body.door_email ?? null, door_naam: body.door_naam ?? null,
          doel_user_id: body.doel_user_id ?? null, doel_email: body.doel_email ?? null, doel_naam: body.doel_naam ?? null,
          details: body.details ?? {},
        });
        return json({ ok: true });
      }

      // ── ADMIN-ACTIES (service-role vervanger; eigenaar/HR/beheer) ──
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
        const rij = await env.DB.prepare("select pw_hash from users_auth where email = ?").bind(oud).first<{ pw_hash: string }>();
        if (!rij) return json({ error: "Doelaccount niet gevonden." }, 404);
        // Nieuw record met dezelfde hash, oud verwijderen (SQLite kent geen simpele PK-rename).
        await env.DB.batch([
          env.DB.prepare("insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do update set pw_hash = ?2").bind(nieuw, rij.pw_hash, nuISO),
          env.DB.prepare("delete from users_auth where email = ?").bind(oud),
        ]);
        spiegelUpsert(env, ctx, "users_auth", [{ email: nieuw, pw_hash: rij.pw_hash, created_at: nuISO, updated_at: nuISO }], "email");
        spiegelVerwijder(env, ctx, "users_auth", "email", oud);
        // De rechten moeten mee verhuizen. Bleef de oude rij staan, dan hield het oude adres zijn rol —
        // en omdat het uit de gebruikerslijst verdwijnt, wordt dat een onzichtbaar spookaccount met
        // beheerrechten. Het nieuwe adres zou omgekeerd zonder rechten komen te zitten.
        const oudeRol = await env.DB.prepare("select rol, boekhouding from app_roles where email = ?")
          .bind(oud).first<{ rol: string; boekhouding: number }>();
        if (oudeRol) {
          await env.DB.batch([
            env.DB.prepare("insert into app_roles (email, rol, boekhouding, bijgewerkt_op) values (?1, ?2, ?3, ?4) on conflict(email) do update set rol = ?2, boekhouding = ?3, bijgewerkt_op = ?4")
              .bind(nieuw, oudeRol.rol, oudeRol.boekhouding, nuISO),
            env.DB.prepare("delete from app_roles where email = ?").bind(oud),
          ]);
          spiegelUpsert(env, ctx, "app_roles", [{ email: nieuw, rol: oudeRol.rol, boekhouding: !!oudeRol.boekhouding, bijgewerkt_op: nuISO }], "email");
          spiegelVerwijder(env, ctx, "app_roles", "email", oud);
        }
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, doel_email, details) values (?1, 'email_gewijzigd', ?2, ?3, ?4)"
        ).bind(nuISO, ikEmail, oud, JSON.stringify({ nieuw })).run();
        return json({ ok: true });
      }
      // Haalt het inlog-account weg. Zonder dit blijft een verwijderde medewerker gewoon inloggen op de
      // Worker (en dus alle teamdata lezen), want /auth/login kijkt alleen naar users_auth.
      if (path === "/admin/verwijder-account" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol) && rol?.rol !== "beheer") return json({ error: "Alleen een beheerder mag dit uitvoeren." }, 403);
        const doel = String(body.doelEmail ?? "").trim().toLowerCase();
        if (!doel.includes("@")) return json({ error: "Ongeldige invoer." }, 400);
        if (doel === ikEmail) return json({ error: "Je kunt je eigen account niet verwijderen." }, 400);
        await env.DB.batch([
          env.DB.prepare("delete from users_auth where email = ?").bind(doel),
          env.DB.prepare("delete from app_roles where email = ?").bind(doel),
        ]);
        spiegelVerwijder(env, ctx, "users_auth", "email", doel);
        spiegelVerwijder(env, ctx, "app_roles", "email", doel);
        await env.DB.prepare(
          "insert into admin_audit (gemaakt_op, actie, door_email, doel_email, details) values (?1, 'account_verwijderd', ?2, ?3, ?4)"
        ).bind(nuISO, ikEmail, doel, JSON.stringify({ via: "worker" })).run();
        return json({ ok: true });
      }

      // ── ACCOUNTS KOPPELEN ──
      // De app bewaart per medewerker een eigen PBKDF2-hash in de teamlijst (van vóór de centrale login).
      // Iemand die nog geen rij in users_auth heeft, kan daardoor alleen inloggen op een apparaat waar die
      // lijst al lokaal staat — op een nieuw of gewist toestel lukt het niet. Dat is precies de klacht
      // "accounts raken los". Hier zetten we die bestaande hashes om naar het formaat van de Worker, zodat
      // iedereen overal met zijn eigen, ongewijzigde wachtwoord kan inloggen. Niemand hoeft iets te wijzigen.
      if (path === "/admin/koppel-accounts" && req.method === "POST") {
        const rol = await rolVan(env, ikEmail);
        if (!magAlles(rol?.rol)) return json({ error: "Alleen de eigenaar en HR mogen accounts koppelen." }, 403);
        const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first<{ data: string }>();
        if (!rij) return json({ error: "Geen teamlijst gevonden." }, 404);
        let lijst: unknown;
        try { lijst = JSON.parse(rij.data); } catch { return json({ error: "Teamlijst onleesbaar." }, 500); }
        if (!Array.isArray(lijst)) return json({ error: "Teamlijst heeft een onverwacht formaat." }, 500);

        const { results: bestaand } = await env.DB.prepare("select email from users_auth").all<{ email: string }>();
        const heeftAl = new Set((bestaand ?? []).map((r) => r.email));

        // Standaard-base64 (zoals de app het bewaart) → base64url (zoals de Worker het bewaart).
        const naarB64url = (s: string) => String(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

        const stmts: D1PreparedStatement[] = [];
        const spiegelRijen: Record<string, unknown>[] = [];
        const overgeslagen: string[] = [];
        for (const u of lijst as Array<Record<string, unknown>>) {
          const email = String(u?.email ?? "").trim().toLowerCase();
          if (!email || heeftAl.has(email)) continue;
          const h = String(u?.wachtwoordHash ?? ""), s = String(u?.wachtwoordSalt ?? "");
          const it = Number(u?.wachtwoordIter ?? 0);
          if (!h || !s || !Number.isFinite(it) || it < 1000) { overgeslagen.push(email); continue; }
          const pwHash = `pbkdf2$${it}$${naarB64url(s)}$${naarB64url(h)}`;
          stmts.push(
            env.DB.prepare("insert into users_auth (email, pw_hash, created_at) values (?1, ?2, ?3) on conflict(email) do nothing")
              .bind(email, pwHash, nuISO)
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

      // ── STATUS van beide databases ── voor de diagnose in de app (Instellingen → Sync & back-up).
      if (path === "/status" && req.method === "GET") {
        let d1Ok = false, d1Onderdelen = 0, d1Accounts = 0, d1Fout = "";
        try {
          const a = await env.DB.prepare("select count(*) as n from wire_state").first<{ n: number }>();
          const b = await env.DB.prepare("select count(*) as n from users_auth").first<{ n: number }>();
          d1Onderdelen = a?.n ?? 0; d1Accounts = b?.n ?? 0; d1Ok = true;
        } catch (e) { d1Fout = e instanceof Error ? e.message : String(e); }
        const spiegel = await spiegelStatus(env);
        return json({
          cloudflare: { gezond: d1Ok, onderdelen: d1Onderdelen, accounts: d1Accounts, fout: d1Fout },
          supabase: spiegel,
          gelijk: d1Ok && spiegel.gezond && spiegel.onderdelen === d1Onderdelen && spiegel.accounts === d1Accounts,
          tijd: nuISO,
        });
      }

      // ── SPIEGEL HERSTELLEN ── zet de hele D1-inhoud opnieuw in Supabase. Nodig ná een storing of
      // pauze: alles wat tijdens de downtime is gewijzigd, loopt daarna weer gelijk. Alleen eigenaar/HR.
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
  },
};

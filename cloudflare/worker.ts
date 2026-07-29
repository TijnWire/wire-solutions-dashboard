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
import { schrijfGesplitst, herstelAllemaal, isDeelSleutel } from "./delen";

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

// Hoeveel maanden bewaren we naam en telefoonnummer na afronding van een project?
const BEWAARMAANDEN = 6;

// De persoonsgegevens van een project wissen. Adres, uitkomst, datum en tijdblok blijven staan: daarmee
// kun je verantwoorden wát er is afgesproken, zonder nog te weten wie daar woonde.
async function wisPersoonsgegevens(env: Env, projectId: string, nuISO: string): Promise<{ adressen: number; afspraken: number }> {
  const a = await env.DB.prepare(
    "update bodem_adressen set bewoner = '', telefoon = '', email = '', bijgewerkt_op = ?2 where project_id = ?1 and (bewoner <> '' or telefoon <> '' or email <> '')"
  ).bind(projectId, nuISO).run();
  const b = await env.DB.prepare(
    "update bodem_afspraken set naam = '', telefoon = '', email = '' where project_id = ?1 and (naam <> '' or telefoon <> '' or email <> '')"
  ).bind(projectId).run();
  await env.DB.prepare("update bodem_projecten set gewist_op = ?2 where project_id = ?1").bind(projectId, nuISO).run();
  return { adressen: a.meta.changes ?? 0, afspraken: b.meta.changes ?? 0 };
}

// Een gebeurtenis vastleggen in het wijzigingslog. Bewust in de achtergrond: het log is belangrijk,
// maar niet zo belangrijk dat een medewerker aan de deur erop moet wachten of een fout krijgt als het
// even niet lukt.
function logBodem(
  env: Env, ctx: ExecutionContext,
  v: { projectId: string; adresId?: string; gebeurtenis: string; oud?: string; nieuw?: string; door: string; tijd: string },
): void {
  ctx.waitUntil(
    env.DB.prepare(
      "insert into bodem_log (project_id, adres_id, gebeurtenis, oud, nieuw, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
    ).bind(v.projectId, v.adresId ?? "", v.gebeurtenis, v.oud ?? "", v.nieuw ?? "", v.door, v.tijd).run()
      .then(() => undefined)
      .catch((e) => console.log("[log] wegschrijven mislukt:", String(e).slice(0, 120))),
  );
  spiegelInsert(env, ctx, "bodem_log", {
    project_id: v.projectId, adres_id: v.adresId ?? "", gebeurtenis: v.gebeurtenis,
    oud: v.oud ?? "", nieuw: v.nieuw ?? "", door: v.door, tijdstip: v.tijd,
  });
}

// Van e-mailadres naar het gebruikers-id uit de app. De Worker kent alleen het adres uit de token,
// maar adressen zijn toegewezen op id. Zonder deze vertaling kan er geen afscherming per medewerker zijn.
async function mijnUserId(env: Env, email: string): Promise<string | null> {
  const rij = await env.DB.prepare("select data from wire_state where key = 'users'").first<{ data: string }>();
  if (!rij) return null;
  try {
    const lijst = JSON.parse(rij.data) as Array<Record<string, unknown>>;
    if (!Array.isArray(lijst)) return null;
    const ik = lijst.find((u) => String(u?.email ?? "").trim().toLowerCase() === email);
    return ik ? String(ik.id) : null;
  } catch {
    return null;
  }
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

// ── RECHTEN PER ONDERDEEL ──
// De app verbergt de boekhoud-schermen al voor een monteur, maar dat is alleen de etalage: met zijn eigen
// token kon hij 'loonstroken' of 'facturen' gewoon rechtstreeks bij de Worker opvragen. Hier dwingen we het
// echt af.
//
// LET OP hoe dit samenwerkt met de sync, anders gaat er data verloren:
//   • GET /state en POST /state/keys LATEN afgeschermde onderdelen WEG uit het antwoord.
//   • GET /state/versions NOEMT ze wel (met hun tijdstempel). Dat is essentieel: de app uploadt namelijk
//     automatisch elk onderdeel dat zij lokaal heeft maar níét in de versielijst ziet staan. Zouden we ze
//     hier weglaten, dan zou de telefoon van een monteur zijn oude kopie van de loonstroken over de echte
//     heen schrijven.
//   • POST /state weigert ze met 403.
// De app haalt de lijst op via GET /rechten en laat die onderdelen daarna met rust (en ruimt ze lokaal op).
// LET OP: hier mogen alleen onderdelen in die in de app een LIJST zijn. Losse objecten (bedrijf,
// instellingen, comm) afschermen breekt de app aan de clientkant — zie de uitleg bij het opruimen in
// src/store/AppContext.tsx. Uitgezocht op 2026-07-27: klanten, verlof, bedrijf en instellingen zijn
// bewust NIET afgeschermd omdat monteur-schermen ze nodig hebben.
const BOEKHOUD_ONDERDELEN = ["loonstroken", "facturen", "boetes"];

function afgeschermdVoor(rol: { rol: string; boekhouding: boolean } | null): Set<string> {
  if (magAlles(rol?.rol)) return new Set();              // eigenaar en HR mogen alles
  if (rol?.boekhouding) return new Set();                // beheerder mét boekhoud-rechten ook
  return new Set(BOEKHOUD_ONDERDELEN);
}

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
  // Dagelijkse opruiming: projecten die langer dan de bewaartermijn geleden zijn afgerond, verliezen
  // hun persoonsgegevens. Draait via een cron-trigger (zie wrangler.toml), zodat het ook gebeurt als
  // er niemand inlogt — een bewaartermijn die afhangt van wie er toevallig het dashboard opent, is er geen.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    const nuISO = new Date().toISOString();
    const grens = new Date();
    grens.setMonth(grens.getMonth() - BEWAARMAANDEN);
    const grensISO = grens.toISOString();
    ctx.waitUntil((async () => {
      try {
        const { results } = await env.DB.prepare(
          "select project_id from bodem_projecten where afgerond_op <> '' and afgerond_op < ?1 and gewist_op = ''"
        ).bind(grensISO).all<{ project_id: string }>();
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

      // ── STATE (gedeelde JSON-store) ── met rechten per onderdeel, zie afgeschermdVoor().
      // Eén keer de rol ophalen en hergebruiken; elke route hieronder rekent ermee.
      const mijnRechten = await rolVan(env, ikEmail).catch(() => null);
      const afgeschermd = afgeschermdVoor(mijnRechten);

      // AVG: naam en telefoonnummer van bewoners zijn persoonsgegevens. Een medewerker hoort alleen te
      // zien wat aan hem is toegewezen; de leiding ziet alles. Zonder deze grens kon iedereen met een
      // token de bewonersgegevens van elk project opvragen.
      const zietAlles = magAlles(mijnRechten?.rol) || mijnRechten?.rol === "beheer";
      const mijnId = zietAlles ? null : await mijnUserId(env, ikEmail);

      // Welke onderdelen mag ik niet zien? De app vraagt dit op zodat zij ze niet probeert te uploaden
      // en haar eigen (mogelijk oude) kopie lokaal opruimt.
      if (path === "/rechten" && req.method === "GET") {
        return json({ rol: mijnRechten?.rol ?? "monteur", boekhouding: !!mijnRechten?.boekhouding, afgeschermd: [...afgeschermd] });
      }

      if (path === "/state" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, data from wire_state").all<{ key: string; data: string }>();
          const out: Record<string, unknown> = {};
          // Eén kapotte rij mag niet de héle lees laten mislukken — dan synct er niets meer.
          for (const r of results ?? []) {
            if (afgeschermd.has(r.key) || isDeelSleutel(r.key)) continue;
            try { out[r.key] = JSON.parse(r.data); } catch { /* rij overslaan */ }
          }
          // Onderdelen die te groot waren voor één rij staan in stukken; die zetten we hier weer aan
          // elkaar. De app krijgt gewoon één lijst terug en merkt van de splitsing niets.
          return json(await herstelAllemaal(env, out));
        } catch (e) {
          // D1 hapert → lees uit de Supabase-spiegel zodat het team gewoon doorwerkt.
          const rijen = await spiegelSelect<{ key: string; data: unknown }>(env, "wire_state", "select=key,data");
          if (!rijen) throw e;
          const out: Record<string, unknown> = {};
          for (const r of rijen) { if (!afgeschermd.has(r.key) && !isDeelSleutel(r.key)) out[r.key] = r.data; } // 'data' is jsonb → al geparsed
          return json(await herstelAllemaal(env, out));
        }
      }

      if (path === "/state/versions" && req.method === "GET") {
        try {
          const { results } = await env.DB.prepare("select key, updated_at from wire_state").all<{ key: string; updated_at: string }>();
          const out: Record<string, string> = {};
          // De losse stukken van een groot onderdeel horen hier niet in: de app kent ze niet en zou ze
          // anders als onbekend onderdeel gaan uploaden.
          for (const r of results ?? []) if (!isDeelSleutel(r.key)) out[r.key] = r.updated_at;
          return json(out);
        } catch (e) {
          const rijen = await spiegelSelect<{ key: string; updated_at: string }>(env, "wire_state", "select=key,updated_at");
          if (!rijen) throw e;
          const out: Record<string, string> = {};
          for (const r of rijen) if (!isDeelSleutel(r.key)) out[r.key] = r.updated_at;
          return json(out);
        }
      }

      if (path === "/state/keys" && req.method === "POST") {
        const keys = Array.isArray(body.keys) ? (body.keys as string[]).filter((k) => typeof k === "string") : [];
        const out: Record<string, unknown> = {};
        // Afgeschermde onderdelen er meteen uit filteren — dan hoeven ze niet eens uit de database.
        const mag = keys.filter((k) => !afgeschermd.has(k) && !isDeelSleutel(k));
        if (mag.length) {
          try {
            const ph = mag.map(() => "?").join(",");
            const { results } = await env.DB.prepare(`select key, data from wire_state where key in (${ph})`).bind(...mag).all<{ key: string; data: string }>();
            for (const r of results ?? []) { try { out[r.key] = JSON.parse(r.data); } catch { /* rij overslaan */ } }
          } catch (e) {
            const lijst = mag.map((k) => `"${k.replace(/"/g, '')}"`).join(",");
            const rijen = await spiegelSelect<{ key: string; data: unknown }>(env, "wire_state", `select=key,data&key=in.(${encodeURIComponent(lijst)})`);
            if (!rijen) throw e;
            for (const r of rijen) out[r.key] = r.data;
          }
        }
        return json(await herstelAllemaal(env, out));
      }

      if (path === "/state" && req.method === "POST") {
        const key = String(body.key ?? "");
        if (!key) return json({ error: "key ontbreekt." }, 400);
        if (afgeschermd.has(key)) return json({ error: `Je hebt geen toegang tot '${key}'.` }, 403);
        // De gebruikerslijst bepaalt wie wat mag. Zonder deze zeef kon iedereen met een token zichzelf
        // in die lijst tot eigenaar promoveren en daarna wachtwoorden van collega's resetten.
        // Wie geen eigenaar/HR is, mag alles aan de lijst wijzigen (naam, contract, eigen wachtwoordhash)
        // BEHALVE de rollen — die worden teruggezet op wat er al stond.
        if (key === "users" && !magAlles(mijnRechten?.rol)) body.data = await zeefRollen(env, body.data);
        if (isDeelSleutel(key)) return json({ error: "Deze naam is voor intern gebruik." }, 400);
        // Past het onderdeel in één rij, dan gaat het precies zoals altijd. Is het te groot voor de
        // database, dan knipt schrijfGesplitst het in stukken en zet de leesroute het weer in elkaar.
        // Zo mislukt een schrijf nooit meer op grootte — ook niet bij een map vol foto's.
        const { rijen: geschreven, gesplitst } = await schrijfGesplitst(env, key, body.data ?? null, nuISO);
        if (gesplitst) console.log("[delen]", key, "in", geschreven.length - 1, "stukken");
        // Tweede kopie naar Supabase (achtergrond — vertraagt of blokkeert deze schrijf nooit).
        spiegelUpsert(env, ctx, "wire_state", geschreven, "key");
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

      // ═══ BODEMONDERZOEK — afspraken met tijdslot ═══
      // De adreslijsten zitten in de JSON-opslag (werkt zonder bereik), maar een afspraak met een
      // bewoner mag nooit verloren gaan doordat een collega toevallig later opslaat. Daarom worden
      // afspraken hier als echte rijen bewaard, met de capaciteitscontrole in de database zelf.

      // Spelregels van een project opslaan (periode, werkdagen, tijdsloten + capaciteit).
      if (path === "/bodem/project" && req.method === "POST") {
        if (!magAlles(mijnRechten?.rol) && mijnRechten?.rol !== "beheer") {
          return json({ error: "Alleen een beheerder mag de planning instellen." }, 403);
        }
        const projectId = String(body.projectId ?? "");
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const config = JSON.stringify(body.config ?? {});
        await env.DB.prepare(
          "insert into bodem_projecten (project_id, config, bijgewerkt_op) values (?1, ?2, ?3) " +
          "on conflict(project_id) do update set config = ?2, bijgewerkt_op = ?3"
        ).bind(projectId, config, nuISO).run();
        spiegelUpsert(env, ctx, "bodem_projecten", [{ project_id: projectId, config: body.config ?? {}, bijgewerkt_op: nuISO }], "project_id");
        return json({ ok: true });
      }

      // Alles wat de app van een project nodig heeft: de spelregels, de afspraken en hoe vol elk blok zit.
      if (path === "/bodem/project" && req.method === "GET") {
        const projectId = url.searchParams.get("id") ?? "";
        if (!projectId) return json({ error: "id ontbreekt." }, 400);
        const cfg = await env.DB.prepare("select config from bodem_projecten where project_id = ?").bind(projectId).first<{ config: string }>();
        // De afsprakenlijst bevat namen en telefoonnummers; een medewerker krijgt alleen die van
        // zijn eigen adressen. De bezetting per blok hieronder is een telling zonder persoonsgegevens
        // en mag iedereen zien — die heeft hij nodig om te weten welk blok nog vrij is.
        const { results: afspraken } = zietAlles
          ? await env.DB.prepare(
              "select adres_id, datum, tijdslot, naam, telefoon, email, notitie, ingevuld_door, ingevuld_op from bodem_afspraken where project_id = ? order by datum, tijdslot"
            ).bind(projectId).all()
          : await env.DB.prepare(
              "select a.adres_id, a.datum, a.tijdslot, a.naam, a.telefoon, a.email, a.notitie, a.ingevuld_door, a.ingevuld_op " +
              "from bodem_afspraken a join bodem_adressen d on d.id = a.adres_id " +
              "where a.project_id = ?1 and d.toegewezen_aan = ?2 order by a.datum, a.tijdslot"
            ).bind(projectId, mijnId ?? "__geen__").all();
        const { results: bezet } = await env.DB.prepare(
          "select datum, tijdslot, count(*) as n from bodem_afspraken where project_id = ? group by datum, tijdslot"
        ).bind(projectId).all<{ datum: string; tijdslot: string; n: number }>();
        let config: unknown = null;
        if (cfg) { try { config = JSON.parse(cfg.config); } catch { config = null; } }
        return json({ config, afspraken: afspraken ?? [], bezetting: bezet ?? [] });
      }

      // ── Een afspraak vastleggen of verplaatsen ──
      // De capaciteitscontrole zit IN de insert: de rij wordt alleen weggeschreven als er op dat moment
      // nog plek is. Twee telefoons die tegelijk het laatste blok pakken, kunnen elkaar dus niet
      // overschrijven — de tweede krijgt netjes "blok is vol" terug in plaats van stilzwijgend te winnen.
      if (path === "/bodem/afspraak" && req.method === "POST") {
        const projectId = String(body.projectId ?? "");
        const adresId = String(body.adresId ?? "");
        const datum = String(body.datum ?? "");
        const tijdslot = String(body.tijdslot ?? "");
        if (!projectId || !adresId) return json({ error: "projectId en adresId zijn verplicht." }, 400);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(datum)) return json({ error: "Ongeldige datum." }, 400);
        if (!/^\d{2}:\d{2}-\d{2}:\d{2}$/.test(tijdslot)) return json({ error: "Ongeldig tijdslot." }, 400);
        if (!zietAlles) {
          const van = await env.DB.prepare("select toegewezen_aan from bodem_adressen where id = ?").bind(adresId).first<{ toegewezen_aan: string | null }>();
          if (van && van.toegewezen_aan !== mijnId) return json({ error: "Dit adres is niet aan jou toegewezen." }, 403);
        }

        // Spelregels ophalen en toetsen. Zonder ingestelde planning laten we de boeking door (dan is er
        // nog niets ingesteld en mag het werk niet stilvallen), maar mét planning is de server leidend.
        const cfgRij = await env.DB.prepare("select config from bodem_projecten where project_id = ?").bind(projectId).first<{ config: string }>();
        let max = Number.MAX_SAFE_INTEGER;
        if (cfgRij) {
          let cfg: { periodeStart?: string; periodeEind?: string; werkdagen?: number[]; sloten?: { slot: string; actief?: boolean; max?: number }[] } = {};
          try { cfg = JSON.parse(cfgRij.config); } catch { /* onleesbare config → geen extra eisen */ }
          if (cfg.periodeStart && datum < cfg.periodeStart) return json({ error: "Deze dag valt vóór de afgesproken periode." }, 409);
          if (cfg.periodeEind && datum > cfg.periodeEind) return json({ error: "Deze dag valt ná de afgesproken periode." }, 409);
          if (Array.isArray(cfg.werkdagen) && cfg.werkdagen.length) {
            // 0 = zondag … 6 = zaterdag, berekend zonder tijdzone-verschuiving.
            const [j, m, d] = datum.split("-").map(Number);
            const dag = new Date(Date.UTC(j, m - 1, d)).getUTCDay();
            if (!cfg.werkdagen.includes(dag)) return json({ error: "Op deze dag wordt niet gewerkt." }, 409);
          }
          const slot = cfg.sloten?.find((s) => s.slot === tijdslot);
          if (slot && slot.actief === false) return json({ error: "Dit tijdblok staat uit." }, 409);
          if (slot && typeof slot.max === "number" && slot.max >= 0) max = slot.max;
        }

        const bestaandeAfspraak = await env.DB.prepare("select datum, tijdslot from bodem_afspraken where adres_id = ?")
          .bind(adresId).first<{ datum: string; tijdslot: string }>();

        // Eén ondeelbare opdracht: tellen én wegschrijven. Het eigen adres telt niet mee, zodat een
        // bestaande afspraak verplaatsen binnen hetzelfde blok blijft werken.
        const res = await env.DB.prepare(
          "insert into bodem_afspraken (adres_id, project_id, datum, tijdslot, naam, telefoon, email, notitie, ingevuld_door, ingevuld_op) " +
          "select ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10 " +
          "where (select count(*) from bodem_afspraken where project_id = ?2 and datum = ?3 and tijdslot = ?4 and adres_id <> ?1) < ?11 " +
          "on conflict(adres_id) do update set project_id = ?2, datum = ?3, tijdslot = ?4, naam = ?5, telefoon = ?6, email = ?7, notitie = ?8, ingevuld_door = ?9, ingevuld_op = ?10"
        ).bind(
          adresId, projectId, datum, tijdslot,
          String(body.naam ?? ""), String(body.telefoon ?? ""), String(body.email ?? ""), String(body.notitie ?? ""),
          ikEmail, nuISO, max,
        ).run();

        // Stond er al een afspraak? Dan is dit een verplaatsing, en dat is precies wat je later wilt
        // kunnen navertellen als de bewoner belt dat hij op een ander moment werd verwacht.
        if (res.meta.changes) {
          logBodem(env, ctx, {
            projectId, adresId, door: ikEmail, tijd: nuISO,
            gebeurtenis: bestaandeAfspraak ? "afspraak_verplaatst" : "afspraak_gemaakt",
            oud: bestaandeAfspraak ? `${bestaandeAfspraak.datum} ${bestaandeAfspraak.tijdslot}` : "",
            nieuw: `${datum} ${tijdslot}`,
          });
        }
        if (!res.meta.changes) {
          const vol = await env.DB.prepare("select count(*) as n from bodem_afspraken where project_id = ? and datum = ? and tijdslot = ?")
            .bind(projectId, datum, tijdslot).first<{ n: number }>();
          return json({ error: "Dit tijdblok is inmiddels vol.", bezet: vol?.n ?? 0, max }, 409);
        }
        spiegelUpsert(env, ctx, "bodem_afspraken", [{
          adres_id: adresId, project_id: projectId, datum, tijdslot,
          naam: String(body.naam ?? ""), telefoon: String(body.telefoon ?? ""), email: String(body.email ?? ""),
          notitie: String(body.notitie ?? ""), ingevuld_door: ikEmail, ingevuld_op: nuISO,
        }], "adres_id");
        return json({ ok: true, datum, tijdslot });
      }

      // Afspraak intrekken (bewoner belt af, of de medewerker koos per ongeluk het verkeerde adres).
      if (path === "/bodem/afspraak" && req.method === "DELETE") {
        const adresId = String(body.adresId ?? "");
        if (!adresId) return json({ error: "adresId ontbreekt." }, 400);
        const weg = await env.DB.prepare("select project_id, datum, tijdslot from bodem_afspraken where adres_id = ?")
          .bind(adresId).first<{ project_id: string; datum: string; tijdslot: string }>();
        await env.DB.prepare("delete from bodem_afspraken where adres_id = ?").bind(adresId).run();
        spiegelVerwijder(env, ctx, "bodem_afspraken", "adres_id", adresId);
        if (weg) {
          logBodem(env, ctx, {
            projectId: weg.project_id, adresId, gebeurtenis: "afspraak_ingetrokken",
            oud: `${weg.datum} ${weg.tijdslot}`, door: ikEmail, tijd: nuISO,
          });
        }
        return json({ ok: true });
      }

      // Een bezoek zonder afspraak vastleggen (niet thuis, weigert, later terugkomen, adres ongeldig).
      if (path === "/bodem/bezoek" && req.method === "POST") {
        const projectId = String(body.projectId ?? "");
        const adresId = String(body.adresId ?? "");
        const uitkomst = String(body.uitkomst ?? "");
        if (!projectId || !adresId) return json({ error: "projectId en adresId zijn verplicht." }, 400);
        if (!["niet_thuis", "weigert", "later", "ongeldig"].includes(uitkomst)) return json({ error: "Onbekende uitkomst." }, 400);
        const eerder = await env.DB.prepare("select count(*) as n from bodem_bezoeken where project_id = ? and adres_id = ?")
          .bind(projectId, adresId).first<{ n: number }>();
        const poging = (eerder?.n ?? 0) + 1;
        await env.DB.prepare(
          "insert into bodem_bezoeken (project_id, adres_id, poging, uitkomst, notitie, door, tijdstip) values (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).bind(projectId, adresId, poging, uitkomst, String(body.notitie ?? ""), ikEmail, nuISO).run();
        spiegelInsert(env, ctx, "bodem_bezoeken", {
          project_id: projectId, adres_id: adresId, poging, uitkomst,
          notitie: String(body.notitie ?? ""), door: ikEmail, tijdstip: nuISO,
        });
        return json({ ok: true, poging });
      }

      // Een project afronden — vanaf dat moment loopt de bewaartermijn voor de persoonsgegevens.
      if (path === "/bodem/afronden" && req.method === "POST") {
        if (!zietAlles) return json({ error: "Alleen een beheerder mag een project afronden." }, 403);
        const projectId = String(body.projectId ?? "");
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const terug = body.ongedaan === true;
        await env.DB.prepare(
          "insert into bodem_projecten (project_id, config, bijgewerkt_op, afgerond_op) values (?1, '{}', ?2, ?3) " +
          "on conflict(project_id) do update set afgerond_op = ?3, bijgewerkt_op = ?2"
        ).bind(projectId, nuISO, terug ? "" : nuISO).run();
        logBodem(env, ctx, { projectId, gebeurtenis: terug ? "heropend" : "afgerond", door: ikEmail, tijd: nuISO });
        return json({ ok: true, afgerondOp: terug ? "" : nuISO });
      }

      // Persoonsgegevens nu wissen — bijvoorbeeld op verzoek van een bewoner, of zodra het werk is
      // opgeleverd. Alleen de eigenaar of HR: dit is onomkeerbaar.
      if (path === "/bodem/wis-persoonsgegevens" && req.method === "POST") {
        if (!magAlles(mijnRechten?.rol)) return json({ error: "Alleen de eigenaar en HR mogen persoonsgegevens wissen." }, 403);
        const projectId = String(body.projectId ?? "");
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const r = await wisPersoonsgegevens(env, projectId, nuISO);
        logBodem(env, ctx, { projectId, gebeurtenis: "gegevens_gewist", nieuw: `${r.adressen} adressen, ${r.afspraken} afspraken`, door: ikEmail, tijd: nuISO });
        return json({ ok: true, ...r });
      }

      // Status van de bewaartermijn: is het project afgerond, en wanneer worden de gegevens gewist?
      if (path === "/bodem/bewaartermijn" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const r = await env.DB.prepare("select afgerond_op, gewist_op from bodem_projecten where project_id = ?")
          .bind(projectId).first<{ afgerond_op: string; gewist_op: string }>();
        let wistOp = "";
        if (r?.afgerond_op) {
          const d = new Date(r.afgerond_op);
          d.setMonth(d.getMonth() + BEWAARMAANDEN);
          wistOp = d.toISOString().slice(0, 10);
        }
        return json({ afgerondOp: r?.afgerond_op ?? "", gewistOp: r?.gewist_op ?? "", wistOp, maanden: BEWAARMAANDEN });
      }

      // Het wijzigingslog uitlezen. Alleen de leiding: er staan e-mailadressen en bewonersgegevens in.
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

      // ═══ BODEMONDERZOEK — adressen als losse rijen ═══
      // Alle velden van een adres, in de volgorde die de queries hieronder gebruiken.
      const ADRES_VELDEN = [
        "id", "project_id", "volgorde", "straat", "huisnummer", "postcode", "plaats", "wijk", "perceel",
        "bewoner", "telefoon", "email", "notitie", "toegewezen_aan", "aanwezig", "datum", "tijdslot",
        "toestemming_tuin", "uitkomst", "pogingen", "afgerond", "afgerond_op", "afgerond_door",
        "verwijderd", "bijgewerkt_op",
      ] as const;

      // Ophalen. Met ?sinds=<ISO> krijg je alleen wat er daarna is gewijzigd — inclusief de zacht
      // verwijderde rijen, zodat een verwijdering ook doorkomt op een toestel dat even offline was.
      if (path === "/bodem/adressen" && req.method === "GET") {
        const projectId = url.searchParams.get("projectId") ?? "";
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        const sinds = url.searchParams.get("sinds") ?? "";
        const kolommen = ADRES_VELDEN.join(", ");
        const mij = mijnId ?? "__geen__";
        // De parameternummers lopen per tak netjes op; een gat erin laat de query mislukken.
        const { results } = sinds
          ? zietAlles
            ? await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and bijgewerkt_op > ?2 order by volgorde`).bind(projectId, sinds).all()
            : await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and bijgewerkt_op > ?2 and toegewezen_aan = ?3 order by volgorde`).bind(projectId, sinds, mij).all()
          : zietAlles
            ? await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and verwijderd = 0 order by volgorde`).bind(projectId).all()
            : await env.DB.prepare(`select ${kolommen} from bodem_adressen where project_id = ?1 and verwijderd = 0 and toegewezen_aan = ?2 order by volgorde`).bind(projectId, mij).all();
        return json({ adressen: results ?? [], tijd: nuISO, alleenEigen: !zietAlles });
      }

      // In bulk wegschrijven: import en het verdelen over het team. In stukjes van 40, want D1 kent een
      // maximum aantal parameters per opdracht.
      if (path === "/bodem/adressen" && req.method === "POST") {
        const projectId = String(body.projectId ?? "");
        const lijst = Array.isArray(body.adressen) ? (body.adressen as Record<string, unknown>[]) : [];
        if (!zietAlles) return json({ error: "Alleen een beheerder mag adressen importeren of verdelen." }, 403);
        if (!projectId) return json({ error: "projectId ontbreekt." }, 400);
        if (!lijst.length) return json({ ok: true, aantal: 0 });
        if (lijst.length > 5000) return json({ error: "Te veel adressen in één keer (maximaal 5000)." }, 400);

        const plaatsen = ADRES_VELDEN.map((_, i) => `?${i + 1}`).join(", ");
        const bijwerken = ADRES_VELDEN.filter((v) => v !== "id").map((v, i) => `${v} = ?${i + 2}`).join(", ");
        const sql = `insert into bodem_adressen (${ADRES_VELDEN.join(", ")}) values (${plaatsen}) on conflict(id) do update set ${bijwerken}`;

        let aantal = 0;
        for (let i = 0; i < lijst.length; i += 40) {
          const stuk = lijst.slice(i, i + 40).map((a) =>
            env.DB.prepare(sql).bind(
              String(a.id ?? ""), projectId, Number(a.volgorde ?? 0),
              String(a.straat ?? ""), String(a.huisnummer ?? ""), String(a.postcode ?? ""), String(a.plaats ?? ""),
              String(a.wijk ?? ""), String(a.perceel ?? ""),
              String(a.bewoner ?? ""), String(a.telefoon ?? ""), String(a.email ?? ""), String(a.notitie ?? ""),
              a.toegewezen_aan ? String(a.toegewezen_aan) : null,
              String(a.aanwezig ?? ""), String(a.datum ?? ""), String(a.tijdslot ?? ""),
              a.toestemming_tuin ? 1 : 0, String(a.uitkomst ?? ""), Number(a.pogingen ?? 0),
              a.afgerond ? 1 : 0, String(a.afgerond_op ?? ""), String(a.afgerond_door ?? ""),
              a.verwijderd ? 1 : 0, nuISO,
            )
          );
          await env.DB.batch(stuk);
          aantal += stuk.length;
        }
        // Tweede kopie naar Supabase (achtergrond; vertraagt of blokkeert deze schrijf nooit).
        spiegelUpsert(env, ctx, "bodem_adressen", lijst.map((a) => ({
          id: String(a.id ?? ""), project_id: projectId, volgorde: Number(a.volgorde ?? 0),
          straat: String(a.straat ?? ""), huisnummer: String(a.huisnummer ?? ""), postcode: String(a.postcode ?? ""),
          plaats: String(a.plaats ?? ""), wijk: String(a.wijk ?? ""), perceel: String(a.perceel ?? ""),
          bewoner: String(a.bewoner ?? ""), telefoon: String(a.telefoon ?? ""), email: String(a.email ?? ""),
          notitie: String(a.notitie ?? ""), toegewezen_aan: a.toegewezen_aan ?? null,
          aanwezig: String(a.aanwezig ?? ""), datum: String(a.datum ?? ""), tijdslot: String(a.tijdslot ?? ""),
          toestemming_tuin: !!a.toestemming_tuin, uitkomst: String(a.uitkomst ?? ""), pogingen: Number(a.pogingen ?? 0),
          afgerond: !!a.afgerond, afgerond_op: String(a.afgerond_op ?? ""), afgerond_door: String(a.afgerond_door ?? ""),
          verwijderd: !!a.verwijderd, bijgewerkt_op: nuISO,
        })), "id");
        // Eén regel voor de hele actie — een regel per adres maakt het log onleesbaar.
        logBodem(env, ctx, {
          projectId, gebeurtenis: lijst.some((a) => a.toegewezen_aan !== undefined) ? "verdeeld" : "geimporteerd",
          nieuw: `${aantal} adressen`, door: ikEmail, tijd: nuISO,
        });
        broadcast(env, ctx, { type: "bodem", projectId, updated_at: nuISO });
        return json({ ok: true, aantal, tijd: nuISO });
      }

      // Eén adres bijwerken — dit is de weg die de medewerker aan de deur gebruikt. Alleen de velden
      // die echt veranderen gaan mee, zodat het ook op een matige verbinding een klein berichtje blijft.
      if (path === "/bodem/adres" && req.method === "POST") {
        const id = String(body.id ?? "");
        const projectId = String(body.projectId ?? "");
        if (!id || !projectId) return json({ error: "id en projectId zijn verplicht." }, 400);
        const patch = (body.patch ?? {}) as Record<string, unknown>;

        const teZetten = Object.keys(patch).filter((k) => (ADRES_VELDEN as readonly string[]).includes(k) && k !== "id" && k !== "project_id");
        if (!teZetten.length) return json({ error: "Niets om bij te werken." }, 400);
        // Een medewerker mag alleen aan zijn eigen adressen komen.
        if (!zietAlles) {
          const van = await env.DB.prepare("select toegewezen_aan from bodem_adressen where id = ?").bind(id).first<{ toegewezen_aan: string | null }>();
          if (van && van.toegewezen_aan !== mijnId) return json({ error: "Dit adres is niet aan jou toegewezen." }, 403);
          // De toewijzing zelf mag hij niet wijzigen — anders kan hij zichzelf adressen toe-eigenen.
          if ("toegewezen_aan" in patch) return json({ error: "Alleen een beheerder mag adressen toewijzen." }, 403);
        }

        const vorige = await env.DB.prepare("select uitkomst, toegewezen_aan, verwijderd from bodem_adressen where id = ?")
          .bind(id).first();

        // Bestaat de rij nog niet (offline aangemaakt), dan zetten we hem hier alsnog neer.
        const zet = teZetten.map((k, i) => `${k} = ?${i + 3}`).join(", ");
        const waarden = teZetten.map((k) => {
          const v = patch[k];
          if (k === "toestemming_tuin" || k === "afgerond" || k === "verwijderd") return v ? 1 : 0;
          if (k === "volgorde" || k === "pogingen") return Number(v ?? 0);
          if (k === "toegewezen_aan") return v ? String(v) : null;
          return String(v ?? "");
        });
        const res = await env.DB.prepare(`update bodem_adressen set ${zet}, bijgewerkt_op = ?2 where id = ?1`)
          .bind(id, nuISO, ...waarden).run();
        if (!res.meta.changes) {
          await env.DB.prepare("insert into bodem_adressen (id, project_id, bijgewerkt_op) values (?1, ?2, ?3) on conflict(id) do nothing")
            .bind(id, projectId, nuISO).run();
          await env.DB.prepare(`update bodem_adressen set ${zet}, bijgewerkt_op = ?2 where id = ?1`).bind(id, nuISO, ...waarden).run();
        }
        if (spiegelAan(env)) {
          const rij = await env.DB.prepare(`select ${ADRES_VELDEN.join(", ")} from bodem_adressen where id = ?`).bind(id).first();
          if (rij) {
            const r = rij as Record<string, unknown>;
            spiegelUpsert(env, ctx, "bodem_adressen", [{
              ...r,
              toestemming_tuin: !!r.toestemming_tuin, afgerond: !!r.afgerond, verwijderd: !!r.verwijderd,
            }], "id");
          }
        }
        // Alleen de wijzigingen vastleggen waar later vragen over komen — niet elk ingevuld veld.
        const vorigeWaarden = (vorige ?? {}) as Record<string, unknown>;
        for (const [veld, gebeurtenis] of [["uitkomst", "uitkomst"], ["toegewezen_aan", "toegewezen"], ["verwijderd", "verwijderd"]] as const) {
          if (!(veld in patch)) continue;
          logBodem(env, ctx, {
            projectId, adresId: id, gebeurtenis,
            oud: String(vorigeWaarden[veld] ?? ""),
            nieuw: String(patch[veld] ?? ""), door: ikEmail, tijd: nuISO,
          });
        }
        broadcast(env, ctx, { type: "bodem", projectId, updated_at: nuISO });
        return json({ ok: true, tijd: nuISO });
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

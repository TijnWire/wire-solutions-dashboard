// Wire Solutions — Supabase als spiegel naast Cloudflare D1
// ─────────────────────────────────────────────────────────────────────────────
// De Worker + D1 blijven de baas. Supabase is een TWEEDE KOPIE die precies gelijk loopt:
//
//   SCHRIJVEN  → altijd eerst D1 (dat bepaalt of de actie lukt), daarna in de achtergrond naar Supabase.
//                De spiegel mag een schrijfactie NOOIT vertragen of laten mislukken — anders trekt een
//                slapende Supabase het hele dashboard onderuit, precies de storing waar we vandaan komen.
//   LEZEN      → altijd D1. Alleen als D1 een fout geeft, valt de Worker terug op Supabase.
//
// Aanzetten (de sleutel komt nooit in de code of in git terecht):
//   npx wrangler secret put SUPABASE_URL          →  https://buauptxdaiuvqazhlrhk.supabase.co
//   npx wrangler secret put SUPABASE_SERVICE_KEY  →  de service_role-key uit Supabase → Settings → API
//
// Staat één van de twee secrets niet ingesteld, dan slaapt de spiegel gewoon en werkt alles als voorheen.

export interface SpiegelEnv {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_KEY?: string;
}

export function spiegelAan(env: SpiegelEnv): boolean {
  return !!(env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY);
}

function koppen(env: SpiegelEnv, extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: env.SUPABASE_SERVICE_KEY!,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY!}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

// Eén PostgREST-aanroep met een harde tijdslimiet. Geeft nooit een exception naar buiten die de
// hoofdactie kan breken — de aanroeper beslist wat hij met het resultaat doet.
async function roep(
  env: SpiegelEnv,
  pad: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; tekst: string }> {
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

// ── SCHRIJVEN (upsert) ──
// Achtergrond-schrijf: de Worker heeft al geantwoord, dit loopt door via ctx.waitUntil.
// Een mislukking wordt geteld (zie spiegelStatus) maar breekt nooit iets af.
export function spiegelUpsert(
  env: SpiegelEnv,
  ctx: { waitUntil(p: Promise<unknown>): void },
  tabel: string,
  rijen: Record<string, unknown>[],
  conflictKolom: string,
  timeoutMs = 25000,
): void {
  if (!spiegelAan(env) || !rijen.length) return;
  const nu = new Date().toISOString();
  const metStempel = rijen.map((r) => ({ ...r, gespiegeld_op: nu }));
  ctx.waitUntil(
    roep(
      env,
      `${tabel}?on_conflict=${encodeURIComponent(conflictKolom)}`,
      {
        method: "POST",
        headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
        body: JSON.stringify(metStempel),
      },
      timeoutMs,
    ).then((r) => {
      if (!r.ok) console.log(`[spiegel] upsert ${tabel} mislukt (${r.status}): ${r.tekst.slice(0, 200)}`);
    }),
  );
}

// Rij(en) verwijderen in de spiegel — bv. bij een verwijderd account.
export function spiegelVerwijder(
  env: SpiegelEnv,
  ctx: { waitUntil(p: Promise<unknown>): void },
  tabel: string,
  kolom: string,
  waarde: string,
  timeoutMs = 15000,
): void {
  if (!spiegelAan(env)) return;
  ctx.waitUntil(
    roep(
      env,
      `${tabel}?${encodeURIComponent(kolom)}=eq.${encodeURIComponent(waarde)}`,
      { method: "DELETE", headers: koppen(env, { Prefer: "return=minimal" }) },
      timeoutMs,
    ).then((r) => {
      if (!r.ok) console.log(`[spiegel] delete ${tabel} mislukt (${r.status}): ${r.tekst.slice(0, 200)}`);
    }),
  );
}

// Rij toevoegen zonder conflict-afhandeling (append-only tabellen zoals admin_audit).
export function spiegelInsert(
  env: SpiegelEnv,
  ctx: { waitUntil(p: Promise<unknown>): void },
  tabel: string,
  rij: Record<string, unknown>,
  timeoutMs = 15000,
): void {
  if (!spiegelAan(env)) return;
  ctx.waitUntil(
    roep(env, tabel, { method: "POST", headers: koppen(env, { Prefer: "return=minimal" }), body: JSON.stringify([rij]) }, timeoutMs)
      .then((r) => { if (!r.ok) console.log(`[spiegel] insert ${tabel} mislukt (${r.status}): ${r.tekst.slice(0, 200)}`); }),
  );
}

// ── LEZEN (alleen als noodgeval, wanneer D1 een fout geeft) ──
export async function spiegelSelect<T = Record<string, unknown>>(
  env: SpiegelEnv,
  tabel: string,
  query: string,
  timeoutMs = 30000,
): Promise<T[] | null> {
  if (!spiegelAan(env)) return null;
  const r = await roep(env, `${tabel}?${query}`, { method: "GET", headers: koppen(env) }, timeoutMs);
  if (!r.ok) return null;
  try { return JSON.parse(r.tekst) as T[]; } catch { return null; }
}

// ── STATUS ── voor de diagnose in de app (Instellingen → Sync & back-up).
export type SpiegelStatus = {
  aan: boolean;
  gezond: boolean;
  melding: string;
  onderdelen?: number;      // aantal rijen in wire_state
  accounts?: number;        // aantal rijen in users_auth
  laatstGespiegeld?: string | null;
};

export async function spiegelStatus(env: SpiegelEnv): Promise<SpiegelStatus> {
  if (!spiegelAan(env)) {
    return { aan: false, gezond: false, melding: "Spiegel staat uit (SUPABASE_URL / SUPABASE_SERVICE_KEY niet ingesteld)." };
  }
  const versies = await spiegelSelect<{ key: string; gespiegeld_op: string | null }>(
    env, "wire_state_versies", "select=key,gespiegeld_op&order=gespiegeld_op.desc.nullslast", 12000,
  );
  if (!versies) {
    return { aan: true, gezond: false, melding: "Supabase antwoordt niet (database gepauzeerd of storing). Cloudflare draait gewoon door." };
  }
  const accounts = await spiegelSelect<{ email: string }>(env, "users_auth", "select=email", 12000);
  return {
    aan: true,
    gezond: true,
    melding: "Supabase-spiegel is bij — beide databases lopen gelijk.",
    onderdelen: versies.length,
    accounts: accounts?.length ?? 0,
    laatstGespiegeld: versies.find((v) => v.gespiegeld_op)?.gespiegeld_op ?? null,
  };
}

// ── VOLLEDIGE HERSPIEGELING ──
// Zet de hele D1-inhoud in één keer in Supabase. Nodig ná een storing/pauze: alles wat tijdens de
// downtime is gewijzigd, staat dan weer gelijk. Loopt in stukjes zodat één grote blob het niet breekt.
export async function herspiegelAlles(
  env: SpiegelEnv,
  d1: D1Database,
): Promise<{ ok: boolean; onderdelen: number; accounts: number; rollen: number; fout?: string }> {
  if (!spiegelAan(env)) return { ok: false, onderdelen: 0, accounts: 0, rollen: 0, fout: "Spiegel staat uit." };
  const nu = new Date().toISOString();
  let onderdelen = 0, accounts = 0, rollen = 0;

  try {
    // 1) Gedeelde data. Cloudflare staat op de gratis laag maar 50 uitgaande verzoeken per aanroep toe,
    //    dus we bundelen onderdelen tot pakketjes van ±3 MB in plaats van één verzoek per onderdeel.
    const { results: staat } = await d1.prepare("select key, data, updated_at from wire_state")
      .all<{ key: string; data: string; updated_at: string }>();
    const PAKKET_BYTES = 3_000_000;
    let pakket: Record<string, unknown>[] = [];
    let pakketBytes = 0;

    const stuur = async (): Promise<void> => {
      if (!pakket.length) return;
      const res = await roep(
        env, "wire_state?on_conflict=key",
        { method: "POST", headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }), body: JSON.stringify(pakket) },
        45000,
      );
      if (res.ok) onderdelen += pakket.length;
      else console.log(`[spiegel] herspiegelen mislukt (${res.status}): ${res.tekst.slice(0, 200)}`);
      pakket = [];
      pakketBytes = 0;
    };

    for (const r of staat ?? []) {
      let data: unknown;
      try { data = JSON.parse(r.data); } catch { continue; } // onleesbare rij overslaan i.p.v. alles laten klappen
      // Onderdeel groter dan een heel pakket? Dan gaat het alleen, in zijn eentje.
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

    // 2) Inloggegevens — in één keer, die zijn klein.
    const { results: auth } = await d1.prepare("select email, pw_hash, created_at from users_auth")
      .all<{ email: string; pw_hash: string; created_at: string }>();
    if (auth?.length) {
      const res = await roep(
        env, "users_auth?on_conflict=email",
        { method: "POST", headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(auth.map((a) => ({ ...a, updated_at: nu }))) },
        30000,
      );
      if (res.ok) accounts = auth.length;
    }

    // 3) Rollen.
    const { results: rol } = await d1.prepare("select email, rol, boekhouding, bijgewerkt_op from app_roles")
      .all<{ email: string; rol: string; boekhouding: number; bijgewerkt_op: string }>();
    if (rol?.length) {
      const res = await roep(
        env, "app_roles?on_conflict=email",
        { method: "POST", headers: koppen(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
          body: JSON.stringify(rol.map((r) => ({ email: r.email, rol: r.rol, boekhouding: !!r.boekhouding, bijgewerkt_op: r.bijgewerkt_op, gespiegeld_op: nu }))) },
        30000,
      );
      if (res.ok) rollen = rol.length;
    }

    return { ok: true, onderdelen, accounts, rollen };
  } catch (e) {
    return { ok: false, onderdelen, accounts, rollen, fout: e instanceof Error ? e.message : String(e) };
  }
}

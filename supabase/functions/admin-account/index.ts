// Wire Solutions — Edge Function "admin-account"
// ─────────────────────────────────────────────────────────────────────────────
// Voert de gevoelige beheerdersacties uit die de service-role vereisen (die NOOIT in de frontend mag):
//   • reset-wachtwoord : zet in Supabase Auth een nieuw wachtwoord (maakt het account aan als nodig)
//   • wijzig-email     : wijzigt in Supabase Auth het e-mailadres (inlog) van een medewerker
//
// Beveiliging: de aanroeper wordt geverifieerd via zijn eigen JWT (Authorization-header) en moet volgens
// de tabel public.app_roles de rol 'eigenaar' of 'beheer' hebben. Elke actie wordt in admin_audit gelogd
// met de geverifieerde beheerder als 'door'.
//
// DEPLOY (eenmalig, jij doet dit):
//   1) Draai eerst supabase/fase2.sql (maakt app_roles + admin_audit).
//   2) supabase functions deploy admin-account         (Supabase CLI, ingelogd op project buauptxdaiuvqazhlrhk)
//   De env-vars SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY worden door Supabase automatisch
//   in de function geïnjecteerd — je hoeft niets te configureren.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// Zoekt een Auth-gebruiker op e-mailadres (paginerend; klein team → weinig pagina's).
async function vindGebruiker(admin: ReturnType<typeof createClient>, email: string): Promise<string | null> {
  const doel = email.toLowerCase();
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const u = data.users.find((x) => (x.email ?? "").toLowerCase() === doel);
    if (u) return u.id;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST." }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Geen sessie." }, 401);

    // 1) Identificeer de aanroeper via zijn eigen token.
    const caller = createClient(url, anon, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await caller.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Ongeldige sessie." }, 401);
    const callerEmail = (userData.user.email ?? "").toLowerCase();

    // 2) Service-client (bypass RLS) — check de rol van de aanroeper en voer de actie uit.
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data: rolRij } = await admin.from("app_roles").select("rol").eq("email", callerEmail).maybeSingle();
    const rol = (rolRij as { rol?: string } | null)?.rol;
    if (rol !== "eigenaar" && rol !== "beheer") return json({ error: "Alleen een beheerder mag dit uitvoeren." }, 403);

    const body = await req.json().catch(() => ({}));
    const actie = String(body.actie ?? "");

    if (actie === "reset-wachtwoord") {
      const doelEmail = String(body.doelEmail ?? "").toLowerCase();
      const nieuw = String(body.nieuwWachtwoord ?? "");
      if (!doelEmail || nieuw.length < 8) return json({ error: "Ongeldige invoer." }, 400);
      let id = await vindGebruiker(admin, doelEmail);
      if (!id) {
        // Account bestaat nog niet in Auth → aanmaken met dit wachtwoord (meteen bevestigd).
        const { data, error } = await admin.auth.admin.createUser({ email: doelEmail, password: nieuw, email_confirm: true });
        if (error || !data.user) return json({ error: error?.message ?? "Aanmaken mislukt." }, 500);
        id = data.user.id;
      } else {
        const { error } = await admin.auth.admin.updateUserById(id, { password: nieuw });
        if (error) return json({ error: error.message }, 500);
      }
      await admin.from("admin_audit").insert({ actie: "wachtwoord_reset", door_email: callerEmail, doel_email: doelEmail, details: { via: "edge-function" } });
      return json({ ok: true });
    }

    if (actie === "wijzig-email") {
      const oud = String(body.oudEmail ?? "").toLowerCase();
      const nieuw = String(body.nieuwEmail ?? "").toLowerCase();
      if (!oud || !nieuw || !nieuw.includes("@")) return json({ error: "Ongeldige invoer." }, 400);
      const id = await vindGebruiker(admin, oud);
      if (!id) return json({ error: "Doelaccount niet gevonden in Auth." }, 404);
      const { error } = await admin.auth.admin.updateUserById(id, { email: nieuw, email_confirm: true });
      if (error) return json({ error: error.message }, 500);
      await admin.from("admin_audit").insert({ actie: "email_gewijzigd", door_email: callerEmail, doel_email: oud, details: { nieuw } });
      return json({ ok: true });
    }

    return json({ error: "Onbekende actie." }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

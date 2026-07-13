-- ─────────────────────────────────────────────────────────────────────────────
-- Wire Solutions — SYNC GOEDZETTEN
-- Draai dit ÉÉN keer: Supabase → SQL Editor → New query → plak alles → Run.
-- Je mag het gerust vaker draaien; het overschrijft de regels netjes (idempotent).
--
-- Wat het doet: het maakt de gedeelde tabel + beveiliging + realtime, en laat vanaf nu
-- ELK ingelogd account synchroniseren (dus ook gmail-/andere adressen). Daarmee is de
-- meest voorkomende oorzaak weg dat collega's elkaars wijzigingen niet zien.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Gedeelde tabel: één rij per onderdeel (key) met de inhoud als JSON.
create table if not exists public.wire_state (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) Beveiliging aan (row level security).
alter table public.wire_state enable row level security;

-- 3) Wie mag bij de gedeelde data? → IEDEREEN die is ingelogd (geen e-mail-domein-eis meer).
--    Veilig genoeg voor een intern teamdashboard: je moet nog steeds inloggen met een geldig
--    account + wachtwoord om een sessie te krijgen.
create or replace function public.is_team() returns boolean
  language sql stable as $$
    select auth.role() = 'authenticated'
  $$;

-- 4) Lees-/schrijf-regels (gebruiken de functie hierboven).
drop policy if exists wire_select on public.wire_state;
create policy wire_select on public.wire_state for select using (public.is_team());

drop policy if exists wire_insert on public.wire_state;
create policy wire_insert on public.wire_state for insert with check (public.is_team());

drop policy if exists wire_update on public.wire_state;
create policy wire_update on public.wire_state for update using (public.is_team()) with check (public.is_team());

drop policy if exists wire_delete on public.wire_state;
create policy wire_delete on public.wire_state for delete using (public.is_team());

-- 5) Realtime aanzetten zodat wijzigingen direct bij iedereen verschijnen.
--    (Krijg je "already member of publication"? Dan stond 'ie al aan — negeren.)
alter publication supabase_realtime add table public.wire_state;

-- ── DAARNA eenmalig in het Supabase-dashboard (Authentication → Providers → Email) ──
--   • "Confirm email"                 → UIT   (nieuw account krijgt meteen een sessie)
--   • "Allow new users to sign up"    → AAN   (de app koppelt elk teamlid vanzelf aan)
--
-- ── EN op elk apparaat (telefoon + laptop) ──
--   1. Log één keer UIT en weer IN (zo krijgt dit apparaat een verse Supabase-sessie).
--   2. Check: Instellingen → Integraties → "Sync testen". Alles moet ✓ zijn (sessie, lezen, schrijven).
--   3. Maak op apparaat A een kleine wijziging; op apparaat B verschijnt die binnen enkele seconden.

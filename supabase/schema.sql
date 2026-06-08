-- Wire Solutions — centrale database (Supabase)
-- Plak dit volledig in Supabase → SQL Editor → Run.
-- Het maakt de gedeelde tabel aan, beveiligt 'm (alleen ingelogde teamleden) en zet realtime aan.

-- 1) Tabel: één rij per onderdeel (key) met de inhoud als JSON.
create table if not exists public.wire_state (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) Beveiliging: row level security aan, en alléén ingelogde gebruikers mogen erbij.
alter table public.wire_state enable row level security;

drop policy if exists wire_select on public.wire_state;
create policy wire_select on public.wire_state
  for select using (auth.role() = 'authenticated');

drop policy if exists wire_insert on public.wire_state;
create policy wire_insert on public.wire_state
  for insert with check (auth.role() = 'authenticated');

drop policy if exists wire_update on public.wire_state;
create policy wire_update on public.wire_state
  for update using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists wire_delete on public.wire_state;
create policy wire_delete on public.wire_state
  for delete using (auth.role() = 'authenticated');

-- 3) Realtime aanzetten zodat wijzigingen direct bij iedereen verschijnen.
alter publication supabase_realtime add table public.wire_state;

-- ── BELANGRIJK, doe daarna in het dashboard ──
-- Authentication → Providers → Email: zet "Confirm email" UIT (logins werken dan meteen).
-- Authentication → Sign In / Providers (of: Settings): zet "Allow new users to sign up" UIT,
--   anders kan een buitenstaander zich registreren en zou die als 'authenticated' bij de data kunnen.

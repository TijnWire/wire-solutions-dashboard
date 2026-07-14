-- Wire Solutions — centrale database (Supabase)
-- Plak dit volledig in Supabase → SQL Editor → Run (mag je opnieuw draaien; het overschrijft de policies netjes).
-- Het maakt de gedeelde tabel aan, beveiligt 'm (alleen team-accounts op @wiresolutions.nl) en zet realtime aan.

-- 1) Tabel: één rij per onderdeel (key) met de inhoud als JSON.
create table if not exists public.wire_state (
  key        text primary key,
  data       jsonb not null,
  updated_at timestamptz not null default now()
);

-- 2) Beveiliging: row level security aan. Alléén ingelogde team-accounts (e-mail op @wiresolutions.nl)
--    mogen bij de data. Zo kan de app nieuwe team-accounts zelf aanmaken (signup) zónder dat een
--    buitenstaander met een willekeurig e-mailadres bij de gegevens kan.
alter table public.wire_state enable row level security;

-- Helper: is de huidige sessie een ingelogd team-account?
create or replace function public.is_team() returns boolean
  language sql stable as $$
    -- IEDEREEN die is ingelogd mag synchroniseren — bewust GEEN e-mail-domein-eis.
    -- Teamleden loggen ook in met gmail e.d.; een domein-eis blokkeerde hun lezen/schrijven
    -- via RLS, waardoor de sync tussen apparaten "kapot" leek. Zie sync-goedzetten.sql.
    select auth.role() = 'authenticated'
  $$;

drop policy if exists wire_select on public.wire_state;
create policy wire_select on public.wire_state for select using (public.is_team());

drop policy if exists wire_insert on public.wire_state;
create policy wire_insert on public.wire_state for insert with check (public.is_team());

drop policy if exists wire_update on public.wire_state;
create policy wire_update on public.wire_state for update using (public.is_team()) with check (public.is_team());

drop policy if exists wire_delete on public.wire_state;
create policy wire_delete on public.wire_state for delete using (public.is_team());

-- 3) Realtime aanzetten zodat wijzigingen direct bij iedereen verschijnen.
--    (Negeer een foutmelding "already member of publication" — dan stond 'ie al aan.)
alter publication supabase_realtime add table public.wire_state;

-- ── BELANGRIJK, daarna eenmalig in het dashboard ──
-- Authentication → Providers → Email:
--   • "Confirm email" UIT  → een nieuw account krijgt meteen een sessie (geen bevestigingsmail nodig).
--   • "Allow new users to sign up" AAN → de app maakt elk teamlid bij de eerste login automatisch aan in
--     Supabase Auth. Dat is veilig: de RLS hierboven laat alleen @wiresolutions.nl-accounts bij de data.
--
-- Werkt het op een apparaat nog niet (Instellingen → Integraties toont "synchroniseert NIET")?
--   • Verwijder in Authentication → Users de oude team-accounts één keer; bij de volgende login maakt de
--     app ze opnieuw aan met het JUISTE (huidige) wachtwoord. (Of draai prive/supabase-users.mjs.)

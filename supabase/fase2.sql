-- Wire Solutions — Fase 2: gebruikersbeheer & beveiliging (server-onderdelen)
-- ─────────────────────────────────────────────────────────────────────────────
-- Plak dit volledig in Supabase → SQL Editor → Run. Veilig meerdere keren te draaien (idempotent).
--
-- DATAVEILIGHEID (harde randvoorwaarde):
--   • Volledig ADDITIEF: maakt alleen nieuwe tabellen + functies + policies aan.
--   • Raakt de bestaande tabel wire_state NIET aan (leest 'm alleen eenmalig uit om rollen te seeden).
--   • Idempotent: 'if not exists' + 'create or replace' + guards.
--
-- VERIFICATIE VOORAF — draai los en noteer:
--     select count(*) as wire_state_rijen_voor from public.wire_state;

-- ── Helper: is de huidige sessie een ingelogd team-account? (zelfde definitie als schema.sql) ──
create or replace function public.is_team() returns boolean
  language sql stable as $$
    select auth.role() = 'authenticated'
       and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@wiresolutions.nl'
  $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) AUDIT-LOG — aparte, alleen-lezen (append-only) tabel voor beheerdersacties op accounts.
create table if not exists public.admin_audit (
  id           bigint generated always as identity primary key,
  gemaakt_op   timestamptz not null default now(),
  actie        text not null,           -- account_aangemaakt | account_bewerkt | account_verwijderd | rol_gewijzigd | email_gewijzigd | wachtwoord_reset
  door_email   text,                    -- wie de actie deed
  door_naam    text,
  doel_user_id text,                    -- voor wie (app-user-id)
  doel_email   text,
  doel_naam    text,
  details      jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_gemaakt_op_idx on public.admin_audit (gemaakt_op);

alter table public.admin_audit enable row level security;
-- Team mag toevoegen (loggen) en teruglezen; NIEMAND mag wijzigen of verwijderen → append-only.
drop policy if exists admin_audit_insert on public.admin_audit;
create policy admin_audit_insert on public.admin_audit for insert with check (public.is_team());
drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit for select using (public.is_team());
-- (bewust geen update/delete policy)

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) ROL-SPIEGEL — kleine tabel die Postgres vertelt wie welke rol heeft en wie bij de Boekhouding mag.
--    Nodig omdat de app-rollen normaal in de wire_state-blob zitten (onzichtbaar voor RLS).
create table if not exists public.app_roles (
  email        text primary key,
  rol          text not null default 'monteur',   -- eigenaar | beheer | monteur
  boekhouding  boolean not null default false,    -- mag verlof goedkeuren
  bijgewerkt_op timestamptz not null default now()
);

alter table public.app_roles enable row level security;

-- Is de huidige sessie de eigenaar? (leest de spiegel zelf — daarom seeden we die hieronder)
create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.app_roles r
      where r.email = lower(coalesce(auth.jwt() ->> 'email', '')) and r.rol = 'eigenaar'
    )
  $$;

-- Heeft de huidige sessie toegang tot de Boekhouding? (mag dus verlof goedkeuren)
create or replace function public.is_boekhouding() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.app_roles r
      where r.email = lower(coalesce(auth.jwt() ->> 'email', '')) and r.boekhouding
    )
  $$;

-- Team mag de rollen lezen; alleen de eigenaar mag ze schrijven.
drop policy if exists app_roles_select on public.app_roles;
create policy app_roles_select on public.app_roles for select using (public.is_team());
drop policy if exists app_roles_write on public.app_roles;
create policy app_roles_write on public.app_roles for all using (public.is_owner()) with check (public.is_owner());

-- Bootstrap: vul de spiegel eenmalig uit de bestaande gebruikers in wire_state, zodat is_owner()/is_boekhouding()
-- meteen werken. 'on conflict do nothing' → latere handmatige/app-wijzigingen blijven staan.
insert into public.app_roles (email, rol, boekhouding)
select
  lower(u->>'email') as email,
  coalesce(u->>'rol', 'monteur') as rol,
  (coalesce(u->>'rol','') = 'eigenaar')
    or (coalesce(u->>'rol','') = 'beheer' and (
        (u->'beheerRechten') is null
        or (u->'beheerRechten') ?| array['facturen','loonstroken','boetes','medewerkers']
    )) as boekhouding
from public.wire_state, jsonb_array_elements(data) as u
where key = 'users' and coalesce(u->>'email','') <> ''
on conflict (email) do nothing;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) VERLOF-BESLISSINGEN — de goedkeuring/afwijzing, afgedwongen op databaseniveau.
--    De verlofaanvragen zelf blijven in wire_state; ALLEEN de beslissing staat hier, en ALLEEN
--    boekhouding-accounts mogen die schrijven. Niet te omzeilen via de frontend.
create table if not exists public.verlof_beslissingen (
  verlof_id          text primary key,
  status             text not null,     -- Goedgekeurd | Afgewezen | Aangevraagd
  beslist_door_email text,
  beslist_door_naam  text,
  beslist_op         timestamptz not null default now()
);

alter table public.verlof_beslissingen enable row level security;
-- Iedereen in het team mag de beslissingen LEZEN; alleen boekhouding mag ze zetten/wijzigen.
drop policy if exists verlof_besl_select on public.verlof_beslissingen;
create policy verlof_besl_select on public.verlof_beslissingen for select using (public.is_team());
drop policy if exists verlof_besl_insert on public.verlof_beslissingen;
create policy verlof_besl_insert on public.verlof_beslissingen for insert with check (public.is_boekhouding());
drop policy if exists verlof_besl_update on public.verlof_beslissingen;
create policy verlof_besl_update on public.verlof_beslissingen for update using (public.is_boekhouding()) with check (public.is_boekhouding());

-- Realtime aanzetten zodat een goedkeuring direct bij iedereen verschijnt.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verlof_beslissingen'
  ) then
    alter publication supabase_realtime add table public.verlof_beslissingen;
  end if;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) VERIFICATIE ACHTERAF — vergelijk met de telling van vooraf (MOET gelijk zijn):
--     select count(*) as wire_state_rijen_na from public.wire_state;
--     select count(*) as rollen from public.app_roles;
--     select email, rol, boekhouding from public.app_roles order by rol, email;
--     select count(*) as audit_regels from public.admin_audit;
--
-- Wie mag er nu verlof goedkeuren? (boekhouding = true)
--     select email from public.app_roles where boekhouding order by email;

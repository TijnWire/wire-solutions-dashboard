-- ═══════════════════════════════════════════════════════════════════════════════
-- Wire Solutions — ALLE openstaande Supabase-SQL, klaar om te draaien
-- ═══════════════════════════════════════════════════════════════════════════════
-- Supabase had een technische storing toen dit werd opgesteld. Zodra Supabase weer
-- online is (check status.supabase.com), draai je dit in Supabase → SQL Editor.
--
-- Alles is ADDITIEF + IDEMPOTENT (veilig meerdere keren te draaien). Het raakt de
-- bestaande tabel wire_state NIET aan; het leest 'm alleen om rollen te seeden.
--
-- VOLGORDE:
--   1) Deel 1 (gebruikersbeheer & beveiliging)   ← altijd draaien
--   2) Deel 2 (minuut-back-up)                    ← altijd draaien
--   3) Deel 3 (multi-device sync-fix)             ← ALLEEN als "Sync testen" laat zien dat
--                                                    schrijven wordt geblokkeerd / je logt in
--                                                    met een niet-@wiresolutions.nl adres.
--
-- CONTROLE VOORAF — draai los en noteer het getal (moet na afloop gelijk zijn):
--     select count(*) from public.wire_state;
-- ═══════════════════════════════════════════════════════════════════════════════


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ DEEL 1 — Gebruikersbeheer & beveiliging (fase2)                              │
-- └─────────────────────────────────────────────────────────────────────────────┘

-- Helper: is de huidige sessie een ingelogd team-account?
create or replace function public.is_team() returns boolean
  language sql stable as $$
    select auth.role() = 'authenticated'
       and lower(coalesce(auth.jwt() ->> 'email', '')) like '%@wiresolutions.nl'
  $$;

-- 1) AUDIT-LOG — aparte, alleen-lezen (append-only) tabel voor beheerdersacties.
create table if not exists public.admin_audit (
  id           bigint generated always as identity primary key,
  gemaakt_op   timestamptz not null default now(),
  actie        text not null,
  door_email   text,
  door_naam    text,
  doel_user_id text,
  doel_email   text,
  doel_naam    text,
  details      jsonb not null default '{}'::jsonb
);
create index if not exists admin_audit_gemaakt_op_idx on public.admin_audit (gemaakt_op);

alter table public.admin_audit enable row level security;
drop policy if exists admin_audit_insert on public.admin_audit;
create policy admin_audit_insert on public.admin_audit for insert with check (public.is_team());
drop policy if exists admin_audit_select on public.admin_audit;
create policy admin_audit_select on public.admin_audit for select using (public.is_team());

-- 2) ROL-SPIEGEL — vertelt Postgres wie welke rol heeft en wie bij de Boekhouding mag.
create table if not exists public.app_roles (
  email        text primary key,
  rol          text not null default 'monteur',
  boekhouding  boolean not null default false,
  bijgewerkt_op timestamptz not null default now()
);

alter table public.app_roles enable row level security;

create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.app_roles r
      where r.email = lower(coalesce(auth.jwt() ->> 'email', '')) and r.rol = 'eigenaar'
    )
  $$;

create or replace function public.is_boekhouding() returns boolean
  language sql stable security definer set search_path = public as $$
    select exists (
      select 1 from public.app_roles r
      where r.email = lower(coalesce(auth.jwt() ->> 'email', '')) and r.boekhouding
    )
  $$;

drop policy if exists app_roles_select on public.app_roles;
create policy app_roles_select on public.app_roles for select using (public.is_team());
drop policy if exists app_roles_write on public.app_roles;
create policy app_roles_write on public.app_roles for all using (public.is_owner()) with check (public.is_owner());

-- Bootstrap: vul de spiegel eenmalig uit de bestaande gebruikers in wire_state.
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

-- 3) VERLOF-BESLISSINGEN — goedkeuring op databaseniveau; alleen boekhouding mag schrijven.
create table if not exists public.verlof_beslissingen (
  verlof_id          text primary key,
  status             text not null,
  beslist_door_email text,
  beslist_door_naam  text,
  beslist_op         timestamptz not null default now()
);

alter table public.verlof_beslissingen enable row level security;
drop policy if exists verlof_besl_select on public.verlof_beslissingen;
create policy verlof_besl_select on public.verlof_beslissingen for select using (public.is_team());
drop policy if exists verlof_besl_insert on public.verlof_beslissingen;
create policy verlof_besl_insert on public.verlof_beslissingen for insert with check (public.is_boekhouding());
drop policy if exists verlof_besl_update on public.verlof_beslissingen;
create policy verlof_besl_update on public.verlof_beslissingen for update using (public.is_boekhouding()) with check (public.is_boekhouding());

do $$ begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'verlof_beslissingen'
  ) then
    alter publication supabase_realtime add table public.verlof_beslissingen;
  end if;
end $$;


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ DEEL 2 — Automatische minuut-back-up (backup)                               │
-- └─────────────────────────────────────────────────────────────────────────────┘

create table if not exists public.wire_state_backups (
  id          bigint generated always as identity primary key,
  gemaakt_op  timestamptz not null default now(),
  key         text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null
);
create index if not exists wire_state_backups_gemaakt_op_idx on public.wire_state_backups (gemaakt_op);
create index if not exists wire_state_backups_key_idx        on public.wire_state_backups (key, gemaakt_op);

alter table public.wire_state_backups enable row level security;
drop policy if exists wire_backups_select on public.wire_state_backups;
create policy wire_backups_select on public.wire_state_backups for select using (public.is_team());

create or replace function public.wire_state_snapshot() returns void
  language plpgsql security definer set search_path = public as $$
declare
  nieuwste timestamptz;
  laatste  timestamptz;
begin
  select max(updated_at) into nieuwste from public.wire_state;
  if nieuwste is null then return; end if;
  select max(updated_at) into laatste from public.wire_state_backups;
  if laatste is not null and nieuwste <= laatste then return; end if;
  insert into public.wire_state_backups (gemaakt_op, key, data, updated_at)
  select now(), key, data, updated_at from public.wire_state;
end;
$$;

create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wire-backup-elke-minuut') then
    perform cron.unschedule('wire-backup-elke-minuut');
  end if;
  perform cron.schedule('wire-backup-elke-minuut', '* * * * *', $cron$select public.wire_state_snapshot();$cron$);
end $$;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'wire-backup-opschonen') then
    perform cron.unschedule('wire-backup-opschonen');
  end if;
  perform cron.schedule('wire-backup-opschonen', '0 3 * * *', $cron$delete from public.wire_state_backups where gemaakt_op < now() - interval '7 days';$cron$);
end $$;


-- ┌─────────────────────────────────────────────────────────────────────────────┐
-- │ DEEL 3 — Multi-device sync-fix  (ALLEEN draaien indien nodig)                │
-- └─────────────────────────────────────────────────────────────────────────────┘
-- Draai dit ALLEEN als "Sync testen" (Instellingen → Integraties) laat zien dat
-- SCHRIJVEN wordt geblokkeerd, of als je inlogt met een adres dat NIET op
-- @wiresolutions.nl eindigt (bijv. een gmail). Dit verruimt de team-check zodat
-- ook dat adres mag synchroniseren. Vul hieronder je eigen inlog-adres(sen) in.
--
-- create or replace function public.is_team() returns boolean
--   language sql stable as $$
--     select auth.role() = 'authenticated'
--        and ( lower(coalesce(auth.jwt() ->> 'email','')) like '%@wiresolutions.nl'
--           or lower(coalesce(auth.jwt() ->> 'email','')) in ('denhaantijn1@gmail.com') );
--   $$;


-- ═══════════════════════════════════════════════════════════════════════════════
-- CONTROLE ACHTERAF (moet gelijk zijn aan de telling vooraf):
--     select count(*) from public.wire_state;
--     select jobname, active from cron.job where jobname like 'wire-backup-%';
--     select email, rol, boekhouding from public.app_roles order by rol, email;
-- ═══════════════════════════════════════════════════════════════════════════════

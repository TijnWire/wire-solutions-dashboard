-- Wire Solutions — Supabase als SPIEGEL naast Cloudflare D1
-- ─────────────────────────────────────────────────────────────────────────────
-- Sinds de migratie is de Cloudflare Worker + D1 de baas over de data. Supabase komt hier terug als
-- TWEEDE KOPIE: de Worker schrijft elke wijziging óók naar Supabase en leest er alleen uit als D1 hapert.
--
-- Dit bestand is ADDITIEF en idempotent (meerdere keren draaien mag):
--   • het raakt de bestaande tabellen (wire_state, app_roles, admin_audit, verlof_beslissingen) NIET aan;
--   • het voegt alleen users_auth toe (die bestond hier nog niet — inloggen liep vroeger via Supabase Auth);
--   • het zet de kolommen klaar die de spiegel nodig heeft.
--
-- Draaien: Supabase → SQL Editor → plak dit → Run.
-- Draai eerst schema.sql en fase2.sql als die er nog niet in staan.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) INLOGGEGEVENS — spiegel van users_auth in D1.
--    De Worker beheert deze tabel met de service_role-key, dus RLS staat aan en NIEMAND anders mag erbij.
--    Zo kan een wachtwoord-hash nooit via de anon-key gelezen worden.
create table if not exists public.users_auth (
  email      text primary key,
  pw_hash    text not null,            -- "pbkdf2$<iteraties>$<salt>$<hash>" — hetzelfde formaat als in D1
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.users_auth enable row level security;
-- Bewust GEEN policies: zonder policy mag alleen de service_role erbij (die slaat RLS over).
-- Een gestolen anon-key levert dus niets op.

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) SPIEGEL-STEMPEL — per rij bijhouden wanneer de Worker hem hierheen heeft geschreven.
--    Hiermee kan de app zien of de twee databases gelijk lopen (Instellingen → Sync & back-up).
alter table public.wire_state           add column if not exists gespiegeld_op timestamptz;
alter table public.app_roles            add column if not exists gespiegeld_op timestamptz;
alter table public.verlof_beslissingen  add column if not exists gespiegeld_op timestamptz;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) VERSIE-OVERZICHT — lichtgewicht view: welke onderdelen staan er, hoe groot en hoe oud.
--    De Worker gebruikt dit voor de statuscontrole zonder de (soms megabytes grote) data op te halen.
create or replace view public.wire_state_versies as
  select key,
         updated_at,
         gespiegeld_op,
         pg_column_size(data) as bytes
  from public.wire_state;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) BODEMONDERZOEK — spiegel van de afsprakentabellen in D1.
--    De capaciteitsbewaking gebeurt in D1 (dat is de baas); dit is puur de tweede kopie.
create table if not exists public.bodem_projecten (
  project_id    text primary key,
  config        jsonb not null default '{}'::jsonb,
  bijgewerkt_op timestamptz not null default now(),
  gespiegeld_op timestamptz
);

create table if not exists public.bodem_afspraken (
  adres_id      text primary key,
  project_id    text not null,
  datum         date not null,
  tijdslot      text not null,
  naam          text not null default '',
  telefoon      text not null default '',
  email         text not null default '',
  notitie       text not null default '',
  ingevuld_door text not null default '',
  ingevuld_op   timestamptz not null default now(),
  gespiegeld_op timestamptz
);
create index if not exists bodem_afspraken_slot_idx on public.bodem_afspraken (project_id, datum, tijdslot);

create table if not exists public.bodem_adressen (
  id               text primary key,
  project_id       text not null,
  volgorde         integer not null default 0,
  straat           text not null default '',
  huisnummer       text not null default '',
  postcode         text not null default '',
  plaats           text not null default '',
  wijk             text not null default '',
  perceel          text not null default '',
  bewoner          text not null default '',
  telefoon         text not null default '',
  email            text not null default '',
  notitie          text not null default '',
  toegewezen_aan   text,
  aanwezig         text not null default '',
  datum            text not null default '',
  tijdslot         text not null default '',
  toestemming_tuin boolean not null default false,
  uitkomst         text not null default '',
  pogingen         integer not null default 0,
  afgerond         boolean not null default false,
  afgerond_op      text not null default '',
  afgerond_door    text not null default '',
  verwijderd       boolean not null default false,
  bijgewerkt_op    text not null default '',
  gespiegeld_op    timestamptz
);
create index if not exists bodem_adressen_project_idx on public.bodem_adressen (project_id, volgorde);
alter table public.bodem_adressen enable row level security;
drop policy if exists bodem_adressen_select on public.bodem_adressen;
create policy bodem_adressen_select on public.bodem_adressen for select using (public.is_team());

create table if not exists public.bodem_bezoeken (
  id         bigint generated always as identity primary key,
  project_id text not null,
  adres_id   text not null,
  poging     integer not null default 1,
  uitkomst   text not null,
  notitie    text not null default '',
  door       text not null default '',
  tijdstip   timestamptz not null default now()
);
create index if not exists bodem_bezoeken_adres_idx on public.bodem_bezoeken (project_id, adres_id);

alter table public.bodem_projecten enable row level security;
alter table public.bodem_afspraken enable row level security;
alter table public.bodem_bezoeken  enable row level security;
drop policy if exists bodem_projecten_select on public.bodem_projecten;
create policy bodem_projecten_select on public.bodem_projecten for select using (public.is_team());
drop policy if exists bodem_afspraken_select on public.bodem_afspraken;
create policy bodem_afspraken_select on public.bodem_afspraken for select using (public.is_team());
drop policy if exists bodem_bezoeken_select on public.bodem_bezoeken;
create policy bodem_bezoeken_select on public.bodem_bezoeken for select using (public.is_team());
-- Schrijven doet alleen de Worker met de service_role-key (die slaat RLS over).

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) CONTROLE — draai deze los om te zien of de spiegel gevuld is:
--     select key, updated_at, gespiegeld_op, bytes from public.wire_state_versies order by updated_at desc;
--     select count(*) as inlogaccounts from public.users_auth;

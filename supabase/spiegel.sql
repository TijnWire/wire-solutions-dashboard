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
-- 4) CONTROLE — draai deze los om te zien of de spiegel gevuld is:
--     select key, updated_at, gespiegeld_op, bytes from public.wire_state_versies order by updated_at desc;
--     select count(*) as inlogaccounts from public.users_auth;

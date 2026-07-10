-- Wire Solutions — automatische minuut-back-up van de centrale database (Supabase)
-- ─────────────────────────────────────────────────────────────────────────────
-- Plak dit volledig in Supabase → SQL Editor → Run. Veilig meerdere keren te draaien (idempotent).
--
-- DATAVEILIGHEID (harde randvoorwaarde):
--   • Volledig ADDITIEF: dit maakt ALLEEN een nieuwe tabel + functie + cron-jobs aan.
--   • Het LEEST wire_state en schrijft kopieën weg; het WIJZIGT of DROPT nooit iets in wire_state.
--   • Idempotent: 'if not exists' + guards, dus opnieuw draaien is veilig.
--
-- VERIFICATIE VOORAF — draai deze regel los en noteer het getal:
--     select count(*) as wire_state_rijen_voor from public.wire_state;
--   Na afloop (onderaan) draai je dezelfde telling; die MOET gelijk zijn.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Aparte, ALLEEN-LEZEN back-uptabel. Elke snapshot bewaart de volledige inhoud
--    van iedere wire_state-rij, met het tijdstip van de snapshot.
create table if not exists public.wire_state_backups (
  id          bigint generated always as identity primary key,
  gemaakt_op  timestamptz not null default now(),
  key         text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null
);

create index if not exists wire_state_backups_gemaakt_op_idx on public.wire_state_backups (gemaakt_op);
create index if not exists wire_state_backups_key_idx        on public.wire_state_backups (key, gemaakt_op);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Beveiliging: RLS aan. Het team mag de back-ups LEZEN (om data terug te halen),
--    maar niemand kan ze via de app wijzigen of wissen — alleen de cron-functie
--    (SECURITY DEFINER) schrijft. Zo is het een onaantastbaar, alleen-lezen archief.
alter table public.wire_state_backups enable row level security;

drop policy if exists wire_backups_select on public.wire_state_backups;
create policy wire_backups_select on public.wire_state_backups
  for select using (public.is_team());
-- (Bewust GEEN insert/update/delete-policy → RLS blokkeert die voor gewone gebruikers.)

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) Snapshot-functie. Schrijft de HUIDIGE wire_state alleen weg als er sinds de
--    vorige snapshot iets gewijzigd is (incrementeel → geen opgeblazen opslag).
--    SECURITY DEFINER zodat de insert niet door RLS geblokkeerd wordt.
create or replace function public.wire_state_snapshot() returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  nieuwste timestamptz;
  laatste  timestamptz;
begin
  select max(updated_at) into nieuwste from public.wire_state;
  if nieuwste is null then
    return;                                   -- nog niets om te bewaren
  end if;

  select max(updated_at) into laatste from public.wire_state_backups;
  if laatste is not null and nieuwste <= laatste then
    return;                                   -- niets gewijzigd sinds de vorige snapshot → overslaan
  end if;

  insert into public.wire_state_backups (gemaakt_op, key, data, updated_at)
  select now(), key, data, updated_at
  from public.wire_state;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) Planning via pg_cron: elke minuut een snapshot + dagelijks opschonen (retentie 7 dagen).
--    pg_cron is op Supabase beschikbaar; staat het uit, zet het dan eenmalig aan via
--    Dashboard → Database → Extensions → "pg_cron" (of de create-extension hieronder).
create extension if not exists pg_cron;

-- Elke minuut een incrementele snapshot. Guard maakt het idempotent (geen dubbele job).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'wire-backup-elke-minuut') then
    perform cron.unschedule('wire-backup-elke-minuut');
  end if;
  perform cron.schedule('wire-backup-elke-minuut', '* * * * *', $cron$select public.wire_state_snapshot();$cron$);
end $$;

-- Dagelijks (03:00) snapshots ouder dan 7 dagen opruimen, zodat de back-uptabel niet oneindig groeit.
-- Raakt uitsluitend de back-uptabel; wire_state blijft ongemoeid.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'wire-backup-opschonen') then
    perform cron.unschedule('wire-backup-opschonen');
  end if;
  perform cron.schedule('wire-backup-opschonen', '0 3 * * *', $cron$delete from public.wire_state_backups where gemaakt_op < now() - interval '7 days';$cron$);
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) VERIFICATIE ACHTERAF — draai deze en vergelijk met de telling van vooraf:
--     select count(*) as wire_state_rijen_na from public.wire_state;     -- MOET gelijk zijn aan _voor
--     select count(*) as backup_rijen, max(gemaakt_op) as laatste_backup from public.wire_state_backups;
--     select jobname, schedule, active from cron.job where jobname like 'wire-backup-%';
--
-- Direct één back-up forceren (zonder een minuut te wachten):
--     select public.wire_state_snapshot();
--
-- ── DATA TERUGHALEN (indien ooit nodig) ──────────────────────────────────────
-- Meest recente snapshot per onderdeel bekijken:
--     select distinct on (key) key, gemaakt_op, updated_at
--     from public.wire_state_backups order by key, gemaakt_op desc;
--
-- Eén onderdeel terugzetten naar de staat van een bepaald moment (voorbeeld: 'projects'):
--     insert into public.wire_state (key, data, updated_at)
--     select key, data, now() from public.wire_state_backups
--     where key = 'projects' and gemaakt_op <= '2026-07-10 12:00:00+00'
--     order by gemaakt_op desc limit 1
--     on conflict (key) do update set data = excluded.data, updated_at = excluded.updated_at;

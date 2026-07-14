-- Wire Solutions — centrale database op Cloudflare D1 (SQLite)
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema.sql
-- Veilig meerdere keren te draaien (idempotent: alleen 'create table if not exists').

-- 1) Gedeelde JSON-store: één rij per onderdeel (key) met de inhoud als JSON-tekst.
create table if not exists wire_state (
  key        text primary key,
  data       text not null,          -- JSON (als tekst opgeslagen; de Worker parse't het)
  updated_at text not null
);

-- 2) Inloggegevens (vervangt Supabase Auth). pw_hash = "pbkdf2$<iter>$<salt>$<hash>".
create table if not exists users_auth (
  email      text primary key,
  pw_hash    text not null,
  created_at text not null
);

-- 3) Rol-spiegel: wie is eigenaar / wie mag verlof goedkeuren. Wordt automatisch bijgewerkt door de Worker
--    zodra de gebruikerslijst (wire_state key 'users') verandert.
create table if not exists app_roles (
  email         text primary key,
  rol           text not null default 'monteur',   -- eigenaar | beheer | monteur
  boekhouding   integer not null default 0,         -- 0/1 — mag verlof goedkeuren
  bijgewerkt_op text not null
);

-- 4) Audit-log voor beheerdersacties op accounts (append-only in de praktijk).
create table if not exists admin_audit (
  id           integer primary key autoincrement,
  gemaakt_op   text not null,
  actie        text not null,          -- account_aangemaakt | ... | wachtwoord_reset | email_gewijzigd
  door_email   text,
  door_naam    text,
  doel_user_id text,
  doel_email   text,
  doel_naam    text,
  details      text not null default '{}'
);
create index if not exists admin_audit_gemaakt_op_idx on admin_audit (gemaakt_op);

-- 5) Verlof-beslissingen: alleen boekhouding mag schrijven (afgedwongen in de Worker).
create table if not exists verlof_beslissingen (
  verlof_id          text primary key,
  status             text not null,     -- Goedgekeurd | Afgewezen | Aangevraagd
  beslist_door_email text,
  beslist_door_naam  text,
  beslist_op         text not null
);

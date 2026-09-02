-- Wire Solutions — Token-intrekking (Cloudflare D1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-token-revocaties.sql
-- Additief: één nieuwe tabel, geen bestaande tabel wordt aangeraakt.
--
-- WAAROM?
-- De inlog-token (JWT) is 30 dagen geldig en staalt stateless — de server bewaart geen sessies. Dat is
-- prima voor de dagelijkse gang van zaken, maar het betekende ook dat een reeds uitgegeven token NIET
-- was in te trekken: een verwijderde medewerker, of een gestolen token na een wachtwoord-reset, hield
-- tot 30 dagen toegang tot alle teamdata.
--
-- Deze tabel legt per e-mailadres een 'geldig_vanaf'-moment (unix-seconden) vast. De Worker weigert elke
-- token waarvan de uitgiftetijd (iat) vóór dat moment ligt. Er wordt een rij gezet bij:
--   • account verwijderen        → alle tokens van dat adres meteen ongeldig
--   • wachtwoord-reset (beheer)   → oude sessies van het doelaccount vervallen
--   • e-mailadres wijzigen        → token op het oude adres vervalt
--
-- De Worker cachet deze lijst ~60s per isolate, zodat de 2s-poll de gratis D1-daglimiet niet opsnoept.

create table if not exists token_revocaties (
  email        text primary key,
  geldig_vanaf integer not null   -- unix-seconden; tokens met iat < geldig_vanaf worden geweigerd
);

-- ── Controle ──
--   select email, datetime(geldig_vanaf, 'unixepoch') as vanaf from token_revocaties order by geldig_vanaf desc;

-- Wire Solutions — Bodemonderzoek: afspraken met tijdslot (Cloudflare D1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-bodem.sql
-- Veilig meerdere keren te draaien. VOLLEDIG ADDITIEF: alleen nieuwe tabellen, geen enkele
-- wijziging aan wire_state, users_auth, app_roles, admin_audit of verlof_beslissingen.
--
-- WAAROM DEZE TABELLEN NAAST DE JSON-OPSLAG?
-- De rest van de app bewaart per onderdeel één JSON-blob. Dat werkt prima local-first, maar het is
-- "laatste schrijver wint": twee medewerkers die tegelijk het laatste vrije tijdblok vullen,
-- overschrijven elkaar zonder dat iemand het merkt. Voor een afspraak met een bewoner is dat niet
-- acceptabel — die staat dan voor een dichte deur. Daarom gaan juist de AFSPRAKEN naar echte rijen,
-- waar de database zelf de capaciteit bewaakt. De adreslijsten blijven in de JSON-opslag, zodat de
-- buitendienst gewoon zonder bereik kan doorwerken.

-- 1) Per project de spelregels die de server bewaakt: welke periode, welke werkdagen, welke
--    tijdsloten actief zijn en hoeveel afspraken er per blok in passen.
--    De beheerder zet dit vanuit het dashboard; de Worker leest het bij élke boeking opnieuw, zodat
--    een apparaat nooit zelf kan bepalen hoeveel er in een blok past.
create table if not exists bodem_projecten (
  project_id    text primary key,     -- id van de TAUW-map
  config        text not null,        -- JSON: { periodeStart, periodeEind, werkdagen[], sloten[{slot,actief,max}] }
  bijgewerkt_op text not null
);

-- 2) De afspraken zelf. Eén rij per adres: het primaire sleutelveld adres_id zorgt ervoor dat een
--    adres nooit twee actieve afspraken kan hebben (de uniciteitseis uit de opdracht).
create table if not exists bodem_afspraken (
  adres_id      text primary key,     -- id van het adres in de TAUW-map
  project_id    text not null,
  datum         text not null,        -- ISO jjjj-mm-dd
  tijdslot      text not null,        -- "08:00-09:00"
  naam          text not null default '',
  telefoon      text not null default '',
  email         text not null default '',
  notitie       text not null default '',
  ingevuld_door text not null default '',
  ingevuld_op   text not null
);

-- Tellen hoe vol een blok zit gebeurt bij élke boeking; dit is de index die dat snel houdt.
create index if not exists bodem_afspraken_slot_idx on bodem_afspraken (project_id, datum, tijdslot);
-- Alle afspraken van een project ophalen (agenda, export, dashboard).
create index if not exists bodem_afspraken_project_idx on bodem_afspraken (project_id);

-- 3) Bezoeken die géén afspraak opleverden: niet thuis, weigert, later terugkomen, adres ongeldig.
--    Append-only, zodat je de hele geschiedenis per adres houdt (1e, 2e, 3e poging) en de beheerder
--    weet wie er herbezocht moet worden.
create table if not exists bodem_bezoeken (
  id         integer primary key autoincrement,
  project_id text not null,
  adres_id   text not null,
  poging     integer not null default 1,
  uitkomst   text not null,           -- niet_thuis | weigert | later | ongeldig
  notitie    text not null default '',
  door       text not null default '',
  tijdstip   text not null
);
create index if not exists bodem_bezoeken_adres_idx on bodem_bezoeken (project_id, adres_id);

-- ── Controle achteraf ──
--   select count(*) from bodem_afspraken;
--   select datum, tijdslot, count(*) from bodem_afspraken group by 1,2 order by 1,2;

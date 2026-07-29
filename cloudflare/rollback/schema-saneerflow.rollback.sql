-- ROLLBACK van cloudflare/schema-saneerflow.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-akkoord.rollback.sql
--
-- LET OP: dit verwijdert de complete bewonersakkoord-module: dossiers, clusters, adressen, ronden,
-- responsen, beschikbaarheid, taken en het log. De bodemonderzoek-tabellen en alle bestaande tabellen
-- blijven ongemoeid.
--
-- Maak eerst kopieën als je de gegevens nog nodig hebt:
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from saneer_adressen"  > adressen.json
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from saneer_responsen" > responsen.json
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from saneer_log"       > log.json
--
-- Volgorde: eerst wat naar iets anders verwijst, dan de rest.

drop index if exists saneer_log_dossier_idx;
drop table if exists saneer_log;

drop index if exists saneer_taken_dossier_idx;
drop table if exists saneer_taken;

drop index if exists saneer_beschikbaarheid_uniek;
drop table if exists saneer_beschikbaarheid;

drop index if exists saneer_responsen_adres_idx;
drop index if exists saneer_responsen_uniek;
drop table if exists saneer_responsen;

drop index if exists saneer_ronden_cluster_idx;
drop table if exists saneer_ronden;

drop index if exists saneer_adressen_cluster_idx;
drop index if exists saneer_adressen_dossier_idx;
drop table if exists saneer_adressen;

drop index if exists saneer_clusters_dossier_idx;
drop table if exists saneer_clusters;

drop table if exists saneer_dossiers;


-- ROLLBACK van cloudflare/schema-saneerflow.sql
-- Verwijdert het onthouden van kolomindelingen en de bewaarde afgekeurde regels.
-- De dossiers, adressen en alle overige tabellen blijven ongemoeid.
drop index if exists saneer_afgekeurd_dossier_idx;
drop table if exists saneer_afgekeurd;
drop table if exists saneer_mappings;

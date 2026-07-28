-- ROLLBACK van cloudflare/schema-akkoord.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-akkoord.rollback.sql
--
-- LET OP: dit verwijdert de complete bewonersakkoord-module: dossiers, clusters, adressen, ronden,
-- responsen, beschikbaarheid, taken en het log. De bodemonderzoek-tabellen en alle bestaande tabellen
-- blijven ongemoeid.
--
-- Maak eerst kopieën als je de gegevens nog nodig hebt:
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from akkoord_adressen"  > adressen.json
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from akkoord_responsen" > responsen.json
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from akkoord_log"       > log.json
--
-- Volgorde: eerst wat naar iets anders verwijst, dan de rest.

drop index if exists akkoord_log_dossier_idx;
drop table if exists akkoord_log;

drop index if exists akkoord_taken_dossier_idx;
drop table if exists akkoord_taken;

drop index if exists akkoord_beschikbaarheid_uniek;
drop table if exists akkoord_beschikbaarheid;

drop index if exists akkoord_responsen_adres_idx;
drop index if exists akkoord_responsen_uniek;
drop table if exists akkoord_responsen;

drop index if exists akkoord_ronden_cluster_idx;
drop table if exists akkoord_ronden;

drop index if exists akkoord_adressen_cluster_idx;
drop index if exists akkoord_adressen_dossier_idx;
drop table if exists akkoord_adressen;

drop index if exists akkoord_clusters_dossier_idx;
drop table if exists akkoord_clusters;

drop table if exists akkoord_dossiers;

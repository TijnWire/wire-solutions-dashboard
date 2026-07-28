-- ROLLBACK van cloudflare/schema-bodem-log.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-bodem-log.rollback.sql
--
-- Verwijdert het wijzigingslog. De adressen, afspraken en alle bestaande tabellen blijven ongemoeid.
-- Bewaar het log eerst als je de geschiedenis nog nodig hebt voor verantwoording:
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from bodem_log" > log.json

drop index if exists bodem_log_adres_idx;
drop index if exists bodem_log_project_idx;
drop table if exists bodem_log;

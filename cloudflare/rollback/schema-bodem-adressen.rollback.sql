-- ROLLBACK van cloudflare/schema-bodem-adressen.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-bodem-adressen.rollback.sql
--
-- LET OP: dit verwijdert ALLE adressen van alle bodemonderzoek-projecten, inclusief wat er aan de deur
-- is ingevuld. Draai dit alleen als je terug wilt naar de oude opslag in de gedeelde JSON-lijst, en
-- maak eerst een kopie:
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from bodem_adressen" > adressen.json

drop index if exists bodem_adressen_postcode_idx;
drop index if exists bodem_adressen_toegewezen_idx;
drop index if exists bodem_adressen_gewijzigd_idx;
drop index if exists bodem_adressen_project_idx;
drop table if exists bodem_adressen;

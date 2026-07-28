-- ROLLBACK van cloudflare/schema-bodem.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-bodem.rollback.sql
--
-- LET OP: dit verwijdert de afspraken, de projectinstellingen en de bezoekgeschiedenis van het
-- bodemonderzoek. Adressen (bodem_adressen) en alle bestaande tabellen blijven ongemoeid.
-- Maak eerst een kopie als je de gegevens nog wilt bewaren:
--   npx wrangler d1 execute wire-solutions --remote --json --command "select * from bodem_afspraken" > afspraken.json

drop table if exists bodem_bezoeken;
drop table if exists bodem_afspraken;
drop table if exists bodem_projecten;

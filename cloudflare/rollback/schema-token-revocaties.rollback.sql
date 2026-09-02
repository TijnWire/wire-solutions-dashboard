-- ROLLBACK van cloudflare/schema-token-revocaties.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-token-revocaties.rollback.sql
--
-- Verwijdert de token-intrekkingstabel. Alle accounts en bestaande tabellen blijven ongemoeid.
-- Let op: na het verwijderen zijn reeds uitgegeven tokens weer NIET in te trekken tot de vervaldatum.

drop table if exists token_revocaties;

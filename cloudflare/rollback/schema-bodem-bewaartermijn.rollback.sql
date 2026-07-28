-- ROLLBACK van cloudflare/schema-bodem-bewaartermijn.sql
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/rollback/schema-bodem-bewaartermijn.rollback.sql
--
-- Haalt de twee kolommen weg die de bewaartermijn bijhouden. De tabel bodem_projecten zelf en alle
-- projectinstellingen blijven staan.
--
-- LET OP: haal ook de cron-trigger uit wrangler.toml en deploy opnieuw, anders draait de nachtelijke
-- opruiming door op kolommen die niet meer bestaan (dat mislukt stil, maar het is rommelig).

alter table bodem_projecten drop column gewist_op;
alter table bodem_projecten drop column afgerond_op;

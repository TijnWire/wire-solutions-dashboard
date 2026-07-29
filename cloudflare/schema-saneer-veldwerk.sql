-- Wire Solutions — Saneren: wat er aan de deur gebeurt vastleggen
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-saneer-veldwerk.sql
-- Terugdraaien: cloudflare/rollback/schema-saneer-veldwerk.rollback.sql
--
-- ADDITIEF: twee kolommen erbij op een bestaande tabel, allebei met een standaardwaarde. Geen
-- bestaande kolom wordt aangeraakt en er gaat geen rij verloren.
--
-- Waarom: aan de deur wordt lang niet altijd meteen een afspraak gemaakt. Vaak is er niemand thuis en
-- gooi je een kaartje in de bus met het verzoek te bellen. Dat moet je kunnen vastleggen, anders staat
-- de volgende collega voor dezelfde deur en weet niemand dat er al een kaartje ligt.

alter table saneer_adressen add column kaartje_op text not null default '';   -- ISO-datum van het kaartje in de bus
alter table saneer_adressen add column bezoeken  integer not null default 0;  -- hoe vaak er is aangebeld

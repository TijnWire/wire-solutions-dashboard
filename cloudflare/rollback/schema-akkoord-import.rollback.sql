-- ROLLBACK van cloudflare/schema-akkoord-import.sql
-- Verwijdert het onthouden van kolomindelingen en de bewaarde afgekeurde regels.
-- De dossiers, adressen en alle overige tabellen blijven ongemoeid.
drop index if exists akkoord_afgekeurd_dossier_idx;
drop table if exists akkoord_afgekeurd;
drop table if exists akkoord_mappings;

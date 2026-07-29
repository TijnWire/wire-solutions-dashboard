-- ROLLBACK van cloudflare/schema-saneer-veldwerk.sql
-- SQLite kan een kolom laten vallen; de rest van de tabel blijft ongemoeid.
alter table saneer_adressen drop column kaartje_op;
alter table saneer_adressen drop column bezoeken;

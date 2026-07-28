-- Wire Solutions — Bewonersakkoord: import onthouden en afgekeurde regels bewaren
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-akkoord-import.sql
-- Additief: twee nieuwe tabellen. Geen bestaande tabel wordt aangeraakt.

-- Kolomindeling per opdrachtgever onthouden. Kolomnamen wisselen per aanlevering, maar dezelfde
-- opdrachtgever levert meestal hetzelfde formaat. De vorige indeling is dan een voorstel, geen wet.
create table if not exists akkoord_mappings (
  opdrachtgever text primary key,
  mapping       text not null,        -- JSON: { veld: kolomindex }
  kop_index     integer not null default 0,
  gebruikt_op   text not null
);

-- Regels die de controle niet haalden. Niets wordt weggegooid: hier staan ze met de reden erbij,
-- zodat ze te corrigeren zijn in plaats van stilzwijgend te verdwijnen.
create table if not exists akkoord_afgekeurd (
  id          text primary key,
  pd_nummer   text not null,
  bron_regel  integer not null default 0,   -- regelnummer in het aangeleverde bestand
  ruw         text not null default '',     -- JSON van wat er in die regel stond
  reden       text not null default '',
  opgelost    integer not null default 0,   -- 1 = alsnog verwerkt na correctie
  aangemaakt_op text not null
);
create index if not exists akkoord_afgekeurd_dossier_idx on akkoord_afgekeurd (pd_nummer, opgelost);

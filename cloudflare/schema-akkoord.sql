-- Wire Solutions — Bewonersakkoord: één uitvoeringsdatum per cluster
-- ─────────────────────────────────────────────────────────────────────────────
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-akkoord.sql
-- Terugdraaien: cloudflare/rollback/schema-akkoord.rollback.sql
--
-- VOLLEDIG ADDITIEF: alleen nieuwe tabellen met een eigen voorvoegsel (akkoord_). Geen bestaande
-- tabel wordt aangeraakt, ook die van bodemonderzoek niet.
--
-- ── DE KERN VAN DEZE INDELING ──
-- Bij een nieuwe ronde ("we spreken een andere datum af") mag er geen contactgegeven verloren gaan.
-- Dat lossen we niet op met zorgvuldige code, maar met de indeling: de akkoordstatus is geen VELD dat
-- gereset wordt, hij bestaat helemaal niet als veld. Hij volgt uit de responsen van de HUIDIGE ronde.
-- Een nieuwe ronde is een rij erbij in akkoord_ronden. Naam, telefoonnummer en opmerkingen staan in
-- akkoord_adressen en worden daarbij niet aangeraakt — er is geen code die dat kán.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) DOSSIER — alles hangt onder het PD-nummer, zodat het aan het eind in één keer afgeboekt kan worden.
create table if not exists akkoord_dossiers (
  pd_nummer        text primary key,          -- "PD123456"
  regio            text not null default '',  -- Zuid | Noord
  opdrachtgever    text not null default '',
  gebouw           text not null default '',
  omschrijving     text not null default '',
  uitvoering_van   text not null default '',  -- ISO jjjj-mm-dd
  uitvoering_tot   text not null default '',
  starttijd        text not null default '08:00',  -- 08:00 of 09:30; per cluster te overschrijven
  status           text not null default 'nieuw',
  -- nieuw | geimporteerd | verdeeld | in_uitvoering | datum_akkoord | poster_geplaatst | afgerond | afgeboekt

  -- Instellingen per dossier; bewust niet vastgetimmerd in de code.
  poster_weken_voor integer not null default 2,   -- deadline = uitvoeringsdatum min zoveel weken
  escalatie_ronden  integer not null default 3,   -- daarna op de lijst voor de leiding
  cluster_grens     integer not null default 25,  -- waarschuwing bij grotere clusters

  aangemaakt_door  text not null default '',
  aangemaakt_op    text not null,
  afgerond_op      text not null default '',
  afgeboekt_op     text not null default '',
  gewist_op        text not null default '',   -- wanneer de persoonsgegevens zijn gewist
  verwijderd       integer not null default 0, -- zacht verwijderen; nooit echt weg
  bijgewerkt_op    text not null
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) CLUSTER — automatisch op volledige postcode. Een cluster gaat ALTIJD in zijn geheel naar één
--    medewerker: iedereen moet immers op dezelfde dag akkoord gaan.
create table if not exists akkoord_clusters (
  id                text primary key,
  pd_nummer         text not null,
  postcode          text not null default '',
  naam              text not null default '',   -- vrije naam, bv. "Kerkstraat 1-40"
  toegewezen_aan    text,                       -- user id; het hele cluster, nooit deels
  definitieve_datum text not null default '',   -- pas gevuld als iedereen akkoord is
  starttijd         text not null default '',   -- leeg = die van het dossier
  handmatig         integer not null default 0, -- 1 = door de beheerder afgesplitst
  verwijderd        integer not null default 0,
  bijgewerkt_op     text not null
);
create index if not exists akkoord_clusters_dossier_idx on akkoord_clusters (pd_nummer, postcode);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) ADRES — de vaste gegevens. Deze tabel overleeft elke nieuwe ronde ongeschonden.
create table if not exists akkoord_adressen (
  id             text primary key,
  pd_nummer      text not null,
  cluster_id     text not null default '',
  volgorde       integer not null default 0,   -- postcode, dan huisnummer

  straat         text not null default '',
  huisnummer     text not null default '',
  toevoeging     text not null default '',
  postcode       text not null default '',
  plaats         text not null default '',

  bewoner        text not null default '',
  telefoon       text not null default '',
  email          text not null default '',
  opmerking      text not null default '',

  -- Uit de import: had dit adres al een telefoonnummer? Bepaalt of het op de bellijst of op de
  -- veldlijst komt. Wordt niet bijgewerkt als er later alsnog een nummer bijkomt — dan blijft
  -- zichtbaar dat het adres oorspronkelijk langsgereden moest worden.
  telefoon_bij_import integer not null default 0,
  belstatus      text not null default '',     -- '' | gebeld | geen_gehoor | terugbellen | akkoord
  belpogingen    integer not null default 0,

  verwijderd     integer not null default 0,
  bijgewerkt_op  text not null
);
create index if not exists akkoord_adressen_dossier_idx on akkoord_adressen (pd_nummer, volgorde);
create index if not exists akkoord_adressen_cluster_idx on akkoord_adressen (cluster_id, volgorde);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4) RONDE — één poging om een datum rond te krijgen voor één cluster.
create table if not exists akkoord_ronden (
  id                 text primary key,
  cluster_id         text not null,
  pd_nummer          text not null,
  nummer             integer not null default 1,
  voorgestelde_datum text not null default '',
  gestart_op         text not null,
  gestart_door       text not null default '',
  afgesloten_op      text not null default '',
  uitkomst           text not null default '',  -- '' | akkoord | afgebroken
  actief             integer not null default 1 -- precies één actieve ronde per cluster
);
create index if not exists akkoord_ronden_cluster_idx on akkoord_ronden (cluster_id, nummer);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5) RESPONS — het antwoord van één bewoner in één ronde. Nieuwe ronde = nieuwe responsen;
--    de oude blijven staan als historie.
create table if not exists akkoord_responsen (
  id           text primary key,
  ronde_id     text not null,
  adres_id     text not null,
  antwoord     text not null default '',  -- akkoord | niet_akkoord | niet_thuis | weigert
  via          text not null default '',  -- deur | telefoon
  opmerking    text not null default '',
  door         text not null default '',
  tijdstip     text not null,
  -- Binnengekomen nadat de ronde al was afgesloten (iemand stond offline). Niet weggooien, wel tonen.
  na_afsluiten integer not null default 0
);
create unique index if not exists akkoord_responsen_uniek on akkoord_responsen (ronde_id, adres_id);
create index if not exists akkoord_responsen_adres_idx on akkoord_responsen (adres_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6) BESCHIKBAARHEID — welke data een bewoner wél of niet kan.
--    Hangt aan het ADRES, niet aan de ronde: zo telt wat iemand in ronde 1 zei ook in ronde 3 nog mee.
--    Zonder deze tabel is elke volgende ronde opnieuw gokken.
create table if not exists akkoord_beschikbaarheid (
  id           text primary key,
  adres_id     text not null,
  datum        text not null,              -- ISO jjjj-mm-dd
  kan          integer not null default 1, -- 1 = kan wel, 0 = kan niet
  ronde_id     text not null default '',   -- waar het vandaan komt, puur ter informatie
  door         text not null default '',
  tijdstip     text not null
);
create unique index if not exists akkoord_beschikbaarheid_uniek on akkoord_beschikbaarheid (adres_id, datum);

-- ─────────────────────────────────────────────────────────────────────────────
-- 7) TAAK — nu alleen de poster, later eventueel meer.
create table if not exists akkoord_taken (
  id            text primary key,
  pd_nummer     text not null,
  cluster_id    text not null default '',
  soort         text not null default 'poster',
  deadline      text not null default '',   -- uitvoeringsdatum min poster_weken_voor
  afgevinkt_op  text not null default '',
  afgevinkt_door text not null default '',
  foto          text not null default '',   -- data-URL van het bewijs, optioneel
  notitie       text not null default '',
  bijgewerkt_op text not null
);
create index if not exists akkoord_taken_dossier_idx on akkoord_taken (pd_nummer, afgevinkt_op);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8) LOG — append-only. Zelfde opzet als bij bodemonderzoek: alleen de gebeurtenissen waar later
--    vragen over komen, niet elke toetsaanslag.
create table if not exists akkoord_log (
  id          integer primary key autoincrement,
  pd_nummer   text not null,
  cluster_id  text not null default '',
  adres_id    text not null default '',
  gebeurtenis text not null,
  oud         text not null default '',
  nieuw       text not null default '',
  door        text not null default '',
  tijdstip    text not null
);
create index if not exists akkoord_log_dossier_idx on akkoord_log (pd_nummer, tijdstip);

-- ── Controle ──
--   select pd_nummer, status, regio from akkoord_dossiers where verwijderd = 0;
--   select gebeurtenis, count(*) from akkoord_log group by 1;

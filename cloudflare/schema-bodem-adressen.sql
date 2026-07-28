-- Wire Solutions — Bodemonderzoek: adressen als echte rijen (Cloudflare D1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-bodem-adressen.sql
-- Veilig meerdere keren te draaien. VOLLEDIG ADDITIEF: één nieuwe tabel, geen wijziging aan bestaande.
--
-- WAAROM WEG UIT DE JSON-BLOB?
-- Alle adressen zaten samen in één JSON-rij (wire_state key 'tauw'). Twee problemen:
--   1) Een volledig ingevuld adres is ~576 bytes, dus rond de 3.640 adressen loopt die rij tegen de
--      grens van D1 aan — en dan stopt de synchronisatie van dat hele onderdeel.
--   2) Erger in de praktijk: élke wijziging herschreef de héle lijst. Vult een medewerker bij één
--      adres een naam in, dan ging bij 2.000 adressen 1,1 MB omhoog. Op 4G, bij iemand op de stoep.
-- Als losse rijen is er geen plafond, en is één wijziging één klein rijtje.

create table if not exists bodem_adressen (
  id               text primary key,
  project_id       text not null,
  volgorde         integer not null default 0,   -- positie in de looproute

  -- Adresgegevens (uit de import)
  straat           text not null default '',
  huisnummer       text not null default '',
  postcode         text not null default '',
  plaats           text not null default '',
  wijk             text not null default '',
  perceel          text not null default '',

  -- Wat er aan de deur wordt ingevuld
  bewoner          text not null default '',
  telefoon         text not null default '',
  email            text not null default '',
  notitie          text not null default '',

  toegewezen_aan   text,                          -- user id van de medewerker
  aanwezig         text not null default '',      -- '' | 'ja' | 'nee'
  datum            text not null default '',      -- ISO jjjj-mm-dd (alleen bij 'ja')
  tijdslot         text not null default '',      -- "08:00-09:00" (alleen bij 'ja')
  toestemming_tuin integer not null default 0,
  uitkomst         text not null default '',      -- afgerond | niet_thuis | weigert | later | ongeldig
  pogingen         integer not null default 0,
  afgerond         integer not null default 0,
  afgerond_op      text not null default '',
  afgerond_door    text not null default '',

  -- Zacht verwijderen: zo komt een verwijdering ook door op toestellen die even offline waren.
  -- Een harde delete zou op zo'n toestel onzichtbaar blijven en het adres later terugbrengen.
  verwijderd       integer not null default 0,
  bijgewerkt_op    text not null
);

create index if not exists bodem_adressen_project_idx    on bodem_adressen (project_id, volgorde);
create index if not exists bodem_adressen_gewijzigd_idx  on bodem_adressen (project_id, bijgewerkt_op);
create index if not exists bodem_adressen_toegewezen_idx on bodem_adressen (project_id, toegewezen_aan);
create index if not exists bodem_adressen_postcode_idx   on bodem_adressen (project_id, postcode);

-- ── Controle ──
--   select project_id, count(*) from bodem_adressen where verwijderd = 0 group by 1;

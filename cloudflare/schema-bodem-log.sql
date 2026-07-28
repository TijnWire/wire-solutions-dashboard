-- Wire Solutions — Bodemonderzoek: wijzigingslog (Cloudflare D1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-bodem-log.sql
-- Additief: één nieuwe tabel, geen bestaande tabel wordt aangeraakt.
--
-- WAT LEGGEN WE VAST, EN WAAROM NIET ALLES?
-- Elke toetsaanslag loggen levert een berg ruis op waarin je niets terugvindt, en het kost onnodig
-- opslag. We leggen de gebeurtenissen vast waar later vragen over komen:
--   • een afspraak gemaakt, verplaatst of ingetrokken   → "waarom staat de aannemer voor een dichte deur?"
--   • de uitkomst van een adres gewijzigd               → "wie heeft dit op weigert gezet?"
--   • een adres toegewezen aan iemand anders            → "wie was hier verantwoordelijk?"
--   • een adres verwijderd                              → "waar is dit adres gebleven?"
--   • een import of verdeling                           → één regel per actie, niet per adres
--
-- De tabel is bedoeld als append-only: er wordt alleen ingevoegd, nooit gewijzigd of verwijderd.
-- Dat wordt in de Worker afgedwongen (er is geen route die hierin wijzigt).

create table if not exists bodem_log (
  id            integer primary key autoincrement,
  project_id    text not null,
  adres_id      text not null default '',   -- leeg bij een actie op het hele project (import, verdeling)
  gebeurtenis   text not null,              -- afspraak_gemaakt | afspraak_verplaatst | afspraak_ingetrokken
                                            -- | uitkomst | toegewezen | verwijderd | geimporteerd | verdeeld
  oud           text not null default '',   -- de vorige waarde, voor zover van toepassing
  nieuw         text not null default '',   -- de nieuwe waarde
  door          text not null default '',   -- e-mailadres van wie het deed
  tijdstip      text not null
);

create index if not exists bodem_log_project_idx on bodem_log (project_id, tijdstip);
create index if not exists bodem_log_adres_idx   on bodem_log (adres_id, tijdstip);

-- ── Controle ──
--   select gebeurtenis, count(*) from bodem_log group by 1 order by 2 desc;
--   select tijdstip, gebeurtenis, adres_id, oud, nieuw, door from bodem_log order by id desc limit 20;

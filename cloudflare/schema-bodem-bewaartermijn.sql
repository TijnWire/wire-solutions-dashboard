-- Wire Solutions — Bodemonderzoek: bewaartermijn voor persoonsgegevens (Cloudflare D1)
-- ─────────────────────────────────────────────────────────────────────────────
-- Draaien:  npx wrangler d1 execute wire-solutions --remote --file cloudflare/schema-bodem-bewaartermijn.sql
-- Additief: twee nieuwe kolommen mét standaardwaarde op een tabel die wij zelf hebben aangemaakt.
-- Geen bestaande kolom wordt gewijzigd of verwijderd.
--
-- WAAROM
-- Naam, telefoonnummer en e-mailadres van bewoners zijn persoonsgegevens. Die mogen we niet langer
-- bewaren dan nodig. "Nodig" loopt tot het bodemonderzoek is uitgevoerd en verantwoord richting TAUW
-- of Van der Helm; daarna niet meer.
--
-- WAT ER BEWAARD BLIJFT
-- Het adres, de uitkomst (wel of niet aanwezig), de datum en het tijdblok blijven staan. Daarmee kun
-- je later nog verantwoorden wat er is afgesproken, zonder dat je nog weet wíé daar woonde.

-- Wanneer is het project afgerond? Vanaf dat moment loopt de bewaartermijn.
alter table bodem_projecten add column afgerond_op text not null default '';

-- Wanneer zijn de persoonsgegevens gewist? Leeg = nog niet. Zo is het achteraf aantoonbaar.
alter table bodem_projecten add column gewist_op text not null default '';

-- ── Controle ──
--   select project_id, afgerond_op, gewist_op from bodem_projecten;

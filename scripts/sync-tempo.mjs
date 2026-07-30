// Vangnet: de pollfrequentie en de gezondheidsgrens moeten uit elkaar blijven.
// ─────────────────────────────────────────────────────────────────────────────
// Draait automatisch vóór elke `npm run build`.
//
// Waarom dit bestaat: op 30-07-2026 stond de poll op 60 seconden en de grens waarbinnen de server
// geantwoord moet hebben óók op 60 seconden. Daardoor sloeg de melding om vlak vóór elke ronde en
// zei de app bij het hele team "niet gesynchroniseerd", terwijl er niets aan de hand was. Iedereen
// ging daarnaar handelen — en dat kostte meer dan een echte storing.
//
// Een melding die liegt is erger dan geen melding. Deze controle houdt de build tegen zodra de
// speling onder de drie rondes zakt.

import { readFileSync } from "node:fs";

const bron = readFileSync("src/store/AppContext.tsx", "utf8");
const getal = (naam) => {
  const m = new RegExp(`const ${naam}\\s*=\\s*([\\d_]+)`).exec(bron);
  return m ? Number(m[1].replace(/_/g, "")) : null;
};

const poll = getal("POLL_MET_VERBINDING");
const grensRegel = /const GEZOND_BINNEN\s*=\s*(.+?);/.exec(bron);

if (poll === null || !grensRegel) {
  console.error("\n  Kon POLL_MET_VERBINDING of GEZOND_BINNEN niet vinden in src/store/AppContext.tsx.");
  console.error("  Zijn die hernoemd? Pas dan ook scripts/sync-tempo.mjs aan.\n");
  process.exit(1);
}

// De grens hoort te worden afgeleid van de poll, niet los ingesteld — dan kunnen ze niet uit de pas
// lopen als iemand later aan de tempo's draait.
if (!grensRegel[1].includes("POLL_MET_VERBINDING")) {
  console.error(`\n  GEZOND_BINNEN staat op "${grensRegel[1].trim()}" — een los getal.`);
  console.error("  Leid hem af van POLL_MET_VERBINDING, anders lopen ze vroeg of laat weer uiteen.\n");
  process.exit(1);
}

const factor = Number((/\*\s*([\d.]+)/.exec(grensRegel[1]) ?? [])[1] ?? 0);
if (!(factor >= 3)) {
  console.error(`\n  De speling is ${factor || "?"}× de pollfrequentie; minimaal 3× is nodig.`);
  console.error("  Anders levert één gemiste ronde — trage verbinding, telefoon in de zak — al een");
  console.error("  vals 'niet gesynchroniseerd' op bij het hele team.\n");
  process.exit(1);
}

console.log(`  sync-tempo: poll ${poll / 1000}s, gezond binnen ${(poll * factor) / 1000}s (${factor}× speling)`);

// Vangnet: er mag nooit een localhost-adres mee de build in.
// ─────────────────────────────────────────────────────────────────────────────
// Draait automatisch vóór elke `npm run build`.
//
// Waarom: om iets te bekijken werd de app weleens tijdelijk naar 127.0.0.1 gewezen. Vergeet je dat
// terug te zetten, dan rolt Vercel een app uit die een server op iemands eigen computer zoekt. Voor
// alle anderen is de app dan simpelweg stuk — geen data, geen inloggen, niets. Dat is te makkelijk
// om te vergeten en te duur als het gebeurt, dus de build weigert het gewoon.

import { readFileSync } from "node:fs";

const BESTANDEN = ["src/lib/supabase.ts"];
const PATROON = /(127\.0\.0\.1|localhost)\s*:?\s*\d*/;

let fout = false;
for (const bestand of BESTANDEN) {
  const regels = readFileSync(bestand, "utf8").split(/\r?\n/);
  regels.forEach((regel, i) => {
    // Uitleg in commentaar overslaan. Let op: NIET zomaar alles vanaf "//" wegknippen — in
    // "http://127.0.0.1" zit ook een dubbele schuine streep, en dan knip je juist weg waar het om
    // gaat. Deze controle liet er daardoor eerst eentje doorheen. Dus: alleen regels die ÉCHT met
    // commentaar beginnen worden overgeslagen.
    const kaal = regel.trim();
    if (!kaal || kaal.startsWith("//") || kaal.startsWith("*") || kaal.startsWith("/*")) return;
    if (!PATROON.test(kaal)) return;
    fout = true;
    console.error(`\n  ${bestand}:${i + 1}  ${kaal.slice(0, 100)}`);
  });
}

if (fout) {
  console.error("\n  De app wijst naar een adres op deze computer. Zo uitrollen betekent dat de app");
  console.error("  het voor iedereen behalve jou niet doet. Zet het adres terug naar de echte Worker");
  console.error("  en probeer opnieuw.\n");
  process.exit(1);
}

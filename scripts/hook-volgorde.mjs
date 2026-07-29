// Vangnet: geen React-hook ná een return in hetzelfde component.
// ─────────────────────────────────────────────────────────────────────────────
// Draait automatisch vóór elke `npm run build`.
//
// Waarom: React eist dat elke hook bij iedere render in dezelfde volgorde draait. Staat er een
// `return` boven een hook, dan wordt die hook op dát pad overgeslagen en klapt de app om — met een
// wit scherm en niets in beeld om aan te zien wat er mis is. Precies dat gebeurde bij het openen van
// een brievenmap: de filterbalk stond onder `if (mapDetail) return <MapDetail …>`.
//
// Dit is geen volledige controle (dat kan alleen een echte parser), maar hij vangt het geval dat in
// de praktijk misgaat: een `return` op componentniveau met daaronder nog een hookaanroep.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const HOOK = /^\s{2}(?:const|let)?\s*[\w{[\], ]*=?\s*use[A-Z]\w*\(/;
const HOOK_KAAL = /^\s{2}use[A-Z]\w*\(/;
const RETURN = /^\s{2}if \([^)]*\)\s*return\b/;
const COMPONENT = /^(?:export )?function [A-Z]\w*/;

function bestanden(map) {
  const uit = [];
  for (const naam of readdirSync(map)) {
    const pad = join(map, naam);
    if (statSync(pad).isDirectory()) uit.push(...bestanden(pad));
    else if (naam.endsWith(".tsx")) uit.push(pad);
  }
  return uit;
}

// Twee schermen hebben dit al langer en zijn niet in één keer veilig recht te zetten: daar zit de
// controle op rol/gebruiker midden tussen de hooks, en die verplaatsen raakt de werking van de
// pagina. Ze staan hier bewust met naam genoemd, zodat ze niet stilletjes vergeten worden — en zodat
// een NIEUWE overtreding wél meteen de build tegenhoudt.
const NOG_TE_DOEN = new Set(["src/pages/Agenda.tsx", "src/pages/Urenstaat.tsx"]);
const netPad = (p) => p.split("\\").join("/");

let fout = 0;
let bekend = 0;
for (const pad of bestanden("src")) {
  const regels = readFileSync(pad, "utf8").split(/\r?\n/);
  let inComponent = false;
  let returnOp = 0;
  regels.forEach((regel, i) => {
    if (COMPONENT.test(regel)) { inComponent = true; returnOp = 0; return; }
    if (!inComponent) return;
    if (RETURN.test(regel)) { if (!returnOp) returnOp = i + 1; return; }
    if (!returnOp) return;
    if (HOOK.test(regel) || HOOK_KAAL.test(regel)) {
      if (NOG_TE_DOEN.has(netPad(pad))) { bekend++; returnOp = 0; return; }
      fout++;
      console.error(`\n  ${pad}:${i + 1}`);
      console.error(`    ${regel.trim().slice(0, 90)}`);
      console.error(`    staat ná de return op regel ${returnOp} — die hook draait dan niet altijd.`);
      returnOp = 0;   // per component één melding is genoeg
    }
  });
}

if (bekend > 0) console.log(`  (${bekend} bekende gevallen in Agenda/Urenstaat staan nog open)`);

if (fout > 0) {
  console.error(`\n  ${fout} hook(s) staan onder een return. Zet ze boven élke return in het component;`);
  console.error("  anders slaat React ze op dat pad over en krijg je een wit scherm.\n");
  process.exit(1);
}

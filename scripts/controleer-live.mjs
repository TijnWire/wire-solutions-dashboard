// Controleren wat er ECHT op Vercel staat.
// ─────────────────────────────────────────────────────────────────────────────
// Draaien:  npm run controleer
//
// Er wordt hier niets lokaal opgestart. Geen vite, geen wrangler dev, geen poort die blijft hangen.
// Deze controle haalt de app op zoals een telefoon hem ophaalt en kijkt wat er in zit.
//
// Waarom dit bestaat: om een scherm te bekijken zette ik eerder een lokale server op en wees ik de
// app tijdelijk naar 127.0.0.1. Vergeet je dat één keer terug te zetten, dan staat er een app op
// Vercel die naar een computer wijst die niemand kan bereiken — en dan werkt er niets meer, voor
// niemand. Die hele omweg is nu weg: we kijken naar wat er staat.

import { readFileSync } from "node:fs";

const SITE = process.env.WIRE_SITE ?? "https://wire-solutions-dashboard.vercel.app";
const API = "https://wire-solutions-api.denhaantijn1.workers.dev";

let geslaagd = 0;
let gefaald = 0;
const check = (ok, wat, extra = "") => {
  if (ok) { geslaagd++; console.log(`  ✓ ${wat}`); }
  else { gefaald++; console.log(`  ✗ ${wat}${extra ? `  — ${extra}` : ""}`); }
};

const haal = async (pad, ms = 30000) => {
  const r = await fetch(SITE + pad, { signal: AbortSignal.timeout(ms), redirect: "follow" });
  return { status: r.status, tekst: await r.text() };
};

// Wat hoort er te staan volgens de broncode in deze map?
const lokaleVersie = (readFileSync("src/lib/versie.ts", "utf8").match(/"([\d.]+)"/) ?? [])[1];
const lokaleCache = (readFileSync("public/sw.js", "utf8").match(/wire-cache-v(\d+)/) ?? [])[1];

console.log(`Site: ${SITE}`);
console.log(`Deze map staat op V${lokaleVersie}, service worker v${lokaleCache}\n`);

// ── 1. Staat de site er? ──
console.log("1. De site");
const start = Date.now();
const pagina = await haal("/");
const laadtijd = Date.now() - start;
check(pagina.status === 200, `de app antwoordt (${laadtijd} ms)`, `status ${pagina.status}`);

const bundel = (pagina.tekst.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/) ?? [])[0];
check(!!bundel, "er staat een bundel in de pagina", bundel ?? "niet gevonden");
if (!bundel) { console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`); process.exit(1); }

// ── 2. Draait Vercel wat hier in de map staat? ──
console.log("\n2. Is dit dezelfde versie als hier?");
const code = (await haal(bundel, 60000)).tekst;
check(code.includes(`"${lokaleVersie}"`), `V${lokaleVersie} zit in de bundel op Vercel`,
  "de laatste push is nog niet uitgerold, of de build is mislukt");

const sw = await haal("/sw.js");
const liveCache = (sw.tekst.match(/wire-cache-v(\d+)/) ?? [])[1];
check(liveCache === lokaleCache, `service worker staat op v${lokaleCache}`, `live: v${liveCache}`);

// ── 3. Het gevaar: wijst de app naar een computer die niemand kan bereiken? ──
console.log("\n3. Waar praat de app mee?");
const naarLokaal = /127\.0\.0\.1|localhost:\d/.test(code);
check(!naarLokaal, "geen localhost-adres in de uitgerolde app",
  "de app zoekt een server op deze computer — voor iedereen behalve jou is hij dan stuk");
check(code.includes("wire-solutions-api.denhaantijn1.workers.dev"), "de app wijst naar de echte Worker");

// ── 4. Doet de Worker het ook? ──
console.log("\n4. De database-kant");
const api = await fetch(`${API}/state`, { signal: AbortSignal.timeout(20000) }).catch(() => null);
check(api?.status === 401, "de Worker antwoordt en vraagt om een geldige sessie", `status ${api?.status ?? "geen antwoord"}`);

// ── 5. Zit het werk van vandaag er echt in? ──
// Een versienummer kan kloppen terwijl de build oud is. Daarom kijken we of een paar dingen die we
// net hebben gebouwd ook echt in de bundel zitten.
console.log("\n5. Steekproef op de inhoud");
for (const [wat, naald] of [
  ["de saneerflow praat met de server", "/saneer/"],
  ["het PD-veld met vaste letters", "Wordt opgeslagen als"],
  ["de poster-herinnering", "Poster hangt"],
  ["bewoners thuis van 08:00 tot 16:00", "08:00 tot 16:00"],
  ["uitvoering is een dag, geen periode", "Geplande uitvoeringsdag"],
  ["het sleepvak in de saneerflow", "de kolommen worden zelf herkend"],
  ["postcodes opzoeken bij ontbreken", "Postcodes opzoeken"],
  ["kop met voorbereiden en uitvoeren", "Voorbereiden"],
  ["hele groep opnieuw bij een afzegging", "gaat niet door"],
  ["een man op het hele project", "Wie voert dit werk uit?"],
  ["checklist voor de schouwer", "Checklists schouwer"],
  ["tabbalk bij Brieven & Routes", "Klaar voor Stedin"],
  ["map doorsturen naar de boekhouding", "Naar boekhouding"],
  ["route via Google Maps", "google.com/maps/dir"],
  ["kaartje in de bus", "Niemand thuis"],
  ["telefoonnummer bewaart zichzelf", "wordt bewaard"],
  ["sync-test met stappen", "Gegevens opslaan"],
  ["telefoonnummer per adres verplicht", "telefoonnummers"],
  ["filterbalk op de projectpaginas", "nieuwste bovenaan"],
]) check(code.includes(naald), wat, "zit niet in de uitgerolde bundel");

console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
process.exit(gefaald === 0 ? 0 : 1);

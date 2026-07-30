// Schrijft dist/versie.json na de build.
// ─────────────────────────────────────────────────────────────────────────────
// Dit bestandje is de ontsnappingsroute voor het geval de service worker zich niet laat vernieuwen.
// Dat gebeurt op iOS: een app op het beginscherm wordt bevroren in plaats van afgesloten, en de
// controle op een nieuwe versie loopt dan soms nooit. Gevolg: de app van je beginscherm gooien en
// opnieuw installeren — en dát gaat weleens mis.
//
// De app haalt dit bestandje op zonder cache. Staat er een ander versienummer in dan wat er draait,
// dan weet hij dat er een nieuwe versie klaarstaat, buiten de service worker om.
import { readFileSync, writeFileSync } from "node:fs";

const versie = (/"([\d.]+)"/.exec(readFileSync("src/lib/versie.ts", "utf8")) ?? [])[1];
if (!versie) { console.error("  Kon APP_VERSIE niet vinden in src/lib/versie.ts"); process.exit(1); }
writeFileSync("dist/versie.json", JSON.stringify({ versie, gebouwd: new Date().toISOString() }) + "\n");
console.log(`  versie.json: V${versie}`);

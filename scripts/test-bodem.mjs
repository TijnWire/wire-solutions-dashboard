// Testsuite voor de bodemonderzoek-module.
// ─────────────────────────────────────────────────────────────────────────────
// Draaien:  npm test
//
// Dekt de vier paden waarvan het pijn doet als ze stukgaan:
//   1. een afspraak vastleggen aan de deur
//   2. zonder bereik werken en later synchroniseren
//   3. twee medewerkers die hetzelfde tijdblok pakken
//   4. een formulier halverwege afbreken en later hervatten
//
// De tests draaien tegen een ECHTE Worker met een lokale database (wrangler dev), niet tegen
// nagebootste functies. Een test die de database nabootst bewijst niets over de capaciteitscontrole,
// want die zit juist ín de SQL-opdracht.
//
// De lokale database wordt niet gewist: elke test gebruikt een eigen project-id, zodat je hem naast
// je gewone werk kunt draaien.

import { spawn } from "node:child_process";

const POORT = 8791;
const U = `http://127.0.0.1:${POORT}`;
const H = (t) => ({ "content-type": "application/json", Authorization: `Bearer ${t}` });
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

let geslaagd = 0;
let gefaald = 0;

function check(voorwaarde, omschrijving, extra = "") {
  if (voorwaarde) {
    geslaagd++;
    console.log(`  ✓ ${omschrijving}`);
  } else {
    gefaald++;
    console.log(`  ✗ ${omschrijving}${extra ? `  — ${extra}` : ""}`);
  }
}

async function post(pad, token, body) {
  const r = await fetch(U + pad, { method: "POST", headers: H(token), body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function get(pad, token) {
  const r = await fetch(U + pad, { headers: H(token) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// ── De Worker starten ──
async function startWorker() {
  const kind = spawn("npx", ["wrangler", "dev", "--port", String(POORT), "--local"], {
    cwd: process.cwd(), shell: true, stdio: "ignore",
  });
  for (let i = 0; i < 40; i++) {
    try {
      await fetch(`${U}/state`, { signal: AbortSignal.timeout(1500) });
      return kind;
    } catch { await wacht(1000); }
  }
  throw new Error("De Worker startte niet binnen 40 seconden.");
}

async function main() {
  console.log("Worker starten…");
  const worker = await startWorker();
  try {
    const inlog = async (e) => (await post("/auth/signup", "", { email: e, wachtwoord: "testtest12" })).data.token;
    const baas = await inlog("baas@test.nl");
    const mont = await inlog("monteur@test.nl");
    if (!baas || !mont) throw new Error("Kon geen testaccounts aanmaken — staat de teamlijst in de lokale database?");

    const stempel = Date.now();
    const project = (naam) => `test-${naam}-${stempel}`;

    // ── 1. Een afspraak vastleggen ──
    console.log("\n1. Afspraak vastleggen aan de deur");
    {
      const P = project("afspraak");
      await post("/bodem/adressen", baas, { projectId: P, adressen: [
        { id: `${P}-a1`, volgorde: 0, straat: "Kerkstraat", huisnummer: "1", postcode: "3011 AB", plaats: "Rotterdam", toegewezen_aan: "u2" },
      ]});
      const r = await post("/bodem/afspraak", mont, {
        projectId: P, adresId: `${P}-a1`, datum: "2026-08-04", tijdslot: "09:00-10:00",
        naam: "Fam. Jansen", telefoon: "0612345678",
      });
      check(r.status === 200, "afspraak wordt aangenomen", `status ${r.status}`);

      const na = await get(`/bodem/project?id=${P}`, baas);
      const af = na.data.afspraken?.[0];
      check(af?.datum === "2026-08-04" && af?.tijdslot === "09:00-10:00", "datum en tijdblok staan in de database");
      check(af?.naam === "Fam. Jansen" && af?.telefoon === "0612345678", "naam en telefoonnummer zijn bewaard");
      check((na.data.bezetting ?? []).some((b) => b.n === 1), "het blok telt als bezet");
    }

    // ── 2. Zonder bereik werken en later synchroniseren ──
    console.log("\n2. Zonder bereik werken, daarna synchroniseren");
    {
      const P = project("offline");
      await post("/bodem/adressen", baas, { projectId: P, adressen: [
        { id: `${P}-a1`, volgorde: 0, straat: "Molenweg", huisnummer: "2", postcode: "3011 CD", plaats: "Rotterdam", toegewezen_aan: "u2" },
      ]});
      // Zonder bereik komt er niets bij de server; de app zet het in de wachtrij. Het versturen
      // daarna is precies wat verwerkWachtrij doet — dat bootsen we hier na.
      const later = await post("/bodem/afspraak", mont, {
        projectId: P, adresId: `${P}-a1`, datum: "2026-08-05", tijdslot: "13:00-14:00",
        naam: "M. Bakker", telefoon: "0698765432",
      });
      check(later.status === 200, "een afspraak uit de wachtrij komt alsnog aan");

      const uitkomst = await post("/bodem/adres", mont, {
        id: `${P}-a1`, projectId: P, patch: { uitkomst: "afgerond", afgerond: 1, bewoner: "M. Bakker" },
      });
      check(uitkomst.status === 200, "de rest van het formulier komt ook aan");

      const na = await get(`/bodem/adressen?projectId=${P}`, baas);
      check(na.data.adressen?.[0]?.bewoner === "M. Bakker", "de ingevulde gegevens staan er na het synchroniseren");
    }

    // ── 3. Twee medewerkers, hetzelfde tijdblok ──
    console.log("\n3. Dubbele boeking");
    {
      const P = project("dubbel");
      await post("/bodem/project", baas, { projectId: P, config: { sloten: [{ slot: "10:00-11:00", actief: true, max: 1 }] } });
      await post("/bodem/adressen", baas, { projectId: P, adressen: [
        { id: `${P}-a1`, volgorde: 0, straat: "Havenweg", huisnummer: "1", toegewezen_aan: "u2" },
        { id: `${P}-a2`, volgorde: 1, straat: "Havenweg", huisnummer: "3", toegewezen_aan: "u2" },
      ]});
      const boek = (n) => post("/bodem/afspraak", mont, {
        projectId: P, adresId: `${P}-a${n}`, datum: "2026-08-06", tijdslot: "10:00-11:00",
        naam: `Bewoner ${n}`, telefoon: "0612345678",
      });
      const [r1, r2] = await Promise.all([boek(1), boek(2)]);
      const ok = [r1.status, r2.status].sort().join(",");
      check(ok === "200,409", "precies één van de twee krijgt het blok", `statussen ${ok}`);
      const geweigerd = [r1, r2].find((r) => r.status === 409);
      check(/vol/i.test(geweigerd?.data?.error ?? ""), "de ander krijgt een leesbare melding", geweigerd?.data?.error);

      const na = await get(`/bodem/project?id=${P}`, baas);
      check(na.data.afspraken?.length === 1, "er staat maar één afspraak in de database");
    }

    // ── 4. Formulier afbreken en hervatten ──
    console.log("\n4. Formulier afbreken en hervatten");
    {
      const P = project("hervat");
      await post("/bodem/adressen", baas, { projectId: P, adressen: [
        { id: `${P}-a1`, volgorde: 0, straat: "Dorpslaan", huisnummer: "5", toegewezen_aan: "u2" },
      ]});
      // Halverwege: alleen de naam is ingevuld, dan gaat het scherm dicht.
      await post("/bodem/adres", mont, { id: `${P}-a1`, projectId: P, patch: { bewoner: "Half ingevuld" } });
      const tussendoor = await get(`/bodem/adressen?projectId=${P}`, mont);
      check(tussendoor.data.adressen?.[0]?.bewoner === "Half ingevuld", "half ingevulde gegevens blijven bewaard");
      check(!tussendoor.data.adressen?.[0]?.afgerond, "het adres staat nog niet op afgerond");

      // Later hervat en afgemaakt.
      await post("/bodem/adres", mont, { id: `${P}-a1`, projectId: P, patch: { telefoon: "0612345678", aanwezig: "nee", toestemming_tuin: 1, uitkomst: "afgerond", afgerond: 1 } });
      const klaar = await get(`/bodem/adressen?projectId=${P}`, mont);
      const a = klaar.data.adressen?.[0];
      check(a?.bewoner === "Half ingevuld" && a?.telefoon === "0612345678", "de eerdere invoer is niet overschreven");
      check(a?.afgerond === 1 && a?.uitkomst === "afgerond", "het adres is nu afgerond");
    }

    // ── 5. Afscherming (AVG) ──
    console.log("\n5. Afscherming per medewerker");
    {
      const P = project("avg");
      await post("/bodem/adressen", baas, { projectId: P, adressen: [
        { id: `${P}-mijn`, volgorde: 0, straat: "Eigen", huisnummer: "1", bewoner: "Van mij", toegewezen_aan: "u2" },
        { id: `${P}-ander`, volgorde: 1, straat: "Ander", huisnummer: "1", bewoner: "Van een collega", toegewezen_aan: "u1" },
      ]});
      const m = await get(`/bodem/adressen?projectId=${P}`, mont);
      check(m.data.adressen?.length === 1, "monteur ziet alleen zijn eigen adres");
      check(!JSON.stringify(m.data).includes("Van een collega"), "de naam van andermans bewoner komt niet mee");
      const poging = await post("/bodem/adres", mont, { id: `${P}-ander`, projectId: P, patch: { bewoner: "Gewijzigd" } });
      check(poging.status === 403, "andermans adres wijzigen wordt geweigerd", `status ${poging.status}`);
    }

    // ── 6. Bewonersakkoord: het dossier ──
    // Aparte module, maar wel dezelfde suite: één commando dat alles nakijkt is er één.
    console.log("\n6. Bewonersakkoord — dossier");
    {
      const PD = `PD${String(stempel).slice(-7)}`;
      const a = await post("/akkoord/dossier", baas, {
        pd_nummer: PD, regio: "Zuid", opdrachtgever: "Stedin", gebouw: "Kerkstraat 1-40",
        uitvoering_van: "2026-09-01", uitvoering_tot: "2026-09-30",
      });
      check(a.status === 200, "dossier aanmaken lukt", a.data.error ?? "");

      const slecht = await post("/akkoord/dossier", baas, { pd_nummer: "P123", regio: "Zuid" });
      check(slecht.status === 400, "een ongeldig PD-nummer wordt geweigerd");

      const dubbel = await post("/akkoord/dossier", baas, { pd_nummer: PD.toLowerCase(), regio: "Noord" });
      check(dubbel.status === 409, "hetzelfde nummer in kleine letters is hetzelfde dossier");

      const m = await post("/akkoord/dossier", mont, { pd_nummer: `${PD}9`, regio: "Zuid" });
      check(m.status === 403, "een monteur mag geen dossier aanmaken");

      await post("/akkoord/dossier/status", baas, { pd_nummer: PD, status: "afgeboekt" });
      const naAfboeken = await post("/akkoord/dossier/status", baas, { pd_nummer: PD, status: "verdeeld" });
      check(naAfboeken.status === 409, "een afgeboekt dossier is alleen-lezen");
    }

    console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
  } finally {
    worker.kill();
    // Wrangler start subprocessen; op Windows blijft de poort anders bezet.
    try { process.kill(worker.pid); } catch { /* al weg */ }
  }
  process.exit(gefaald === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error("Testsuite kon niet draaien:", e.message);
  process.exit(1);
});

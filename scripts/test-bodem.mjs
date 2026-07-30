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
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

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

// src/lib/saneerflowRekenen.ts draait in de browser, maar heeft bewust geen imports. Zo kunnen we het
// hier echt uitvoeren in plaats van de logica na te bouwen — een nagebouwde test bewijst niets.
async function laadRekenwerk() {
  const { transform } = await import("esbuild");
  const bron = readFileSync("src/lib/saneerflowRekenen.ts", "utf8");
  const { code } = await transform(bron, { loader: "ts", format: "esm" });
  const map = mkdtempSync(join(tmpdir(), "wire-test-"));
  const pad = join(map, "rekenen.mjs");
  writeFileSync(pad, code);
  return import(new URL(`file://${pad.split("\\").join("/")}`).href);
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

    // ── 6. Saneren: het dossier ──
    // Aparte module, maar wel dezelfde suite: één commando dat alles nakijkt is er één.
    console.log("\n6. Saneren — dossier");
    {
      const PD = `PD${String(stempel).slice(-7)}`;
      const a = await post("/saneer/dossier", baas, {
        pd_nummer: PD, regio: "Zuid", opdrachtgever: "Stedin", gebouw: "Kerkstraat 1-40",
        uitvoering_van: "2026-09-01", uitvoering_tot: "2026-09-30",
      });
      check(a.status === 200, "dossier aanmaken lukt", a.data.error ?? "");

      const slecht = await post("/saneer/dossier", baas, { pd_nummer: "P123", regio: "Zuid" });
      check(slecht.status === 400, "een ongeldig PD-nummer wordt geweigerd");

      const dubbel = await post("/saneer/dossier", baas, { pd_nummer: PD.toLowerCase(), regio: "Noord" });
      check(dubbel.status === 409, "hetzelfde nummer in kleine letters is hetzelfde dossier");

      const m = await post("/saneer/dossier", mont, { pd_nummer: `${PD}9`, regio: "Zuid" });
      check(m.status === 403, "een monteur mag geen dossier aanmaken");

      await post("/saneer/dossier/status", baas, { pd_nummer: PD, status: "afgeboekt" });
      const naAfboeken = await post("/saneer/dossier/status", baas, { pd_nummer: PD, status: "verdeeld" });
      check(naAfboeken.status === 409, "een afgeboekt dossier is alleen-lezen");
    }

    // ── 7. Saneren: import vult aan, overschrijft nooit ──
    console.log("\n7. Saneren — import");
    let PD2 = "";
    let cluster1 = "";
    {
      PD2 = `PD${String(stempel).slice(-6)}7`;
      await post("/saneer/dossier", baas, {
        pd_nummer: PD2, regio: "Zuid", opdrachtgever: "Stedin", gebouw: "Flat A",
        uitvoering_van: "2026-10-05", uitvoering_tot: "2026-10-30", cluster_grens: 1,
      });
      const adres = (n, pc, tel = "") => ({
        id: `${PD2}-a${n}`, volgorde: n, straat: "Kerkstraat", huisnummer: String(n),
        postcode: pc, plaats: "Rotterdam", telefoon: tel,
      });
      const eerste = await post("/saneer/adressen", baas, {
        pd_nummer: PD2, opdrachtgever: "Stedin", mapping: { straat: 0, huisnummer: 1 }, kopIndex: 0,
        adressen: [adres(1, "3011 AB", "0612345678"), adres(2, "3011 AB"), adres(3, "3011 CD")],
        afgekeurd: [{ id: `${PD2}-x1`, bron_regel: 9, ruw: { a: "geen postcode" }, reden: "Postcode ontbreekt" }],
      });
      check(eerste.data.toegevoegd === 3, "drie adressen ingelezen", JSON.stringify(eerste.data));

      const afg = await get(`/saneer/afgekeurd?pd=${PD2}`, baas);
      check(afg.data.regels?.length === 1, "de afgekeurde regel is bewaard met reden erbij");

      // Aan de deur wordt een naam ingevuld…
      await post("/saneer/adres", baas, { id: `${PD2}-a2`, patch: { bewoner: "Fam. De Vries", telefoon: "0611111111" } });
      // …en dan levert de opdrachtgever het bestand opnieuw aan, met één adres extra.
      const tweede = await post("/saneer/adressen", baas, {
        pd_nummer: PD2, adressen: [adres(1, "3011 AB"), adres(2, "3011 AB"), adres(3, "3011 CD"), adres(4, "3011 CD")],
      });
      check(tweede.data.toegevoegd === 1 && tweede.data.overgeslagen === 3, "tweede import vult alleen aan", JSON.stringify(tweede.data));
      const na = await get(`/saneer/adressen?pd=${PD2}`, baas);
      const a2 = (na.data.adressen ?? []).find((a) => a.id === `${PD2}-a2`);
      check(a2?.bewoner === "Fam. De Vries" && a2?.telefoon === "0611111111", "veldwerk overleeft de tweede import");

      const onthouden = await get("/saneer/mapping?opdrachtgever=Stedin", baas);
      check(onthouden.data.mapping?.huisnummer === 1, "de kolomindeling is onthouden voor de volgende keer");
    }

    // ── 8. Clusteren en verdelen ──
    console.log("\n8. Saneren — clusters");
    {
      const r = await post("/saneer/clusters/maak", baas, { pd_nummer: PD2 });
      check(r.data.clusters?.length === 2, "twee postcodes worden twee clusters", JSON.stringify(r.data));
      check(r.data.teGroot?.length === 2, "clusters boven de grens geven een waarschuwing", JSON.stringify(r.data.teGroot));
      cluster1 = (r.data.clusters ?? []).find((k) => k.postcode === "3011AB")?.id ?? "";

      const opnieuw = await post("/saneer/clusters/maak", baas, { pd_nummer: PD2 });
      check(opnieuw.data.clusters?.length === 2, "nog eens clusteren maakt geen dubbele clusters");

      const geenRecht = await post("/saneer/cluster", mont, { id: cluster1, toegewezen_aan: "u2" });
      check(geenRecht.status === 403, "een monteur mag zichzelf geen cluster toewijzen");

      // Eén man op een flat: alle groepen tegelijk aanwijzen in plaats van stuk voor stuk.
      const geenRecht2 = await post("/saneer/clusters/toewijzen", mont, { pd_nummer: PD2, toegewezen_aan: "u2" });
      check(geenRecht2.status === 403, "een monteur mag het werk niet zelf verdelen");

      const alles = await post("/saneer/clusters/toewijzen", baas, { pd_nummer: PD2, toegewezen_aan: "u2" });
      check(alles.status === 200 && alles.data.aantal === 2, "één opdracht verdeelt alle groepen", JSON.stringify(alles.data));
      const naVerdelen = await get(`/saneer/dossier?pd=${PD2}`, baas);
      check((naVerdelen.data.clusters ?? []).every((k) => k.toegewezen_aan === "u2"), "elke groep staat op dezelfde naam");
      check(naVerdelen.data.dossier?.status === "verdeeld", "het dossier staat op verdeeld", naVerdelen.data.dossier?.status);

      const eigen = await get(`/saneer/adressen?pd=${PD2}`, mont);
      check(eigen.data.adressen?.length === 4, "de monteur ziet nu alle adressen van het project", `${eigen.data.adressen?.length}`);

      // En weer vrijgeven moet ook kunnen, zonder dat er groepen achterblijven.
      await post("/saneer/clusters/toewijzen", baas, { pd_nummer: PD2, toegewezen_aan: "" });
      const leeg = await get(`/saneer/dossier?pd=${PD2}`, baas);
      check((leeg.data.clusters ?? []).every((k) => !k.toegewezen_aan), "toewijzing wissen laat geen groep achter");

      // Voor de rest van de test weer op één man zetten.
      await post("/saneer/clusters/toewijzen", baas, { pd_nummer: PD2, toegewezen_aan: "u2" });
    }

    // ── 9. Eén datum voor het hele cluster ──
    console.log("\n9. Saneren — één datum voor iedereen");
    {
      const r = await post("/saneer/ronde", mont, { cluster_id: cluster1, voorgestelde_datum: "2026-10-07" });
      check(r.status === 200 && r.data.nummer === 1, "ronde 1 gestart", r.data.error ?? "");

      const antwoord = (n, a, extra = {}) => post("/saneer/respons", mont, {
        adres_id: `${PD2}-a${n}`, antwoord: a, via: "deur", ...extra,
      });
      await antwoord(1, "akkoord", { bewoner: "Fam. Jansen", kan_wel: ["2026-10-07", "2026-10-08"] });
      const half = await post("/saneer/cluster/datum", mont, { cluster_id: cluster1, datum: "2026-10-07" });
      check(half.status === 409, "één akkoord van de twee is niet genoeg voor een datum");
      check(/niet iedereen/i.test(half.data.error ?? ""), "de melding legt uit waarom", half.data.error);

      await antwoord(2, "niet_akkoord", { kan_niet: ["2026-10-07"], kan_wel: ["2026-10-08"] });
      const tegen = await post("/saneer/cluster/datum", mont, { cluster_id: cluster1, datum: "2026-10-07" });
      check(tegen.status === 409, "één bewoner die niet kan blokkeert de datum");

      // Aan de deur was adres 1 al akkoord: die staat groen op de bellijst.
      await post("/saneer/adres", baas, { id: `${PD2}-a1`, patch: { belstatus: "akkoord" } });

      // Nieuwe ronde met een datum die iedereen wél kan.
      const r2 = await post("/saneer/ronde", mont, { cluster_id: cluster1, voorgestelde_datum: "2026-10-08" });
      check((r2.data.opnieuwTeBellen ?? 0) >= 1, "een nieuwe ronde zet de hele groep weer op te bellen", JSON.stringify(r2.data.opnieuwTeBellen));
      const naNieuw = await get(`/saneer/bellijst?pd=${PD2}`, baas);
      const a1 = (naNieuw.data.adressen ?? []).find((a) => a.id === `${PD2}-a1`);
      check(a1 && a1.belstatus === "", "wie eerder akkoord was staat niet meer groen afgevinkt", a1?.belstatus);
      check(!!a1?.telefoon, "maar het telefoonnummer is niet aangeraakt", a1?.telefoon);
      check(r2.data.nummer === 2, "ronde 2 gestart");
      const bewaard = await get(`/saneer/cluster?id=${cluster1}`, mont);
      check((bewaard.data.adressen ?? []).some((a) => a.bewoner === "Fam. Jansen"), "namen uit ronde 1 staan er in ronde 2 nog");
      check((bewaard.data.beschikbaarheid ?? []).length >= 3, "wat bewoners over data zeiden telt in ronde 2 mee", `${bewaard.data.beschikbaarheid?.length}`);
      check((bewaard.data.responsen ?? []).length === 0, "de antwoorden van ronde 1 tellen niet meer mee");

      await antwoord(1, "akkoord");
      await antwoord(2, "akkoord");
      const vast = await post("/saneer/cluster/datum", mont, { cluster_id: cluster1, datum: "2026-10-08" });
      check(vast.status === 200, "met iedereen akkoord komt de datum erin", vast.data.error ?? "");
      const overTwee = new Date(); overTwee.setUTCDate(overTwee.getUTCDate() + 14);
      check(vast.data.poster_deadline === overTwee.toISOString().slice(0, 10),
        "de poster moet binnen twee weken na de afspraak hangen", `${vast.data.poster_deadline} i.p.v. ${overTwee.toISOString().slice(0, 10)}`);
    }

    // ── 10. Poster en afronden ──
    // ── Aan de deur: telefoonnummer of kaartje in de bus ──
    // De kern van stap 3: aan de deur haal je meestal geen afspraak maar een telefoonnummer. Zodra dat
    // er staat, moet het adres vanzelf op de bellijst komen — anders belt niemand die bewoner ooit.
    console.log("\n9b. Saneren — langs de deuren");
    {
      const voor = await get(`/saneer/bellijst?pd=${PD2}`, baas);
      const voorN = (voor.data.adressen ?? []).length;

      // Niemand thuis bij adres 3: kaartje in de bus.
      const kaartje = await post("/saneer/adres", baas, { id: `${PD2}-a3`, patch: { kaartje_op: "2026-07-29", bezoeken: 1 } });
      check(kaartje.status === 200, "kaartje in de bus wordt vastgelegd", kaartje.data.error ?? "");

      // Bij adres 4 doet iemand open en geeft een nummer.
      await post("/saneer/adres", baas, { id: `${PD2}-a4`, patch: { telefoon: "0612349999", bezoeken: 1 } });
      const na = await get(`/saneer/bellijst?pd=${PD2}`, baas);
      const opBellijst = (na.data.adressen ?? []).some((a) => a.id === `${PD2}-a4`);
      check(opBellijst, "een nummer dat aan de deur is opgehaald komt meteen op de bellijst");
      check((na.data.adressen ?? []).length === voorN + 1, "en precies dat ene adres komt erbij", `${voorN} -> ${na.data.adressen?.length}`);

      const alles = await get(`/saneer/adressen?pd=${PD2}`, baas);
      const a3 = (alles.data.adressen ?? []).find((a) => a.id === `${PD2}-a3`);
      check(a3?.kaartje_op === "2026-07-29" && a3?.bezoeken === 1, "het kaartje en het aantal bezoeken staan bij het adres");
      check(!(na.data.adressen ?? []).some((a) => a.id === `${PD2}-a3`), "een adres met alleen een kaartje staat nog niet op de bellijst");
    }

    console.log("\n10. Saneren — poster en afronden");
    {
      const teVroeg = await post("/saneer/afronden", baas, { pd_nummer: PD2 });
      check(teVroeg.status === 409, "afronden lukt niet zolang er werk openstaat");
      // Zonder telefoonnummer is een bewoner niet te bereiken als de dag verschuift; daarom mag een
      // dossier niet afgerond worden zolang er nummers ontbreken.
      check((teVroeg.data.belet ?? []).some((b) => /telefoonnummer/i.test(b)),
        "ontbrekende telefoonnummers houden het afronden tegen", JSON.stringify(teVroeg.data.belet));
      check((teVroeg.data.belet ?? []).some((b) => /poster/i.test(b)), "de reden staat erbij", JSON.stringify(teVroeg.data.belet));

      const taken = await get(`/saneer/taken?pd=${PD2}`, baas);
      check(taken.data.taken?.length === 1, "er staat een postertaak klaar");
      await post("/saneer/taak", baas, { id: taken.data.taken[0].id, notitie: "Opgehangen bij de brievenbussen" });

      const nog = await post("/saneer/afronden", baas, { pd_nummer: PD2 });
      check(nog.status === 409 && (nog.data.belet ?? []).some((b) => /datum/i.test(b)), "het tweede cluster zonder datum houdt afronden tegen");

      const ex = await get(`/saneer/export?pd=${PD2}`, baas);
      check(ex.data.adressen?.length === 4 && (ex.data.log ?? []).length > 0, "de export bevat alle adressen en het wijzigingslog");
      const exMont = await get(`/saneer/export?pd=${PD2}`, mont);
      check(exMont.status === 403, "een monteur mag geen export van alles trekken");
    }

    // ── 11. Het rekenwerk in de app zelf ──
    // De server bewaakt de regel bij het vastleggen, maar aan de deur rekent de app zonder bereik.
    // Gaat dát mis, dan ziet een monteur een groen vinkje terwijl er niets rond is.
    console.log("\n11. Saneren — rekenwerk zonder bereik");
    {
      const { standVan, datumVoorstellen } = await laadRekenwerk();
      const adr = (n) => ({ id: `a${n}` });
      const alle = [adr(1), adr(2), adr(3)];

      const bijna = standVan(alle, [
        { adres_id: "a1", antwoord: "akkoord" },
        { adres_id: "a2", antwoord: "akkoord" },
      ]);
      check(bijna.akkoord === 2 && bijna.rond === false, "twee van de drie akkoord is niet rond");

      const heel = standVan(alle, alle.map((a) => ({ adres_id: a.id, antwoord: "akkoord" })));
      check(heel.rond === true, "pas bij iedereen akkoord is de groep rond");

      const weigeraar = standVan(alle, [
        { adres_id: "a1", antwoord: "akkoord" },
        { adres_id: "a2", antwoord: "akkoord" },
        { adres_id: "a3", antwoord: "weigert" },
      ]);
      check(weigeraar.rond === false && weigeraar.tegen === 1, "één weigeraar houdt de groep tegen");
      check(standVan([], []).rond === false, "een lege groep telt nooit als rond");

      // 5 oktober 2026 is een maandag; 10 en 11 oktober zijn zaterdag en zondag.
      const voorstellen = datumVoorstellen(alle, [
        { adres_id: "a1", datum: "2026-10-06", kan: 1 },
        { adres_id: "a2", datum: "2026-10-06", kan: 1 },
        { adres_id: "a3", datum: "2026-10-06", kan: 0 },
        { adres_id: "a1", datum: "2026-10-07", kan: 1 },
      ], "2026-10-05", "2026-10-12");
      check(voorstellen[0].datum === "2026-10-07", "de dag waar niemand tegen is staat bovenaan", voorstellen[0]?.datum);
      const zesde = voorstellen.find((v) => v.datum === "2026-10-06");
      check(zesde.haalbaar === false, "een dag met één tegenstem is onhaalbaar, ook met de meeste stemmen");
      check(!voorstellen.some((v) => v.datum === "2026-10-10" || v.datum === "2026-10-11"), "weekenden worden overgeslagen");
      check(datumVoorstellen(alle, [], "", "").length === 0, "zonder periode komt er geen voorstel");
    }

    // ── 12. De fotoruimte ──
    // Foto's en archiefdossiers gaan niet meer door de synchronisatie maar naar R2. Als dit stukgaat,
    // raak je geen gegevens kwijt maar wél het bewijsmateriaal van een afgerond dossier — dus het moet
    // aantoonbaar heen én terug kunnen, ongeschonden.
    console.log("\n12. Fotoruimte (R2)");
    {
      // Een piepklein PNG'je: 1 bij 1 pixel, maar wel een echt bestand met een echte header.
      const png = Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      );
      const opslaan = await fetch(`${U}/foto`, {
        method: "POST",
        headers: { "content-type": "image/png", Authorization: `Bearer ${baas}` },
        body: png,
      });
      const uit = await opslaan.json().catch(() => ({}));
      check(opslaan.status === 200 && !!uit.naam, "een foto wordt opgeslagen", uit.error ?? `status ${opslaan.status}`);

      if (uit.naam) {
        const terug = await fetch(`${U}/foto/${uit.naam}`);
        const bytes = Buffer.from(await terug.arrayBuffer());
        check(terug.status === 200, "en is weer op te halen");
        check(bytes.equals(png), "byte voor byte hetzelfde als wat erin ging", `${bytes.length} van ${png.length} bytes`);
        check((terug.headers.get("cache-control") ?? "").includes("immutable"), "en mag een jaar in de cache van de browser");

        // Een archiefdossier is een ZIP of PDF; die moet ook kunnen, met een eigen plek.
        const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n", "utf8");
        const arch = await fetch(`${U}/foto`, {
          method: "POST",
          headers: { "content-type": "application/pdf", Authorization: `Bearer ${baas}` },
          body: pdf,
        });
        const archUit = await arch.json().catch(() => ({}));
        check(arch.status === 200 && String(archUit.naam ?? "").startsWith("archief/"),
          "een archiefdossier komt in zijn eigen map terecht", archUit.naam ?? archUit.error);

        // Zonder sessie mag je niets wegschrijven — anders kan iedereen de opslag volgooien.
        const zonder = await fetch(`${U}/foto`, { method: "POST", headers: { "content-type": "image/png" }, body: png });
        check(zonder.status === 401, "opslaan zonder sessie wordt geweigerd", `status ${zonder.status}`);

        // Ophalen mag wél zonder sessie: de naam is niet te raden, en een foto in een tab moet laden.
        const open = await fetch(`${U}/foto/${uit.naam}`);
        check(open.status === 200, "ophalen mag zonder sessie");

        const weg = await fetch(`${U}/foto/${uit.naam}`, { method: "DELETE", headers: { Authorization: `Bearer ${baas}` } });
        check(weg.status === 200, "weggooien lukt");
        const nadien = await fetch(`${U}/foto/${uit.naam}`);
        check(nadien.status === 404, "en daarna is hij echt weg");
      }
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

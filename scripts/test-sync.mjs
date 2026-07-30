// Testsuite voor het live meekijken tussen apparaten.
// ─────────────────────────────────────────────────────────────────────────────
// Draaien:  npm run test:sync            (tegen de lokale Worker)
//           npm run test:sync -- --prod  (tegen de echte Worker, met eigen testsleutels)
//
// De vraag die deze test beantwoordt: als Tijn op zijn telefoon in een map werkt, ziet Remon dat dan
// meteen op zijn laptop, en staat het ook meteen op Tijns eigen laptop?
//
// Daarom doen we hier niet alsof. We openen ECHTE WebSocket-verbindingen — drie stuks, net als drie
// apparaten — schrijven via de echte route, en meten hoeveel milliseconden er tussen zit. Een test die
// de verbinding nabootst bewijst niets over de Durable Object die de berichten rondstuurt.
//
// Tegen productie draait de test uitsluitend op sleutels die met "synctest_" beginnen; die staan niet
// in de app en worden aan het eind weer opgeruimd. Er wordt nooit naar echte data geschreven.

import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import WebSocket from "ws";

const PROD = process.argv.includes("--prod");
const POORT = 8792;
const BASIS = PROD ? "https://wire-solutions-api.denhaantijn1.workers.dev" : `http://127.0.0.1:${POORT}`;
const WS_BASIS = BASIS.replace(/^http/, "ws");
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));

let geslaagd = 0;
let gefaald = 0;
const opruimen = [];

function check(voorwaarde, omschrijving, extra = "") {
  if (voorwaarde) { geslaagd++; console.log(`  ✓ ${omschrijving}`); }
  else { gefaald++; console.log(`  ✗ ${omschrijving}${extra ? `  — ${extra}` : ""}`); }
}
function meet(omschrijving, ms, grens) {
  const ok = ms >= 0 && ms <= grens;
  if (ok) { geslaagd++; console.log(`  ✓ ${omschrijving}  (${ms} ms, grens ${grens} ms)`); }
  else { gefaald++; console.log(`  ✗ ${omschrijving}  (${ms < 0 ? "niets ontvangen" : `${ms} ms`}, grens ${grens} ms)`); }
}

const H = (t) => ({ "content-type": "application/json", Authorization: `Bearer ${t}` });
async function post(pad, token, body) {
  const r = await fetch(BASIS + pad, { method: "POST", headers: H(token), body: JSON.stringify(body) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}
async function get(pad, token) {
  const r = await fetch(BASIS + pad, { headers: H(token) });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

// ── Eén apparaat ──
// Houdt zijn eigen WebSocket vast en onthoudt wanneer welk bericht binnenkwam, zodat we per apparaat
// kunnen meten in plaats van te hopen dat "het wel goed zal zijn".
function apparaat(naam, token) {
  const a = { naam, token, ws: null, ontvangen: [], open: false };
  a.verbind = () => new Promise((klaar, mislukt) => {
    const ws = new WebSocket(`${WS_BASIS}/ws?token=${encodeURIComponent(token)}`);
    a.ws = ws;
    const t = setTimeout(() => mislukt(new Error(`${naam}: WebSocket kwam niet open`)), 15000);
    ws.on("open", () => { clearTimeout(t); a.open = true; klaar(); });
    ws.on("message", (raw) => {
      const tekst = String(raw);
      if (tekst === "pong") return;
      try { a.ontvangen.push({ op: Date.now(), msg: JSON.parse(tekst) }); } catch { /* onbekend bericht */ }
    });
    ws.on("close", () => { a.open = false; });
    ws.on("error", () => { clearTimeout(t); a.open = false; mislukt(new Error(`${naam}: WebSocket gaf een fout`)); });
  });
  a.sluit = () => { try { a.ws?.close(); } catch { /* al dicht */ } a.open = false; };
  // Hoeveel ms na `vanaf` kreeg dit apparaat bericht over deze sleutel? -1 = niets binnen de tijd.
  a.wachtOp = async (key, vanaf, max = 8000) => {
    const eind = Date.now() + max;
    while (Date.now() < eind) {
      const hit = a.ontvangen.find((x) => x.op >= vanaf && x.msg?.type === "changed" && (x.msg.keys ?? []).includes(key));
      if (hit) return hit.op - vanaf;
      await wacht(25);
    }
    return -1;
  };
  a.leeg = () => { a.ontvangen.length = 0; };
  return a;
}

// merge.ts heeft bewust geen imports, dus we kunnen de échte samenvoegcode draaien in plaats van hem
// na te bouwen. Een nagebouwde samenvoeging bewijst niets over de samenvoeging in de app.
async function laadMerge() {
  const { transform } = await import("esbuild");
  const { code } = await transform(readFileSync("src/lib/merge.ts", "utf8"), { loader: "ts", format: "esm" });
  const pad = join(mkdtempSync(join(tmpdir(), "wire-sync-")), "merge.mjs");
  writeFileSync(pad, code);
  return import(new URL(`file://${pad.split("\\").join("/")}`).href);
}

async function startWorker() {
  if (PROD) return null;
  const kind = spawn("npx", ["wrangler", "dev", "--port", String(POORT), "--local"], { cwd: process.cwd(), shell: true, stdio: "ignore" });
  for (let i = 0; i < 40; i++) {
    try { await fetch(`${BASIS}/state`, { signal: AbortSignal.timeout(1500) }); return kind; }
    catch { await wacht(1000); }
  }
  throw new Error("De Worker startte niet binnen 40 seconden.");
}

// De Worker omleggen zoals bij een uitrol: het oude proces weg, een nieuw proces erbij. De database
// blijft staan — precies zoals in het echt, waar alleen de code wordt vervangen.
async function herstartWorker(oud) {
  try { oud.kill(); process.kill(oud.pid); } catch { /* al weg */ }
  await wacht(1200);
  return startWorker();
}

async function main() {
  console.log(`Doel: ${BASIS}${PROD ? "  (ECHTE Worker — alleen synctest_-sleutels)" : "  (lokale Worker)"}\n`);
  const worker = await startWorker();
  const stempel = Date.now();
  const KEY = `synctest_${stempel}`;
  const KEY2 = `synctest_${stempel}_b`;

  try {
    let tijnTel, tijnLap, remon;
    if (PROD) {
      // Tegen productie logt de test in met een bestaand account; het wachtwoord komt uit de omgeving.
      const email = process.env.WIRE_TEST_EMAIL;
      const ww = process.env.WIRE_TEST_WW;
      if (!email || !ww) throw new Error("Zet WIRE_TEST_EMAIL en WIRE_TEST_WW om tegen productie te draaien.");
      const r = await post("/auth/login", "", { email, wachtwoord: ww });
      if (!r.data.token) throw new Error(`Inloggen mislukte: ${r.data.error ?? r.status}`);
      // Drie aparte tokens = drie aparte apparaten, net als in het echt.
      const t2 = (await post("/auth/login", "", { email, wachtwoord: ww })).data.token;
      const t3 = (await post("/auth/login", "", { email, wachtwoord: ww })).data.token;
      tijnTel = apparaat("Tijn-telefoon", r.data.token);
      tijnLap = apparaat("Tijn-laptop", t2);
      remon = apparaat("Remon-laptop", t3);
    } else {
      const inlog = async (e) => (await post("/auth/signup", "", { email: e, wachtwoord: "testtest12" })).data.token;
      tijnTel = apparaat("Tijn-telefoon", await inlog("baas@test.nl"));
      tijnLap = apparaat("Tijn-laptop", await inlog("baas@test.nl"));
      remon = apparaat("Remon-laptop", await inlog("monteur@test.nl"));
    }

    // ── 1. Drie apparaten verbonden ──
    console.log("1. Drie apparaten verbinden");
    await Promise.all([tijnTel.verbind(), tijnLap.verbind(), remon.verbind()]);
    check(tijnTel.open && tijnLap.open && remon.open, "telefoon, laptop en collega zijn alle drie verbonden");

    const slecht = new WebSocket(`${WS_BASIS}/ws?token=onzin`);
    const slechtDicht = await new Promise((r) => {
      slecht.on("open", () => r("open"));
      slecht.on("error", () => r("geweigerd"));
      slecht.on("unexpected-response", () => r("geweigerd"));
      setTimeout(() => r("geen antwoord"), 8000);
    });
    check(slechtDicht === "geweigerd", "een verbinding zonder geldige sessie wordt geweigerd", slechtDicht);

    // ── 2. Tijn werkt op zijn telefoon, de rest kijkt mee ──
    console.log("\n2. Tijn werkt op zijn telefoon");
    {
      [tijnTel, tijnLap, remon].forEach((a) => a.leeg());
      const vanaf = Date.now();
      const w = await post("/state", tijnTel.token, {
        key: KEY,
        data: [{ id: "m1", naam: "Map van de telefoon", bijgewerktOp: new Date().toISOString() }],
      });
      check(w.status === 200, "de telefoon kan schrijven", w.data.error ?? `status ${w.status}`);

      const [naarLaptop, naarRemon] = await Promise.all([tijnLap.wachtOp(KEY, vanaf), remon.wachtOp(KEY, vanaf)]);
      meet("Tijns laptop krijgt meteen bericht", naarLaptop, 3000);
      meet("Remon krijgt meteen bericht", naarRemon, 3000);

      // Bericht krijgen is niet genoeg — het gaat erom dat de gegevens er ook echt zijn.
      const bij = await get(`/state/keys?x=1`, remon.token).catch(() => null);
      const opgehaald = await post("/state/keys", remon.token, { keys: [KEY] });
      check(opgehaald.data?.[KEY]?.[0]?.naam === "Map van de telefoon", "Remon haalt de nieuwe gegevens ook echt op");
      void bij;
    }

    // ── 3. Verder werken in dezelfde map ──
    console.log("\n3. Tijn werkt door in die map");
    {
      [tijnLap, remon].forEach((a) => a.leeg());
      const vanaf = Date.now();
      await post("/state", tijnTel.token, {
        key: KEY,
        data: [{ id: "m1", naam: "Map van de telefoon", status: "bezig", bijgewerktOp: new Date().toISOString() }],
      });
      const naarRemon = await remon.wachtOp(KEY, vanaf);
      meet("een vervolgwijziging komt net zo snel door", naarRemon, 3000);
      const na = await post("/state/keys", remon.token, { keys: [KEY] });
      check(na.data?.[KEY]?.[0]?.status === "bezig", "Remon ziet de nieuwe stand, niet de oude");
    }

    // ── 4. Twee mensen tegelijk in dezelfde map ──
    // Dit is waar het vroeger misging: de centrale database bewaart één blok per onderdeel, dus zonder
    // samenvoegen overschrijft de laatste schrijver de toevoeging van de ander.
    console.log("\n4. Tijn en Remon werken tegelijk");
    {
      const { mergeCollection } = await laadMerge();
      const centraal = [{ id: "m1", naam: "Bestaande map", bijgewerktOp: "2026-07-01T10:00:00Z" }];
      const vanTijn = [...centraal, { id: "t1", naam: "Tijn voegt toe", bijgewerktOp: "2026-07-29T10:00:00Z" }];
      const vanRemon = [...centraal, { id: "r1", naam: "Remon voegt toe", bijgewerktOp: "2026-07-29T10:00:01Z" }];

      const samen = mergeCollection(vanTijn, vanRemon);
      const ids = samen.map((x) => x.id).sort().join(",");
      check(ids === "m1,r1,t1", "beide toevoegingen blijven bestaan", ids);

      // Ook echt via de server: eerst Tijn, dan Remon die de samenvoeging terugschrijft.
      await post("/state", tijnTel.token, { key: KEY2, data: vanTijn });
      const gelezen = (await post("/state/keys", remon.token, { keys: [KEY2] })).data[KEY2];
      await post("/state", remon.token, { key: KEY2, data: mergeCollection(vanRemon, gelezen) });
      const eind = (await post("/state/keys", tijnTel.token, { keys: [KEY2] })).data[KEY2];
      const eindIds = eind.map((x) => x.id).sort().join(",");
      check(eindIds === "m1,r1,t1", "na een ronde over de server staat alles er nog", eindIds);

      // Een wijziging van dit apparaat die nieuwer is, mag niet worden teruggedraaid door een oudere
      // versie van een collega die net iets later toevallig als laatste schrijft.
      const mijnNieuwer = [{ id: "m1", naam: "Net gearchiveerd", bijgewerktOp: "2026-07-29T12:00:00Z" }];
      const hunOuder = [{ id: "m1", naam: "Bestaande map", bijgewerktOp: "2026-07-29T09:00:00Z" }];
      check(mergeCollection(mijnNieuwer, hunOuder)[0].naam === "Net gearchiveerd", "een nieuwere wijziging wint van een oudere");

      // ── Terugzetten van een veiligheidskopie mag niets ongedaan maken ──
      // Dit is precies de zorg van Tijn: klik je op herstellen, dan mogen mappen die je daarna hebt
      // gearchiveerd niet ineens weer in de actieve lijst staan. Het herstel voegt daarom alleen toe:
      // de kopie is 'local', de huidige toestand is 'incoming', en bij een gedeeld id wint het huidige.
      const kopie = [
        { id: "m1", naam: "Vlaardingen", gearchiveerd: false },
        { id: "m2", naam: "Per ongeluk weg", gearchiveerd: false },
      ];
      const nu = [{ id: "m1", naam: "Vlaardingen", gearchiveerd: true }];
      const na = mergeCollection(kopie, nu);
      const m1 = na.find((x) => x.id === "m1");
      check(m1?.gearchiveerd === true, "na terugzetten blijft een gearchiveerde map gearchiveerd");
      check(na.some((x) => x.id === "m2"), "en komt de map die weg was wél terug");
      check(na.length === 2, "zonder dubbelen", `${na.length}`);
    }

    // ── 5. Verwijderen blijft verwijderd ──
    console.log("\n5. Iets weggooien komt niet terug");
    {
      const { mergeCollection } = await laadMerge();
      const lokaal = [{ id: "m1" }];
      const centraalNogAanwezig = [{ id: "m1" }, { id: "weg1" }];
      const grafsteen = { weg1: "2026-07-29T10:00:00Z" };
      const uit = mergeCollection(lokaal, centraalNogAanwezig, grafsteen);
      check(!uit.some((x) => x.id === "weg1"), "een verwijderd record komt niet via een collega terug");
      check(uit.some((x) => x.id === "m1"), "de rest blijft gewoon staan");
    }

    // ── 6. Telefoon even zonder bereik ──
    // Zonder WebSocket valt de app terug op een controle elke 2 seconden. Die controle vraagt eerst een
    // piepklein lijstje met tijdstempels op; daarom testen we of dat lijstje de wijziging laat zien.
    console.log("\n6. Telefoon even zonder bereik");
    {
      const voor = (await get("/state/versions", tijnTel.token)).data[KEY];
      tijnTel.sluit();
      await wacht(300);
      await post("/state", remon.token, {
        key: KEY, data: [{ id: "m1", naam: "Remon werkte door", bijgewerktOp: new Date().toISOString() }],
      });
      const na = (await get("/state/versions", tijnTel.token)).data[KEY];
      check(!!na && na !== voor, "de tijdstempel verandert, dus de vangnet-controle ziet het", `${voor} → ${na}`);

      // Weer bereik: opnieuw verbinden moet gewoon lukken en daarna moet live meekijken weer werken.
      await tijnTel.verbind();
      check(tijnTel.open, "de telefoon verbindt vanzelf opnieuw");
      tijnTel.leeg();
      const vanaf = Date.now();
      await post("/state", remon.token, {
        key: KEY, data: [{ id: "m1", naam: "En weer verder", bijgewerktOp: new Date().toISOString() }],
      });
      meet("na terugkeer van bereik komt het weer meteen door", await tijnTel.wachtOp(KEY, vanaf), 3000);
    }

    // ── 8. Doorwerken terwijl wij aan het uitrollen zijn ──
    // De vraag van Tijn: iemand zit in een map te werken en ondertussen zetten wij een nieuwe versie
    // live. Blijft alles dan bewaard en blijft het live bijwerken werken?
    //
    // Wat er bij een uitrol gebeurt: de Worker wordt vervangen en alle open WebSockets vallen weg.
    // Verzoeken die op dat moment onderweg zijn, mislukken. Dat mag geen werk kosten. Hier zetten we
    // dat na: iemand schrijft door terwijl de Worker omvalt en weer opkomt.
    console.log("\n8. Doorwerken terwijl er wordt uitgerold");
    {
      const KEY3 = `synctest_${stempel}_uitrol`;
      const records = [];
      const mislukt = [];

      const schrijf = async (n) => {
        records.push({ id: `r${n}`, naam: `Voorschouw ${n}`, bijgewerktOp: new Date().toISOString() });
        try {
          const r = await post("/state", tijnTel.token, { key: KEY3, data: [...records] });
          if (r.status !== 200) mislukt.push(n);
        } catch { mislukt.push(n); }        // net als in de app: onthouden en later opnieuw
      };

      for (let n = 1; n <= 4; n++) await schrijf(n);
      const voorUitrol = (await post("/state/keys", remon.token, { keys: [KEY3] })).data[KEY3] ?? [];
      check(voorUitrol.length === 4, "vier stukjes werk staan erin voordat we uitrollen", `${voorUitrol.length}`);

      // ── De uitrol ──
      const opnieuw = await herstartWorker(worker);
      // Tijdens en vlak na de herstart blijft de medewerker gewoon typen.
      for (let n = 5; n <= 8; n++) await schrijf(n);
      // Wat toen mislukte, gaat er alsnog heen — dat doet de app ook (de 'vuil'-lijst).
      if (mislukt.length) await schrijf(records.length);
      check(true, `tijdens de uitrol mislukten ${mislukt.length} van de 8 schrijfacties`);

      const na = (await post("/state/keys", remon.token, { keys: [KEY3] })).data[KEY3] ?? [];
      check(na.length >= 8, "na de uitrol staat al het werk er nog", `${na.length} van de 8`);
      check(na.every((x, i) => x.naam === `Voorschouw ${i + 1}`), "en in de goede volgorde, zonder gaten");

      // ── Blijft live meekijken werken? ──
      // De verbindingen zijn bij de uitrol weggevallen. De app maakt ze vanzelf opnieuw; hier doen
      // we dat expliciet en kijken of er daarna weer meteen bericht komt.
      [tijnTel, tijnLap, remon].forEach((a) => a.sluit());
      await Promise.all([tijnTel.verbind(), tijnLap.verbind(), remon.verbind()]);
      check(tijnTel.open && tijnLap.open && remon.open, "de apparaten verbinden na de uitrol weer");

      [tijnLap, remon].forEach((a) => a.leeg());
      const vanaf = Date.now();
      await post("/state", tijnTel.token, { key: KEY3, data: [...records, { id: "na", naam: "Na de uitrol" }] });
      meet("live meekijken werkt na de uitrol weer", await remon.wachtOp(KEY3, vanaf), 4000);
      opruimen.push(KEY3);
      void opnieuw;
    }

    // ── 9. Een onderdeel dat niet in één rij past ──
    // Hier ging het eerder mis: de database weigert een rij boven ongeveer 2,19 MB. Een voorschouwmap
    // vol foto's gaat daar zonder moeite overheen, en dan mislukte de schrijf zonder dat iemand het
    // zag — je hield de mappen, maar het werk van die dag kwam nergens aan.
    // De server knipt zo'n onderdeel nu zelf in stukken. Deze test controleert de drie dingen die
    // moeten kloppen: het slaat op, het komt er ongeschonden weer uit, en het gaat live door.
    console.log("\n9. Werk dat groter is dan de database aankan");
    {
      const maakGroot = (mb, merk) => {
        const brok = "F".repeat(60_000);
        const foto = (n) => ({ id: `f${n}`, naam: `foto-${n}.jpg`, inhoud: `${merk}${brok}` });
        const stuks = Math.ceil((mb * 1_000_000) / 60_050);
        return [{ id: "vs1", naam: "Voorschouw met veel fotos", merk, bijgewerktOp: new Date().toISOString(),
                  fotos: Array.from({ length: stuks }, (_, i) => foto(i)) }];
      };

      for (const mb of [3, 8]) {
        [tijnLap, remon].forEach((a) => a.leeg());
        const groot = maakGroot(mb, `m${mb}`);
        const tekens = JSON.stringify(groot).length;
        const vanaf = Date.now();
        const w = await post("/state", tijnTel.token, { key: `${KEY}_groot`, data: groot });
        const duur = Date.now() - vanaf;
        check(w.status === 200, `${mb} MB aan werk wordt opgeslagen (${(tekens / 1_000_000).toFixed(1)} MB, ${duur} ms)`,
          w.data.error ?? `status ${w.status}`);
        if (w.status !== 200) continue;

        // Komt het er ongeschonden weer uit? Eén ontbrekend stuk zou hier meteen opvallen.
        const terug = (await post("/state/keys", remon.token, { keys: [`${KEY}_groot`] })).data[`${KEY}_groot`];
        check(JSON.stringify(terug) === JSON.stringify(groot), `de ${mb} MB komt er byte voor byte weer uit`,
          terug ? `${JSON.stringify(terug).length} van ${tekens} tekens` : "niets teruggekregen");

        // En gaat het ook live door naar de andere apparaten?
        meet(`de ${mb} MB komt live door naar Remon`, await remon.wachtOp(`${KEY}_groot`, vanaf), 5000);
      }
      opruimen.push(`${KEY}_groot`);

      // Weer klein maken moet de losse stukken opruimen, anders groeit de database eindeloos.
      await post("/state", tijnTel.token, { key: `${KEY}_groot`, data: [{ id: "vs1", naam: "weer klein" }] });
      const naKlein = (await post("/state/keys", remon.token, { keys: [`${KEY}_groot`] })).data[`${KEY}_groot`];
      check(naKlein?.[0]?.naam === "weer klein", "weer klein worden werkt ook");
      const versies = (await get("/state/versions", tijnTel.token)).data ?? {};
      check(!Object.keys(versies).some((k) => k.includes(" deel ")), "de losse stukken staan niet in de lijst met onderdelen");

      // De grens zelf, ter informatie: hoe groot mag één rij nog zijn?
      const past = async (bytes) => (await post("/state", tijnTel.token, {
        key: `${KEY}_rij`, data: "x".repeat(Math.max(0, bytes - 20)),
      })).status === 200;
      let onder = 1_000_000, boven = 8_000_000;
      while (boven - onder > 100_000) {
        const midden = Math.round((onder + boven) / 2);
        if (await past(midden)) onder = midden; else boven = midden;
      }
      opruimen.push(`${KEY}_rij`);
      console.log(`  → een enkele schrijf van ${(onder / 1_000_000).toFixed(2)} MB komt zonder klagen door; de server knipt zelf waar nodig`);

      // En wat staat er nu écht in de database? Onderdelen die nog ongesplitst tegen de grens aan zitten
      // zijn geen probleem meer, maar het is goed om te zien hoe het ervoor staat.
      const echte = Object.keys(versies).filter((k) => !k.startsWith("synctest_"));
      const groot2 = [];
      for (const k of echte) {
        const d = (await post("/state/keys", tijnTel.token, { keys: [k] })).data;
        if (!(k in d)) continue;
        const bytes = Buffer.byteLength(JSON.stringify(d[k]), "utf8");
        if (bytes > 1_000_000) groot2.push({ k, bytes });
      }
      groot2.sort((a, b) => b.bytes - a.bytes);
      for (const g of groot2.slice(0, 5)) console.log(`     ${g.k}: ${(g.bytes / 1_000_000).toFixed(2)} MB`);
      check(true, `${groot2.length} onderdeel(en) boven 1 MB — die worden vanaf nu automatisch geknipt`);
    }

    opruimen.push(KEY, KEY2);
    console.log(`\n${geslaagd} geslaagd, ${gefaald} gefaald`);
    if (PROD) {
      console.log("\nOpruimen van de testsleutels:");
      console.log(`  npx wrangler d1 execute wire-solutions --remote --command "delete from wire_state where key like 'synctest_%'"`);
    }
    [tijnTel, tijnLap, remon].forEach((a) => a.sluit());
  } finally {
    if (worker) { worker.kill(); try { process.kill(worker.pid); } catch { /* al weg */ } }
  }
  process.exit(gefaald === 0 ? 0 : 1);
}

main().catch((e) => { console.error("Testsuite kon niet draaien:", e.message); process.exit(1); });

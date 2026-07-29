// Een demo-aanleverbestand om de saneerflow mee uit te proberen.
// ─────────────────────────────────────────────────────────────────────────────
// Draaien:  npm run demo
// Resultaat: voorbeelden/demo-saneren.xlsx — sleep dat bestand in stap 1 van een sanering.
//
// Waarom dit bestand er zo uitziet: het bootst na hoe een opdrachtgever het echt aanlevert. Straat en
// huisnummer in één kolom, een kolom vol streepjes die nergens over gaat, lege regels ertussen, een
// adres dat twee keer voorkomt en eentje zonder postcode. Een demo waarin alles netjes is, bewijst
// niets — juist die rommel moet de import aankunnen.
//
// ALLE GEGEVENS ZIJN VERZONNEN. De namen zijn duidelijk fictief en de telefoonnummers liggen in een
// reeks die in Nederland niet wordt uitgegeven. Er staat dus geen enkel gegeven van een echt persoon in.

import ExcelJS from "exceljs";
import { mkdirSync } from "node:fs";

const UIT = "voorbeelden";
const BESTAND = `${UIT}/demo-saneren.xlsx`;

// Een vast patroon in plaats van toeval: dan levert elke keer draaien hetzelfde bestand op en kun je
// een probleem dat je ziet ook morgen nog nadoen.
let teller = 0;
const volgende = () => (teller = (teller * 31 + 17) % 1000);

const NAMEN = [
  "Fam. Van Dijk", "Fam. De Groot", "Mevr. Bakker", "Dhr. Visser", "Fam. Meijer",
  "Fam. Jansen", "Dhr. Kuipers", "Mevr. Willems", "Fam. Peters", "Fam. Hendriks",
];

// 06-nummers in een reeks die niet wordt uitgegeven, zodat er nooit iemand echt gebeld kan worden.
const nummer = (i) => `06 9900 ${String(1000 + i).slice(-4)}`;

const rijen = [];
let i = 0;

// ── 1. Het portiekflat-scenario: één postcode, veel voordeuren, iedereen op dezelfde dag ──
// Dit is waar de flow om draait: 24 huishoudens die het samen eens moeten worden over één datum.
for (let nr = 11; nr <= 57; nr += 2) {
  i++;
  const heeftTelefoon = i % 5 !== 0;   // vier van de vijf leveren een nummer aan
  rijen.push({
    deel: "-",
    adres: `Nieuwe Rijksweg ${nr}`,
    postcode: "4128 BM",
    plaats: "Lexmond",
    naam: heeftTelefoon ? NAMEN[volgende() % NAMEN.length] : "",
    telefoon: heeftTelefoon ? nummer(i) : "",
    opmerking: nr === 23 ? "Bel bij voorkeur na 17:00" : "",
  });
}

// ── 2. Een tweede portiek in hetzelfde complex, andere postcode ──
for (let nr = 40; nr <= 60; nr += 2) {
  i++;
  const heeftTelefoon = i % 4 !== 0;
  rijen.push({
    deel: "-",
    adres: `Nieuwe Rijksweg ${nr}`,
    postcode: "4128 BN",
    plaats: "Lexmond",
    naam: heeftTelefoon ? NAMEN[volgende() % NAMEN.length] : "",
    telefoon: heeftTelefoon ? nummer(i) : "",
    opmerking: "",
  });
}

// ── 3. Losse woningen aan de dijk — hier zit vaker geen nummer bij ──
for (const [straat, nr, pc] of [
  ["Kortenhoevendijk", 16, "4128 CL"], ["Kortenhoevendijk", 17, "4128 CL"],
  ["Kortenhoevendijk", 18, "4128 CL"], ["Dorpsstraat", 101, "4128 BX"],
  ["Dorpsstraat", 103, "4128 BX"], ["Kom Lekdijk", 23, "4128 BT"],
  ["Kom Lekdijk", 25, "4128 BT"],
]) {
  i++;
  const heeftTelefoon = i % 3 !== 0;
  rijen.push({
    deel: "-",
    adres: `${straat} ${nr}`,
    postcode: pc,
    plaats: "Lexmond",
    naam: heeftTelefoon ? NAMEN[volgende() % NAMEN.length] : "",
    telefoon: heeftTelefoon ? nummer(i) : "",
    opmerking: "",
  });
}

// ── 4. En de rommel die er in het echt ook in zit ──
// Zonder postcode: de app zoekt hem op bij de landelijke adressenzoeker.
rijen.push({ deel: "-", adres: "Kortenhoevenseweg 9", postcode: "", plaats: "Lexmond", naam: "Fam. Schouten", telefoon: nummer(99), opmerking: "postcode ontbrak bij aanlevering" });
// Precies hetzelfde adres als hierboven: hoort er maar één keer in te komen.
rijen.push({ deel: "-", adres: "Dorpsstraat 101", postcode: "4128 BX", plaats: "Lexmond", naam: "", telefoon: "", opmerking: "dubbel aangeleverd" });
// Een adres dat nergens bestaat: hier vindt de app geen postcode en blijft de regel ter correctie staan.
rijen.push({ deel: "-", adres: "Verzonnenlaan 404", postcode: "", plaats: "Lexmond", naam: "", telefoon: "", opmerking: "" });

const wb = new ExcelJS.Workbook();
wb.creator = "Wire Solutions — demo";
const ws = wb.addWorksheet("Adressen");

ws.addRow(["Deellocatie", "Adres(sen)", "Postcode", "Woonplaats", "Naam bewoner", "Telefoonnummer", "Opmerking"]);
const kop = ws.getRow(1);
kop.font = { bold: true };
kop.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAEAEA" } };
[14, 26, 11, 16, 22, 18, 30].forEach((b, k) => { ws.getColumn(k + 1).width = b; });

rijen.forEach((r, k) => {
  ws.addRow([r.deel, r.adres, r.postcode, r.plaats, r.naam, r.telefoon, r.opmerking]);
  // Om de tien regels een lege: die horen straks stilzwijgend overgeslagen te worden.
  if (k > 0 && k % 10 === 0) ws.addRow(["-", "", "", "", "", "", ""]);
});

mkdirSync(UIT, { recursive: true });
await wb.xlsx.writeFile(BESTAND);

const metTelefoon = rijen.filter((r) => r.telefoon).length;
console.log(`\n${BESTAND}`);
console.log(`  ${rijen.length} adressen`);
console.log(`  ${metTelefoon} met telefoonnummer  -> die komen op de bellijst`);
console.log(`  ${rijen.length - metTelefoon} zonder             -> die komen op 'Langs de deur'`);
console.log(`  2 zonder postcode (waarvan 1 op te zoeken), 1 dubbel, en lege regels ertussen`);
console.log(`\nSleep dit bestand in stap 1 van een sanering.\n`);

import { TAUW_TYPE_LABEL, type TauwAdres, type TauwOpdracht } from "./types";

const STD_SLOTS = ["08:00", "09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00"];
// Kolommen in het Stedin-sjabloon (1-indexed): A=marge, B=Week … K=aantal m2.
const KOL = { week: 2, tijd: 3, bijzonderheden: 4, adres: 5, huisnummer: 6, telefoon: 7, dna: 9 } as const;
// Het sjabloon staat in /public (let op de dubbele extensie waarmee het is opgeslagen).
const SJABLOON_NAMEN = ["TAUW-stedin-template.xlsx.xlsx", "TAUW-stedin-template.xlsx"];
const NL_WEEKDAG = ["Zondag", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag"];
const NL_MND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n: number) => String(n).padStart(2, "0");
const fromISO = (iso: string) => new Date(iso + "T00:00:00");
const toISO = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const dagLabel = (iso: string) => { const [, m, d] = iso.split("-").map(Number); return `${d}-${NL_MND[m - 1]}`; };
const weekdagNaam = (iso: string) => NL_WEEKDAG[fromISO(iso).getDay()];
// "08:00" → "8.00" (Stedin-notatie); leeg blijft leeg.
const tijdLabel = (t: string) => { const m = /^(\d{1,2}):(\d{2})$/.exec(t || ""); return m ? `${Number(m[1])}.${m[2]}` : (t || ""); };

async function laadSjabloon(): Promise<ArrayBuffer | null> {
  for (const naam of SJABLOON_NAMEN) {
    try {
      const resp = await fetch("/" + encodeURIComponent(naam));
      if (resp.ok) return await resp.arrayBuffer();
    } catch { /* probeer de volgende naam */ }
  }
  return null;
}

// Vult het échte Stedin-sjabloon: balk, logo, koppen en kolombreedtes blijven exact;
// alleen het dag-/adresgedeelte (rij 6+) wordt opnieuw opgebouwd met de eigen sjabloon-stijlen.
export async function exporteerTauwExcel(o: TauwOpdracht): Promise<void> {
  const ExcelJS = (await import("exceljs")).default;
  const sjabloon = await laadSjabloon();
  if (!sjabloon) {
    if (typeof alert !== "undefined") alert("Het Stedin-sjabloon is niet gevonden in de /public-map.");
    return;
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(sjabloon);
  const ws = wb.worksheets[0];

  // Planning-week (ma–vr) o.b.v. de vroegste afspraak; de datums worden automatisch ingevuld.
  const metDatum = o.adressen.filter((a) => ISO.test(a.datum));
  const datums = metDatum.map((a) => a.datum).sort();
  const basis = datums.length ? fromISO(datums[0]) : new Date();
  const maandag = new Date(basis); maandag.setDate(maandag.getDate() - ((maandag.getDay() + 6) % 7));
  const weekDagen = [0, 1, 2, 3, 4].map((i) => { const d = new Date(maandag); d.setDate(d.getDate() + i); return toISO(d); });
  const inWeek = new Set(weekDagen);
  const buitenWeek = metDatum.filter((a) => !inWeek.has(a.datum)).length; // afspraken buiten deze ma–vr-week

  // Stijlen + rijhoogtes uit het sjabloon overnemen (rij 6 dagkop, 12 slot, 20 spacer, 46 afsluitrij).
  const kloon = (s: unknown) => JSON.parse(JSON.stringify(s ?? {}));
  const pak = (rij: number): Record<number, unknown> => { const m: Record<number, unknown> = {}; for (let c = 2; c <= 11; c++) m[c] = kloon(ws.getCell(rij, c).style); return m; };
  const dagStijl = pak(6), slotStijl = pak(12), spacerStijl = pak(20), sluitStijl = pak(46);
  const dagHoogte = ws.getRow(6).height || 15.75;
  const sluitHoogte = ws.getRow(46).height || 15.75;
  // Maakt een rij leeg, geeft 'm de sjabloon-stijl én consistente dikke zwarte randen (het sjabloon zelf
  // mist randen bij o.a. de Tel nr-kolom). volledig=true → box rondom (gele balken); anders alleen verticale lijnen.
  const origEinde = ws.rowCount;
  const lijn = () => ({ style: "medium" as const, color: { argb: "FF000000" } });
  const zetRij = (r: number, stijl: Record<number, unknown>, volledig: boolean) => {
    for (let c = 2; c <= 11; c++) {
      const cell = ws.getCell(r, c);
      cell.value = null;
      cell.style = kloon(stijl[c]);
      cell.border = { left: lijn(), right: lijn(), top: volledig ? lijn() : undefined, bottom: volledig ? lijn() : undefined };
    }
  };

  let r = 6;
  for (const iso of weekDagen) {
    zetRij(r, dagStijl, true);
    ws.getCell(r, KOL.week).value = dagLabel(iso);
    ws.getCell(r, KOL.tijd).value = weekdagNaam(iso);
    ws.getCell(r, KOL.dna).value = "ja/nee";
    ws.getRow(r).height = dagHoogte;
    r++;

    const dagAdr = inWeek.has(iso) ? metDatum.filter((a) => a.datum === iso) : [];
    const gebruikt = new Set<string>();
    const rijen: { tijd: string; a: TauwAdres | null }[] = [];
    for (const slot of STD_SLOTS) {
      const matches = dagAdr.filter((a) => a.tijd === slot);
      if (matches.length === 0) rijen.push({ tijd: tijdLabel(slot), a: null });
      else matches.forEach((a) => { rijen.push({ tijd: tijdLabel(slot), a }); gebruikt.add(a.id); });
    }
    dagAdr.filter((a) => !gebruikt.has(a.id)).sort((x, y) => (x.tijd || "").localeCompare(y.tijd || ""))
      .forEach((a) => rijen.push({ tijd: tijdLabel(a.tijd), a }));

    for (const rij of rijen) {
      zetRij(r, slotStijl, false);
      ws.getCell(r, KOL.tijd).value = rij.tijd;
      if (rij.a) {
        if (rij.a.notitie) ws.getCell(r, KOL.bijzonderheden).value = rij.a.notitie;
        if (rij.a.straat) ws.getCell(r, KOL.adres).value = rij.a.straat;
        if (rij.a.huisnummer) ws.getCell(r, KOL.huisnummer).value = rij.a.huisnummer;
        if (rij.a.telefoon) ws.getCell(r, KOL.telefoon).value = rij.a.telefoon;
      }
      ws.getRow(r).height = 14.4;
      r++;
    }
    zetRij(r, spacerStijl, false); ws.getRow(r).height = dagHoogte; r++;
  }
  zetRij(r, sluitStijl, true); ws.getRow(r).height = sluitHoogte;
  // Eventuele resterende sjabloon-rijen onder onze planning legen (mocht het sjabloon langer zijn).
  for (let rr = r + 1; rr <= origEinde; rr++) for (let c = 2; c <= 11; c++) { const cell = ws.getCell(rr, c); cell.value = null; cell.style = {}; }

  if (buitenWeek > 0 && typeof alert !== "undefined") {
    alert(`Let op: ${buitenWeek} afspra${buitenWeek === 1 ? "ak valt" : "ken vallen"} buiten deze week (${dagLabel(weekDagen[0])} t/m ${dagLabel(weekDagen[4])}) en ${buitenWeek === 1 ? "staat" : "staan"} niet in deze export. Plan die apart.`);
  }

  const out = await wb.xlsx.writeBuffer();
  const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Stedin-planning-${(o.referentie || o.regio || o.id).replace(/[^\w-]+/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Definitieve verzending: opent een mailto met een samenvatting (gebruiker kiest de ontvanger).
export function mailTauwNaarStedin(o: TauwOpdracht): string {
  const klaar = o.adressen.filter((a) => a.bevestigd).length;
  const soort = TAUW_TYPE_LABEL[o.type].toLowerCase();
  const statusRegel = o.type === "bezoekronde" ? `Bezocht: ${klaar}/${o.adressen.length}` : `Bevestigd door bewoner: ${klaar}/${o.adressen.length}`;
  const onderwerp = `TAUW ${soort} — planning ${o.referentie || o.regio}`.trim();
  const lijnen = [
    "Beste,",
    "",
    `Hierbij de definitieve planning voor de ${soort}.`,
    `Referentie: ${o.referentie || "—"}`,
    `Regio: ${o.regio || "—"}`,
    `Aantal adressen: ${o.adressen.length}`,
    statusRegel,
    "",
    "De Excel-planning is als bijlage toegevoegd.",
    "",
    "Met vriendelijke groet,",
    "Wire Solutions",
  ];
  return `mailto:?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(lijnen.join("\n"))}`;
}

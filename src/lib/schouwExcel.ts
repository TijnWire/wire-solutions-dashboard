// Stedin-planning voor schouwafspraken als Excel — dezelfde opmaak als het aangeleverde voorbeeld (week 44):
// logo, koppen, kolombreedtes, gele dagbalken en het kader komen rechtstreeks uit het sjabloon in /public.
// Alleen het deel vanaf rij 6 (dagen, tijden, adressen) wordt per week opnieuw opgebouwd, met de eigen
// opmaak van het sjabloon. Weeknummer en jaar bovenin volgen automatisch uit de gekozen week.
import { tijdLabel, weekJaar, type SchouwExportDag } from "./schouw";
import { weekNummer } from "./week";

const SJABLOON_URL = "/Stedin-schouwplanning-sjabloon.xlsx";
type ExcelJSModule = typeof import("exceljs");

// Rijen in het sjabloon waarvan we de opmaak overnemen: eerste dagbalk (met "ja/nee"), gewone dagbalk,
// eerste regel onder een dagbalk, gewone regel en de afsluitende regel met de onderrand van het kader.
const RIJ = { eersteDag: 6, dag: 14, eersteRegelMaandag: 7, eersteRegel: 26, regel: 8, laatsteRegel: 57 } as const;
// Kolommen (1 = A): B week/datum, C tijd, D straat, E huisnummer, F tel nr, G opmerkingen, H DNA, I straatwerk, J m2.
const KOL = { datum: 2, tijd: 3, straat: 4, huisnummer: 5, telefoon: 6, opmerking: 7, dna: 8 } as const;
const KOL_VAN = 2;
const KOL_TOT = 10;

// Bouwt het werkboek. Los van de browser, zodat dezelfde code ook getest kan worden tegen het voorbeeldbestand.
export async function bouwSchouwWerkboek(
  ExcelJS: ExcelJSModule,
  sjabloon: ArrayBuffer,
  o: { maandag: string; dagen: SchouwExportDag[] },
): Promise<ArrayBuffer> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(sjabloon);
  const ws = wb.worksheets[0];

  // Opmaak uit het sjabloon veiligstellen vóórdat we de rijen leegmaken.
  const kloon = (s: unknown) => JSON.parse(JSON.stringify(s ?? {}));
  const pak = (rij: number): Record<number, unknown> => {
    const m: Record<number, unknown> = {};
    for (let c = KOL_VAN; c <= KOL_TOT; c++) m[c] = kloon(ws.getCell(rij, c).style);
    return m;
  };
  const stijl = { eersteDag: pak(RIJ.eersteDag), dag: pak(RIJ.dag), eersteRegelMaandag: pak(RIJ.eersteRegelMaandag), eersteRegel: pak(RIJ.eersteRegel), regel: pak(RIJ.regel), laatsteRegel: pak(RIJ.laatsteRegel) };
  const dagHoogte = ws.getRow(RIJ.eersteDag).height || 15.75;
  const origEinde = Math.max(ws.rowCount, RIJ.laatsteRegel);

  // Alles vanaf rij 6 leeg en zonder opmaak; wat we nodig hebben zetten we hieronder opnieuw neer.
  for (let r = RIJ.eersteDag; r <= origEinde; r++) {
    for (let c = KOL_VAN; c <= KOL_TOT; c++) {
      const cell = ws.getCell(r, c);
      cell.value = null;
      cell.style = {};
    }
    ws.getRow(r).height = undefined as unknown as number;
  }
  const zetRij = (r: number, s: Record<number, unknown>) => {
    for (let c = KOL_VAN; c <= KOL_TOT; c++) ws.getCell(r, c).style = kloon(s[c]);
  };

  // Titelblok: "Week 44" en het jaar.
  ws.getCell("G2").value = `Week ${weekNummer(o.maandag)}`;
  ws.getCell("I2").value = weekJaar(o.maandag);

  let r = RIJ.eersteDag;
  o.dagen.forEach((dag, di) => {
    zetRij(r, di === 0 ? stijl.eersteDag : stijl.dag);
    const [j, m, d] = dag.datum.split("-").map(Number);
    ws.getCell(r, KOL.datum).value = new Date(Date.UTC(j, m - 1, d)); // opmaak uit het sjabloon toont "26-okt"
    ws.getCell(r, KOL.tijd).value = dag.naam;
    if (di === 0) ws.getCell(r, KOL.dna).value = "ja/nee";
    ws.getRow(r).height = dagHoogte;
    r++;

    // Een dag zonder regels krijgt toch één lege regel, zodat het kader netjes sluit.
    const regels = dag.regels.length ? dag.regels : [{ tijd: "", straat: "", huisnummer: "", telefoon: "", opmerking: "" }];
    regels.forEach((x, i) => {
      const laatste = di === o.dagen.length - 1 && i === regels.length - 1;
      zetRij(r, laatste ? stijl.laatsteRegel : i === 0 ? (di === 0 ? stijl.eersteRegelMaandag : stijl.eersteRegel) : stijl.regel);
      if (x.tijd) ws.getCell(r, KOL.tijd).value = tijdLabel(x.tijd);
      if (x.straat) ws.getCell(r, KOL.straat).value = x.straat;
      // Alleen cijfers → als getal (zoals in het voorbeeld); "142B" of "90 & 92" blijft tekst.
      if (x.huisnummer) ws.getCell(r, KOL.huisnummer).value = /^\d+$/.test(x.huisnummer) ? Number(x.huisnummer) : x.huisnummer;
      // Telefoonnummers blijven tekst zodat de beginnul bewaard blijft ("06…" wordt anders "6…").
      if (x.telefoon) ws.getCell(r, KOL.telefoon).value = x.telefoon;
      if (x.opmerking) ws.getCell(r, KOL.opmerking).value = x.opmerking;
      // Net als in het voorbeeld is de laatste regel van een dag (met de dikke onderrand) iets hoger.
      if (i === regels.length - 1) ws.getRow(r).height = dagHoogte;
      r++;
    });
  });

  wb.creator = "Wire Solutions";
  wb.lastModifiedBy = "Wire Solutions";
  wb.modified = new Date();
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}

const bestandsdeel = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w-]+/g, "_").replace(/^_+|_+$/g, "") || "planning";

// Maakt de planning van één stad en week en downloadt die. Geeft false terug als het sjabloon ontbreekt.
export async function exporteerSchouwPlanning(o: { plaats: string; maandag: string; dagen: SchouwExportDag[] }): Promise<boolean> {
  let sjabloon: ArrayBuffer | null = null;
  try {
    const resp = await fetch(SJABLOON_URL);
    if (resp.ok) sjabloon = await resp.arrayBuffer();
  } catch { /* hieronder melden */ }
  if (!sjabloon) {
    if (typeof alert !== "undefined") alert("Het Stedin-sjabloon kon niet worden geladen. Controleer je verbinding en probeer het opnieuw.");
    return false;
  }
  const ExcelJS = (await import("exceljs")).default;
  const buffer = await bouwSchouwWerkboek(ExcelJS, sjabloon, o);
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Planning_Schouwafspraken_Week_${weekNummer(o.maandag)}_${bestandsdeel(o.plaats)}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return true;
}

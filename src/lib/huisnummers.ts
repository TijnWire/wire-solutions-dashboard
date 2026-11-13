// "Straatnaam en huisnummers" in één veld, bijvoorbeeld:
//   "Admiraal de Ruyterweg 12, 14A, 16-2, 20-26"
// → straat "Admiraal de Ruyterweg" met de huisnummers 12, 14 A, 16 -2 (toevoeging), 20, 22, 24, 26.
// Een reeks ("20-26") loopt in stappen van 2 als begin en eind allebei even of oneven zijn (één kant van
// de straat), anders in stappen van 1. Een streepje met een kleiner getal erachter ("16-2") is een
// toevoeging (verdieping), geen reeks. Met letters: "45B - 47E" → 45B t/m 45E en 47A t/m 47E.
export type Huisnummer = { huisnummer: string; toevoeging: string };

const MAX = 200;

export function splitsStraatEnHuisnummers(invoer: string): { straat: string; nummers: Huisnummer[]; fout?: string } {
  // Spaties rond een streepje of "t/m" weg, zodat "45B - 47E" en "20 t/m 26" één reeks blijven.
  const tekst = invoer.trim().replace(/\s+/g, " ").replace(/\s*(-|–|—)\s*/g, "-").replace(/\s+(t\/m|tm|tot)\s+/gi, "-");
  // De straat loopt tot het eerste losse getal na een woord; "2e Jan Steenstraat" blijft dus heel.
  const m = tekst.match(/^(.*?[^\d\s].*?)\s+(\d.*)$/);
  if (!m) return { straat: tekst, nummers: [], fout: "Zet de huisnummers achter de straatnaam, bijvoorbeeld: Kerkstraat 12, 14, 16A" };
  const straat = m[1].trim();
  const delen = m[2].split(/\s*(?:,|;|\/|&|\ben\b|\s(?=\d))\s*/i).map((d) => d.trim()).filter(Boolean);
  const nummers: Huisnummer[] = [];
  const gezien = new Set<string>();
  const voeg = (n: number | string, t = "") => {
    const k = `${n}|${t.toUpperCase()}`;
    if (gezien.has(k)) return;
    gezien.add(k);
    nummers.push({ huisnummer: String(n), toevoeging: t.toUpperCase() });
  };
  for (const deel of delen) {
    // Reeks met letters: "45B-47E" → 45B t/m 45E en 47A t/m 47E; "12A-12D" → 12A, 12B, 12C, 12D.
    const letterReeks = deel.match(/^(\d+)\s*([a-z])-(\d+)\s*([a-z])$/i);
    if (letterReeks) {
      const a = Number(letterReeks[1]), b = Number(letterReeks[3]);
      const la = letterReeks[2].toUpperCase().charCodeAt(0), lb = letterReeks[4].toUpperCase().charCodeAt(0);
      if (b < a || (a === b && lb < la)) return { straat, nummers, fout: `“${deel}” loopt achteruit.` };
      const stap = a === b ? 1 : a % 2 === b % 2 ? 2 : 1;
      for (let n = a; n <= b; n += stap) {
        const van = n === a ? la : 65, tot = lb;
        if (van > tot) { voeg(n, n === a ? String.fromCharCode(la) : ""); continue; }
        for (let c = van; c <= tot; c++) voeg(n, String.fromCharCode(c));
        if (nummers.length > MAX) return { straat, nummers, fout: `Te veel huisnummers (meer dan ${MAX}).` };
      }
      continue;
    }
    const reeks = deel.match(/^(\d+)\s*(?:-|t\/m|tm|tot)\s*(\d+)$/i);
    if (reeks) {
      const a = Number(reeks[1]), b = Number(reeks[2]);
      if (b > a) {
        const stap = a % 2 === b % 2 ? 2 : 1;
        if ((b - a) / stap + 1 + nummers.length > MAX) return { straat, nummers, fout: `Te veel huisnummers (meer dan ${MAX}).` };
        for (let n = a; n <= b; n += stap) voeg(n);
        continue;
      }
      voeg(a, `-${reeks[2]}`); // "16-2": toevoeging
      continue;
    }
    const los = deel.match(/^(\d+)\s*-?\s*([a-z]{1,4}|\d{1,3}[a-z]?)?$/i);
    if (!los) return { straat, nummers, fout: `“${deel}” is geen huisnummer.` };
    voeg(Number(los[1]), los[2] ?? "");
  }
  if (nummers.length === 0) return { straat, nummers, fout: "Vul minstens één huisnummer in." };
  return { straat, nummers };
}

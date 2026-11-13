// "Straatnaam en huisnummers" in één veld, bijvoorbeeld:
//   "Admiraal de Ruyterweg 12, 14A, 16-2, 20-26"
// → straat "Admiraal de Ruyterweg" met de huisnummers 12, 14 A, 16 -2 (toevoeging), 20, 22, 24, 26.
// Een reeks ("20-26") loopt in stappen van 2 als begin en eind allebei even of oneven zijn (één kant van
// de straat), anders in stappen van 1. Een streepje met een kleiner getal erachter ("16-2") is een
// toevoeging (verdieping), geen reeks.
export type Huisnummer = { huisnummer: string; toevoeging: string };

const MAX = 200;

export function splitsStraatEnHuisnummers(invoer: string): { straat: string; nummers: Huisnummer[]; fout?: string } {
  const tekst = invoer.trim().replace(/\s+/g, " ");
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

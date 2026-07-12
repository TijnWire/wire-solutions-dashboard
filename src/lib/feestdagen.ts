// Nederlandse (algemeen erkende) feestdagen per jaar, met naam. Wordt gebruikt zodat opgenomen verlof
// niet op weekenden/feestdagen telt, en zodat de Urenstaat feestdagen automatisch als vrije dag toont.
// De paas-afhankelijke dagen (Goede Vrijdag, Tweede Paasdag, Hemelvaart, Tweede Pinksterdag) worden
// per jaar berekend met de paasdatum-formule.

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const plus = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

// Eerste Paasdag (zondag) volgens de Meeus/Jones/Butcher-formule voor de gregoriaanse kalender.
function eerstePaasdag(jaar: number): Date {
  const a = jaar % 19;
  const b = Math.floor(jaar / 100);
  const c = jaar % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const maand = Math.floor((h + l - 7 * m + 114) / 31); // 3 = maart, 4 = april
  const dag = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(jaar, maand - 1, dag);
}

const cache = new Map<number, Map<string, string>>();

function bereken(jaar: number): Map<string, string> {
  const paas = eerstePaasdag(jaar);
  // Koningsdag: 27 april, of 26 april als 27 april op een zondag valt.
  let koningsdag = new Date(jaar, 3, 27);
  if (koningsdag.getDay() === 0) koningsdag = new Date(jaar, 3, 26);
  const dagen: [Date, string][] = [
    [new Date(jaar, 0, 1), "Nieuwjaarsdag"],
    [plus(paas, -2), "Goede Vrijdag"],
    [paas, "Eerste Paasdag"],
    [plus(paas, 1), "Tweede Paasdag"],
    [koningsdag, "Koningsdag"],
    [new Date(jaar, 4, 5), "Bevrijdingsdag"],
    [plus(paas, 39), "Hemelvaartsdag"],
    [plus(paas, 49), "Eerste Pinksterdag"],
    [plus(paas, 50), "Tweede Pinksterdag"],
    [new Date(jaar, 11, 25), "Eerste Kerstdag"],
    [new Date(jaar, 11, 26), "Tweede Kerstdag"],
  ];
  return new Map(dagen.map(([d, naam]) => [iso(d), naam]));
}

function feestdagenVan(jaar: number): Map<string, string> {
  let m = cache.get(jaar);
  if (!m) { m = bereken(jaar); cache.set(jaar, m); }
  return m;
}

// Naam van de feestdag op deze ISO-datum (yyyy-mm-dd), of undefined als het geen feestdag is.
export function feestdagNaam(isoDatum: string): string | undefined {
  const jaar = Number(isoDatum.slice(0, 4));
  if (!Number.isFinite(jaar)) return undefined;
  return feestdagenVan(jaar).get(isoDatum);
}

export function isFeestdag(isoDatum: string): boolean {
  return feestdagNaam(isoDatum) !== undefined;
}

// Aantal werkdagen (ma–vr) tussen twee ISO-datums, beide inclusief, met weekenden ÉN feestdagen eruit.
export function werkdagenExclFeestdagen(vanISO: string, totISO: string): number {
  const d = new Date(vanISO + "T00:00:00");
  const eind = new Date(totISO + "T00:00:00");
  let n = 0;
  while (d <= eind) {
    const dow = d.getDay();
    if (dow >= 1 && dow <= 5 && !isFeestdag(iso(d))) n++;
    d.setDate(d.getDate() + 1);
  }
  return n;
}

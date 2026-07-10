// Gedeelde week-helpers (maandag-start, NL-labels). Gebruikt door Facturen en de Agenda-weekmodus.
const NL_MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

export function isISODatum(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// De maandag (ISO) van de week waarin `iso` valt. Lege string bij een ongeldige datum.
export function weekStartISO(iso: string): string {
  if (!isISODatum(iso)) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const dag = (d.getDay() + 6) % 7; // maandag = 0
  d.setDate(d.getDate() - dag);
  return toISO(d);
}

// De zondag (ISO) horend bij een maandag-ISO.
export function weekEindISO(maandagISO: string): string {
  if (!isISODatum(maandagISO)) return "";
  const d = new Date(maandagISO + "T00:00:00");
  d.setDate(d.getDate() + 6);
  return toISO(d);
}

// Verschuif een maandag-ISO met `delta` weken (±).
export function verschuifWeek(maandagISO: string, delta: number): string {
  const basis = isISODatum(maandagISO) ? maandagISO : weekStartISO(maandagISO);
  const d = new Date(basis + "T00:00:00");
  d.setDate(d.getDate() + delta * 7);
  return toISO(d);
}

export function weekLabel(maandagISO: string): string {
  const [j, mnd, d] = maandagISO.split("-").map(Number);
  if (!j) return "Zonder datum";
  return `Week van ${d} ${NL_MAANDEN[mnd - 1]} ${j}`;
}

// Kort dagbereik van de week, bv. "13–19 jul 2026".
export function weekBereik(maandagISO: string): string {
  if (!isISODatum(maandagISO)) return "Zonder datum";
  const ma = new Date(maandagISO + "T00:00:00");
  const zo = new Date(maandagISO + "T00:00:00");
  zo.setDate(zo.getDate() + 6);
  const mMaand = NL_MAANDEN[ma.getMonth()];
  const zMaand = NL_MAANDEN[zo.getMonth()];
  if (ma.getMonth() === zo.getMonth()) return `${ma.getDate()}–${zo.getDate()} ${mMaand} ${zo.getFullYear()}`;
  return `${ma.getDate()} ${mMaand} – ${zo.getDate()} ${zMaand} ${zo.getFullYear()}`;
}

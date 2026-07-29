// Saneren — het rekenwerk: consensus en het datumvoorstel.
// ─────────────────────────────────────────────────────────────────────────────
// Bewust een bestand zonder imports. Twee redenen: het werkt zonder bereik, en het is te draaien
// zonder browser en zonder database — dus npm test kan er echt op controleren of "18 van de 22" nog
// steeds niet als akkoord telt.

export type Antwoord = "akkoord" | "niet_akkoord" | "niet_thuis" | "weigert";
export type Beschikbaar = { id: string; adres_id: string; datum: string; kan: number };
export type ResponsKern = { adres_id: string; antwoord: Antwoord };

// ═════════════════════════════════════════════════════════════════════════════
// REKENWERK — consensus en het datumvoorstel
// ═════════════════════════════════════════════════════════════════════════════

export type Stand = { totaal: number; akkoord: number; tegen: number; nietThuis: number; open: number; rond: boolean };

// De stand van één cluster in de LOPENDE ronde. "rond" is alles of niets: 18 van de 22 is geen 82%,
// dat is gewoon niet rond. Daar draait deze module om.
export function standVan(adressen: { id: string }[], responsen: ResponsKern[]): Stand {
  const per = new Map(responsen.map((r) => [r.adres_id, r.antwoord]));
  let akkoord = 0, tegen = 0, nietThuis = 0;
  for (const a of adressen) {
    const r = per.get(a.id);
    if (r === "akkoord") akkoord++;
    else if (r === "niet_akkoord" || r === "weigert") tegen++;
    else if (r === "niet_thuis") nietThuis++;
  }
  const totaal = adressen.length;
  return { totaal, akkoord, tegen, nietThuis, open: totaal - akkoord - tegen - nietThuis, rond: totaal > 0 && akkoord === totaal };
}

export type DatumKans = { datum: string; kan: number; kanNiet: number; onbekend: number; haalbaar: boolean };

// Welke datum maakt de meeste kans? Per dag tellen we wie ja zei en wie nee. Eén "kan niet" haalt een
// datum eruit: die is dan onhaalbaar, hoe goed hij verder ook scoort. Weekenden slaan we over.
export function datumVoorstellen(
  adressen: { id: string }[], beschikbaarheid: Beschikbaar[], van: string, tot: string, maxDagen = 90,
): DatumKans[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(van)) return [];
  const inCluster = new Set(adressen.map((a) => a.id));
  const perDatum = new Map<string, { kan: Set<string>; niet: Set<string> }>();
  for (const b of beschikbaarheid) {
    if (!inCluster.has(b.adres_id)) continue;
    if (!perDatum.has(b.datum)) perDatum.set(b.datum, { kan: new Set(), niet: new Set() });
    (b.kan ? perDatum.get(b.datum)!.kan : perDatum.get(b.datum)!.niet).add(b.adres_id);
  }

  const uit: DatumKans[] = [];
  const d = new Date(`${van}T12:00:00Z`);
  const eind = new Date(`${tot || van}T12:00:00Z`);
  for (let i = 0; i < maxDagen && d <= eind; i++) {
    const iso = d.toISOString().slice(0, 10);
    const dag = d.getUTCDay();
    d.setUTCDate(d.getUTCDate() + 1);
    if (dag === 0 || dag === 6) continue; // in het weekend wordt er niet gegraven
    const p = perDatum.get(iso);
    const kan = p?.kan.size ?? 0;
    const kanNiet = p?.niet.size ?? 0;
    uit.push({ datum: iso, kan, kanNiet, onbekend: adressen.length - kan - kanNiet, haalbaar: kanNiet === 0 });
  }
  return uit.sort((a, b) => Number(b.haalbaar) - Number(a.haalbaar) || b.kan - a.kan || a.datum.localeCompare(b.datum));
}


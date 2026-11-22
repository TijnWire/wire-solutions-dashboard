// Samenvoegen van gedeelde data zodat er nooit een record verloren gaat.
//
// Achtergrond: elk onderdeel (projecten, taken, …) staat als één lijst in de centrale database.
// Vroeger verving een binnenkomende lijst de hele lokale lijst ("laatste schrijver wint"). Als twee
// apparaten rond dezelfde tijd iets toevoegden, overschreef de één de toevoeging van de ander → verloren.
//
// Nu voegen we per record (op `id`) samen: alles wat op één van beide plekken bestaat blijft bestaan.
// Alleen expliciet verwijderde records (tombstones) worden weggelaten, zodat een verwijdering niet
// door de samenvoeging weer terugkomt.

// Tombstones: per onderdeel (slice) een map van verwijderd-record-id → tijdstip van verwijderen.
export type Tombstones = Record<string, Record<string, string>>;

type MetId = { id: string; bijgewerktOp?: string };

// Heeft de lokale versie een nieuwere `bijgewerktOp` dan de centrale? Dan is dit apparaat de bron van de
// meest recente wijziging en moet die blijven staan. Zonder tijdstempel (oude records / onderdelen die er
// niet mee werken) valt het terug op het oude gedrag: dan wint de centrale versie.
function lokaalIsNieuwer(lokaal: MetId, centraal: MetId): boolean {
  const l = lokaal.bijgewerktOp;
  if (!l) return false;
  const c = centraal.bijgewerktOp;
  return !c || l > c;
}

// Voeg twee lijsten samen op `id`. Niets gaat verloren: elk id dat in local óf incoming zit blijft,
// behalve verwijderde ids (tombstones). Bij een gedeeld id wint normaal de centrale (incoming) versie,
// zodat wijzigingen van collega's doorkomen — MAAR een lokaal record met een nieuwere `bijgewerktOp` wint,
// zodat een net gemaakte wijziging (bv. archiveren) niet wordt teruggedraaid doordat een ander apparaat nog
// een ietsje oudere lijst terugschrijft. Volgorde: lokaal-only toevoegingen bovenaan (een net toegevoegd
// record blijft zichtbaar), daarna de centrale volgorde — deterministisch, dus de apparaten komen samen.
export function mergeCollection<T extends MetId>(
  local: T[] | undefined,
  incoming: T[] | undefined,
  tomb?: Record<string, string>
): T[] {
  const L = Array.isArray(local) ? local : [];
  const I = Array.isArray(incoming) ? incoming : [];
  const dood = (id: string) => !!(tomb && tomb[id]);
  const inIds = new Set<string>();
  for (const it of I) if (it && it.id != null) inIds.add(it.id);
  const lokaalById = new Map<string, T>();
  for (const it of L) if (it && it.id != null) lokaalById.set(it.id, it);

  const out: T[] = [];
  const seen = new Set<string>();
  // 1) Lokaal-only toevoegingen eerst (bovenaan) — nog niet in de centrale lijst.
  for (const it of L) {
    if (!it || it.id == null) continue;
    if (inIds.has(it.id) || dood(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    out.push(it);
  }
  // 2) Daarna de centrale volgorde; de centrale versie wint bij een gedeeld id — tenzij de lokale versie
  //    aantoonbaar nieuwer is (nieuwere bijgewerktOp), dan houden we die.
  for (const it of I) {
    if (!it || it.id == null) continue;
    if (dood(it.id) || seen.has(it.id)) continue;
    seen.add(it.id);
    const lokaal = lokaalById.get(it.id);
    out.push(lokaal && lokaalIsNieuwer(lokaal, it) ? lokaal : it);
  }
  return out;
}

// Voeg twee tombstone-verzamelingen samen (nooit een verwijdering kwijtraken; nieuwste tijd wint).
export function mergeTombstones(a: Tombstones | undefined, b: Tombstones | undefined): Tombstones {
  const out: Tombstones = {};
  for (const src of [a, b]) {
    if (!src) continue;
    for (const slice of Object.keys(src)) {
      const m = out[slice] ?? (out[slice] = {});
      const s = src[slice] || {};
      for (const id of Object.keys(s)) {
        if (!m[id] || m[id] < s[id]) m[id] = s[id];
      }
    }
  }
  return out;
}

// ── Samenvoegen op de server en met losse wijzigingen ──
// Met vijftig mensen tegelijk is "de hele lijst heen en weer sturen" niet meer houdbaar: een toestel met
// een verouderde kopie van record X overschrijft dan de nieuwere versie van een collega, ook als het zelf
// alleen record Y aanpaste. Daarom sturen toestellen alleen nog de records die ze écht wijzigden, en
// voegt de server die (één schrijver per onderdeel tegelijk) samen met wat er al staat.

// Mag het bestaande record blijven staan? Alleen als beide een tijdstempel hebben en het bestaande
// aantoonbaar nieuwer is. Zonder tijdstempels wint de wijziging (zoals het altijd ging).
const bestaandNieuwer = (bestaand: MetId, wijziging: MetId) =>
  !!(bestaand.bijgewerktOp && wijziging.bijgewerktOp && bestaand.bijgewerktOp > wijziging.bijgewerktOp);

// Een lijst waarin elk element een id heeft — alleen zulke lijsten voegen we per record samen.
export const heeftIds = (v: unknown): v is MetId[] =>
  Array.isArray(v) && v.every((x) => !!x && typeof x === "object" && (x as MetId).id != null);

// Losse wijzigingen (nieuwe en aangepaste records) in een lijst verwerken. Bestaande records houden hun
// plek; nieuwe komen bovenaan, of onderaan als ze in `achter` staan (de app voegde ze achteraan toe).
export function pasWijzigingenToe<T extends MetId>(
  lijst: T[] | undefined, wijzig: T[], tomb?: Record<string, string>, achter?: string[],
): T[] {
  const L = Array.isArray(lijst) ? lijst : [];
  const dood = (id: string) => !!(tomb && tomb[id]);
  const nieuw = new Map<string, T>();
  for (const w of wijzig) if (w && w.id != null) nieuw.set(w.id, w);
  const bestaand = new Set(L.map((x) => x?.id));
  const achteraan = new Set(achter ?? []);
  const kop: T[] = [];
  const staart: T[] = [];
  for (const [id, w] of nieuw) if (!bestaand.has(id) && !dood(id)) (achteraan.has(id) ? staart : kop).push(w);
  const midden = L.filter((x) => x && x.id != null && !dood(x.id)).map((x) => {
    const w = nieuw.get(x.id);
    return w && !bestaandNieuwer(x, w) ? w : x;
  });
  return [...kop, ...midden, ...staart];
}

// Een hele lijst van een toestel samenvoegen met wat er centraal staat (oudere app-versies sturen nog
// altijd de hele lijst). Niets van collega's gaat verloren: records die alleen centraal staan blijven.
export function samenvoegenOpServer<T extends MetId>(centraal: T[], binnen: T[], tomb?: Record<string, string>): T[] {
  const dood = (id: string) => !!(tomb && tomb[id]);
  const binnenIds = new Set(binnen.map((x) => x.id));
  const cMap = new Map(centraal.map((x) => [x.id, x] as const));
  const gezien = new Set<string>();
  const rest: T[] = [];
  for (const b of binnen) {
    if (dood(b.id) || gezien.has(b.id)) continue;
    gezien.add(b.id);
    const c = cMap.get(b.id);
    rest.push(c && bestaandNieuwer(c, b) ? c : b);
  }
  return [...centraal.filter((x) => !binnenIds.has(x.id) && !dood(x.id)), ...rest];
}

// Grote onderdelen opslaan zonder tegen de grens van de database aan te lopen.
// ─────────────────────────────────────────────────────────────────────────────
// HET PROBLEEM
// D1 (SQLite) weigert een rij boven ongeveer 2,19 MB met SQLITE_TOOBIG. Voorschouwen bevatten foto's,
// dus dat blok groeit vanzelf. Loopt het eroverheen, dan mislukt de schrijf en blijft het werk op de
// telefoon staan: je ziet wel de mappen, maar het werk van vandaag komt nergens aan.
//
// Dat is eerder opgelost door voorschouwen over 16 blokken te verdelen. Dat schuift de grens alleen
// vooruit: één blok zat op 2,17 MB — 1% onder de rand. En één enkele voorschouw met veel foto's kan
// er in z'n eentje al overheen gaan; die is met verdelen niet kleiner te krijgen.
//
// DE OPLOSSING
// De grens hoort geen probleem van de app te zijn. De server knipt een te groot onderdeel zelf in
// stukken en zet ze bij het lezen weer aan elkaar. De app blijft één onderdeel schrijven en lezen en
// merkt hier niets van — ook niet aan het live bijwerken, want dat gaat nog steeds over dezelfde naam.
//
// HOE HET WISSELT ZONDER HALVE DATA
// De stukken krijgen een generatie mee (het tijdstip van schrijven). Volgorde:
//   1. alle stukken van de NIEUWE generatie wegschrijven,
//   2. dan pas de hoofdrij omzetten naar die generatie — één kleine, ondeelbare schrijf,
//   3. daarna de stukken van de vorige generatie opruimen.
// Een apparaat dat er middenin leest, ziet dus óf helemaal de oude versie óf helemaal de nieuwe.
// Nooit de helft.

export type DelenEnv = { DB: D1Database };

// Ruim onder de grens. Een teken kan in UTF-8 tot 4 bytes worden, dus 400.000 tekens is in het
// slechtste geval 1,6 MB — nog steeds veilig. Bij gewone tekst en foto's is het ongeveer 400 kB.
export const DEEL_TEKENS = 400_000;

// Boven deze grootte gaat een onderdeel in stukken. Bewust lager dan wat de database aankan: dan is
// er lucht voor een onderdeel dat net iets groeit tussen twee schrijfacties door.
export const SPLITS_BOVEN = 1_200_000;

const MARKERING = "__wire_delen";
const SCHEIDING = " deel ";
// Er heeft een tijd een NUL-byte als scheidingsteken in gestaan (een verschrijving). SQLite stopt bij
// een NUL met tellen en zoeken: length() gaf 15 voor een sleutel van 41 tekens, en like/instr vonden
// niets. Daardoor werd nooit iets opgeruimd en groeide de database naar 496 MB. De sleutels die toen
// zijn gemaakt staan er nog, dus lezen moet allebei aankunnen tot ze een keer overschreven zijn.
const OUDE_SCHEIDING = "\u0000deel\u0000";
const deelSleutel = (key: string, gen: string, i: number, oud = false) =>
  oud ? `${key}${OUDE_SCHEIDING}${gen}\u0000${i}` : `${key}${SCHEIDING}${gen} ${i}`;

// Interne stukken horen nergens in een lijst thuis. Ze bevatten een teken dat in een gewone naam niet
// voorkomt, dus dit is geen naamafspraak die per ongeluk kan botsen.
export const isDeelSleutel = (key: string) => key.includes(SCHEIDING) || key.includes(OUDE_SCHEIDING);

// Van welk onderdeel is dit een brok? Beide scheidingstekens tellen mee: er staan nog brokken in de
// database van vóór de reparatie van 30-07-2026, met een NUL-byte als scheiding. Wie die niet
// terugrekent, gaat onderhoud doen op een halve brok in plaats van op het onderdeel zelf.
export const basisSleutel = (key: string) =>
  key.split(SCHEIDING)[0].split(OUDE_SCHEIDING)[0];

type Markering = { [MARKERING]: 1; delen: number; gen: string; tekens: number };
const isMarkering = (v: unknown): v is Markering =>
  !!v && typeof v === "object" && (v as Record<string, unknown>)[MARKERING] === 1;

// ── Schrijven ──
// Geeft de rijen terug die weggeschreven zijn, zodat de spiegel naar Supabase dezelfde stukken krijgt.
export async function schrijfGesplitst(
  env: DelenEnv, key: string, data: unknown, nuISO: string,
): Promise<{ rijen: { key: string; data: unknown; updated_at: string }[]; gesplitst: boolean }> {
  const tekst = JSON.stringify(data ?? null);

  // Past het gewoon? Dan blijft alles precies zoals het was — één rij, één schrijf.
  if (tekst.length <= SPLITS_BOVEN) {
    await env.DB.prepare(
      "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
    ).bind(key, tekst, nuISO).run();
    // Opruimen mag nooit de schrijf laten mislukken: de gegevens staan dan al goed.
    try { await ruimOudeDelenOp(env, key, ""); } catch (e) { console.log("[delen] opruimen mislukt", String(e).slice(0, 120)); }
    return { rijen: [{ key, data: data ?? null, updated_at: nuISO }], gesplitst: false };
  }

  // Te groot: in stukken, onder een eigen generatie.
  const gen = nuISO.replace(/[^0-9]/g, "");
  const stukken: string[] = [];
  for (let i = 0; i < tekst.length; i += DEEL_TEKENS) stukken.push(tekst.slice(i, i + DEEL_TEKENS));

  const rijen: { key: string; data: unknown; updated_at: string }[] = [];
  // 1) De stukken eerst. In groepjes, zodat één schrijfopdracht nooit te groot wordt.
  for (let i = 0; i < stukken.length; i += 3) {
    const groep = stukken.slice(i, i + 3);
    await env.DB.batch(groep.map((stuk, j) => {
      const k = deelSleutel(key, gen, i + j);
      rijen.push({ key: k, data: stuk, updated_at: nuISO });
      return env.DB.prepare(
        "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
      ).bind(k, JSON.stringify(stuk), nuISO);
    }));
  }

  // 2) Pas nu de hoofdrij omzetten. Vanaf dit moment leest iedereen de nieuwe versie.
  const markering: Markering = { [MARKERING]: 1, delen: stukken.length, gen, tekens: tekst.length };
  await env.DB.prepare(
    "insert into wire_state (key, data, updated_at) values (?1, ?2, ?3) on conflict(key) do update set data = ?2, updated_at = ?3"
  ).bind(key, JSON.stringify(markering), nuISO).run();
  rijen.push({ key, data: markering, updated_at: nuISO });

  // 3) De vorige generatie mag weg. Lukt dat niet, dan is de nieuwe versie nog steeds goed —
  //    volgende keer opnieuw. Wél loggen, want blijft het misgaan dan groeit de database.
  try {
    const opgeruimd = await ruimOudeDelenOp(env, key, gen);
    if (opgeruimd) console.log("[delen]", key, "→", opgeruimd, "oude stukken opgeruimd");
  } catch (e) { console.log("[delen] opruimen mislukt", String(e).slice(0, 120)); }
  return { rijen, gesplitst: true };
}

// Oude stukken opruimen.
// ─────────────────────────────────────────────────────────────────────────────
// Bewust GEEN like/glob/substr op de sleutel. Dat is hier misgegaan: de opruiming raakte nul rijen
// terwijl er honderden oude stukken stonden, en elke schrijfactie stapelde er 400 kB bovenop tot de
// database op 496 MB stond. De tekstfuncties van de database bleken niet te doen wat ze leken te
// doen. Nu halen we de namen op, kiezen we in JavaScript welke weg moeten, en verwijderen we ze op
// exacte naam. Daar valt niets aan te interpreteren.
export async function ruimOudeDelenOp(env: DelenEnv, key: string, behoudGen: string): Promise<number> {
  const voorvoegsels = [`${key}${SCHEIDING}`, `${key}${OUDE_SCHEIDING}`];
  const houden = behoudGen ? [`${key}${SCHEIDING}${behoudGen} `, `${key}${OUDE_SCHEIDING}${behoudGen}\u0000`] : null;

  const { results } = await env.DB.prepare("select key from wire_state").all<{ key: string }>();
  const weg = (results ?? [])
    .map((r) => r.key)
    .filter((k) => voorvoegsels.some((v) => k.startsWith(v)) && (!houden || !houden.some((h) => k.startsWith(h))));
  if (weg.length === 0) return 0;

  // In kleine groepjes: één opdracht met honderden verwijderingen van 400 kB loopt tegen de grenzen
  // van de database aan, en dan mislukt de héle opruiming weer.
  for (let i = 0; i < weg.length; i += 20) {
    await env.DB.batch(weg.slice(i, i + 20).map((k) => env.DB.prepare("delete from wire_state where key = ?").bind(k)));
  }
  return weg.length;
}

// ── Lezen ──
// Zet een gelezen waarde weer in elkaar als het een markering blijkt te zijn. Is er iets mis met de
// stukken, dan geven we `undefined` terug: dan slaat de aanroeper dit onderdeel over en probeert de
// app het bij de volgende ronde opnieuw. Half samengestelde data doorgeven is het ergste wat je kunt
// doen — dan overschrijft het apparaat de goede versie met een kapotte.
export async function zetWeerInElkaar(env: DelenEnv, key: string, waarde: unknown): Promise<unknown> {
  if (!isMarkering(waarde)) return waarde;
  const { delen, gen, tekens } = waarde;
  // Eerst de nieuwe schrijfwijze; staat die er niet, dan is dit onderdeel nog met de oude gemaakt.
  let sleutels = Array.from({ length: delen }, (_, i) => deelSleutel(key, gen, i));
  const proef = await env.DB.prepare("select 1 as x from wire_state where key = ?").bind(sleutels[0]).first();
  if (!proef) sleutels = Array.from({ length: delen }, (_, i) => deelSleutel(key, gen, i, true));
  const ph = sleutels.map(() => "?").join(",");
  const { results } = await env.DB.prepare(`select key, data from wire_state where key in (${ph})`)
    .bind(...sleutels).all<{ key: string; data: string }>();
  const perSleutel = new Map((results ?? []).map((r) => [r.key, r.data]));

  let tekst = "";
  for (const s of sleutels) {
    const rij = perSleutel.get(s);
    if (rij === undefined) { console.log("[delen] ontbrekend stuk", s.slice(0, 60)); return undefined; }
    try { tekst += JSON.parse(rij) as string; } catch { return undefined; }
  }
  if (tekens && tekst.length !== tekens) { console.log("[delen] lengte klopt niet", key, tekst.length, tekens); return undefined; }
  try { return JSON.parse(tekst); } catch { return undefined; }
}

// Meerdere onderdelen tegelijk weer in elkaar zetten (voor /state en /state/keys).
export async function herstelAllemaal(
  env: DelenEnv, uit: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const gesplitst = Object.keys(uit).filter((k) => isMarkering(uit[k]));
  if (gesplitst.length === 0) return uit;
  for (const k of gesplitst) {
    const heel = await zetWeerInElkaar(env, k, uit[k]);
    if (heel === undefined) delete uit[k];   // liever niets dan half
    else uit[k] = heel;
  }
  return uit;
}

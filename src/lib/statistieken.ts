// Statistieken voor Mijn werk: wat staat open, waar ben je mee bezig, wat is klaar — en hoeveel afspraken,
// brieven enzovoort er zijn gedaan. Pure rekenlogica zonder scherm, zodat de cijfers te testen zijn.
//
// `wie` = één medewerker (user id) of `null` voor het hele team.
import type { Afspraak, Brievenronde, Buurtaanpak, Project, Schouwafspraak, Taak, TauwOpdracht, Voorschouw, VoorschouwMap } from "./types";
import { isISODatum, verschuifWeek, weekNummer, weekStartISO } from "./week";
import { normPlaats } from "./schouw";

export type StatBron = {
  taken: Taak[];
  projects: Project[];
  rondes: Brievenronde[];
  afspraken: Afspraak[];
  schouwafspraken: Schouwafspraak[];
  tauwOpdrachten: TauwOpdracht[];
  buurtaanpak: Buurtaanpak[];
  voorschouwen: Voorschouw[];
  voorschouwMappen: VoorschouwMap[];
};

export type WerkFase = "open" | "bezig" | "klaar";
export type WerkItem = { id: string; titel: string; sub: string; onderdeel: string; pct: number; fase: WerkFase };

export type Trechter = { gemaakt: number; bevestigd: number; doorgegaan: number; geannuleerd: number };
export type WeekPunt = { maandag: string; label: string; gemaakt: number; doorgegaan: number };
export type Mijlpaal = { id: string; titel: string; uitleg: string; huidig: number; doel: number; behaald: boolean };

export type Statistieken = {
  werk: Record<WerkFase, WerkItem[]>;
  totaalWerk: number;
  klaarPct: number;
  afspraken: Trechter & { doorgegaanPct: number; perWeek: WeekPunt[]; perSoort: { naam: string; gemaakt: number; doorgegaan: number }[] };
  brieven: { bezorgd: number; blanco: number; nietThuis: number; nogTeDoen: number; totaal: number; rondesKlaar: number; rondesTotaal: number };
  voorschouwen: number;
  mijlpalen: Mijlpaal[];
};

const faseVan = (pct: number): WerkFase => (pct <= 0 ? "open" : pct >= 100 ? "klaar" : "bezig");
const pctVan = (deel: number, totaal: number) => (totaal > 0 ? Math.round((deel / totaal) * 100) : 0);

// Aantal weken dat de grafiek terugkijkt (inclusief de huidige).
export const WEKEN_TERUG = 8;

export function berekenStatistieken(b: StatBron, wie: string | null, vandaagISO: string): Statistieken {
  const van = (id?: string) => wie === null || id === wie;

  // ── Open / bezig / klaar ──
  const werk: WerkItem[] = [];
  for (const t of b.taken.filter((t) => wie === null || t.toegewezenAan === wie || t.toegewezenAan === "")) {
    const pct = t.status === "Klaar" ? 100 : t.status === "Mee bezig" ? 50 : 0;
    werk.push({ id: "t-" + t.id, titel: t.titel, sub: b.projects.find((p) => p.id === t.projectId)?.naam ?? "Taak", onderdeel: "Taken", pct, fase: faseVan(pct) });
  }
  for (const r of b.rondes.filter((r) => !r.verwijderd && van(r.toegewezenAan))) {
    const te = r.adressen.filter((a) => !a.ontbreekt);
    const pct = pctVan(te.filter((a) => a.status === "Gegooid").length, te.length);
    werk.push({ id: "r-" + r.id, titel: r.straat, sub: r.plaats, onderdeel: "Brieven & routes", pct, fase: faseVan(pct) });
  }
  const afspraakGroepen = new Map<string, Afspraak[]>();
  for (const a of b.afspraken.filter((a) => van(a.toegewezenAan))) {
    const lijst = afspraakGroepen.get(a.locatie) ?? [];
    lijst.push(a);
    afspraakGroepen.set(a.locatie, lijst);
  }
  for (const [locatie, rijen] of afspraakGroepen) {
    const pct = pctVan(rijen.filter((a) => a.status === "Bevestigd" || a.status === "Afgerond").length, rijen.length);
    werk.push({ id: "a-" + locatie, titel: locatie, sub: rijen[0]?.plaats ?? "", onderdeel: "Afspraken", pct, fase: faseVan(pct) });
  }
  // Schouwafspraken staan per stad in een map; voor de voortgang tellen we per stad.
  const schouwPerStad = new Map<string, Schouwafspraak[]>();
  for (const s of b.schouwafspraken.filter((s) => !s.gearchiveerd && s.status !== "Geannuleerd" && van(s.toegewezenAan))) {
    const sleutel = normPlaats(s.plaats);
    const lijst = schouwPerStad.get(sleutel) ?? [];
    lijst.push(s);
    schouwPerStad.set(sleutel, lijst);
  }
  for (const [, rijen] of schouwPerStad) {
    const pct = pctVan(rijen.filter((s) => s.status === "Uitgevoerd").length, rijen.length);
    werk.push({ id: "sch-" + normPlaats(rijen[0].plaats), titel: rijen[0].plaats.trim() || "Zonder plaats", sub: `${rijen.length} schouwafspraken`, onderdeel: "Schouwafspraken", pct, fase: faseVan(pct) });
  }
  for (const o of b.tauwOpdrachten.filter((o) => o.status !== "verstuurd" && !o.gearchiveerd && van(o.toegewezenAan))) {
    const pct = pctVan(o.adressen.filter((a) => a.bevestigd).length, o.adressen.length);
    werk.push({ id: "tw-" + o.id, titel: o.referentie || o.regio || "Bodemonderzoek", sub: o.regio || `${o.adressen.length} adressen`, onderdeel: "Bodemonderzoeken", pct, fase: faseVan(pct) });
  }
  for (const k of b.buurtaanpak.filter((k) => !k.gearchiveerd && van(k.toegewezenAan))) {
    const pct = pctVan(k.adressen.filter((a) => a.uitgevoerd).length, k.adressen.length);
    werk.push({ id: "ba-" + k.id, titel: k.naam, sub: k.regio || k.opdrachtgever, onderdeel: "Buurtaanpak", pct, fase: faseVan(pct) });
  }
  for (const m of b.voorschouwMappen.filter((m) => !m.gearchiveerd && van(m.toegewezenAan))) {
    const items = b.voorschouwen.filter((v) => v.mapId === m.id);
    const pct = pctVan(items.filter((v) => v.fotos && v.fotos.length > 0).length, items.length);
    werk.push({ id: "vs-" + m.id, titel: m.naam, sub: `${items.length} adressen`, onderdeel: "Voorschouwen", pct, fase: faseVan(pct) });
  }

  const perFase: Record<WerkFase, WerkItem[]> = { open: [], bezig: [], klaar: [] };
  for (const w of werk) perFase[w.fase].push(w);
  // Open: nieuwste/onaangeroerde eerst is niet te weten; we sorteren op naam. Bezig: het verste eerst (bijna klaar).
  perFase.open.sort((a, c) => a.titel.localeCompare(c.titel, "nl"));
  perFase.bezig.sort((a, c) => c.pct - a.pct || a.titel.localeCompare(c.titel, "nl"));
  perFase.klaar.sort((a, c) => a.titel.localeCompare(c.titel, "nl"));

  // ── Afspraken: gemaakt → bevestigd → doorgegaan ──
  const soorten: { naam: string; gemaakt: number; bevestigd: number; doorgegaan: number; geannuleerd: number }[] = [];
  const punten: { datum: string; doorgegaan: boolean }[] = [];
  const tel = (naam: string, rijen: { datum: string; bevestigd: boolean; doorgegaan: boolean; geannuleerd: boolean }[]) => {
    soorten.push({
      naam,
      gemaakt: rijen.length,
      bevestigd: rijen.filter((r) => r.bevestigd || r.doorgegaan).length,
      doorgegaan: rijen.filter((r) => r.doorgegaan).length,
      geannuleerd: rijen.filter((r) => r.geannuleerd).length,
    });
    for (const r of rijen) if (!r.geannuleerd && isISODatum((r.datum ?? "").slice(0, 10))) punten.push({ datum: r.datum.slice(0, 10), doorgegaan: r.doorgegaan });
  };
  tel("Afspraken", b.afspraken.filter((a) => van(a.toegewezenAan)).map((a) => ({ datum: a.datum, bevestigd: a.status === "Bevestigd", doorgegaan: a.status === "Afgerond", geannuleerd: a.status === "Geannuleerd" })));
  tel("Schouwafspraken", b.schouwafspraken.filter((s) => !s.gearchiveerd || s.status === "Uitgevoerd").filter((s) => s.datum && van(s.toegewezenAan)).map((s) => ({ datum: s.datum, bevestigd: s.status === "Ingepland", doorgegaan: s.status === "Uitgevoerd", geannuleerd: s.status === "Geannuleerd" })));
  tel("Bodemonderzoeken", b.tauwOpdrachten.flatMap((o) => o.adressen.map((a) => ({ a, wie: a.toegewezenAan ?? o.toegewezenAan }))).filter(({ a, wie: w }) => a.bevestigd && van(w)).map(({ a }) => ({ datum: a.datum, bevestigd: true, doorgegaan: !!a.afgerond, geannuleerd: false })));
  tel("Buurtaanpak", b.buurtaanpak.filter((k) => van(k.toegewezenAan)).flatMap((k) => k.adressen).filter((a) => a.bevestigd || a.uitgevoerd).map((a) => ({ datum: a.datum, bevestigd: a.bevestigd, doorgegaan: a.uitgevoerd, geannuleerd: false })));

  const trechter: Trechter = soorten.reduce((s, x) => ({ gemaakt: s.gemaakt + x.gemaakt, bevestigd: s.bevestigd + x.bevestigd, doorgegaan: s.doorgegaan + x.doorgegaan, geannuleerd: s.geannuleerd + x.geannuleerd }), { gemaakt: 0, bevestigd: 0, doorgegaan: 0, geannuleerd: 0 });

  // Per week, de laatste WEKEN_TERUG weken (op de datum van de afspraak).
  const huidigeMaandag = weekStartISO(vandaagISO);
  const perWeek: WeekPunt[] = [];
  for (let i = WEKEN_TERUG - 1; i >= 0; i--) {
    const maandag = verschuifWeek(huidigeMaandag, -i);
    perWeek.push({ maandag, label: `wk ${weekNummer(maandag)}`, gemaakt: 0, doorgegaan: 0 });
  }
  for (const p of punten) {
    const w = perWeek.find((x) => x.maandag === weekStartISO(p.datum));
    if (!w) continue;
    w.gemaakt++;
    if (p.doorgegaan) w.doorgegaan++;
  }

  // ── Brieven ──
  let bezorgd = 0, blanco = 0, nietThuis = 0, nogTeDoen = 0, rondesKlaar = 0, rondesTotaal = 0;
  for (const r of b.rondes.filter((r) => !r.verwijderd && van(r.toegewezenAan))) {
    const te = r.adressen.filter((a) => !a.ontbreekt);
    const g = te.filter((a) => a.status === "Gegooid").length;
    bezorgd += g;
    blanco += te.filter((a) => a.status === "Blanco").length;
    nietThuis += te.filter((a) => a.status === "Niet thuis").length;
    nogTeDoen += te.filter((a) => a.status === "Te doen").length;
    rondesTotaal++;
    if (te.length > 0 && te.every((a) => a.status !== "Te doen")) rondesKlaar++;
  }
  const brieven = { bezorgd, blanco, nietThuis, nogTeDoen, totaal: bezorgd + blanco + nietThuis + nogTeDoen, rondesKlaar, rondesTotaal };

  const voorschouwen = b.voorschouwen.filter((v) => wie === null || v.ingevuldDoor === wie).length;

  // ── Mijlpalen ──
  const mp = (id: string, titel: string, uitleg: string, huidig: number, doel: number): Mijlpaal => ({ id, titel, uitleg, huidig, doel, behaald: huidig >= doel });
  const mijlpalen: Mijlpaal[] = [
    mp("brieven-100", "Postbode", "100 brieven bezorgd", bezorgd, 100),
    mp("brieven-500", "Straatkenner", "500 brieven bezorgd", bezorgd, 500),
    mp("brieven-1000", "Wijkheld", "1.000 brieven bezorgd", bezorgd, 1000),
    mp("route-1", "Route volbracht", "Een hele route afgerond", rondesKlaar, 1),
    mp("afspraken-10", "Afspraken-pro", "10 afspraken doorgegaan", trechter.doorgegaan, 10),
    mp("afspraken-50", "Planningsmeester", "50 afspraken doorgegaan", trechter.doorgegaan, 50),
    mp("voorschouw-10", "Scherp oog", "10 voorschouwen ingevuld", voorschouwen, 10),
  ];

  const totaalWerk = werk.length;
  return {
    werk: perFase,
    totaalWerk,
    klaarPct: pctVan(perFase.klaar.length, totaalWerk),
    afspraken: { ...trechter, doorgegaanPct: pctVan(trechter.doorgegaan, trechter.gemaakt - trechter.geannuleerd), perWeek, perSoort: soorten.filter((s) => s.gemaakt > 0).map((s) => ({ naam: s.naam, gemaakt: s.gemaakt, doorgegaan: s.doorgegaan })) },
    brieven,
    voorschouwen,
    mijlpalen,
  };
}

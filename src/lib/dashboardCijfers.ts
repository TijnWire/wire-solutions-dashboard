// Cijfers voor het bedrijfsdashboard (eigenaren en beheerders).
// ─────────────────────────────────────────────────────────────────────────────
// "Lopende projecten" telt per soort werk per regio: alle lopende saneringen in Regio Den Haag zijn samen
// één project, alle schouwafspraken in Regio Rotterdam ook één, enzovoort.
import { regioVan, REGIO_LABEL } from "./werkgebieden";
import type { Afspraak, Brievenronde, Buurtaanpak, Sanering, Schouwafspraak, TauwOpdracht, VoorschouwMap } from "./types";

export type ProjectSoort = "Brieven" | "Bodemonderzoeken" | "Saneren" | "Schouwafspraken" | "Buurtaanpak" | "Voorschouwen";
export type LopendProject = { soort: ProjectSoort; regio: string; onderdelen: number; navKey: string };

const NAV: Record<ProjectSoort, string> = {
  Brieven: "brieven", Bodemonderzoeken: "tauw", Saneren: "saneren", Schouwafspraken: "schouwafspraken", Buurtaanpak: "buurtaanpak", Voorschouwen: "voorschouwen",
};

/** Naam van het werkgebied, of anders de plaats/regio zoals ingevuld. */
export function regioNaam(...namen: (string | undefined)[]): string {
  const r = regioVan(...namen);
  if (r) return REGIO_LABEL[r];
  const eerste = namen.map((n) => (n ?? "").trim()).find(Boolean);
  return eerste ? `Regio ${eerste.charAt(0).toUpperCase()}${eerste.slice(1)}` : "Regio onbekend";
}

export type DossierLicht = { pd_nummer: string; regio: string; gebouw: string; status: string };

export function lopendeProjecten(bron: {
  rondes: Brievenronde[];
  tauwOpdrachten: TauwOpdracht[];
  saneringen: Sanering[];
  dossiers: DossierLicht[];
  schouwafspraken: Schouwafspraak[];
  buurtaanpak: Buurtaanpak[];
  voorschouwMappen: VoorschouwMap[];
}, weekStartISO: string): LopendProject[] {
  const telling = new Map<string, LopendProject>();
  const tel = (soort: ProjectSoort, regio: string) => {
    const k = `${soort}|${regio}`;
    const p = telling.get(k) ?? { soort, regio, onderdelen: 0, navKey: NAV[soort] };
    p.onderdelen++;
    telling.set(k, p);
  };
  for (const r of bron.rondes) if (!r.gearchiveerd && !r.verwijderd && r.status !== "verstuurd") tel("Brieven", regioNaam(r.plaats, r.regio, r.mapNaam));
  for (const o of bron.tauwOpdrachten) if (!o.gearchiveerd && o.status !== "verstuurd") tel("Bodemonderzoeken", regioNaam(o.regio, o.adressen?.[0]?.plaats));
  for (const s of bron.saneringen) if (!s.gearchiveerd && !s.verwijderd && s.status !== "verstuurd") tel("Saneren", regioNaam(s.regio, s.adressen?.[0]?.plaats, s.naam));
  for (const d of bron.dossiers) if (d.status !== "afgerond" && d.status !== "afgeboekt") tel("Saneren", regioNaam(d.regio, d.gebouw));
  for (const b of bron.buurtaanpak) if (!b.gearchiveerd && !b.afgerondOp) tel("Buurtaanpak", regioNaam(b.regio, b.naam));
  for (const m of bron.voorschouwMappen) if (!m.gearchiveerd) tel("Voorschouwen", regioNaam(m.naam));
  // Schouwafspraken: een plaats telt als lopend zolang er afspraken vanaf deze week (of zonder datum) staan.
  for (const a of bron.schouwafspraken) {
    if (a.status === "Geannuleerd") continue;
    if (a.datum && a.datum < weekStartISO) continue;
    tel("Schouwafspraken", regioNaam(a.plaats));
  }
  const volgorde: ProjectSoort[] = ["Saneren", "Schouwafspraken", "Bodemonderzoeken", "Buurtaanpak", "Brieven", "Voorschouwen"];
  return [...telling.values()].sort((a, b) => volgorde.indexOf(a.soort) - volgorde.indexOf(b.soort) || a.regio.localeCompare(b.regio));
}

/** Maandag t/m vrijdag van deze week (in het weekend wordt niet gewerkt). */
export function werkweek(vandaag = new Date()): { ma: string; vr: string } {
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const dag = (vandaag.getDay() + 6) % 7;
  const ma = new Date(vandaag); ma.setDate(vandaag.getDate() - dag);
  const vr = new Date(ma); vr.setDate(ma.getDate() + 4);
  return { ma: iso(ma), vr: iso(vr) };
}

/** Alle afspraken in de werkweek: afspraken, schouwafspraken en de afgesproken adressen bij saneren/buurtaanpak/bodem. */
export function afsprakenInWerkweek(bron: {
  afspraken: Afspraak[];
  schouwafspraken: Schouwafspraak[];
  saneringen: Sanering[];
  buurtaanpak: Buurtaanpak[];
  tauwOpdrachten: TauwOpdracht[];
}, ma: string, vr: string): number {
  const inWeek = (d?: string) => !!d && d >= ma && d <= vr;
  let n = 0;
  n += bron.afspraken.filter((a) => inWeek(a.datum) && a.status !== "Geannuleerd").length;
  n += bron.schouwafspraken.filter((a) => inWeek(a.datum) && a.status !== "Geannuleerd").length;
  for (const s of bron.saneringen) if (!s.verwijderd) n += s.adressen.filter((a) => inWeek(a.datum)).length;
  for (const b of bron.buurtaanpak) n += b.adressen.filter((a) => inWeek(a.datum)).length;
  for (const o of bron.tauwOpdrachten) n += (o.adressen ?? []).filter((a) => inWeek(a.datum)).length;
  return n;
}

const NL_MAAND = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** De laatste n kalendermaanden (oudste eerst), ook als er in een maand niets gebeurde. */
export function laatsteMaanden(n: number, nu = new Date()): { sleutel: string; label: string }[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(nu.getFullYear(), nu.getMonth() - (n - 1 - i), 1);
    const sleutel = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    return { sleutel, label: `${NL_MAAND[d.getMonth()]} '${String(d.getFullYear()).slice(2)}` };
  });
}

/** Gegooide brieven per maand. Zonder eigen stempel telt de datum waarop de ronde klaar/bijgewerkt was. */
export function brievenPerMaand(rondes: Brievenronde[], maanden: { sleutel: string; label: string }[]): { maand: string; gegooid: number }[] {
  const tel = new Map(maanden.map((m) => [m.sleutel, 0]));
  for (const r of rondes) {
    if (r.verwijderd) continue;
    const terugval = r.doorgestuurdOp ?? r.gecontroleerdOp ?? r.verstuurdOp ?? r.toegewezenOp ?? r.aangemaakt;
    for (const a of r.adressen) {
      if (a.ontbreekt || a.status !== "Gegooid") continue;
      const k = (a.gegooidOp ?? terugval ?? "").slice(0, 7);
      if (tel.has(k)) tel.set(k, (tel.get(k) ?? 0) + 1);
    }
  }
  return maanden.map((m) => ({ maand: m.label, gegooid: tel.get(m.sleutel) ?? 0 }));
}

export function gegooidDezeMaand(rondes: Brievenronde[], nu = new Date()): number {
  const m = laatsteMaanden(1, nu);
  return brievenPerMaand(rondes, m)[0].gegooid;
}

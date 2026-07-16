import type { Project, Brievenronde, VoorschouwMap, TauwOpdracht } from "./types";

// De vaste projecten/onderdelen waar werk op geboekt wordt of een mededeling over gaat.
// Bewust de onderdelen zelf — niet het losse werk erbinnen (dat wordt een onleesbare lijst).
export const WERK_CATEGORIEEN: { id: string; naam: string }[] = [
  { id: "brieven", naam: "Brieven & Routes" },
  { id: "buurtaanpak", naam: "Buurtaanpak" },
  { id: "saneren", naam: "Saneren" },
  { id: "voorschouwen", naam: "Voorschouwen" },
  { id: "schouwafspraken", naam: "Schouwafspraken" },
  { id: "tauw", naam: "TAUW" },
];
export const werkCategorieNaam = (id?: string) => WERK_CATEGORIEEN.find((c) => c.id === id)?.naam;

// Bouwt één lijst "lopende projecten" voor de projectkeuzes: echte projecten + lopend werk uit
// Brieven & Routes, Voorschouwen en TAUW. Zo kun je uren/mededelingen ook aan dat werk koppelen zonder
// er apart een project voor aan te maken. Werk-items krijgen een voorvoegsel in hun id (brv:/vsm:/tauw:)
// zodat ze nooit botsen met een echt project-id.

export type WerkOptie = { id: string; naam: string; groep: string };
export type WerkCtx = { projects: Project[]; voorschouwMappen: VoorschouwMap[]; tauwOpdrachten: TauwOpdracht[] };

export function lopendeProjectOpties(projects: Project[], rondes: Brievenronde[], voorschouwMappen: VoorschouwMap[], tauwOpdrachten: TauwOpdracht[]): WerkOptie[] {
  const opties: WerkOptie[] = [];

  // Echte projecten (nog niet gefactureerd)
  for (const p of projects.filter((p) => p.boekhouding !== "gefactureerd").sort((a, b) => a.naam.localeCompare(b.naam, "nl"))) {
    opties.push({ id: p.id, naam: p.pdNummer ? `${p.naam} · ${p.pdNummer}` : p.naam, groep: "Projecten" });
  }

  // Brieven & Routes: mappen met nog lopend werk (minstens één ronde niet verstuurd), gegroepeerd op mapnaam
  const brvMappen = [...new Set(rondes.filter((r) => r.mapNaam && !r.gearchiveerd && r.status !== "verstuurd").map((r) => r.mapNaam as string))].sort((a, b) => a.localeCompare(b, "nl"));
  for (const naam of brvMappen) opties.push({ id: `brv:${naam}`, naam: `Brieven: ${naam}`, groep: "Brieven & routes" });

  // Voorschouwen: actieve mappen (niet gearchiveerd)
  for (const m of voorschouwMappen.filter((m) => !m.gearchiveerd).sort((a, b) => a.naam.localeCompare(b.naam, "nl"))) {
    opties.push({ id: `vsm:${m.id}`, naam: `Voorschouw: ${m.naam}`, groep: "Voorschouwen" });
  }

  // TAUW: lopende opdrachten (niet verstuurd/gearchiveerd)
  for (const o of tauwOpdrachten.filter((o) => o.status !== "verstuurd" && !o.gearchiveerd).sort((a, b) => (a.referentie || a.regio || "").localeCompare(b.referentie || b.regio || "", "nl"))) {
    opties.push({ id: `tauw:${o.id}`, naam: `TAUW: ${o.referentie || o.regio || "opdracht"}`, groep: "TAUW" });
  }

  return opties;
}

// Zet een (mogelijk voorvoegsel-)id om naar een leesbare naam. Werkt voor echte projecten én werk-items.
export function werkNaam(id: string | undefined, ctx: WerkCtx): string | undefined {
  if (!id) return undefined;
  if (id.startsWith("brv:")) return `Brieven: ${id.slice(4)}`;
  if (id.startsWith("vsm:")) { const m = ctx.voorschouwMappen.find((x) => x.id === id.slice(4)); return m ? `Voorschouw: ${m.naam}` : "Voorschouw"; }
  if (id.startsWith("tauw:")) { const o = ctx.tauwOpdrachten.find((x) => x.id === id.slice(5)); return o ? `TAUW: ${o.referentie || o.regio || "opdracht"}` : "TAUW"; }
  return ctx.projects.find((p) => p.id === id)?.naam;
}

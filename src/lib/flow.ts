import type { NavTarget } from "../store/NavContext";
import type { FlowStap, StapStatus, TauwType } from "./types";

// Een stap-actie: een bestaande module openen (deep-link), een inline-paneel tonen, of alleen afvinken.
export type StapActie =
  | { soort: "module"; navKey: string; target: (id: string) => NavTarget }
  | { soort: "inline"; paneel: string }
  | { soort: "markeer" };

export type StapDef = {
  key: string;
  label: string;
  hint?: string;
  actie: StapActie;
  vereist?: string[]; // keys die eerst 'klaar' moeten zijn
};

// Per-versie werknemer-stappen. Bodemonderzoek draait om contact + bevestiging bij de bewoner;
// bezoekronde draait om regio bepalen en een route over lange afstanden.
export const TAUW_STAP_DEFS: Record<TauwType, StapDef[]> = {
  bodemonderzoek: [
    { key: "regio", label: "Regio bepalen", actie: { soort: "inline", paneel: "regio" } },
    { key: "contact", label: "Bewoners contacteren & afspraken bevestigen", hint: "Bel of WhatsApp elke bewoner en zet datum/tijd in de adres-balk.", actie: { soort: "markeer" } },
    { key: "informatie", label: "Bijzonderheden invullen", hint: "Noteer per adres de bijzonderheden uit het gesprek.", actie: { soort: "markeer" } },
  ],
  bezoekronde: [
    { key: "regio", label: "Regio bepalen", actie: { soort: "inline", paneel: "regio" } },
    { key: "route", label: "Route aanmaken (lange afstanden)", hint: "Rijroute langs alle te bezoeken adressen via Google Maps.", actie: { soort: "inline", paneel: "route" } },
  ],
};

export function legeStappen(defs: StapDef[]): FlowStap[] {
  return defs.map((d) => ({ key: d.key, status: "open" as StapStatus, notitie: "" }));
}

export function stapVan(stappen: FlowStap[], key: string): FlowStap {
  return stappen.find((s) => s.key === key) ?? { key, status: "open", notitie: "" };
}

export function stapOntgrendeld(def: StapDef, stappen: FlowStap[]): boolean {
  if (!def.vereist?.length) return true;
  return def.vereist.every((k) => stapVan(stappen, k).status === "klaar");
}

export function volgendeStatus(s: StapStatus): StapStatus {
  return s === "open" ? "bezig" : s === "bezig" ? "klaar" : "open";
}

// Totaalstatus van een dossier op basis van de stappen.
export function flowStatus(stappen: FlowStap[]): StapStatus {
  if (stappen.length > 0 && stappen.every((s) => s.status === "klaar")) return "klaar";
  if (stappen.some((s) => s.status !== "open")) return "bezig";
  return "open";
}

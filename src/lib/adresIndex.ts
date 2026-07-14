// Centrale adres-index over ÁLLE projecten/modules.
// Doel: als je ergens een adres invult dat we eerder al hebben gedaan (in welk project dan ook), kunnen we
// dat melden ("je hebt hier misschien al informatie") zodat je het niet dubbel hoeft te doen.
//
// Let op de granulariteit: een Voorschouw is straat-niveau (straatnaam + postcode + plaats, geen huisnummer),
// terwijl Saneren/TAUW/Brieven/Afspraken/Klanten op huisnummer-niveau zitten. We matchen daarom op STRAAT.
// Omdat het ene record wél en het andere geen postcode heeft, indexeren we op ÉLKE beschikbare sleutel
// (postcode-cijfers én plaats) — zo vinden records met/zonder postcode elkaar toch.
import type { Voorschouw, Brievenronde, Sanering, Buurtaanpak, TauwOpdracht, Afspraak, Klant } from "./types";

export type AdresTreffer = {
  bron: string;      // "Voorschouw" | "Brieven" | "Saneren" | "Buurtaanpak" | "TAUW" | "Afspraak" | "Klant"
  recordId: string;  // het bovenliggende record
  titel: string;     // korte omschrijving (project/straat)
  detail: string;    // extra context (bv. "3 foto's", "12 adressen")
  navKey: string;    // pagina om heen te navigeren
};

const normStraat = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const normPlaats = (s: string) => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
const pcCijfers = (s: string) => (s || "").replace(/\D/g, "").slice(0, 4); // "3011 AB" → "3011"

// Alle sleutels waarop dit adres als "dezelfde straat" telt. We indexeren/zoeken op élke beschikbare sleutel
// (postcode-cijfers én plaats), zodat records met/zonder postcode elkaar toch vinden en de "niet meer
// melden"-keuze niet lekt zodra je daarna alsnog een postcode invult. Leeg als er geen straat is.
export function straatSleutels(straat: string, plaats: string, postcode?: string): string[] {
  const st = normStraat(straat);
  if (!st) return [];
  const keys = new Set<string>();
  const pc4 = pcCijfers(postcode || "");
  if (pc4) keys.add(`${st}|${pc4}`);
  const pl = normPlaats(plaats);
  if (pl) keys.add(`${st}|${pl}`);
  if (keys.size === 0) keys.add(`${st}|`); // geen postcode én geen plaats → op straatnaam alleen
  return [...keys];
}

export type AdresBronnen = {
  voorschouwen: Voorschouw[];
  rondes: Brievenronde[];
  saneringen: Sanering[];
  buurtaanpak: Buurtaanpak[];
  tauwOpdrachten: TauwOpdracht[];
  afspraken: Afspraak[];
  klanten: Klant[];
};

// Bouwt de index straat-sleutel → treffers. Eén treffer per (bron, record) per sleutel (geen dubbele).
export function bouwAdresIndex(b: AdresBronnen): Map<string, AdresTreffer[]> {
  const idx = new Map<string, AdresTreffer[]>();
  const voegToe = (straat: string, plaats: string, postcode: string, t: AdresTreffer) => {
    for (const key of straatSleutels(straat, plaats, postcode)) {
      const lijst = idx.get(key);
      if (!lijst) { idx.set(key, [t]); continue; }
      if (!lijst.some((x) => x.bron === t.bron && x.recordId === t.recordId)) lijst.push(t);
    }
  };

  for (const v of b.voorschouwen) {
    voegToe(v.straatnaam, v.plaats, v.postcode, {
      bron: "Voorschouw", recordId: v.id, titel: v.straatnaam || v.plaats || "Voorschouw",
      detail: v.fotos?.length ? `${v.fotos.length} foto${v.fotos.length > 1 ? "'s" : ""}` : "ingevuld",
      navKey: "voorschouwen",
    });
  }
  for (const r of b.rondes) {
    if (r.verwijderd) continue;
    voegToe(r.straat, r.plaats, r.postcode, {
      bron: "Brieven", recordId: r.id, titel: r.mapNaam || r.straat || "Brievenronde",
      detail: `${r.adressen.length} adres${r.adressen.length === 1 ? "" : "sen"}`, navKey: "brieven",
    });
  }
  for (const s of b.saneringen) {
    if (s.verwijderd) continue;
    for (const a of s.adressen) {
      voegToe(a.straat, a.plaats, a.postcode, {
        bron: "Saneren", recordId: s.id, titel: s.naam || a.straat || "Sanering", detail: a.straat || "sanering", navKey: "saneren",
      });
    }
  }
  for (const bu of b.buurtaanpak) {
    for (const a of bu.adressen) {
      voegToe(a.straat, "", a.postcode, {
        bron: "Buurtaanpak", recordId: bu.id, titel: bu.naam || a.straat || "Buurtaanpak", detail: a.straat || "buurtaanpak", navKey: "buurtaanpak",
      });
    }
  }
  for (const o of b.tauwOpdrachten) {
    for (const a of o.adressen) {
      voegToe(a.straat, a.plaats, a.postcode, {
        bron: "TAUW", recordId: o.id, titel: o.referentie || o.regio || a.straat || "TAUW", detail: a.straat || "TAUW", navKey: "tauw",
      });
    }
  }
  for (const a of b.afspraken) {
    voegToe(a.straat, a.plaats, a.postcode, {
      bron: "Afspraak", recordId: a.id, titel: `${a.straat} ${a.huisnummer}`.trim() || a.locatie || "Afspraak",
      detail: a.klantNaam || "afspraak", navKey: "afspraken",
    });
  }
  for (const k of b.klanten) {
    voegToe(k.straat, k.plaats, k.postcode, {
      bron: "Klant", recordId: k.id, titel: k.naam || k.straat || "Klant",
      detail: `${k.straat} ${k.huisnummer}`.trim() || "klant", navKey: "klanten",
    });
  }
  return idx;
}

// Treffers voor één adres over álle sleutels (gededupt), met uitzondering van het huidige record.
export function zoekTreffers(
  idx: Map<string, AdresTreffer[]>,
  straat: string, plaats: string, postcode: string,
  negeerRecordId?: string,
): AdresTreffer[] {
  const gezien = new Set<string>();
  const out: AdresTreffer[] = [];
  for (const key of straatSleutels(straat, plaats, postcode)) {
    for (const t of idx.get(key) ?? []) {
      if (negeerRecordId && t.recordId === negeerRecordId) continue;
      const dedup = `${t.bron}|${t.recordId}`;
      if (gezien.has(dedup)) continue;
      gezien.add(dedup);
      out.push(t);
    }
  }
  return out;
}

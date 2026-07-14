// Centrale adres-index over ÁLLE projecten/modules.
// Doel: als je ergens een adres invult dat we eerder al hebben gedaan (in welk project dan ook), kunnen we
// dat melden ("je hebt hier misschien al informatie") zodat je het niet dubbel hoeft te doen.
//
// Let op de granulariteit: een Voorschouw is straat-niveau (straatnaam + postcode + plaats, geen huisnummer),
// terwijl Saneren/TAUW/Brieven/Afspraken/Klanten op huisnummer-niveau zitten. We matchen daarom op STRAAT
// (straatnaam + postcode-cijfers, met plaats als terugval) — dat is de gemene deler en precies wat je nodig
// hebt om te zien "op deze straat hebben we al eens iets gedaan".
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

// De sleutel waarop we adressen als "dezelfde straat" beschouwen: straat + postcode-cijfers (sterkste
// indicator), of straat + plaats als er geen postcode is. Leeg als er geen straat is (dan geen match).
export function straatSleutel(straat: string, plaats: string, postcode?: string): string {
  const st = normStraat(straat);
  if (!st) return "";
  const pc4 = pcCijfers(postcode || "");
  return pc4 ? `${st}|${pc4}` : `${st}|${normPlaats(plaats)}`;
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

// Bouwt de index straat-sleutel → treffers. Eén treffer per (bron, record) per straat (geen dubbele).
export function bouwAdresIndex(b: AdresBronnen): Map<string, AdresTreffer[]> {
  const idx = new Map<string, AdresTreffer[]>();
  const voegToe = (sleutel: string, t: AdresTreffer) => {
    if (!sleutel) return;
    const lijst = idx.get(sleutel);
    if (!lijst) { idx.set(sleutel, [t]); return; }
    if (!lijst.some((x) => x.bron === t.bron && x.recordId === t.recordId)) lijst.push(t);
  };

  for (const v of b.voorschouwen) {
    voegToe(straatSleutel(v.straatnaam, v.plaats, v.postcode), {
      bron: "Voorschouw", recordId: v.id, titel: v.straatnaam || v.plaats || "Voorschouw",
      detail: v.fotos?.length ? `${v.fotos.length} foto${v.fotos.length > 1 ? "'s" : ""}` : "ingevuld",
      navKey: "voorschouwen",
    });
  }
  for (const r of b.rondes) {
    if (r.verwijderd) continue;
    voegToe(straatSleutel(r.straat, r.plaats, r.postcode), {
      bron: "Brieven", recordId: r.id, titel: r.mapNaam || r.straat || "Brievenronde",
      detail: `${r.adressen.length} adres${r.adressen.length === 1 ? "" : "sen"}`, navKey: "brieven",
    });
  }
  for (const s of b.saneringen) {
    if (s.verwijderd) continue;
    for (const a of s.adressen) {
      voegToe(straatSleutel(a.straat, a.plaats, a.postcode), {
        bron: "Saneren", recordId: s.id, titel: s.naam || a.straat || "Sanering", detail: a.straat || "sanering", navKey: "saneren",
      });
    }
  }
  for (const bu of b.buurtaanpak) {
    for (const a of bu.adressen) {
      voegToe(straatSleutel(a.straat, "", a.postcode), {
        bron: "Buurtaanpak", recordId: bu.id, titel: bu.naam || a.straat || "Buurtaanpak", detail: a.straat || "buurtaanpak", navKey: "buurtaanpak",
      });
    }
  }
  for (const o of b.tauwOpdrachten) {
    for (const a of o.adressen) {
      voegToe(straatSleutel(a.straat, a.plaats, a.postcode), {
        bron: "TAUW", recordId: o.id, titel: o.referentie || o.regio || a.straat || "TAUW", detail: a.straat || "TAUW", navKey: "tauw",
      });
    }
  }
  for (const a of b.afspraken) {
    voegToe(straatSleutel(a.straat, a.plaats, a.postcode), {
      bron: "Afspraak", recordId: a.id, titel: `${a.straat} ${a.huisnummer}`.trim() || a.locatie || "Afspraak",
      detail: a.klantNaam || "afspraak", navKey: "afspraken",
    });
  }
  for (const k of b.klanten) {
    voegToe(straatSleutel(k.straat, k.plaats, k.postcode), {
      bron: "Klant", recordId: k.id, titel: k.naam || k.straat || "Klant",
      detail: `${k.straat} ${k.huisnummer}`.trim() || "klant", navKey: "klanten",
    });
  }
  return idx;
}

// Treffers voor één adres, met uitzondering van het huidige record (zodat je jezelf niet matcht).
export function zoekTreffers(
  idx: Map<string, AdresTreffer[]>,
  straat: string, plaats: string, postcode: string,
  negeerRecordId?: string,
): AdresTreffer[] {
  const sleutel = straatSleutel(straat, plaats, postcode);
  if (!sleutel) return [];
  const lijst = idx.get(sleutel) ?? [];
  return negeerRecordId ? lijst.filter((t) => t.recordId !== negeerRecordId) : lijst;
}

import { useRef, useState } from "react";
import {
  Upload, AlertTriangle, CheckCircle2, Phone, PhoneOff, Pencil, X, Loader2, RotateCcw, Save,
} from "lucide-react";
import { ImportScan, type ScanStap } from "./ImportScan";
import {
  leesRaster, raadKop, bouwRijen, herkenningCompleet, netPostcode,
  type ImportRij, type Mapping, type Raster,
} from "../lib/bodemImport";
import { haalMapping, stuurAdressen, type AkkoordAdres } from "../lib/akkoordWerk";
import type { Dossier } from "../lib/akkoord";

// Bewonersakkoord — stap 2: het adressenbestand inlezen.
// ─────────────────────────────────────────────────────────────────────────────
// Drie dingen die deze import anders maken dan die van bodemonderzoek:
//
// 1. AANVULLEN, NOOIT OVERSCHRIJVEN. Een opdrachtgever levert hetzelfde bestand vaak twee keer aan,
//    de tweede keer met een paar regels erbij. Adressen die er al staan blijven exact zoals ze zijn —
//    inclusief de naam die een monteur er aan de deur bij heeft geschreven. De server bepaalt dat,
//    niet dit scherm.
// 2. AFGEKEURDE REGELS BLIJVEN BESTAAN. Een regel zonder postcode verdwijnt niet; hij gaat mee naar
//    de database met de reden erbij en is hier te corrigeren. Wat je weggooit, kun je niet meer
//    nakijken als de opdrachtgever belt.
// 3. MET OF ZONDER TELEFOONNUMMER. Staat er een nummer bij, dan hoeft er niemand langs — dat adres
//    gaat naar de bellijst. De rest wordt veldwerk. Die splitsing bepaalt de hele planning erna.

const knop = "inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors";

type Klaar = {
  goed: ImportRij[];
  afgekeurd: ImportRij[];
  bestandsnaam: string;
  mapping: Mapping;
  kopIndex: number;
};

const nieuwId = (pd: string) => `${pd}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Een adres zoals de server het wil. Toevoeging blijft een eigen veld: "12" en "12A" zijn twee huizen,
// en als je die samenvoegt tot het huisnummer herkent de volgende import ze niet meer als dezelfde.
const naarAkkoordAdres = (r: ImportRij, pd: string): Partial<AkkoordAdres> => ({
  id: nieuwId(pd), volgorde: r.bron,
  straat: r.straat, huisnummer: r.huisnummer, toevoeging: r.toevoeging,
  postcode: netPostcode(r.postcode), plaats: r.plaats,
  bewoner: r.bewoner, telefoon: r.telefoon,
  opmerking: [r.opmerking, r.wijk && `wijk: ${r.wijk}`].filter(Boolean).join(" · "),
});

export function AkkoordImport({ dossier, aantalNu, onKlaar }: {
  dossier: Dossier;
  aantalNu: number;
  onKlaar: () => void;
}) {
  const invoer = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<ScanStap | null>(null);
  const [bestand, setBestand] = useState("");
  const [klaar, setKlaar] = useState<Klaar | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [uitslag, setUitslag] = useState<{ toegevoegd: number; overgeslagen: number; afgekeurd: number } | null>(null);
  const [bewerk, setBewerk] = useState<number | null>(null);

  async function kies(file: File) {
    setFout(""); setUitslag(null); setKlaar(null);
    setBestand(file.name);
    setScan("lezen");

    const gelezen = await leesRaster(file);
    if (!gelezen.ok) { setScan(null); setFout(gelezen.fout); return; }
    const raster: Raster = gelezen.raster;

    setScan("herkennen");
    // De indeling van de vorige aanlevering van dezelfde opdrachtgever is een voorstel, geen wet:
    // klopt hij niet met dit bestand, dan wint wat we zelf in de kolommen herkennen.
    const zelf = raadKop(raster);
    const onthouden = await haalMapping(dossier.opdrachtgever ?? "");
    const kopIndex = onthouden.mapping && !herkenningCompleet(zelf.mapping) ? (onthouden.kopIndex ?? 0) : zelf.kopIndex;
    const mapping: Mapping = onthouden.mapping && !herkenningCompleet(zelf.mapping)
      ? (onthouden.mapping as Mapping)
      : zelf.mapping;

    setScan("sorteren");
    const rijen = bouwRijen(raster, kopIndex, mapping, []);
    if (rijen.length === 0) { setScan(null); setFout("In dit bestand staan geen regels die op adressen lijken."); return; }

    setScan("klaar");
    setKlaar({
      goed: rijen.filter((r) => r.fouten.length === 0 && !r.dubbelInBestand),
      afgekeurd: rijen.filter((r) => r.fouten.length > 0 || r.dubbelInBestand),
      bestandsnaam: file.name, mapping, kopIndex,
    });
  }

  async function verstuur() {
    if (!klaar) return;
    setBezig(true); setFout("");
    const r = await stuurAdressen({
      pd_nummer: dossier.pd_nummer,
      opdrachtgever: dossier.opdrachtgever,
      mapping: klaar.mapping, kopIndex: klaar.kopIndex,
      adressen: klaar.goed.map((x) => naarAkkoordAdres(x, dossier.pd_nummer)),
      afgekeurd: klaar.afgekeurd.map((x) => ({
        id: nieuwId(dossier.pd_nummer),
        bron_regel: x.bron,
        ruw: { straat: x.straat, huisnummer: x.huisnummer, postcode: x.postcode, plaats: x.plaats, bewoner: x.bewoner, telefoon: x.telefoon },
        reden: x.dubbelInBestand ? "Staat twee keer in het bestand" : x.fouten.join("; "),
      })),
    });
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Versturen mislukt."); return; }
    setUitslag(r.uitslag ?? null);
    setKlaar(null);
    onKlaar();
  }

  // Een afgekeurde regel alsnog rechtzetten. Zodra hij klopt, schuift hij naar de goede lijst.
  function herstel(i: number, patch: Partial<ImportRij>) {
    setKlaar((k) => {
      if (!k) return k;
      const rij = { ...k.afgekeurd[i], ...patch };
      const nogFout: string[] = [];
      if (!rij.straat.trim()) nogFout.push("Straat ontbreekt");
      if (!rij.huisnummer.trim()) nogFout.push("Huisnummer ontbreekt");
      if (!netPostcode(rij.postcode)) nogFout.push("Postcode ontbreekt");
      rij.fouten = nogFout;
      rij.dubbelInBestand = false;
      const afgekeurd = [...k.afgekeurd];
      if (nogFout.length === 0) {
        afgekeurd.splice(i, 1);
        return { ...k, goed: [...k.goed, rij], afgekeurd };
      }
      afgekeurd[i] = rij;
      return { ...k, afgekeurd };
    });
  }

  const metTelefoon = klaar?.goed.filter((r) => r.telefoon.trim()).length ?? 0;
  const zonderTelefoon = (klaar?.goed.length ?? 0) - metTelefoon;

  return (
    <div className="space-y-4">
      <input ref={invoer} type="file" accept=".xlsx,.xls,.csv" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void kies(f); }} />

      {aantalNu > 0 && !klaar && !scan && (
        <div className="rounded-xl bg-sky-50 px-4 py-3 text-sm text-sky-900">
          Er staan al <b>{aantalNu} adressen</b> in dit dossier. Een nieuw bestand vult die lijst aan:
          bestaande adressen blijven ongemoeid, inclusief wat er aan de deur is ingevuld.
        </div>
      )}

      {scan && scan !== "klaar" && <ImportScan stap={scan} aantal={0} bestandsnaam={bestand} />}

      {fout && (
        <div className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {fout}
        </div>
      )}

      {uitslag && (
        <div className="rounded-2xl border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2 font-bold text-green-900">
            <CheckCircle2 className="h-5 w-5" /> Ingelezen
          </div>
          <ul className="mt-2 space-y-1 text-sm text-green-900">
            <li><b>{uitslag.toegevoegd}</b> adressen toegevoegd</li>
            {uitslag.overgeslagen > 0 && <li><b>{uitslag.overgeslagen}</b> stonden er al — die zijn niet aangeraakt</li>}
            {uitslag.afgekeurd > 0 && <li><b>{uitslag.afgekeurd}</b> regels bewaard als afgekeurd, met de reden erbij</li>}
          </ul>
        </div>
      )}

      {!klaar && (
        <button type="button" onClick={() => invoer.current?.click()} disabled={!!scan}
          className={`${knop} w-full bg-sky-600 py-4 text-base text-white hover:bg-sky-700 disabled:opacity-60 sm:w-auto`}>
          {scan ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
          {aantalNu > 0 ? "Nog een bestand inlezen" : "Adressenbestand inlezen"}
        </button>
      )}

      {klaar && (
        <>
          {/* Wat er straks gebeurt met deze adressen — dat is de vraag, niet welke kolom waar stond. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex items-center gap-2 text-sky-700"><Phone className="h-4 w-4" /><span className="text-sm font-semibold">Naar de bellijst</span></div>
              <div className="mt-1 text-3xl font-bold text-ink-900">{metTelefoon}</div>
              <p className="text-xs text-ink-500">Telefoonnummer bekend — hier hoeft niemand langs.</p>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex items-center gap-2 text-amber-700"><PhoneOff className="h-4 w-4" /><span className="text-sm font-semibold">Langs de deur</span></div>
              <div className="mt-1 text-3xl font-bold text-ink-900">{zonderTelefoon}</div>
              <p className="text-xs text-ink-500">Geen nummer bekend — deze adressen worden veldwerk.</p>
            </div>
          </div>

          {klaar.afgekeurd.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 font-semibold text-amber-900">
                <AlertTriangle className="h-4 w-4" /> {klaar.afgekeurd.length} regels komen er niet doorheen
              </div>
              <p className="mt-1 text-xs text-amber-800">
                Ze worden bewaard met de reden erbij, dus je raakt niets kwijt. Je kunt ze hier meteen rechtzetten.
              </p>
              <div className="mt-3 space-y-2">
                {klaar.afgekeurd.slice(0, 40).map((r, i) => (
                  <div key={`${r.bron}-${i}`} className="rounded-xl bg-white px-3 py-2 text-sm">
                    {bewerk === i ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {(["straat", "huisnummer", "postcode", "plaats"] as const).map((veld) => (
                            <input key={veld} defaultValue={r[veld]} placeholder={veld}
                              onBlur={(e) => herstel(i, { [veld]: e.target.value } as Partial<ImportRij>)}
                              className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-sky-400" />
                          ))}
                        </div>
                        <button type="button" onClick={() => setBewerk(null)} className={`${knop} bg-ink-100 py-1.5 text-xs text-ink-700`}>
                          <Save className="h-3.5 w-3.5" /> Klaar
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-medium text-ink-800">
                            regel {r.bron}: {[r.straat, r.huisnummer, r.postcode, r.plaats].filter(Boolean).join(" ") || "(leeg)"}
                          </div>
                          <div className="text-xs text-amber-700">{r.dubbelInBestand ? "Staat twee keer in het bestand" : r.fouten.join(" · ")}</div>
                        </div>
                        <button type="button" onClick={() => setBewerk(i)} className="shrink-0 rounded-lg p-1.5 text-ink-500 hover:bg-ink-100">
                          <Pencil className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                ))}
                {klaar.afgekeurd.length > 40 && (
                  <p className="text-xs text-amber-800">…en nog {klaar.afgekeurd.length - 40}. Die staan straks in het dossier onder “afgekeurd”.</p>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void verstuur()} disabled={bezig || klaar.goed.length === 0}
              className={`${knop} bg-sky-600 py-3.5 text-base text-white hover:bg-sky-700 disabled:opacity-60`}>
              {bezig ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle2 className="h-5 w-5" />}
              {klaar.goed.length} adressen toevoegen
            </button>
            <button type="button" onClick={() => { setKlaar(null); setScan(null); }} className={`${knop} bg-ink-100 text-ink-700 hover:bg-ink-200`}>
              <X className="h-4 w-4" /> Annuleren
            </button>
            <button type="button" onClick={() => invoer.current?.click()} className={`${knop} bg-white text-ink-700 ring-1 ring-ink-200 hover:bg-ink-50`}>
              <RotateCcw className="h-4 w-4" /> Ander bestand
            </button>
          </div>
        </>
      )}
    </div>
  );
}

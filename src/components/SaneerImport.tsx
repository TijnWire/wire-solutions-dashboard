import { useRef, useState } from "react";
import {
  FileUp, AlertTriangle, CheckCircle2, Phone, PhoneOff, Pencil, X, Loader2, RotateCcw, Save, Search, Sparkles, Plus,
} from "lucide-react";
import { ImportScan, type ScanStap } from "./ImportScan";
import {
  leesRaster, raadKop, bouwRijen, herkenningCompleet, netPostcode, postcodeGeldig,
  type ImportRij, type Mapping, type Raster,
} from "../lib/bodemImport";
import { leesAdressenViaAi } from "../lib/saneerAiImport";
import { leesPdfAlsRaster } from "../lib/pdfRaster";
import type { ChecklistGegevens } from "../lib/checklistScan";
import { useApp } from "../store/AppContext";
import { aiBeschikbaar } from "../lib/aiTransport";
import { haalMapping, stuurAdressen, type FlowAdres } from "../lib/saneerflowWerk";
import { zoekPostcodes } from "../lib/postcodeZoeker";
import { splitsStraatEnHuisnummers } from "../lib/huisnummers";
import type { Dossier } from "../lib/saneerflow";

// Saneren — stap 2: het adressenbestand inlezen.
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
  leegAantal: number;   // regels zonder enige inhoud, stilzwijgend overgeslagen
  opgezocht: number;    // postcodes die we bij de landelijke adressenzoeker hebben opgehaald
};

const nieuwId = (pd: string) => `${pd}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

// Een adres zoals de server het wil. Toevoeging blijft een eigen veld: "12" en "12A" zijn twee huizen,
// en als je die samenvoegt tot het huisnummer herkent de volgende import ze niet meer als dezelfde.
const naarFlowAdres = (r: ImportRij, pd: string): Partial<FlowAdres> => ({
  id: nieuwId(pd), volgorde: r.bron,
  straat: r.straat, huisnummer: r.huisnummer, toevoeging: r.toevoeging,
  postcode: netPostcode(r.postcode), plaats: r.plaats,
  bewoner: r.bewoner, telefoon: r.telefoon,
  opmerking: [r.opmerking, r.wijk && `wijk: ${r.wijk}`].filter(Boolean).join(" · "),
});

export function SaneerImport({ dossier, aantalNu, bestaandeAdressen, onKlaar }: {
  dossier: Dossier;
  aantalNu: number;
  bestaandeAdressen?: { straat: string; huisnummer: string; toevoeging?: string; postcode: string }[];
  onKlaar: () => void;
}) {
  const { addSaneerChecklist } = useApp();
  const invoer = useRef<HTMLInputElement>(null);
  const aiInvoer = useRef<HTMLInputElement>(null);
  const [scan, setScan] = useState<ScanStap | null>(null);
  const [bestand, setBestand] = useState("");
  const [klaar, setKlaar] = useState<Klaar | null>(null);
  const [fout, setFout] = useState("");
  const [bezig, setBezig] = useState(false);
  const [aiBezig, setAiBezig] = useState(false);
  const [handmatig, setHandmatig] = useState(false);
  const [uitslag, setUitslag] = useState<{ toegevoegd: number; overgeslagen: number; afgekeurd: number } | null>(null);
  const [bewerk, setBewerk] = useState<number | null>(null);
  const [gevonden, setGevonden] = useState(0);
  const [sleept, setSleept] = useState(false);
  const [zoeken, setZoeken] = useState<{ gedaan: number; totaal: number } | null>(null);

  // Het uitlezen zelf duurt vaak geen halve seconde. Zonder iets in beeld voelt dat als "er gebeurt
  // niets", en bij een groot bestand juist als "hij is vastgelopen". Daarom lopen de stappen mee met
  // wat er echt gebeurt, met net genoeg pauze om ze te kunnen lezen.
  const adem = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function kies(file: File) {
    setFout(""); setUitslag(null); setKlaar(null);
    setBestand(file.name);
    setScan("lezen");
    await adem(350);

    // PDF's lezen we zonder AI uit (checklist, Stedin-brieven of een tabel); al het andere als Excel/CSV.
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const pdf = isPdf ? await leesPdfAlsRaster(file) : null;
    const gelezen = pdf ?? await leesRaster(file);
    if (!gelezen.ok) { setScan(null); setFout(gelezen.fout); return; }
    const raster: Raster = gelezen.raster;
    const vasteMapping: Mapping | undefined = pdf?.ok ? pdf.mapping : undefined;
    // Een ingelezen checklist bewaren we ook als geheel bij dit dossier (te vinden onder Checklists).
    const cl: ChecklistGegevens | undefined = pdf?.ok ? pdf.checklist : undefined;
    if (cl) {
      const nu = new Date().toISOString();
      addSaneerChecklist({ id: `cl-${Math.random().toString(36).slice(2, 10)}`, aangemaakt: nu, bijgewerktOp: nu, bron: "pdf", bestandNaam: file.name, pdNummer: dossier.pd_nummer, velden: cl.velden, bewoners: cl.bewoners, opmerkingen: cl.opmerkingen });
    }

    setScan("herkennen");
    await adem(450);
    // De indeling van de vorige aanlevering van dezelfde opdrachtgever is een voorstel, geen wet:
    // klopt hij niet met dit bestand, dan wint wat we zelf in de kolommen herkennen.
    const zelf = raadKop(raster);
    const onthouden = vasteMapping ? { mapping: null } : await haalMapping(dossier.opdrachtgever ?? "");
    const kopIndex = vasteMapping ? 0 : onthouden.mapping && !herkenningCompleet(zelf.mapping) ? (onthouden.kopIndex ?? 0) : zelf.kopIndex;
    const mapping: Mapping = vasteMapping ?? (onthouden.mapping && !herkenningCompleet(zelf.mapping)
      ? (onthouden.mapping as Mapping)
      : zelf.mapping);

    setScan("sorteren");
    await adem(450);
    let rijen = bouwRijen(raster, kopIndex, mapping, []);
    if (rijen.length === 0) { setScan(null); setFout("In dit bestand staan geen regels die op adressen lijken."); return; }

    // ── Lege regels tellen niet mee ──
    // Aanleverbestanden zitten vol met regels die alleen een streepje of een restje opmaak bevatten.
    // Die als "afgekeurd" tonen levert een lijst van honderden meldingen op waar niets tussen zit dat
    // je kúnt rechtzetten — dan kijkt niemand meer naar de meldingen die er wél toe doen. Een regel
    // zonder straat, huisnummer, postcode, naam én telefoonnummer is geen adres. Die slaan we over.
    const heeftIets = (r: ImportRij) =>
      [r.straat, r.huisnummer, r.postcode, r.bewoner, r.telefoon].some((v) => v.trim().length > 0);
    const leegAantal = rijen.filter((r) => !heeftIets(r)).length;
    rijen = rijen.filter(heeftIets);

    // ── Ontbrekende postcodes opzoeken ──
    // Zonder postcode kan een adres nergens bij horen; het groeperen gaat er juist op. Voor we zo'n
    // regel afkeuren, vragen we hem op bij de landelijke adressenzoeker. Scheelt handwerk bij een
    // bestand waar de opdrachtgever de postcode simpelweg niet meelevert.
    const zonderPostcode = rijen.filter((r) => !postcodeGeldig(r.postcode) && r.straat.trim() && r.huisnummer.trim());
    let opgezocht = 0;
    if (zonderPostcode.length > 0) {
      setZoeken({ gedaan: 0, totaal: zonderPostcode.length });
      const uitslag = await zoekPostcodes(
        zonderPostcode,
        (rij, treffer) => {
          rij.postcode = treffer.postcode;
          if (!rij.plaats.trim() && treffer.plaats) rij.plaats = treffer.plaats;
          rij.waarschuwingen = [...rij.waarschuwingen, "postcode opgezocht"];
        },
        (gedaan, totaal) => setZoeken({ gedaan, totaal }),
      );
      opgezocht = uitslag.gevonden;
      setZoeken(null);
    }

    // Wat daarna nog geen postcode heeft, gaat naar de te corrigeren regels.
    for (const r of rijen) {
      if (r.fouten.length === 0 && !postcodeGeldig(r.postcode)) {
        r.fouten = [r.postcode.trim() ? "Postcode klopt niet" : "Postcode niet gevonden"];
      }
    }

    // Op postcode en huisnummer, zodat de lijst er straks uitziet zoals je 'm ook zou rijden.
    const goed = rijen
      .filter((r) => r.fouten.length === 0 && !r.dubbelInBestand)
      .sort((a, b) => {
        const pa = netPostcode(a.postcode), pb = netPostcode(b.postcode);
        if (pa !== pb) return pa < pb ? -1 : 1;
        const na = parseInt(a.huisnummer.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.huisnummer.replace(/\D/g, ""), 10) || 0;
        return na - nb || a.toevoeging.localeCompare(b.toevoeging);
      });

    setGevonden(goed.length);
    setScan("klaar");
    setKlaar({
      goed,
      afgekeurd: rijen.filter((r) => r.fouten.length > 0 || r.dubbelInBestand),
      bestandsnaam: file.name, mapping, kopIndex, leegAantal, opgezocht,
    });
    // De uitkomst even laten staan voordat het scherm opengaat — anders flitst het getal voorbij.
    await adem(1500);
    setScan(null);
  }

  // ── AI-import: PDF of rommelig bestand uitlezen naar nette adres-kolommen ──
  // Loopt via de OpenRouter-proxy op de server. De uitkomst gaat door hetzelfde voorbeeld-/controle-
  // scherm als de gewone import, inclusief dubbel-detectie tegen de al bestaande adressen.
  async function kiesAi(file: File) {
    setFout(""); setUitslag(null); setKlaar(null);
    setBestand(file.name);
    setAiBezig(true);
    setScan("herkennen");
    const r = await leesAdressenViaAi(file, bestaandeAdressen ?? []);
    setAiBezig(false);
    setScan(null);
    if (!r.ok) { setFout(r.fout); return; }

    // Adressen die al in dit dossier staan: niet opnieuw toevoegen — markeer ze met een duidelijke reden
    // zodat ze in de "komt er niet doorheen"-lijst staan i.p.v. stil te verdwijnen of dubbel te komen.
    const rijen = r.rijen.map((x) =>
      x.bestaatAl && x.fouten.length === 0
        ? { ...x, fouten: ["Staat al in dit dossier"] }
        : x);

    const goed = rijen
      .filter((x) => x.fouten.length === 0 && !x.dubbelInBestand)
      .sort((a, b) => {
        const pa = netPostcode(a.postcode), pb = netPostcode(b.postcode);
        if (pa !== pb) return pa < pb ? -1 : 1;
        const na = parseInt(a.huisnummer.replace(/\D/g, ""), 10) || 0;
        const nb = parseInt(b.huisnummer.replace(/\D/g, ""), 10) || 0;
        return na - nb || a.toevoeging.localeCompare(b.toevoeging);
      });
    setGevonden(goed.length);
    setKlaar({
      goed,
      afgekeurd: rijen.filter((x) => x.fouten.length > 0 || x.dubbelInBestand),
      bestandsnaam: file.name, mapping: {}, kopIndex: 0, leegAantal: 0, opgezocht: 0,
    });
  }

  // ── Handmatig adressen toevoegen: één straat met één of meer huisnummers ──
  async function voegHandmatigToe(velden: HandVelden): Promise<boolean> {
    const gesplitst = splitsStraatEnHuisnummers(velden.straatEnNummers);
    const { straat, fout: splitsFout } = gesplitst;
    const nummers = gesplitst.nummers.filter((n) => !velden.weg.includes(n.huisnummer + n.toevoeging));
    if (!splitsFout && nummers.length === 0) { setFout("Er staat geen huisnummer meer in de lijst."); return false; }
    const postcode = netPostcode(velden.postcode.trim());
    if (!straat) { setFout("Vul de straatnaam en huisnummers in."); return false; }
    if (splitsFout) { setFout(splitsFout); return false; }
    if (postcode && !postcodeGeldig(postcode)) { setFout("Postcode klopt niet"); return false; }
    const start = klaar?.goed.length ?? 0;
    const rijen: ImportRij[] = nummers.map((n, i) => ({
      bron: start + i + 1, straat, huisnummer: n.huisnummer, toevoeging: n.toevoeging,
      postcode, plaats: velden.plaats.trim(), wijk: "", perceel: "",
      // Bewoner en telefoon vul je per huisnummer in.
      bewoner: (velden.perAdres[n.huisnummer + n.toevoeging]?.bewoner ?? "").trim(),
      telefoon: (velden.perAdres[n.huisnummer + n.toevoeging]?.telefoon ?? "").trim(),
      opmerking: "", fouten: [], waarschuwingen: ["handmatig toegevoegd"], dubbelInBestand: false, bestaatAl: false,
    }));
    // Geen postcode ingevuld? Dan zoeken we die per huisnummer op (aan de even en oneven kant kan hij verschillen).
    let opgezocht = 0;
    if (!postcode) {
      setZoeken({ gedaan: 0, totaal: rijen.length });
      const uitslag = await zoekPostcodes(
        rijen,
        (rij, treffer) => {
          rij.postcode = treffer.postcode;
          if (!rij.plaats.trim() && treffer.plaats) rij.plaats = treffer.plaats;
          rij.waarschuwingen = [...rij.waarschuwingen, "postcode opgezocht"];
        },
        (gedaan, totaal) => setZoeken({ gedaan, totaal }),
      );
      opgezocht = uitslag.gevonden;
      setZoeken(null);
      const mist = rijen.filter((r) => !postcodeGeldig(r.postcode));
      if (mist.length > 0) {
        setFout(`Geen postcode gevonden voor ${mist.map((r) => `${r.straat} ${r.huisnummer}${r.toevoeging}`).join(", ")}. Vul de postcode (en plaats) in en probeer opnieuw.`);
        return false;
      }
    }
    setFout("");
    // Staat er al een ingelezen bestand klaar om te controleren, dan komen deze adressen erbij. Anders
    // gaan ze meteen het dossier in: één klik, geen tweede "toevoegen"-stap die je kunt vergeten.
    if (klaar) {
      setKlaar({ ...klaar, goed: [...klaar.goed, ...rijen], opgezocht: klaar.opgezocht + opgezocht });
      setHandmatig(false);
      return true;
    }
    const gelukt = await verstuur({ goed: rijen, afgekeurd: [], bestandsnaam: "Handmatig toegevoegd", mapping: {}, kopIndex: 0, leegAantal: 0, opgezocht });
    if (gelukt) setHandmatig(false);
    return gelukt;
  }

  async function verstuur(lijst: typeof klaar = klaar): Promise<boolean> {
    const klaar = lijst;
    if (!klaar) return false;
    setBezig(true); setFout("");
    const r = await stuurAdressen({
      pd_nummer: dossier.pd_nummer,
      opdrachtgever: dossier.opdrachtgever,
      mapping: klaar.mapping, kopIndex: klaar.kopIndex,
      adressen: klaar.goed.map((x) => naarFlowAdres(x, dossier.pd_nummer)),
      afgekeurd: klaar.afgekeurd.map((x) => ({
        id: nieuwId(dossier.pd_nummer),
        bron_regel: x.bron,
        ruw: { straat: x.straat, huisnummer: x.huisnummer, postcode: x.postcode, plaats: x.plaats, bewoner: x.bewoner, telefoon: x.telefoon },
        reden: x.dubbelInBestand ? "Staat twee keer in het bestand" : x.fouten.join("; "),
      })),
    });
    setBezig(false);
    if (!r.ok) { setFout(r.fout ?? "Versturen mislukt."); return false; }
    setUitslag(r.uitslag ?? null);
    setKlaar(null);
    onKlaar();
    return true;
  }

  // Een afgekeurde regel alsnog rechtzetten. Zodra hij klopt, schuift hij naar de goede lijst.
  function herstel(i: number, patch: Partial<ImportRij>) {
    setKlaar((k) => {
      if (!k) return k;
      const rij = { ...k.afgekeurd[i], ...patch };
      const nogFout: string[] = [];
      if (!rij.straat.trim()) nogFout.push("Straat ontbreekt");
      if (!rij.huisnummer.trim()) nogFout.push("Huisnummer ontbreekt");
      if (!postcodeGeldig(rij.postcode)) nogFout.push(rij.postcode.trim() ? "Postcode klopt niet" : "Postcode ontbreekt");
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
      <input ref={invoer} type="file" accept=".xlsx,.xls,.csv,.pdf,application/pdf" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void kies(f); }} />
      <input ref={aiInvoer} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void kiesAi(f); }} />

      {aantalNu > 0 && !klaar && !scan && (
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
          Er staan al <b>{aantalNu} adressen</b> in dit dossier. Een nieuw bestand vult die lijst aan:
          bestaande adressen blijven ongemoeid, inclusief wat er aan de deur is ingevuld.
        </div>
      )}

      {scan && <ImportScan stap={scan} aantal={gevonden} bestandsnaam={bestand} />}

      {zoeken && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center shadow-xl">
            <span className="mx-auto inline-flex rounded-full bg-brand-50 p-4 text-brand-600"><Search className="h-7 w-7" /></span>
            <div className="mt-3 text-base font-bold text-ink-900">Postcodes opzoeken</div>
            <p className="mt-1 text-sm text-ink-500">
              Bij {zoeken.totaal} adressen ontbreekt de postcode. Die halen we op bij de landelijke
              adressenzoeker, want zonder postcode kunnen ze niet gegroepeerd worden.
            </p>
            <div className="mt-4 h-2 overflow-hidden rounded-full bg-ink-100">
              <div className="h-full rounded-full bg-brand-500 transition-all" style={{ width: `${Math.round((zoeken.gedaan / Math.max(1, zoeken.totaal)) * 100)}%` }} />
            </div>
            <div className="mt-1.5 text-sm font-semibold tabular-nums text-ink-600">{zoeken.gedaan} van de {zoeken.totaal}</div>
          </div>
        </div>
      )}

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
        <div
          onDragOver={(e) => { e.preventDefault(); setSleept(true); }}
          onDragLeave={() => setSleept(false)}
          onDrop={(e) => { e.preventDefault(); setSleept(false); const f = e.dataTransfer.files?.[0]; if (f) void kies(f); }}
          onClick={() => { if (!scan) invoer.current?.click(); }}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); invoer.current?.click(); } }}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-5 py-12 text-center transition-colors ${
            sleept ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-400 hover:bg-brand-50/40"
          } ${scan ? "pointer-events-none opacity-60" : ""}`}
        >
          <div className="mx-auto mb-3 inline-flex rounded-full border border-ink-200 bg-white p-4 text-brand-600">
            {scan ? <Loader2 className="h-7 w-7 animate-spin" /> : <FileUp className="h-7 w-7" />}
          </div>
          <div className="text-base font-bold text-ink-900">
            {aantalNu > 0 ? "Sleep nog een bestand hierheen of klik om te kiezen" : "Sleep het bestand hierheen of klik om te kiezen"}
          </div>
          <div className="mt-1 text-sm text-ink-500">
            Excel (.xlsx, .xls), CSV of PDF (zoals de Checklist Consument Saneren of Stedin-brieven) — de gegevens worden zelf herkend en in het systeem gezet.
          </div>
        </div>
      )}

      {/* Extra manieren om adressen toe te voegen: AI voor foto's, en handmatig. */}
      {!klaar && !scan && !handmatig && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => { if (aiBeschikbaar()) aiInvoer.current?.click(); else setFout("Foto's uitlezen kan alleen als je online bent ingelogd."); }}
            disabled={aiBezig}
            className={`${knop} flex-1 border-2 border-dashed border-brand-300 bg-brand-50/50 text-brand-800 hover:bg-brand-50 disabled:opacity-60`}>
            {aiBezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiBezig ? "AI leest de foto…" : "Geen PDF of rommelig bestand? Laat AI een foto uitlezen"}
          </button>
          <button type="button" onClick={() => { setFout(""); setHandmatig(true); }}
            className={`${knop} border border-ink-200 bg-white text-ink-700 hover:bg-ink-50 sm:flex-none`}>
            <Plus className="h-4 w-4" /> Adressen handmatig
          </button>
        </div>
      )}

      {/* Handmatig één adres invoeren */}
      {handmatig && (
        <HandmatigAdres
          onToevoegen={voegHandmatigToe}
          onAnnuleer={() => { setHandmatig(false); setFout(""); }}
        />
      )}

      {klaar && (
        <>
          {/* Wat er straks gebeurt met deze adressen — dat is de vraag, niet welke kolom waar stond. */}
          {(klaar.opgezocht > 0 || klaar.leegAantal > 0) && (
            <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-900">
              {klaar.opgezocht > 0 && (
                <div>
                  Bij <b>{klaar.opgezocht} adressen</b> stond geen postcode in het bestand; die zijn opgezocht
                  bij de landelijke adressenzoeker en staan in de lijst hieronder.
                </div>
              )}
              {klaar.leegAantal > 0 && (
                <div className={klaar.opgezocht > 0 ? "mt-1" : ""}>
                  <b>{klaar.leegAantal} lege regels</b> uit het bestand overgeslagen — daar stond geen adres in.
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex items-center gap-2 text-brand-700"><Phone className="h-4 w-4" /><span className="text-sm font-semibold">Naar de bellijst</span></div>
              <div className="mt-1 text-3xl font-bold text-ink-900">{metTelefoon}</div>
              <p className="text-xs text-ink-500">Telefoonnummer bekend — hier hoeft niemand langs.</p>
            </div>
            <div className="rounded-2xl border border-ink-200 bg-white p-4">
              <div className="flex items-center gap-2 text-amber-700"><PhoneOff className="h-4 w-4" /><span className="text-sm font-semibold">Langs de deur</span></div>
              <div className="mt-1 text-3xl font-bold text-ink-900">{zonderTelefoon}</div>
              <p className="text-xs text-ink-500">Geen nummer bekend — deze adressen worden veldwerk.</p>
            </div>
          </div>

          {/* De adressen zoals ze straks in de database komen: op postcode, dan huisnummer. Zo zie je
              in één oogopslag of het klopt — en of de goede kolommen zijn herkend. */}
          <div className="overflow-hidden rounded-2xl border border-ink-200 bg-white">
            <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2.5">
              <span className="text-sm font-bold text-ink-900">{klaar.goed.length} adressen, op postcode gesorteerd</span>
              <span className="text-xs text-ink-500">{klaar.bestandsnaam}</span>
            </div>
            <div className="max-h-80 divide-y divide-ink-50 overflow-y-auto">
              {klaar.goed.slice(0, 200).map((r, i) => (
                <div key={`${r.bron}-${i}`} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-ink-800">{[r.straat, r.huisnummer, r.toevoeging].filter(Boolean).join(" ")}</span>
                    <span className="block truncate text-xs text-ink-500">
                      {netPostcode(r.postcode)} {r.plaats}{r.bewoner ? ` · ${r.bewoner}` : ""}
                      {r.waarschuwingen.includes("postcode opgezocht") && <span className="ml-1.5 rounded bg-brand-100 px-1.5 py-0.5 text-[10px] font-semibold text-brand-800">opgezocht</span>}
                    </span>
                  </span>
                  {r.telefoon.trim()
                    ? <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-1 text-xs font-semibold text-brand-800"><Phone className="h-3 w-3" /> {r.telefoon}</span>
                    : <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800"><PhoneOff className="h-3 w-3" /> langs</span>}
                </div>
              ))}
              {klaar.goed.length > 200 && (
                <div className="px-4 py-2 text-xs text-ink-500">…en nog {klaar.goed.length - 200} adressen.</div>
              )}
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
                              className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
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
              className={`${knop} bg-brand-600 py-3.5 text-base text-white hover:bg-brand-700 disabled:opacity-60`}>
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

// ── Klein formulier om adressen met de hand in te voeren: één straat, één of meer huisnummers ──
type HandVelden = { straatEnNummers: string; postcode: string; plaats: string; perAdres: Record<string, { bewoner: string; telefoon: string }>; weg: string[] };
export function HandmatigAdres({ onToevoegen, onAnnuleer }: {
  onToevoegen: (velden: HandVelden) => Promise<boolean>;
  onAnnuleer: () => void;
}) {
  const [v, setV] = useState<HandVelden>({ straatEnNummers: "", postcode: "", plaats: "", perAdres: {}, weg: [] });
  const [bezig, setBezig] = useState(false);
  const set = (p: Partial<HandVelden>) => setV((s) => ({ ...s, ...p }));
  const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
  const lab = "mb-1 block text-xs font-semibold text-ink-600";
  const split = v.straatEnNummers.trim() ? splitsStraatEnHuisnummers(v.straatEnNummers) : null;
  const zichtbaar = split && !split.fout ? split.nummers.filter((n) => !v.weg.includes(n.huisnummer + n.toevoeging)) : [];
  const aantal = zichtbaar.length;
  const kanToe = aantal > 0 && !bezig;
  const zetAdres = (sleutel: string, p: Partial<{ bewoner: string; telefoon: string }>) =>
    setV((s) => ({ ...s, perAdres: { ...s.perAdres, [sleutel]: { ...(s.perAdres[sleutel] ?? { bewoner: "", telefoon: "" }), ...p } } }));
  const toevoegen = async () => {
    setBezig(true);
    try { await onToevoegen(v); } finally { setBezig(false); }
  };
  return (
    <div className="rounded-2xl border-2 border-brand-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h4 className="text-sm font-bold text-ink-900">Adressen handmatig toevoegen</h4>
        <button type="button" onClick={onAnnuleer} className="text-ink-400 hover:text-ink-600"><X className="h-5 w-5" /></button>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
        <div className="col-span-2 sm:col-span-6">
          <label className={lab}>Straatnaam en huisnummers *</label>
          <input autoFocus value={v.straatEnNummers} onChange={(e) => set({ straatEnNummers: e.target.value })} placeholder="Dorpsstraat 12, 14A, 20-26" className={veld} />
          {split && (
            <p className={`mt-1 text-xs ${split.fout ? "text-red-600" : "text-ink-500"}`}>
              {split.fout ?? `${aantal} ${aantal === 1 ? "adres" : "adressen"}: ${split.straat} ${zichtbaar.slice(0, 12).map((n) => n.huisnummer + n.toevoeging).join(", ")}${aantal > 12 ? " …" : ""}`}
            </p>
          )}
        </div>
        <div className="col-span-1 sm:col-span-2"><label className={lab}>Postcode</label><input value={v.postcode} onChange={(e) => set({ postcode: e.target.value })} placeholder="1234 AB" className={veld} /></div>
        <div className="col-span-1 sm:col-span-4"><label className={lab}>Plaats</label><input value={v.plaats} onChange={(e) => set({ plaats: e.target.value })} placeholder="Rotterdam" className={veld} /></div>
        {aantal > 0 && split && (
          <div className="col-span-2 sm:col-span-6">
            <span className={lab}>Per huisnummer</span>
            <div className="divide-y divide-ink-100 rounded-lg border border-ink-200">
              {zichtbaar.map((n) => {
                const k = n.huisnummer + n.toevoeging;
                const d = v.perAdres[k];
                return (
                  <div key={k} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 p-2 sm:grid-cols-[6rem_1fr_1fr_auto]">
                    <span className="row-span-2 text-sm font-semibold text-ink-800 sm:row-span-1">{k}</span>
                    <input value={d?.telefoon ?? ""} onChange={(e) => zetAdres(k, { telefoon: e.target.value })} placeholder="Telefoon 06 …" inputMode="tel" className={veld} />
                    <button type="button" onClick={() => set({ weg: [...v.weg, k] })} title={`${k} weghalen`} aria-label={`${k} weghalen`}
                      className="row-span-2 rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-red-600 sm:order-last sm:row-span-1"><X className="h-4 w-4" /></button>
                    <input value={d?.bewoner ?? ""} onChange={(e) => zetAdres(k, { bewoner: e.target.value })} placeholder="Bewoner (optioneel)" className={veld} />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button type="button" onClick={toevoegen} disabled={!kanToe}
          className={`${knop} bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-40`}>
          <Plus className="h-4 w-4" /> {bezig ? "Bezig met toevoegen…" : aantal > 1 ? `${aantal} adressen toevoegen` : "Adres toevoegen"}
        </button>
        <button type="button" onClick={onAnnuleer} className={`${knop} bg-ink-100 text-ink-700 hover:bg-ink-200`}>Annuleren</button>
      </div>
      <p className="mt-2 text-xs text-ink-500">Meerdere huisnummers scheid je met een komma; “20-26” is 20, 22, 24 en 26 en “45B-47E” is 45B t/m 45E en 47A t/m 47E. Klopt er een nummer niet, haal het dan weg met het kruisje. Per huisnummer vul je daarna telefoon en bewoner in. Laat je de postcode leeg, dan zoekt de app hem per adres op. De adressen gaan direct het dossier in.</p>
    </div>
  );
}

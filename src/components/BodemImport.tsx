import { useMemo, useRef, useState } from "react";
import { FileUp, ArrowLeft, ArrowRight, Check, AlertTriangle, Copy, Table2 } from "lucide-react";
import { Card } from "./ui";
import {
  leesRaster, raadKop, bouwRijen, samenvatting, naarAdressen, herkenningCompleet,
  VELDEN, type Mapping, type Raster, type ImportRij, type Veld,
} from "../lib/bodemImport";
import { ImportScan, type ScanStap } from "./ImportScan";
import { sorteerRoute } from "../lib/bodemonderzoek";
import type { TauwAdres } from "../lib/types";

// Adressen importeren in drie stappen: bestand kiezen → kolommen kloppend maken → controleren en
// importeren. Bewust géén "hij herkent het wel of niet"-knop meer: je ziet altijd wat er in het
// bestand staat en kunt elke kolom zelf toewijzen. Importeren gebeurt in één keer — of alle goede
// regels gaan erin, of er verandert niets.

const knopKlein = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3.5 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";
const knopPrimair = "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";

const nieuwId = () => {
  try { return crypto.randomUUID(); } catch { return `ta-${Date.now()}-${Math.round(Math.random() * 1e6)}`; }
};

function Stapbalk({ stap }: { stap: number }) {
  const namen = ["Bestand", "Kolommen", "Controleren"];
  return (
    <div className="flex items-center gap-2">
      {namen.map((n, i) => (
        <div key={n} className="flex items-center gap-2">
          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
            i < stap ? "bg-green-500 text-white" : i === stap ? "bg-brand-600 text-white" : "bg-ink-200 text-ink-500"
          }`}>{i < stap ? "✓" : i + 1}</span>
          <span className={`text-sm font-semibold ${i === stap ? "text-ink-900" : "text-ink-400"}`}>{n}</span>
          {i < namen.length - 1 && <span className="mx-1 h-px w-4 bg-ink-200" />}
        </div>
      ))}
    </div>
  );
}

export function BodemImport({ bestaand, onKlaar, onAnnuleer }: {
  bestaand: TauwAdres[];
  onKlaar: (adressen: TauwAdres[], bestandsnaam: string) => void;
  onAnnuleer: () => void;
}) {
  const [stap, setStap] = useState(0);
  const [fout, setFout] = useState("");
  const [bestandsnaam, setBestandsnaam] = useState("");
  const [raster, setRaster] = useState<Raster | null>(null);
  const [kopIndex, setKopIndex] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [slaDubbeleOver, setSlaDubbeleOver] = useState(true);
  const [sleept, setSleept] = useState(false);
  const [scan, setScan] = useState<ScanStap | null>(null);
  const [scanAantal, setScanAantal] = useState(0);
  const invoer = useRef<HTMLInputElement | null>(null);

  const rijen: ImportRij[] = useMemo(
    () => (raster ? bouwRijen(raster, kopIndex, mapping, bestaand) : []),
    [raster, kopIndex, mapping, bestaand],
  );
  const sam = useMemo(() => samenvatting(rijen), [rijen]);
  const teImporteren = useMemo(
    () => sorteerRoute(naarAdressen(rijen, { slaDubbeleOver }, nieuwId)),
    [rijen, slaDubbeleOver],
  );

  const wacht = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

  // Bestand inlezen met de stappen in beeld. De pauzes zijn kort en houden gelijke tred met wat er
  // echt gebeurt; bij een groot bestand duurt het uitlezen vanzelf langer en blijft die stap staan.
  const pak = async (file?: File | null) => {
    if (!file) return;
    setFout("");
    setBestandsnaam(file.name);
    setScan("lezen");
    await wacht(250);

    const r = await leesRaster(file);
    if (!r.ok) { setScan(null); setFout(r.fout); return; }

    setScan("herkennen");
    await wacht(350);
    const gok = raadKop(r.raster);
    setRaster(r.raster);
    setKopIndex(gok.kopIndex);
    setMapping(gok.mapping);

    // Herkent hij de adressen niet met zekerheid, dan is het eerlijker om het meteen te vragen dan om
    // een lijst te tonen waar de helft van klopt.
    if (!herkenningCompleet(gok.mapping)) {
      setScan(null);
      setStap(1);
      setFout("De adreskolom is niet met zekerheid herkend. Wijs hieronder even aan welke kolom wat is.");
      return;
    }

    setScan("sorteren");
    await wacht(400);
    const rijenNu = bouwRijen(r.raster, gok.kopIndex, gok.mapping, bestaand);
    setScanAantal(naarAdressen(rijenNu, { slaDubbeleOver: true }, () => "x").length);
    setScan("klaar");
    await wacht(1100);
    setScan(null);
    setStap(2); // recht naar het resultaat — de kolommentabel is alleen nodig als er iets niet klopt
  };

  // Welk veld hangt aan kolom c? (leeg = niet gebruiken)
  const veldVanKolom = (c: number): Veld | "" => {
    const gevonden = (Object.entries(mapping) as [Veld, number][]).find(([, k]) => k === c);
    return gevonden ? gevonden[0] : "";
  };
  const koppel = (c: number, veld: Veld | "") => {
    setMapping((prev) => {
      const n: Mapping = { ...prev };
      // Eén kolom per veld: een veld dat al aan een andere kolom hing, laat die los.
      for (const [v, k] of Object.entries(n) as [Veld, number][]) if (k === c) delete n[v];
      if (veld) n[veld] = c;
      return n;
    });
  };

  const kopRij = raster?.rijen[kopIndex] ?? [];
  const kolommen = raster ? Math.max(...raster.rijen.slice(0, 50).map((r) => r.length), kopRij.length) : 0;
  const adresCompleet = mapping.straat !== undefined || mapping.adresVolledig !== undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {stap === 1 ? <Stapbalk stap={stap} /> : <span className="text-sm font-bold text-ink-900">Adressen inlezen</span>}
        <button type="button" onClick={onAnnuleer} className="text-sm font-medium text-ink-500 hover:text-ink-800">Annuleren</button>
      </div>

      {scan && <ImportScan stap={scan} aantal={scanAantal} bestandsnaam={bestandsnaam} />}

      {fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{fout}</div>}

      {/* ── Stap 1: bestand ── */}
      {stap === 0 && (
        <div
          onDragOver={(e) => { e.preventDefault(); setSleept(true); }}
          onDragLeave={() => setSleept(false)}
          onDrop={(e) => { e.preventDefault(); setSleept(false); void pak(e.dataTransfer.files?.[0]); }}
          onClick={() => invoer.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); invoer.current?.click(); } }}
          className={`cursor-pointer rounded-2xl border-2 border-dashed px-5 py-10 text-center transition-colors ${
            sleept ? "border-brand-500 bg-brand-50" : "border-ink-300 bg-white hover:border-brand-400 hover:bg-brand-50/40"
          }`}
        >
          <div className="mx-auto mb-2 inline-flex rounded-full border border-ink-200 bg-white p-3 text-ink-500">
            <FileUp className="h-6 w-6" />
          </div>
          <div className="text-sm font-semibold text-ink-800">Sleep het bestand hierheen of klik om te kiezen</div>
          <div className="mt-0.5 text-xs text-ink-500">Excel (.xlsx, .xls) of CSV — je kunt hierna zelf aanwijzen welke kolom wat is</div>
        </div>
      )}
      <input ref={invoer} type="file" accept=".xlsx,.xls,.csv" className="hidden" aria-label="Bestand kiezen"
        onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; void pak(f); }} />

      {/* ── Stap 2: kolommen ── */}
      {stap === 1 && raster && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink-900">Welke kolom is wat?</h3>
            <label className="flex items-center gap-2 text-sm text-ink-600">
              Koprij
              <select
                value={kopIndex}
                onChange={(e) => { const i = Number(e.target.value); setKopIndex(i); setMapping(raadKop({ ...raster, rijen: raster.rijen }).mapping); }}
                className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
              >
                {raster.rijen.slice(0, 40).map((r, i) => (
                  <option key={i} value={i}>regel {i + 1}: {r.slice(0, 4).filter(Boolean).join(" | ").slice(0, 40) || "(leeg)"}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-ink-500">
            We hebben een voorstel gedaan op basis van de kopnamen. Klopt er iets niet, zet het dan hier recht —
            <span className="font-semibold"> Straat</span> en <span className="font-semibold">Huisnummer</span> zijn nodig,
            of één kolom met <span className="font-semibold">Adres (straat + nummer samen)</span>.
          </p>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-ink-200">
                  {Array.from({ length: kolommen }, (_, c) => (
                    <th key={c} className="p-1.5 align-top">
                      <div className="mb-1 truncate text-xs font-semibold text-ink-500" title={kopRij[c] || ""}>
                        {kopRij[c] || `kolom ${c + 1}`}
                      </div>
                      <select
                        value={veldVanKolom(c)}
                        onChange={(e) => koppel(c, e.target.value as Veld | "")}
                        className={`w-full rounded-lg border px-2 py-1.5 text-xs ${veldVanKolom(c) ? "border-brand-300 bg-brand-50 font-semibold text-brand-800" : "border-ink-200 bg-white text-ink-500"}`}
                      >
                        <option value="">— niet gebruiken —</option>
                        {VELDEN.map((v) => <option key={v.veld} value={v.veld}>{v.label}</option>)}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {raster.rijen.slice(kopIndex + 1, kopIndex + 6).map((r, i) => (
                  <tr key={i} className="border-b border-ink-100">
                    {Array.from({ length: kolommen }, (_, c) => (
                      <td key={c} className="max-w-[160px] truncate p-1.5 text-xs text-ink-600" title={r[c] || ""}>{r[c] || ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
            <button type="button" onClick={() => { setStap(0); setRaster(null); }} className={knopKlein}>
              <ArrowLeft className="h-3.5 w-3.5" /> Ander bestand
            </button>
            <button type="button" disabled={!adresCompleet} onClick={() => setStap(2)} className={knopPrimair}>
              Controleren <ArrowRight className="h-4 w-4" />
            </button>
          </div>
          {!adresCompleet && (
            <p className="text-xs text-amber-700">Wijs eerst aan waar de straat staat (of het volledige adres).</p>
          )}
        </Card>
      )}

      {/* ── Stap 3: controleren ── */}
      {stap === 2 && raster && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">Controleren</h3>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "Regels", n: sam.totaal, kleur: "text-ink-900", Icon: Table2 },
              { label: "Klaar om te importeren", n: sam.goed, kleur: "text-green-700", Icon: Check },
              { label: "Met een fout", n: sam.metFout, kleur: sam.metFout ? "text-red-700" : "text-ink-400", Icon: AlertTriangle },
              { label: "Dubbel", n: sam.dubbel + sam.bestaatAl, kleur: sam.dubbel + sam.bestaatAl ? "text-amber-700" : "text-ink-400", Icon: Copy },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-ink-200 bg-white px-3 py-2">
                <div className={`flex items-center gap-1.5 text-lg font-bold ${k.kleur}`}><k.Icon className="h-4 w-4" />{k.n}</div>
                <div className="text-[11px] text-ink-500">{k.label}</div>
              </div>
            ))}
          </div>

          {(sam.dubbel > 0 || sam.bestaatAl > 0) && (
            <label className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <input type="checkbox" checked={slaDubbeleOver} onChange={(e) => setSlaDubbeleOver(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                Dubbele adressen overslaan
                <span className="block text-xs text-amber-800">
                  {sam.dubbel > 0 && `${sam.dubbel} ${sam.dubbel === 1 ? "komt" : "komen"} twee keer in het bestand voor. `}
                  {sam.bestaatAl > 0 && `${sam.bestaatAl} ${sam.bestaatAl === 1 ? "staat" : "staan"} al in deze map. `}
                  Zet dit uit als je ze tóch allemaal wilt toevoegen.
                </span>
              </span>
            </label>
          )}

          {sam.metFout > 0 && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
              {sam.metFout} {sam.metFout === 1 ? "regel wordt" : "regels worden"} niet geïmporteerd omdat er verplichte gegevens
              ontbreken of niet kloppen. Los ze op in het bestand en importeer opnieuw, of ga door zonder deze regels.
            </div>
          )}

          <div className="max-h-72 overflow-auto rounded-lg border border-ink-200">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 bg-ink-50">
                <tr className="text-[11px] uppercase tracking-wide text-ink-500">
                  <th className="p-2">Regel</th><th className="p-2">Adres</th><th className="p-2">Postcode / plaats</th><th className="p-2">Opmerking</th>
                </tr>
              </thead>
              <tbody>
                {rijen.map((r) => {
                  const blok = r.fouten.length > 0;
                  const let_op = !blok && (r.dubbelInBestand || r.bestaatAl);
                  return (
                    <tr key={r.bron} className={`border-t border-ink-100 ${blok ? "bg-red-50" : let_op ? "bg-amber-50" : ""}`}>
                      <td className="p-2 text-ink-400">{r.bron}</td>
                      <td className="p-2 font-medium text-ink-800">{`${r.straat} ${r.huisnummer}${r.toevoeging}`.trim() || "—"}</td>
                      <td className="p-2 text-ink-600">{[r.postcode, r.plaats].filter(Boolean).join(" ") || "—"}</td>
                      <td className={`p-2 ${blok ? "font-semibold text-red-700" : "text-amber-700"}`}>
                        {[...r.fouten, ...r.waarschuwingen].join("; ")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-ink-100 pt-3">
            <button type="button" onClick={() => setStap(1)} className={knopKlein}>
              <ArrowLeft className="h-3.5 w-3.5" /> Klopt er iets niet? Kolommen aanpassen
            </button>
            <button
              type="button"
              disabled={teImporteren.length === 0}
              onClick={() => onKlaar(teImporteren, bestandsnaam)}
              className={knopPrimair}
            >
              <Check className="h-4 w-4" /> {teImporteren.length} {teImporteren.length === 1 ? "adres" : "adressen"} importeren
            </button>
          </div>
          {teImporteren.length === 0 && (
            <p className="text-xs text-red-700">Er blijft geen enkele bruikbare regel over. Controleer de kolommen of het bestand.</p>
          )}
        </Card>
      )}
    </div>
  );
}

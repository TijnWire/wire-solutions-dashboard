import { useState } from "react";
import { Plus, ArrowLeft, Trash2, Upload, MessageSquare, Send, Check, Copy, Cable, ChevronRight, Phone, MapPin } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { BUURT_SOORTEN, BUURT_SOORT_KORT, legeBuurtAdres, type Buurtaanpak as BuurtaanpakT, type BuurtAdres } from "../lib/types";
import { parseKlantafspraaklijst, whatsappBevestiging, groepeerPerStraat, smsHerinneringTekst, smsLink } from "../lib/buurtaanpak";

const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const klein = "rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400";
const nu = () => new Date().toISOString();

// Excel-cel → tekst (datum als ISO yyyy-mm-dd).
function celTekst(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") {
    const o = v as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (o.richText) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
}

export function Buurtaanpak() {
  const { buurtaanpak, addBuurtaanpak, currentUser } = useApp();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const [selId, setSelId] = useState<string | null>(null);
  const [nieuw, setNieuw] = useState(false);
  const [naam, setNaam] = useState("");
  const [regio, setRegio] = useState("");

  const gekozen = buurtaanpak.find((b) => b.id === selId);
  if (gekozen) return <Detail project={gekozen} onTerug={() => setSelId(null)} isLeiding={isLeiding} />;

  const maak = () => {
    if (!naam.trim()) return;
    const id = addBuurtaanpak({ aangemaakt: nu(), naam: naam.trim(), regio: regio.trim(), opdrachtgever: "Stedin / FUES", adressen: [] });
    setNaam(""); setRegio(""); setNieuw(false); setSelId(id);
  };

  // Voor werknemers alleen de aan hen toegewezen buurtaanpakken
  const zichtbaar = isLeiding ? buurtaanpak : buurtaanpak.filter((b) => b.toegewezenAan === currentUser?.id);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Buurtaanpak</h2>
          <p className="text-sm text-ink-500">Wijkplanning van de opdrachtgever (Stedin / FUES) omzetten naar afspraken — per straat, met bevestiging.</p>
        </div>
        {isLeiding && !nieuw && (
          <button type="button" onClick={() => setNieuw(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe buurtaanpak
          </button>
        )}
      </div>

      {nieuw && (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-bold text-ink-900">Nieuwe buurtaanpak</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Naam (bijv. Buurtaanpak Klaverruiter)" className={veld} />
            <input value={regio} onChange={(e) => setRegio(e.target.value)} placeholder="Wijk / plaats" className={veld} />
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={maak} disabled={!naam.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Aanmaken</button>
            <button type="button" onClick={() => setNieuw(false)} className="rounded-lg px-3 py-2 text-sm text-ink-500 hover:bg-ink-50">Annuleer</button>
          </div>
        </Card>
      )}

      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <Cable className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">{isLeiding ? "Nog geen buurtaanpak. Maak er een en importeer de planning-Excel van de opdrachtgever." : "Je hebt nog geen buurtaanpak toegewezen gekregen."}</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {zichtbaar.map((b) => {
            const bevestigd = b.adressen.filter((a) => a.bevestigd).length;
            const uitgevoerd = b.adressen.filter((a) => a.uitgevoerd).length;
            return (
              <button key={b.id} type="button" onClick={() => setSelId(b.id)} className="flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-card transition-all hover:border-brand-300 hover:shadow-cardhover">
                <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><Cable className="h-5 w-5" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-ink-900">{b.naam}</span>
                    {b.boekhouding === "gefactureerd" ? <Badge tone="green">Gefactureerd</Badge> : b.boekhouding === "te_factureren" ? <Badge tone="indigo">Bij boekhouding</Badge> : b.afgerondOp ? <Badge tone="amber">Afgerond</Badge> : null}
                  </div>
                  <div className="truncate text-xs text-ink-500">{[b.regio, b.opdrachtgever, `${b.adressen.length} adressen`].filter(Boolean).join(" · ")} · {bevestigd} bevestigd · {uitgevoerd} uitgevoerd</div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ project, onTerug, isLeiding }: { project: BuurtaanpakT; onTerug: () => void; isLeiding: boolean }) {
  const { updateBuurtaanpak, deleteBuurtaanpak, users, bedrijf } = useApp();
  const [verwijder, setVerwijder] = useState(false);
  const [importFout, setImportFout] = useState<string | null>(null);
  const [toonWa, setToonWa] = useState(false);

  const setAdres = (id: string, patch: Partial<BuurtAdres>) =>
    updateBuurtaanpak(project.id, { adressen: project.adressen.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  const verwijderAdres = (id: string) => updateBuurtaanpak(project.id, { adressen: project.adressen.filter((a) => a.id !== id) });
  const voegAdresToe = () => updateBuurtaanpak(project.id, { adressen: [...project.adressen, legeBuurtAdres(`m-${Date.now().toString(36)}`)] });

  const importeer = async (file: File | undefined) => {
    if (!file) return;
    setImportFout(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(await file.arrayBuffer());
      const ws = wb.worksheets[0];
      const rijen: string[][] = [];
      ws.eachRow((row) => {
        const cols: string[] = [];
        for (let c = 1; c <= 11; c++) cols.push(celTekst(row.getCell(c).value));
        rijen.push(cols);
      });
      const adressen = parseKlantafspraaklijst(rijen);
      if (adressen.length === 0) { setImportFout("Geen adressen herkend — controleer of het de Klantafspraaklijst is."); return; }
      updateBuurtaanpak(project.id, { adressen });
    } catch {
      setImportFout("Kon het Excel-bestand niet lezen.");
    }
  };

  const groepen = groepeerPerStraat(project.adressen);
  const waTekst = whatsappBevestiging(project.adressen);
  const bevestigd = project.adressen.filter((a) => a.bevestigd).length;
  const uitgevoerd = project.adressen.filter((a) => a.uitgevoerd).length;

  return (
    <div className="space-y-5">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar buurtaanpak
      </button>

      {/* Kop */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">{project.naam}</h2>
          <p className="text-sm text-ink-500">{[project.regio, project.opdrachtgever].filter(Boolean).join(" · ")} · {project.adressen.length} adressen · {bevestigd} bevestigd · {uitgevoerd} uitgevoerd</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setVerwijder(true)} className="inline-flex items-center gap-1.5 text-sm font-medium text-red-500 hover:text-red-700"><Trash2 className="h-4 w-4" /> Verwijderen</button>
        )}
      </div>

      {isLeiding && (
        <Card className="space-y-3 p-4">
          {/* Toewijzen + import + boekhouding */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">Uitvoerder (werknemer)</label>
              <Keuze value={project.toegewezenAan ?? ""} onChange={(w) => updateBuurtaanpak(project.id, { toegewezenAan: w || undefined })} opties={[{ waarde: "", label: "— Nog niet toewijzen —" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Uitvoerder" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">Opdrachtgever</label>
              <input value={project.opdrachtgever} onChange={(e) => updateBuurtaanpak(project.id, { opdrachtgever: e.target.value })} className={veld} />
            </div>
          </div>

          {/* Excel-import */}
          <div className="rounded-xl border border-dashed border-ink-300 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm text-ink-600">
                <span className="font-semibold text-ink-900">Planning importeren</span> — upload de Klantafspraaklijst (Excel) van de opdrachtgever.
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-ink-800 px-3 py-2 text-sm font-semibold text-white hover:bg-ink-900">
                <Upload className="h-4 w-4" /> Excel kiezen
                <input type="file" accept=".xlsx,.xls" title="Excel-bestand kiezen" className="hidden" onChange={(e) => importeer(e.target.files?.[0])} />
              </label>
            </div>
            {importFout && <p className="mt-2 text-xs font-medium text-red-600">{importFout}</p>}
            <p className="mt-1 text-xs text-ink-400">De adressen worden automatisch per straat gesorteerd (straat maar 1× open). Hele-dag (08:00–16:00) en korte (tot 09:30) werkzaamheden worden herkend.</p>
          </div>

          {/* PD-nummer + boekhouding (zelfde stappen als een project) */}
          <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
            <span className="text-xs font-semibold text-ink-500">PD-nummer</span>
            <input value={project.pdNummer ?? ""} onChange={(e) => updateBuurtaanpak(project.id, { pdNummer: e.target.value })} placeholder="bijv. PD153335" className="w-40 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-medium text-ink-800 outline-none focus:border-brand-400" />
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {project.boekhouding === "gefactureerd" ? (
                <>
                  <Badge tone="green">Gefactureerd ✓</Badge>
                  <button type="button" onClick={() => updateBuurtaanpak(project.id, { boekhouding: "te_factureren", gefactureerdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">corrigeren</button>
                </>
              ) : project.boekhouding === "te_factureren" ? (
                <>
                  <Badge tone="indigo">Bij boekhouding</Badge>
                  <button type="button" onClick={() => updateBuurtaanpak(project.id, { boekhouding: undefined, doorgestuurdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">terughalen</button>
                </>
              ) : project.afgerondOp ? (
                <>
                  <Badge tone="amber">Afgerond</Badge>
                  <button type="button" onClick={() => updateBuurtaanpak(project.id, { boekhouding: "te_factureren", doorgestuurdOp: nu() })} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"><Send className="h-3.5 w-3.5" /> Naar boekhouding</button>
                  <button type="button" onClick={() => updateBuurtaanpak(project.id, { afgerondOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">heropenen</button>
                </>
              ) : (
                <button type="button" onClick={() => updateBuurtaanpak(project.id, { afgerondOp: nu() })} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"><Check className="h-3.5 w-3.5" /> Buurtaanpak afronden</button>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* WhatsApp-bevestiging voor de opdrachtgever */}
      {project.adressen.length > 0 && (
        <Card className="p-4">
          <button type="button" onClick={() => setToonWa((o) => !o)} className="flex w-full items-center gap-2 text-left">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600"><MessageSquare className="h-4 w-4" /></span>
            <span className="flex-1">
              <span className="block text-sm font-bold text-ink-900">Bevestiging voor de opdrachtgever (WhatsApp-groep)</span>
              <span className="block text-xs text-ink-500">Per dag, per straat de huisnummers + bijzonderheden — klaar om te plakken.</span>
            </span>
            <ChevronRight className={`h-5 w-5 text-ink-300 transition-transform ${toonWa ? "rotate-90" : ""}`} />
          </button>
          {toonWa && (
            <div className="mt-3 space-y-2">
              <textarea readOnly value={waTekst} rows={Math.min(12, Math.max(3, waTekst.split("\n").length))} className="w-full resize-none rounded-lg border border-ink-200 bg-ink-50/50 px-3 py-2 font-mono text-xs text-ink-800 outline-none" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => navigator.clipboard?.writeText(waTekst)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><Copy className="h-4 w-4" /> Kopiëren</button>
                <a href={`https://wa.me/?text=${encodeURIComponent(waTekst)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"><MessageSquare className="h-4 w-4" /> Openen in WhatsApp</a>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Adressen per straat */}
      {project.adressen.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">Nog geen adressen. {isLeiding ? "Importeer de planning-Excel hierboven, of voeg handmatig toe." : "De planning is nog niet ingeladen."}</Card>
      ) : (
        <div className="space-y-4">
          {groepen.map((g) => (
            <Card key={g.straat} className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/50 px-4 py-2.5">
                <MapPin className="h-4 w-4 text-brand-600" />
                <span className="text-sm font-bold text-ink-900">{g.straat}</span>
                <span className="text-xs text-ink-400">{g.adressen.length} adres{g.adressen.length === 1 ? "" : "sen"}{g.adressen[0]?.postcode ? ` · ${g.adressen[0].postcode}` : ""}</span>
              </div>
              <div className="divide-y divide-ink-100">
                {g.adressen.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className="w-10 text-sm font-bold text-ink-900">{a.huisnummer || "—"}</span>
                    <div className="w-32"><Keuze size="sm" value={a.soort} onChange={(w) => setAdres(a.id, { soort: w as BuurtAdres["soort"] })} opties={BUURT_SOORTEN.map((s) => ({ waarde: s, label: BUURT_SOORT_KORT[s] }))} title="Soort werkzaamheden" /></div>
                    <div className="w-36"><DatumKiezer value={a.datum} onChange={(iso) => setAdres(a.id, { datum: iso })} placeholder="Datum" /></div>
                    <input value={a.telefoon} onChange={(e) => setAdres(a.id, { telefoon: e.target.value })} placeholder="06-…" className={klein + " w-32"} />
                    <input value={a.bijzonderheid} onChange={(e) => setAdres(a.id, { bijzonderheid: e.target.value })} placeholder="Bijzonderheid (TVM / boorder / sleutel…)" className={klein + " min-w-[10rem] flex-1"} />
                    <label className="inline-flex items-center gap-1 text-xs text-ink-600"><input type="checkbox" aria-label="Bevestigd met bewoner" checked={a.bevestigd} onChange={(e) => setAdres(a.id, { bevestigd: e.target.checked })} className="h-4 w-4 accent-brand-600" /> bevestigd</label>
                    <label className="inline-flex items-center gap-1 text-xs text-ink-600"><input type="checkbox" aria-label="Uitgevoerd" checked={a.uitgevoerd} onChange={(e) => setAdres(a.id, { uitgevoerd: e.target.checked })} className="h-4 w-4 accent-green-600" /> uitgevoerd</label>
                    {a.telefoon.trim() && (
                      <a href={smsLink(a.telefoon, smsHerinneringTekst(a, bedrijf?.naam))} onClick={() => setAdres(a.id, { herinnerVerstuurdOp: nu() })} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1.5 text-xs font-semibold ${a.herinnerVerstuurdOp ? "border-green-200 bg-green-50 text-green-700" : "border-ink-200 text-ink-600 hover:bg-ink-50"}`} title="SMS-herinnering naar bewoner (dag van tevoren)">
                        <Phone className="h-3.5 w-3.5" /> SMS
                      </a>
                    )}
                    {isLeiding && <button type="button" onClick={() => verwijderAdres(a.id)} className="rounded-lg p-1.5 text-ink-300 hover:bg-red-50 hover:text-red-600" title="Adres verwijderen"><Trash2 className="h-4 w-4" /></button>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
          {isLeiding && (
            <button type="button" onClick={voegAdresToe} className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-brand-600 hover:bg-brand-50">
              <Plus className="h-4 w-4" /> Adres handmatig toevoegen
            </button>
          )}
        </div>
      )}

      <Bevestig
        open={verwijder}
        titel="Buurtaanpak verwijderen"
        tekst={`Weet je zeker dat je "${project.naam}" met ${project.adressen.length} adressen wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        onBevestig={() => { deleteBuurtaanpak(project.id); setVerwijder(false); onTerug(); }}
        onAnnuleer={() => setVerwijder(false)}
      />
    </div>
  );
}

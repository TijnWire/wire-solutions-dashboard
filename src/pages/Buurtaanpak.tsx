import { useState, useMemo, useRef, useCallback, memo, Fragment } from "react";
import { Plus, ArrowLeft, Trash2, Upload, MessageSquare, Send, Check, Copy, Cable, ChevronRight, Phone, Search, Download, CalendarDays } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { BUURT_SOORTEN, BUURT_SOORT_KORT, BUURT_SOORT_LABEL, legeBuurtAdres, type Buurtaanpak as BuurtaanpakT, type BuurtAdres } from "../lib/types";
import { parseKlantafspraaklijst, whatsappPerDag, groepeerPerDatum, smsHerinneringTekst, smsLink, datumLabelNL } from "../lib/buurtaanpak";

const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const klein = "rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400";
const nu = () => new Date().toISOString();

// Levenscyclus van een buurtaanpak (zelfde stijl als Brieven & Routes).
const STAPPEN = ["nieuw", "toegewezen", "afgerond", "boekhouding", "gefactureerd"] as const;
type BuurtStap = (typeof STAPPEN)[number];
const STAP_LABEL: Record<BuurtStap, string> = { nieuw: "Aangemaakt", toegewezen: "Bij werknemer", afgerond: "Afgerond", boekhouding: "Bij boekhouding", gefactureerd: "Gefactureerd" };
const STAP_TONE: Record<BuurtStap, string> = { nieuw: "slate", toegewezen: "amber", afgerond: "amber", boekhouding: "indigo", gefactureerd: "green" };
function buurtStap(b: BuurtaanpakT): BuurtStap {
  if (b.boekhouding === "gefactureerd") return "gefactureerd";
  if (b.boekhouding === "te_factureren") return "boekhouding";
  if (b.afgerondOp) return "afgerond";
  if (b.toegewezenAan) return "toegewezen";
  return "nieuw";
}

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

// Leest een Klantafspraaklijst (Excel) in en geeft de herkende adressen terug.
async function leesExcelAdressen(file: File): Promise<BuurtAdres[]> {
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
  return parseKlantafspraaklijst(rijen);
}

const DAGEN_NL = ["zondag", "maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
function dagNaam(iso: string): string {
  const [j, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!j || !m || !d) return "";
  const n = DAGEN_NL[new Date(Date.UTC(j, m - 1, d)).getUTCDay()];
  return n.charAt(0).toUpperCase() + n.slice(1);
}

function triggerDownload(blob: Blob, naam: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = naam;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Alle adressen (import + handmatig) naar een Excel-bestand — zo komen de toegevoegde adressen
// ook in de planning-Excel terecht. Gesorteerd op datum, dan straat, dan huisnummer.
async function exporteerNaarExcel(project: BuurtaanpakT) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Adressen");
  ws.columns = [
    { header: "Dag", key: "dag", width: 12 },
    { header: "Datum", key: "datum", width: 12 },
    { header: "Straat", key: "straat", width: 22 },
    { header: "Huisnummer", key: "huisnummer", width: 12 },
    { header: "Postcode", key: "postcode", width: 10 },
    { header: "Soort werkzaamheden", key: "soort", width: 22 },
    { header: "Telefoonnummer", key: "telefoon", width: 16 },
    { header: "Bijzonderheid", key: "bijzonderheid", width: 30 },
    { header: "Bevestigd", key: "bevestigd", width: 10 },
    { header: "Uitgevoerd", key: "uitgevoerd", width: 10 },
    { header: "Toegevoegd", key: "toegevoegd", width: 12 },
  ];
  ws.getRow(1).font = { bold: true };
  const gesorteerd = [...project.adressen].sort((a, b) =>
    (a.datum || "9999").localeCompare(b.datum || "9999") || a.straat.localeCompare(b.straat) || (parseInt(a.huisnummer) || 0) - (parseInt(b.huisnummer) || 0)
  );
  for (const a of gesorteerd) {
    ws.addRow({
      dag: dagNaam(a.datum),
      datum: a.datum,
      straat: a.straat,
      huisnummer: a.huisnummer,
      postcode: a.postcode,
      soort: BUURT_SOORT_LABEL[a.soort],
      telefoon: a.telefoon,
      bijzonderheid: a.bijzonderheid,
      bevestigd: a.bevestigd ? "JA" : "",
      uitgevoerd: a.uitgevoerd ? "JA" : "",
      toegevoegd: a.handmatig ? "handmatig" : "",
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  const naam = `${(project.naam || "buurtaanpak").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "")}_adressen.xlsx`;
  triggerDownload(new Blob([buf as BlobPart], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), naam);
}

// Projectnaam afleiden uit de bestandsnaam, bv. "Klantafspraaklijst bruidsluier.xlsx" -> "Bruidsluier".
function projectNaamVanBestand(bestand: string): string {
  const n = bestand.replace(/\.[^.]+$/, "").replace(/klantafspraaklijst/i, "").trim();
  const basis = n || bestand.replace(/\.[^.]+$/, "");
  return basis ? basis.charAt(0).toUpperCase() + basis.slice(1) : "Buurtaanpak";
}

export function Buurtaanpak({ initieelId }: { initieelId?: string }) {
  const { buurtaanpak, addBuurtaanpak, currentUser } = useApp();
  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const [selId, setSelId] = useState<string | null>(initieelId ?? null);
  const [nieuw, setNieuw] = useState(false);
  const [naam, setNaam] = useState("");
  const [regio, setRegio] = useState("");
  const [importBezig, setImportBezig] = useState(false);
  const [importFout, setImportFout] = useState<string | null>(null);

  const gekozen = buurtaanpak.find((b) => b.id === selId);
  if (gekozen) return <Detail project={gekozen} onTerug={() => setSelId(null)} isLeiding={isLeiding} />;

  const maak = () => {
    if (!naam.trim()) return;
    const id = addBuurtaanpak({ aangemaakt: nu(), naam: naam.trim(), regio: regio.trim(), opdrachtgever: "Stedin / FUES", adressen: [] });
    setNaam(""); setRegio(""); setNieuw(false); setSelId(id);
  };

  // Excel uploaden → analyseren → meteen een nieuw buurtaanpak-project ervan maken.
  const importeerNieuw = async (file?: File) => {
    if (!file) return;
    setImportBezig(true); setImportFout(null);
    try {
      const adressen = await leesExcelAdressen(file);
      if (!adressen.length) { setImportFout("Geen adressen herkend — is dit de Klantafspraaklijst (Excel)?"); return; }
      const id = addBuurtaanpak({ aangemaakt: nu(), naam: projectNaamVanBestand(file.name), regio: "", opdrachtgever: "Stedin / FUES", adressen });
      setSelId(id);
    } catch {
      setImportFout("Kon het Excel-bestand niet lezen.");
    } finally {
      setImportBezig(false);
    }
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
        {isLeiding && (
          <div className="flex flex-wrap items-center gap-2">
            <label className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 ${importBezig ? "pointer-events-none opacity-60" : ""}`}>
              <Upload className="h-4 w-4" /> {importBezig ? "Bezig met inlezen…" : "Excel importeren → project"}
              <input type="file" accept=".xlsx,.xls" title="Klantafspraaklijst (Excel)" className="hidden" disabled={importBezig} onChange={(e) => importeerNieuw(e.target.files?.[0])} />
            </label>
            {!nieuw && (
              <button type="button" onClick={() => setNieuw(true)} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
                <Plus className="h-4 w-4" /> Leeg project
              </button>
            )}
          </div>
        )}
      </div>
      {importFout && <p className="-mt-2 text-sm font-medium text-red-600">{importFout}</p>}

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

// Eén adresregel — gememoiseerd zodat bij 700+ adressen alleen de gewijzigde regel hertekent (geen lag).
const BuurtAdresRij = memo(function BuurtAdresRij({ adres: a, onPatch, onVerwijder, isLeiding, afspraakmaker }: {
  adres: BuurtAdres;
  onPatch: (id: string, patch: Partial<BuurtAdres>) => void;
  onVerwijder: (id: string) => void;
  isLeiding: boolean;
  afspraakmaker?: string;
}) {
  // SMS is "aangemaakt" zodra de afspraak bevestigd is; versturen kan zodra er een telefoonnummer is.
  const smsKlaar = a.bevestigd && a.telefoon.trim().length > 0;
  return (
    <div className="flex flex-col gap-2 px-3 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2 sm:py-2">
      {/* Status-badge + straat + huisnummer + soort */}
      <div className="flex items-center gap-2 sm:contents">
        <span title={a.handmatig ? "Handmatig toegevoegd" : undefined} className={`h-3 w-3 shrink-0 rounded-full ${a.uitgevoerd ? "bg-green-500" : a.bevestigd ? "bg-green-300" : "bg-ink-300"} ${a.handmatig ? "ring-2 ring-brand-400" : ""}`} />
        <input value={a.straat} onChange={(e) => onPatch(a.id, { straat: e.target.value })} placeholder="Straat" className={klein + " min-w-0 flex-1 font-medium text-ink-800 sm:w-40 sm:flex-none"} />
        <input value={a.huisnummer} onChange={(e) => onPatch(a.id, { huisnummer: e.target.value })} placeholder="nr" inputMode="numeric" className={klein + " w-14 shrink-0 text-center font-semibold"} />
        <div className="w-28 shrink-0 sm:w-32"><Keuze size="sm" value={a.soort} onChange={(w) => onPatch(a.id, { soort: w as BuurtAdres["soort"] })} opties={BUURT_SOORTEN.map((s) => ({ waarde: s, label: BUURT_SOORT_KORT[s] }))} title="Soort werkzaamheden" /></div>
      </div>
      {/* Datum (verplaatsen naar andere dag) + telefoon */}
      <div className="flex items-center gap-2 sm:contents">
        <div className="w-32 shrink-0 sm:w-32"><DatumKiezer compact value={a.datum} onChange={(iso) => onPatch(a.id, { datum: iso })} placeholder="Datum" /></div>
        <input value={a.telefoon} onChange={(e) => onPatch(a.id, { telefoon: e.target.value })} placeholder="06-…" inputMode="tel" className={klein + " min-w-0 flex-1 sm:w-32 sm:flex-none"} />
      </div>
      <input value={a.bijzonderheid} onChange={(e) => onPatch(a.id, { bijzonderheid: e.target.value })} placeholder="Bijzonderheid (TVM / boorder / sleutel…)" className={klein + " min-w-0 flex-1 sm:max-w-[22rem]"} />
      {/* Bevestigd / uitgevoerd / SMS / verwijder */}
      <div className="flex flex-wrap items-center gap-2 sm:ml-auto sm:flex-nowrap">
        <label className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold sm:w-28 sm:py-1.5 ${a.bevestigd ? "border-green-300 bg-green-50 text-green-700" : "border-ink-200 text-ink-500 hover:bg-ink-50"}`} title="Afspraak bevestigd met de bewoner — maakt de SMS klaar">
          <input type="checkbox" aria-label="Bevestigd met bewoner" checked={a.bevestigd} onChange={(e) => onPatch(a.id, { bevestigd: e.target.checked })} className="h-3.5 w-3.5 accent-green-600" /> Bevestigd
        </label>
        <label className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-2.5 py-2 text-xs font-semibold sm:w-28 sm:py-1.5 ${a.uitgevoerd ? "border-brand-300 bg-brand-50 text-brand-700" : "border-ink-200 text-ink-500 hover:bg-ink-50"}`} title="Werk uitgevoerd">
          <input type="checkbox" aria-label="Uitgevoerd" checked={a.uitgevoerd} onChange={(e) => onPatch(a.id, { uitgevoerd: e.target.checked })} className="h-3.5 w-3.5 accent-brand-600" /> Uitgevoerd
        </label>
        {smsKlaar ? (
          <a href={smsLink(a.telefoon, smsHerinneringTekst(a, afspraakmaker))} onClick={() => onPatch(a.id, { herinnerVerstuurdOp: nu() })} className={`flex items-center justify-center gap-1 rounded-lg border px-3 py-2 text-xs font-semibold sm:w-16 sm:px-2 sm:py-1.5 ${a.herinnerVerstuurdOp ? "border-green-200 bg-green-50 text-green-700" : "border-brand-300 bg-brand-50 text-brand-700 hover:bg-brand-100"}`} title={a.herinnerVerstuurdOp ? "SMS verstuurd — opnieuw versturen" : "Stuur de SMS-herinnering (dag van tevoren)"}>
            <Phone className="h-3.5 w-3.5" /> SMS
          </a>
        ) : (
          <span className="hidden sm:block sm:w-16" aria-hidden="true" />
        )}
        {isLeiding && <button type="button" onClick={() => onVerwijder(a.id)} className="shrink-0 rounded-lg p-2.5 text-ink-300 hover:bg-red-50 hover:text-red-600 sm:p-1.5" title="Adres verwijderen"><Trash2 className="h-4 w-4" /></button>}
      </div>
    </div>
  );
});

function Detail({ project, onTerug, isLeiding }: { project: BuurtaanpakT; onTerug: () => void; isLeiding: boolean }) {
  const { updateBuurtaanpak, deleteBuurtaanpak, users, currentUser } = useApp();
  const [verwijder, setVerwijder] = useState(false);
  const [bevestigAfronden, setBevestigAfronden] = useState(false);
  const [importFout, setImportFout] = useState<string | null>(null);
  const [toonWa, setToonWa] = useState(false);
  const [zoek, setZoek] = useState("");
  const [draft, setDraft] = useState<BuurtAdres | null>(null);
  const [exportBezig, setExportBezig] = useState(false);

  // Stabiele callbacks (via refs) zodat de gememoiseerde adresregels niet onnodig hertekenen.
  const projectRef = useRef(project); projectRef.current = project;
  const updateRef = useRef(updateBuurtaanpak); updateRef.current = updateBuurtaanpak;
  const patchAdres = useCallback((id: string, patch: Partial<BuurtAdres>) => {
    const p = projectRef.current;
    updateRef.current(p.id, { adressen: p.adressen.map((a) => (a.id === id ? { ...a, ...patch } : a)) });
  }, []);
  const verwijderAdres = useCallback((id: string) => {
    const p = projectRef.current;
    updateRef.current(p.id, { adressen: p.adressen.filter((a) => a.id !== id) });
  }, []);
  const startToevoegen = () => setDraft({ ...legeBuurtAdres(`m-${Date.now().toString(36)}`), handmatig: true });
  const startToevoegenOpDatum = (datum: string) => { setDraft({ ...legeBuurtAdres(`m-${Date.now().toString(36)}`), handmatig: true, datum }); setOpenDagen((prev) => new Set(prev).add(datum)); };
  const setDraftVeld = (patch: Partial<BuurtAdres>) => setDraft((d) => (d ? { ...d, ...patch } : d));
  const bewaarToevoegen = () => {
    if (!draft || !draft.straat.trim()) return;
    updateBuurtaanpak(project.id, { adressen: [...project.adressen, draft] });
    setDraft(null);
  };
  const exporteer = async () => { setExportBezig(true); try { await exporteerNaarExcel(project); } finally { setExportBezig(false); } };
  // Het invul-formulier voor een nieuw adres — wordt zowel inline in een dag-groep als onderaan getoond.
  const renderAdresForm = () => {
    if (!draft) return null;
    return (
      <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-3">
        <div className="grid gap-2 sm:grid-cols-3">
          <input autoFocus value={draft.straat} onChange={(e) => setDraftVeld({ straat: e.target.value })} placeholder="Straat" className={veld} />
          <input value={draft.huisnummer} onChange={(e) => setDraftVeld({ huisnummer: e.target.value })} placeholder="Huisnummer" className={veld} />
          <input value={draft.postcode} onChange={(e) => setDraftVeld({ postcode: e.target.value })} placeholder="Postcode" className={veld} />
          <Keuze value={draft.soort} onChange={(w) => setDraftVeld({ soort: w as BuurtAdres["soort"] })} opties={BUURT_SOORTEN.map((s) => ({ waarde: s, label: BUURT_SOORT_KORT[s] }))} title="Soort werkzaamheden" />
          <DatumKiezer compact value={draft.datum} onChange={(iso) => setDraftVeld({ datum: iso })} placeholder="Datum" />
          <input value={draft.telefoon} onChange={(e) => setDraftVeld({ telefoon: e.target.value })} placeholder="06-…" inputMode="tel" className={veld} />
        </div>
        <input value={draft.bijzonderheid} onChange={(e) => setDraftVeld({ bijzonderheid: e.target.value })} placeholder="Bijzonderheid (TVM / boorder / sleutel…)" className={veld} />
        <div className="flex gap-2">
          <button type="button" onClick={bewaarToevoegen} disabled={!draft.straat.trim()} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-40">Adres toevoegen</button>
          <button type="button" onClick={() => setDraft(null)} className="rounded-lg px-3 py-2 text-sm text-ink-500 hover:bg-ink-50">Annuleer</button>
        </div>
      </div>
    );
  };

  const importeer = async (file: File | undefined) => {
    if (!file) return;
    setImportFout(null);
    try {
      const adressen = await leesExcelAdressen(file);
      if (adressen.length === 0) { setImportFout("Geen adressen herkend — controleer of het de Klantafspraaklijst is."); return; }
      // Handmatig toegevoegde adressen behouden — die staan niet in de Excel maar mogen niet verloren gaan.
      const handmatige = projectRef.current.adressen.filter((a) => a.handmatig);
      updateBuurtaanpak(project.id, { adressen: [...adressen, ...handmatige] });
    } catch {
      setImportFout("Kon het Excel-bestand niet lezen.");
    }
  };

  const groepen = useMemo(() => groepeerPerDatum(project.adressen), [project.adressen]);
  const q = zoek.trim().toLowerCase();
  const groepenZichtbaar = useMemo(() => !q
    ? groepen
    : groepen.map((g) => ({ ...g, adressen: g.adressen.filter((a) => `${a.straat} ${a.huisnummer} ${a.postcode} ${a.bijzonderheid} ${a.telefoon}`.toLowerCase().includes(q)) })).filter((g) => g.adressen.length > 0), [groepen, q]);
  // Dag-groepen standaard ingeklapt bij veel dagen — alleen de geopende dag rendert z'n regels (snel, ook bij 700+ adressen).
  const [openDagen, setOpenDagen] = useState<Set<string>>(() => new Set(groepen.length <= 6 ? groepen.map((g) => g.datum) : []));
  const toggleDag = (datum: string) => setOpenDagen((prev) => { const n = new Set(prev); if (n.has(datum)) n.delete(datum); else n.add(datum); return n; });
  const alleUit = groepenZichtbaar.length > 0 && groepenZichtbaar.every((g) => openDagen.has(g.datum));
  // Goedkope tellingen in één pass; de zware WhatsApp-tekst pas opbouwen als het paneel open is.
  const stats = useMemo(() => {
    let bev = 0, uit = 0;
    const datums = new Set<string>();
    for (const a of project.adressen) { if (a.bevestigd) bev++; if (a.uitgevoerd) uit++; if (a.datum) datums.add(a.datum); }
    return { bevestigd: bev, uitgevoerd: uit, datums };
  }, [project.adressen]);
  const aantalOnverstuurd = useMemo(() => {
    let n = 0;
    for (const d of stats.datums) if (!project.whatsappVerstuurd?.[d]) n++;
    return n;
  }, [stats, project.whatsappVerstuurd]);
  const whatsappDagen = useMemo(() => (toonWa ? whatsappPerDag(project.adressen) : []), [toonWa, project.adressen]);
  const markeerVerstuurd = (datum: string) => updateBuurtaanpak(project.id, { whatsappVerstuurd: { ...(project.whatsappVerstuurd ?? {}), [datum]: nu() } });
  const markeerNietVerstuurd = (datum: string) => {
    const v = { ...(project.whatsappVerstuurd ?? {}) };
    delete v[datum];
    updateBuurtaanpak(project.id, { whatsappVerstuurd: v });
  };
  const bevestigd = stats.bevestigd;
  const uitgevoerd = stats.uitgevoerd;
  const stap = buurtStap(project);
  const stapIndex = STAPPEN.indexOf(stap);
  const monteur = users.find((u) => u.id === project.toegewezenAan);

  return (
    <div className="space-y-5">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar buurtaanpak
      </button>

      {/* Kop */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-xl font-bold text-ink-900">{project.naam}</h2>
            <Badge tone={STAP_TONE[stap]}>{STAP_LABEL[stap]}</Badge>
          </div>
          <p className="text-sm text-ink-500">{[project.opdrachtgever, project.regio, `${project.adressen.length} adressen`, `${bevestigd} bevestigd`, `${uitgevoerd} uitgevoerd`, monteur?.naam].filter(Boolean).join(" · ")}</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setVerwijder(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Verwijderen</button>
        )}
      </div>

      {/* Levenscyclus — zelfde stappenbalk als Brieven & Routes */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {STAPPEN.map((s, i) => {
            const gedaan = i < stapIndex, isNu = i === stapIndex;
            return (
              <Fragment key={s}>
                <span className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold sm:px-2.5 sm:text-xs ${isNu ? "bg-brand-600 text-white" : gedaan ? "bg-green-100 text-green-700" : "bg-ink-100 text-ink-400"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${isNu ? "bg-white/25 text-white" : gedaan ? "bg-green-500 text-white" : "bg-ink-300 text-white"}`}>{gedaan ? "✓" : i + 1}</span>
                  {STAP_LABEL[s]}
                </span>
                {i < STAPPEN.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
              </Fragment>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          {isLeiding ? (
            <>
              <span className="text-xs font-semibold text-ink-500">PD-nummer</span>
              <input value={project.pdNummer ?? ""} onChange={(e) => updateBuurtaanpak(project.id, { pdNummer: e.target.value })} placeholder="bijv. PD153335" className="w-40 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm font-medium text-ink-800 outline-none focus:border-brand-400" />
              <div className="ml-auto flex flex-wrap items-center gap-2">
                {project.boekhouding === "gefactureerd" ? (
                  <button type="button" onClick={() => updateBuurtaanpak(project.id, { boekhouding: "te_factureren", gefactureerdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">corrigeren</button>
                ) : project.boekhouding === "te_factureren" ? (
                  <button type="button" onClick={() => updateBuurtaanpak(project.id, { boekhouding: undefined, doorgestuurdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">terughalen naar afgerond</button>
                ) : project.afgerondOp ? (
                  <>
                    <button type="button" onClick={() => updateBuurtaanpak(project.id, { boekhouding: "te_factureren", doorgestuurdOp: nu() })} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700 hover:bg-green-100"><Send className="h-3.5 w-3.5" /> Naar boekhouding</button>
                    <button type="button" onClick={() => updateBuurtaanpak(project.id, { afgerondOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">heropenen</button>
                  </>
                ) : (
                  <button type="button" onClick={() => setBevestigAfronden(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700 hover:bg-brand-100"><Check className="h-3.5 w-3.5" /> Buurtaanpak afronden</button>
                )}
              </div>
            </>
          ) : (
            <p className="text-sm text-ink-600">
              {stap === "toegewezen" ? "Toegewezen aan jou — voer de adressen uit en vink ze af."
                : stap === "afgerond" ? "Afgerond — wordt verder verwerkt door de leiding."
                : stap === "boekhouding" ? "Doorgestuurd naar de boekhouding."
                : stap === "gefactureerd" ? "Gefactureerd en afgerond."
                : "Nog niet toegewezen."}
            </p>
          )}
        </div>
      </Card>

      {isLeiding && (
        <Card className="space-y-3 p-4">
          {/* Naam + toewijzen + opdrachtgever */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">Projectnaam</label>
              <input value={project.naam} onChange={(e) => updateBuurtaanpak(project.id, { naam: e.target.value })} placeholder="Naam van de buurtaanpak" className={veld} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-ink-600">Wijk / regio</label>
              <input value={project.regio} onChange={(e) => updateBuurtaanpak(project.id, { regio: e.target.value })} placeholder="Wijk / plaats" className={veld} />
            </div>
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
        </Card>
      )}

      {/* WhatsApp-bevestiging voor de opdrachtgever */}
      {project.adressen.length > 0 && (
        <Card className="p-4">
          <button type="button" onClick={() => setToonWa((o) => !o)} className="flex w-full items-center gap-2 text-left">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-green-50 text-green-600"><MessageSquare className="h-4 w-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-ink-900">Bevestiging naar de opdrachtgever (WhatsApp-groep)</span>
              <span className="block text-xs text-ink-500">Verstuur per dag — verstuurde dagen worden gemarkeerd, dus je stuurt nooit dubbel.</span>
            </span>
            {aantalOnverstuurd > 0 && <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">{aantalOnverstuurd} te versturen</span>}
            <ChevronRight className={`h-5 w-5 shrink-0 text-ink-300 transition-transform ${toonWa ? "rotate-90" : ""}`} />
          </button>
          {toonWa && (
            <div className="mt-3 space-y-2">
              {whatsappDagen.length === 0 ? (
                <p className="text-sm text-ink-400">Nog geen adressen met een datum.</p>
              ) : whatsappDagen.map((d) => {
                const verstuurd = project.whatsappVerstuurd?.[d.datum];
                return (
                  <div key={d.datum} className={`rounded-xl border p-3 ${verstuurd ? "border-green-200 bg-green-50/40" : "border-ink-200"}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ink-900">{datumLabelNL(d.datum)}</span>
                        <span className="text-xs text-ink-400">{d.aantal} adres{d.aantal === 1 ? "" : "sen"}</span>
                        {verstuurd && <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700"><Check className="h-3 w-3" /> Verstuurd</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => navigator.clipboard?.writeText(d.tekst)} className="rounded-lg border border-ink-200 p-1.5 text-ink-500 hover:bg-ink-50" title="Kopiëren"><Copy className="h-4 w-4" /></button>
                        {verstuurd ? (
                          <button type="button" onClick={() => markeerNietVerstuurd(d.datum)} className="text-xs font-medium text-ink-400 hover:text-ink-600" title="Toch nog niet verstuurd? Markeer als niet-verstuurd">ongedaan</button>
                        ) : (
                          <a href={`https://wa.me/?text=${encodeURIComponent(d.tekst)}`} target="_blank" rel="noopener noreferrer" onClick={() => markeerVerstuurd(d.datum)} className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700"><MessageSquare className="h-4 w-4" /> Versturen</a>
                        )}
                      </div>
                    </div>
                    <pre className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-white/70 px-2.5 py-1.5 font-sans text-xs text-ink-700">{d.tekst}</pre>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* Adressen per straat */}
      {project.adressen.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">Nog geen adressen. {isLeiding ? "Importeer de planning-Excel hierboven, of voeg handmatig toe." : "De planning is nog niet ingeladen."}</Card>
      ) : (
        <div className="space-y-3">
          {/* Zoekbalk */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op straat, huisnummer, postcode of bijzonderheid…" className="w-full rounded-xl border border-ink-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </div>

          {groepenZichtbaar.length === 0 ? (
            <Card className="p-6 text-center text-sm text-ink-400">Geen adressen gevonden voor “{zoek}”.</Card>
          ) : (
            <>
              {!q && groepenZichtbaar.length > 1 && (
                <div className="flex items-center justify-between px-1 text-xs text-ink-400">
                  <span>{groepenZichtbaar.length} dagen · tik een dag om te openen</span>
                  <button type="button" onClick={() => setOpenDagen(alleUit ? new Set() : new Set(groepenZichtbaar.map((g) => g.datum)))} className="font-semibold text-brand-600 hover:underline">
                    {alleUit ? "Alles inklappen" : "Alles uitklappen"}
                  </button>
                </div>
              )}
              {groepenZichtbaar.map((g) => {
                const open = q ? true : openDagen.has(g.datum);
                const gUit = g.adressen.filter((a) => a.uitgevoerd).length;
                const gBev = g.adressen.filter((a) => a.bevestigd).length;
                const straten = [...new Set(g.adressen.map((a) => a.straat).filter(Boolean))].join(", ");
                return (
                  <Card key={g.datum || "zonder"} className="overflow-hidden">
                    <div className="flex w-full items-center gap-2 bg-ink-50/50 px-4 py-2.5">
                      <button type="button" onClick={() => { if (!q) toggleDag(g.datum); }} className="flex min-w-0 flex-1 items-center gap-2 text-left hover:opacity-80">
                        <CalendarDays className="h-4 w-4 shrink-0 text-brand-600" />
                        <span className="shrink-0 text-sm font-bold text-ink-900">{g.label}</span>
                        <span className="hidden min-w-0 truncate text-xs text-ink-400 sm:inline">· {g.adressen.length} adres{g.adressen.length === 1 ? "" : "sen"}{straten ? ` · ${straten}` : ""}</span>
                      </button>
                      <span className="flex shrink-0 items-center gap-1.5">
                        <span className="text-xs text-ink-400 sm:hidden">{g.adressen.length}×</span>
                        {gUit > 0 && <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-700">{gUit} uitgevoerd</span>}
                        {gBev > 0 && <span className="hidden rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-semibold text-ink-600 sm:inline">{gBev} bevestigd</span>}
                        {isLeiding && g.datum && <button type="button" onClick={() => startToevoegenOpDatum(g.datum)} className="rounded-lg p-1.5 text-brand-600 hover:bg-brand-50" title="Adres toevoegen op deze dag"><Plus className="h-4 w-4" /></button>}
                        {!q && <button type="button" onClick={() => toggleDag(g.datum)} className="rounded-lg p-1 text-ink-300 hover:bg-ink-100" title={open ? "Inklappen" : "Uitklappen"}><ChevronRight className={`h-4 w-4 transition-transform ${open ? "rotate-90" : ""}`} /></button>}
                      </span>
                    </div>
                    {open && (
                      <div className="divide-y divide-ink-100 border-t border-ink-100">
                        {g.adressen.map((a) => (
                          <BuurtAdresRij key={a.id} adres={a} onPatch={patchAdres} onVerwijder={verwijderAdres} isLeiding={isLeiding} afspraakmaker={currentUser?.naam} />
                        ))}
                        {draft && draft.datum === g.datum && <div className="bg-brand-50/30 p-3">{renderAdresForm()}</div>}
                      </div>
                    )}
                  </Card>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Adres handmatig toevoegen + export naar Excel (leiding) */}
      {isLeiding && (
        <Card className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => (draft ? setDraft(null) : startToevoegen())} className="inline-flex items-center gap-1.5 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100"><Plus className="h-4 w-4" /> Adres toevoegen</button>
            {project.adressen.length > 0 && (
              <button type="button" onClick={() => void exporteer()} disabled={exportBezig} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:opacity-50"><Download className="h-4 w-4" /> {exportBezig ? "Bezig…" : "Exporteer naar Excel"}</button>
            )}
            <span className="text-xs text-ink-400">Handmatig toegevoegde adressen blijven behouden bij een her-import en staan in de export.</span>
          </div>
          {draft && !draft.datum && renderAdresForm()}
        </Card>
      )}

      <Bevestig
        open={verwijder}
        titel="Buurtaanpak verwijderen"
        tekst={`Weet je zeker dat je "${project.naam}" met ${project.adressen.length} adressen wilt verwijderen? Dit kan niet ongedaan worden gemaakt.`}
        onBevestig={() => { deleteBuurtaanpak(project.id); setVerwijder(false); onTerug(); }}
        onAnnuleer={() => setVerwijder(false)}
      />

      <Bevestig
        open={bevestigAfronden}
        titel="Buurtaanpak afronden"
        tekst={
          project.adressen.length - uitgevoerd > 0
            ? `Let op: er staan nog ${project.adressen.length - uitgevoerd} van de ${project.adressen.length} adressen open (nog niet uitgevoerd). Weet je zeker dat je "${project.naam}" wilt afronden?`
            : `Alle ${project.adressen.length} adressen zijn uitgevoerd. Weet je zeker dat je "${project.naam}" wilt afronden? Daarna kun je 'm doorsturen naar de boekhouding.`
        }
        onBevestig={() => { updateBuurtaanpak(project.id, { afgerondOp: nu() }); setBevestigAfronden(false); }}
        onAnnuleer={() => setBevestigAfronden(false)}
      />
    </div>
  );
}

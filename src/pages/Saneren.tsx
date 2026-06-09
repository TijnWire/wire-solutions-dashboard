import { Fragment, useRef, useState } from "react";
import {
  ArrowLeft, Plus, Recycle, Trash2, MessageCircle, Phone, ChevronRight, ChevronDown,
  X, Check, FileUp, Search, Loader2, Database, Wand2, MapPin, UserPlus, RotateCcw, CalendarClock, Pencil, Send,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { WerknemerKiezer } from "../components/WerknemerKiezer";
import { DatumKiezer } from "../components/DatumKiezer";
import { afleidRegio } from "../lib/regio";
import { waUrl, smsUrl } from "../lib/communicatie";
import { leesStedinPlanning } from "../lib/tauwImport";
import { legeSaneerAdres, TAUW_STATUS_VOLGORDE, TAUW_STATUS_LABEL, type Sanering, type SaneerAdres, type TauwStatus } from "../lib/types";

const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const knopKlein = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";
const knopPrimair = "inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40";
const adresLabel = "mb-1 block text-[11px] font-semibold uppercase tracking-wide text-brand-600";
const STATUS_TONE: Record<TauwStatus, string> = { nieuw: "slate", toegewezen: "amber", ter_controle: "indigo", gecontroleerd: "green", verstuurd: "green" };

const uid = () => Math.random().toString(36).slice(2, 10);
const isISO = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
const isTijd = (t: string) => /^\d{2}:\d{2}$/.test(t);
const wacht = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const datumKort = (iso: string) => { const d = iso.slice(0, 10).split("-"); return d.length === 3 ? `${d[2]}-${d[1]}-${d[0]}` : iso; };
function vandaagISO(): string { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; }
const dezeISO = (offset = 0) => { const t = new Date(); t.setDate(t.getDate() + offset); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const minEenDag = (iso: string) => { const t = new Date(iso + "T00:00:00"); if (isNaN(t.getTime())) return iso; t.setDate(t.getDate() - 1); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
const adresVol = (a: SaneerAdres) => !!(a.straat || a.huisnummer || a.naam || a.telefoon || a.postcode);
const matchtZoek = (a: SaneerAdres, q: string) => !q || `${a.straat} ${a.huisnummer} ${a.postcode} ${a.plaats} ${a.naam} ${a.telefoon}`.toLowerCase().includes(q);
const adresTekst = (a: SaneerAdres) => [`${a.straat} ${a.huisnummer}`.replace(/\s+/g, " ").trim(), `${a.postcode} ${a.plaats}`.replace(/\s+/g, " ").trim()].filter(Boolean).join(", ");
const smsBevestiging = (a: SaneerAdres) => `Beste ${a.naam || "bewoner"}, hierbij de bevestiging van uw afspraak voor de saneringswerkzaamheden op ${datumKort(a.datum)}${a.tijd ? ` om ${a.tijd}` : ""}. Adres: ${adresTekst(a) || `${a.straat} ${a.huisnummer}`.trim()}. Met vriendelijke groet, Wire Solutions.`;

const openAdressen = (s: Sanering) => s.adressen.filter((a) => !a.bevestigd).length;

// ── Groeperen per werkweek (zelfde logica als de TAUW-pagina) ──
const NL_MAANDEN = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
function weekStartISO(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const dag = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - dag);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function weekLabel(maandagISO: string): string {
  const [j, mnd, d] = maandagISO.split("-").map(Number);
  if (!j) return "Zonder datum";
  return `Week van ${d} ${NL_MAANDEN[mnd - 1]} ${j}`;
}
// Peildatum: deadline → vroegste afspraakdatum → aanmaakdatum.
const peilSanering = (s: Sanering) => s.deadline || s.adressen.map((a) => a.datum).filter(isISO).sort()[0] || s.aangemaakt.slice(0, 10);

// ── Scan-animatie tijdens het inlezen ──
type ScanFase = "lezen" | "herkennen" | "klaar";
const SCAN_STAPPEN: { key: ScanFase; label: string }[] = [
  { key: "lezen", label: "Bestand lezen" },
  { key: "herkennen", label: "Adressen herkennen" },
  { key: "klaar", label: "Klaar" },
];
function ScanOverlay({ fase, aantal }: { fase: ScanFase; aantal: number }) {
  const idx = SCAN_STAPPEN.findIndex((s) => s.key === fase);
  const isKlaar = fase === "klaar";
  const pct = Math.round(((idx + 1) / SCAN_STAPPEN.length) * 100);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-cardhover">
        <div className="relative mx-auto mb-5 h-28 w-24 overflow-hidden rounded-lg border-2 border-ink-200 bg-ink-50">
          <div className="space-y-1.5 p-3">
            {[88, 64, 92, 56, 76, 48].map((w, i) => <div key={i} className="h-1.5 rounded-full bg-ink-200" style={{ width: `${w}%` }} />)}
          </div>
          {!isKlaar && <div className="tauw-scan-lijn absolute inset-x-0 top-0"><div className="h-0.5 w-full bg-brand-500 shadow-[0_0_10px_3px] shadow-brand-400/70" /></div>}
          {isKlaar && <div className="absolute inset-0 flex items-center justify-center bg-green-50/85"><Check className="h-10 w-10 text-green-600" /></div>}
        </div>
        <h3 className="text-center text-base font-bold text-ink-900">{isKlaar ? `${aantal} adres${aantal === 1 ? "" : "sen"} ingelezen` : "Het bestand wordt gescand…"}</h3>
        <ul className="mx-auto mt-4 w-max space-y-2">
          {SCAN_STAPPEN.map((s, i) => {
            const gedaan = isKlaar || i < idx;
            const actief = !isKlaar && i === idx;
            return (
              <li key={s.key} className={`flex items-center gap-2.5 text-sm ${gedaan ? "text-ink-500" : actief ? "font-semibold text-ink-900" : "text-ink-300"}`}>
                <span className="flex h-5 w-5 items-center justify-center">
                  {gedaan ? <Check className="h-4 w-4 text-green-600" /> : actief ? <Loader2 className="h-4 w-4 animate-spin text-brand-600" /> : <span className="h-1.5 w-1.5 rounded-full bg-ink-300" />}
                </span>
                {s.label}
              </li>
            );
          })}
        </ul>
        <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${pct}%` }} /></div>
      </div>
    </div>
  );
}

// Meest voorkomende plaats → projectnaam (de wijk/buurt/gemeente).
function projectNaamVan(adressen: SaneerAdres[]): string {
  const tel = new Map<string, number>();
  for (const a of adressen) { const p = a.plaats.trim(); if (p) tel.set(p, (tel.get(p) ?? 0) + 1); }
  const beste = [...tel.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  return beste || "Sanering-project";
}

// Leest een Excel met een staps-gewijze scan-animatie en levert de adressen + een projectnaam.
function useSaneerScan() {
  const [fase, setFase] = useState<ScanFase | null>(null);
  const [aantal, setAantal] = useState(0);
  const [fout, setFout] = useState<string | null>(null);
  const run = async (file: File, onKlaar: (adressen: SaneerAdres[], naam: string) => void) => {
    setFout(null);
    setFase("lezen");
    await wacht(450);
    const r = await leesStedinPlanning(file, "bezoekronde"); // adressenlijst (datum/tijd plant de werknemer zelf)
    if (!r.ok) { setFase(null); setFout(r.fout); return; }
    setFase("herkennen");
    await wacht(650);
    const adressen: SaneerAdres[] = r.rijen.map((rij) => ({
      ...legeSaneerAdres(uid()),
      straat: rij.straat, huisnummer: rij.huisnummer, postcode: rij.postcode, plaats: rij.plaats,
      naam: rij.naam, telefoon: rij.telefoon, notitie: rij.notitie,
    }));
    setAantal(adressen.length);
    setFase("klaar");
    await wacht(800);
    setFase(null);
    onKlaar(adressen, projectNaamVan(adressen));
  };
  return { fase, aantal, fout, setFout, run };
}

// ── Eén adres = één afspraak-balk. Datum/tijd altijd zichtbaar; klap uit voor de rest. ──
function SaneerAdresKaart({ adres, nr, bewerkbaar, magVerwijderen, onChange, onVerwijder }: {
  adres: SaneerAdres; nr: number; bewerkbaar: boolean; magVerwijderen: boolean;
  onChange: (patch: Partial<SaneerAdres>) => void; onVerwijder: () => void;
}) {
  const [open, setOpen] = useState(false);
  const titel = `${adres.straat} ${adres.huisnummer}`.trim() || "Nieuw adres";
  const bericht = `Beste ${adres.naam || "bewoner"}, voor de geplande saneringswerkzaamheden op ${adresTekst(adres) || titel} willen wij graag een afspraak met u maken. Met vriendelijke groet, Wire Solutions.`;
  const tel = adres.telefoon.trim();
  return (
    <div className={`overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-card ${adres.bevestigd ? "border-green-300" : "border-ink-200"}`}>
      <div className={`flex items-center gap-2.5 px-3 py-2.5 ${adres.bevestigd ? "bg-green-50/60" : "bg-brand-50/40"}`}>
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-bold ${adres.bevestigd ? "bg-green-500 text-white" : "bg-brand-500 text-white"}`}>
          {adres.bevestigd ? <Check className="h-4 w-4" /> : nr}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <div className="truncate text-sm font-bold text-ink-900">{titel}</div>
          {(adres.naam || adres.plaats) && <div className="truncate text-xs text-ink-500">{[adres.naam, adres.plaats].filter(Boolean).join(" · ")}</div>}
        </button>
        <label className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors ${adres.bevestigd ? "border-green-300 bg-green-50 text-green-700" : "border-ink-200 bg-white text-ink-500 hover:bg-ink-50"} ${bewerkbaar ? "cursor-pointer" : "pointer-events-none opacity-60"}`} title="Afspraak gemaakt">
          <input type="checkbox" disabled={!bewerkbaar} checked={adres.bevestigd} onChange={(e) => onChange({ bevestigd: e.target.checked })} className="h-4 w-4 accent-green-600" />
          <span className="hidden whitespace-nowrap sm:inline">Afspraak gemaakt</span>
        </label>
        <button type="button" onClick={() => setOpen((o) => !o)} className="rounded-lg p-1.5 text-ink-400 hover:bg-brand-100 hover:text-brand-600" title={open ? "Inklappen" : "Meer gegevens"}><ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} /></button>
        {magVerwijderen && <button type="button" onClick={onVerwijder} className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><X className="h-4 w-4" /></button>}
      </div>

      {/* Altijd zichtbaar: afspraak datum + tijd */}
      <div className="grid grid-cols-2 gap-3 p-3">
        <label className="block">
          <span className={adresLabel}>Datum afspraak</span>
          <DatumKiezer value={isISO(adres.datum) ? adres.datum : ""} onChange={(iso) => onChange({ datum: iso })} disabled={!bewerkbaar} placeholder="Kies datum" />
        </label>
        <label className="block">
          <span className={adresLabel}>Tijd</span>
          <input type="time" disabled={!bewerkbaar} value={isTijd(adres.tijd) ? adres.tijd : ""} onChange={(e) => onChange({ tijd: e.target.value })} className={veld} title="Afspraaktijd" />
        </label>
      </div>

      {open && (
        <div className="space-y-3 border-t border-ink-100 bg-ink-50/50 p-3">
          <div>
            <span className={adresLabel}>Contact met de bewoner</span>
            <div className="flex flex-wrap items-center gap-1.5">
              <a href={tel ? waUrl(tel, bericht) : undefined} target="_blank" rel="noopener noreferrer" className={`inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 ${tel ? "" : "pointer-events-none opacity-40"}`}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
              <a href={tel ? smsUrl(tel, bericht) : undefined} className={`${knopKlein} ${tel ? "" : "pointer-events-none opacity-40"}`}>SMS</a>
              <a href={tel ? `tel:${tel.replace(/\s/g, "")}` : undefined} className={`${knopKlein} ${tel ? "" : "pointer-events-none opacity-40"}`}><Phone className="h-3.5 w-3.5" /> Bellen</a>
            </div>
          </div>
          <div>
            <span className={adresLabel}>Adres & bewoner</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
              <input value={adres.straat} disabled={!bewerkbaar} onChange={(e) => onChange({ straat: e.target.value })} placeholder="Straat" className={`${veld} col-span-2 sm:col-span-5`} />
              <input value={adres.huisnummer} disabled={!bewerkbaar} onChange={(e) => onChange({ huisnummer: e.target.value })} placeholder="Nr" className={`${veld} sm:col-span-2`} />
              <input value={adres.postcode} disabled={!bewerkbaar} onChange={(e) => onChange({ postcode: e.target.value })} placeholder="Postcode" className={`${veld} sm:col-span-2`} />
              <input value={adres.plaats} disabled={!bewerkbaar} onChange={(e) => onChange({ plaats: e.target.value })} placeholder="Plaats" className={`${veld} sm:col-span-3`} />
              <input value={adres.naam} disabled={!bewerkbaar} onChange={(e) => onChange({ naam: e.target.value })} placeholder="Naam bewoner" className={`${veld} col-span-2 sm:col-span-6`} />
              <input value={adres.telefoon} disabled={!bewerkbaar} onChange={(e) => onChange({ telefoon: e.target.value })} placeholder="Telefoon" inputMode="tel" className={`${veld} col-span-2 sm:col-span-6`} />
            </div>
          </div>
          <textarea value={adres.notitie} disabled={!bewerkbaar} onChange={(e) => onChange({ notitie: e.target.value })} rows={2} placeholder="Notitie / bijzonderheden" className={`${veld} resize-none`} />
        </div>
      )}
    </div>
  );
}

// ── Projectdetail: levenscyclus, toewijzen, adressenlijst met afspraken ──
function SaneringDetail({ sanering, onTerug }: { sanering: Sanering; onTerug: () => void }) {
  const { users, currentUser, updateSanering, deleteSanering } = useApp();
  const [verwijder, setVerwijder] = useState(false);
  const [naarDb, setNaarDb] = useState(false);
  const [bevestigGereed, setBevestigGereed] = useState(false);
  const [naamBewerken, setNaamBewerken] = useState(false);
  const [naamConcept, setNaamConcept] = useState("");
  const [zoek, setZoek] = useState("");
  const importInput = useRef<HTMLInputElement | null>(null);
  const scan = useSaneerScan();

  const isLeiding = currentUser?.rol === "eigenaar" || currentUser?.rol === "beheer";
  const isToegewezen = !!currentUser && currentUser.id === sanering.toegewezenAan;
  const magWerken = isLeiding || isToegewezen;
  const status = sanering.status;
  const bewerkbaar = magWerken && (status === "nieuw" || status === "toegewezen");
  const monteur = users.find((u) => u.id === sanering.toegewezenAan);
  const controleur = users.find((u) => u.id === sanering.gecontroleerdDoor);
  const nu = () => new Date().toISOString();
  const huidigIndex = TAUW_STATUS_VOLGORDE.indexOf(status);
  const teLaat = !!sanering.deadline && sanering.deadline < vandaagISO() && status !== "verstuurd";
  const openA = openAdressen(sanering);
  const totaal = sanering.adressen.length;
  const bevestigd = totaal - openA;

  const setAdressen = (next: SaneerAdres[]) => {
    const klaarNu = next.length > 0 && next.every((a) => a.bevestigd);
    updateSanering(sanering.id, { adressen: next, afgerondOp: klaarNu ? (sanering.afgerondOp ?? nu()) : undefined });
  };
  const updateAdres = (id: string, patch: Partial<SaneerAdres>) => setAdressen(sanering.adressen.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const verwijderAdres = (id: string) => setAdressen(sanering.adressen.filter((a) => a.id !== id));
  const voegAdresToe = () => setAdressen([...sanering.adressen, legeSaneerAdres(uid())]);
  const eerstePostcode = sanering.adressen.find((a) => a.postcode.trim());
  const importeer = (file: File) => void scan.run(file, (adressen) => setAdressen([...sanering.adressen.filter(adresVol), ...adressen]));

  // Levenscyclus-overgangen (rol-gebonden) — zelfde stappen als TAUW.
  const toewijzen = (id: string) => updateSanering(sanering.id, { toegewezenAan: id || undefined, status: id ? "toegewezen" : "nieuw", toegewezenOp: id ? nu() : undefined });
  const naarControle = () => updateSanering(sanering.id, { status: "ter_controle" });
  // Terugzetten/heropenen: ruim de (nu ongeldige) goedkeurings-/verstuurgegevens op.
  const terugNaarWerknemer = () => updateSanering(sanering.id, { status: "toegewezen", gecontroleerdDoor: undefined, gecontroleerdOp: undefined, verstuurdOp: undefined });
  const goedkeuren = () => updateSanering(sanering.id, { status: "gecontroleerd", gecontroleerdDoor: currentUser?.id, gecontroleerdOp: nu() });
  const afronden = () => updateSanering(sanering.id, { status: "verstuurd", verstuurdOp: nu() });

  const slaNaamOp = () => { updateSanering(sanering.id, { naam: naamConcept.trim() || sanering.naam }); setNaamBewerken(false); };
  const naarDatabase = () => {
    updateSanering(sanering.id, { gearchiveerd: true, gearchiveerdOp: nu() });
    setNaarDb(false);
    onTerug();
  };

  const zichtbareAdressen = sanering.adressen.filter((a) => matchtZoek(a, zoek.trim().toLowerCase()));

  // Bevestigings-sms (24u vooraf): pas zodra bij élk adres een afspraak is gemaakt.
  const alleBevestigd = sanering.adressen.length > 0 && sanering.adressen.every((a) => a.bevestigd);
  const vandaag = vandaagISO(), morgen = dezeISO(1);
  const metAfspraak = sanering.adressen.filter((a) => a.bevestigd && isISO(a.datum) && a.telefoon.trim());
  const smsNu = metAfspraak.filter((a) => !a.herinnerVerstuurdOp && a.datum >= vandaag && a.datum <= morgen);
  const smsGepland = metAfspraak.filter((a) => !a.herinnerVerstuurdOp && a.datum > morgen);
  const smsVerstuurd = metAfspraak.filter((a) => !!a.herinnerVerstuurdOp);
  const smsZonderContact = sanering.adressen.filter((a) => a.bevestigd && (!isISO(a.datum) || !a.telefoon.trim()));

  return (
    <div className="space-y-5">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar saneringen
      </button>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {naamBewerken ? (
            <div className="flex flex-wrap items-center gap-2">
              <input autoFocus value={naamConcept} onChange={(e) => setNaamConcept(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") slaNaamOp(); if (e.key === "Escape") setNaamBewerken(false); }} aria-label="Projectnaam" className="w-72 max-w-full rounded-lg border border-brand-300 px-2.5 py-1.5 text-xl font-bold text-ink-900 outline-none focus:ring-2 focus:ring-brand-100" />
              <button type="button" onClick={slaNaamOp} className={knopKlein}><Check className="h-3.5 w-3.5" /> Opslaan</button>
              <button type="button" onClick={() => setNaamBewerken(false)} className="text-sm font-medium text-ink-500 hover:text-ink-800">Annuleer</button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-xl font-bold text-ink-900">{sanering.naam}</h2>
              {isLeiding && <button type="button" onClick={() => { setNaamConcept(sanering.naam); setNaamBewerken(true); }} className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100 hover:text-brand-600" title="Naam wijzigen" aria-label="Naam wijzigen"><Pencil className="h-4 w-4" /></button>}
              <Badge tone={STATUS_TONE[status]}>{TAUW_STATUS_LABEL[status]}</Badge>
            </div>
          )}
          <p className="text-sm text-ink-500">{[sanering.regio, `${totaal} adres${totaal === 1 ? "" : "sen"}`, monteur ? monteur.naam : null].filter(Boolean).join(" · ")}</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => setVerwijder(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Verwijderen</button>
        )}
      </div>

      {scan.fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{scan.fout}</div>}

      {/* Levenscyclus + rol-acties (zelfde flow als TAUW) */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-x-1 gap-y-2">
          {TAUW_STATUS_VOLGORDE.map((s, i) => {
            const gedaan = i < huidigIndex, isNu = i === huidigIndex;
            return (
              <Fragment key={s}>
                <span className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${isNu ? "bg-brand-600 text-white" : gedaan ? "bg-green-100 text-green-700" : "bg-ink-100 text-ink-400"}`}>
                  <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${isNu ? "bg-white/25 text-white" : gedaan ? "bg-green-500 text-white" : "bg-ink-300 text-white"}`}>{gedaan ? "✓" : i + 1}</span>
                  {TAUW_STATUS_LABEL[s]}
                </span>
                {i < TAUW_STATUS_VOLGORDE.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-ink-300" />}
              </Fragment>
            );
          })}
        </div>

        <div className="border-t border-ink-100 pt-3">
          {status === "nieuw" && (isLeiding ? (
            <div className="flex flex-wrap items-center gap-2">
              <UserPlus className="h-4 w-4 text-ink-400" />
              <span className="text-sm text-ink-600">Wijs toe aan een werknemer:</span>
              <WerknemerKiezer value={sanering.toegewezenAan ?? ""} onChange={toewijzen} users={users} leegLabel="Kies werknemer…" />
            </div>
          ) : <p className="text-sm text-ink-500">Nog niet vrijgegeven door de beheerder.</p>)}

          {status === "toegewezen" && (
            <div className="flex flex-wrap items-center gap-2">
              {magWerken ? (
                <button type="button" onClick={() => setBevestigGereed(true)} className={knopPrimair}><Check className="h-4 w-4" /> Afspraken klaar → naar controle</button>
              ) : <p className="text-sm text-ink-500">Wordt afgewerkt door {monteur?.naam ?? "de werknemer"}.</p>}
              {isLeiding && <WerknemerKiezer value={sanering.toegewezenAan ?? ""} onChange={toewijzen} users={users} leegLabel="Niet toegewezen" />}
            </div>
          )}

          {status === "ter_controle" && (isLeiding ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={goedkeuren} className={knopPrimair}><Check className="h-4 w-4" /> Goedkeuren</button>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar werknemer</button>
            </div>
          ) : isToegewezen ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-ink-500">Klaar gemeld — wacht op controle.</span>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar mezelf — nog iets aanpassen</button>
            </div>
          ) : <p className="text-sm text-ink-500">Klaar gemeld — wacht op controle door de beheerder.</p>)}

          {status === "gecontroleerd" && (isLeiding ? (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={afronden} className={knopPrimair}><Check className="h-4 w-4" /> Afronden</button>
              <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Terug naar werknemer</button>
            </div>
          ) : <p className="text-sm text-ink-500">Goedgekeurd{controleur ? ` door ${controleur.naam}` : ""} — wacht op afronden door de beheerder.</p>)}

          {status === "verstuurd" && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-green-700"><Check className="h-4 w-4" /> Afgerond{sanering.verstuurdOp ? ` op ${datumKort(sanering.verstuurdOp)}` : ""}.</span>
              {isLeiding && <button type="button" onClick={() => setNaarDb(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 hover:bg-green-100"><Database className="h-4 w-4" /> Naar database</button>}
              {isLeiding && <button type="button" onClick={terugNaarWerknemer} className={knopKlein}><RotateCcw className="h-3.5 w-3.5" /> Heropenen</button>}
            </div>
          )}
        </div>

        {/* Deadline — door de beheerder ingesteld, door iedereen zichtbaar */}
        <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-3">
          <CalendarClock className="h-4 w-4 text-ink-400" />
          <span className="text-sm text-ink-600">Deadline</span>
          {isLeiding ? (
            <>
              <div className="w-48"><DatumKiezer value={sanering.deadline ?? ""} onChange={(iso) => updateSanering(sanering.id, { deadline: iso || undefined })} placeholder="Geen deadline" /></div>
              {sanering.deadline && <button type="button" onClick={() => updateSanering(sanering.id, { deadline: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">wissen</button>}
            </>
          ) : (
            <span className={`text-sm font-semibold ${teLaat ? "text-red-600" : "text-ink-800"}`}>{sanering.deadline ? `${datumKort(sanering.deadline)}${teLaat ? " · te laat" : ""}` : "nog niet gezet"}</span>
          )}
        </div>
      </Card>

      {/* Regio */}
      <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 p-4">
        <span className="text-sm font-medium text-ink-600">Regio</span>
        <input value={sanering.regio} disabled={!bewerkbaar} onChange={(e) => updateSanering(sanering.id, { regio: e.target.value })} placeholder="Onbekend" className="w-40 rounded-lg border border-ink-200 px-2.5 py-1.5 text-sm outline-none focus:border-brand-400 disabled:bg-ink-50 disabled:text-ink-500" />
        {bewerkbaar && <button type="button" onClick={() => updateSanering(sanering.id, { regio: afleidRegio(eerstePostcode?.postcode ?? "", eerstePostcode?.plaats ?? "") })} className={knopKlein}><Wand2 className="h-3.5 w-3.5" /> Auto uit postcode</button>}
      </Card>

      {/* Adressen */}
      <Card className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink-900">Adressen <span className="font-normal text-ink-400">· {bevestigd}/{totaal} afspraak gemaakt</span></h3>
          {isLeiding && bewerkbaar && (
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => importInput.current?.click()} className={knopKlein}><FileUp className="h-3.5 w-3.5" /> Adressen importeren</button>
              <input ref={importInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Excel inlezen" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importeer(f); }} />
              <button type="button" onClick={voegAdresToe} className={knopKlein}><Plus className="h-3.5 w-3.5" /> Adres</button>
            </div>
          )}
        </div>

        {totaal > 0 && (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op straat, naam, postcode of telefoon…" className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </div>
        )}

        {totaal === 0 ? (
          <p className="rounded-lg bg-ink-50 px-3 py-6 text-center text-sm text-ink-400">Nog geen adressen. {isLeiding ? "Importeer een Excel of voeg een adres toe." : "Wacht tot de beheerder adressen toevoegt."}</p>
        ) : zichtbareAdressen.length === 0 ? (
          <p className="rounded-lg bg-ink-50 px-3 py-4 text-center text-sm text-ink-400">Geen adressen gevonden voor “{zoek}”.</p>
        ) : (
          <div className="space-y-2.5">
            {zichtbareAdressen.map((a, i) => (
              <SaneerAdresKaart key={a.id} adres={a} nr={i + 1} bewerkbaar={bewerkbaar} magVerwijderen={isLeiding && bewerkbaar} onChange={(patch) => updateAdres(a.id, patch)} onVerwijder={() => verwijderAdres(a.id)} />
            ))}
          </div>
        )}
      </Card>

      {magWerken && alleBevestigd && (
        <Card className="space-y-3 p-4">
          <div className="flex items-center gap-2">
            <Send className="h-5 w-5 text-brand-600" />
            <h3 className="text-sm font-bold text-ink-900">Bevestigings-sms · 24 uur vooraf</h3>
          </div>
          <p className="text-xs text-ink-500">Alle afspraken zijn gemaakt. Stuur elke bewoner 24 uur vóór de afspraak een sms-bevestiging. Eén tik opent de sms-app met datum, tijd en adres er al in — verstuur 'm en hij wordt hier afgevinkt.</p>

          {smsNu.length > 0 ? (
            <div>
              <div className="mb-1.5 text-xs font-bold text-red-600">Nu versturen — afspraak vandaag/morgen ({smsNu.length})</div>
              <div className="space-y-2">
                {smsNu.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-white p-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink-900">{a.naam || "Bewoner"} · {`${a.straat} ${a.huisnummer}`.trim()}</div>
                      <div className="truncate text-xs text-ink-500">Afspraak {datumKort(a.datum)}{a.tijd ? ` om ${a.tijd}` : ""}</div>
                    </div>
                    <a href={smsUrl(a.telefoon, smsBevestiging(a))} onClick={() => updateAdres(a.id, { herinnerVerstuurdOp: nu() })} className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"><Send className="h-3.5 w-3.5" /> Stuur sms</a>
                    <a href={waUrl(a.telefoon, smsBevestiging(a))} target="_blank" rel="noopener noreferrer" onClick={() => updateAdres(a.id, { herinnerVerstuurdOp: nu() })} className={knopKlein}><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-xs font-medium text-green-700">Geen bevestigingen te versturen voor vandaag of morgen. 👍</p>
          )}

          {smsGepland.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-500">Later versturen (24u vóór de afspraak)</div>
              <div className="space-y-1">
                {smsGepland.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs text-ink-500">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                    <span className="truncate">Verstuur op <span className="font-semibold text-ink-700">{datumKort(minEenDag(a.datum))}</span> · {a.naam || "Bewoner"} · afspraak {datumKort(a.datum)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {smsVerstuurd.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold text-ink-500">Verstuurd ({smsVerstuurd.length})</div>
              <div className="space-y-1.5">
                {smsVerstuurd.map((a) => (
                  <div key={a.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-green-200 bg-green-50/50 p-2.5">
                    <Check className="h-4 w-4 shrink-0 text-green-600" />
                    <div className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{a.naam || "Bewoner"} · afspraak {datumKort(a.datum)}</div>
                    <button type="button" onClick={() => updateAdres(a.id, { herinnerVerstuurdOp: undefined })} className="text-xs font-medium text-ink-400 hover:text-ink-600">terugzetten</button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {smsZonderContact.length > 0 && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">{smsZonderContact.length} adres{smsZonderContact.length === 1 ? "" : "sen"} mist nog een datum of telefoonnummer — vul die aan om een bevestiging te kunnen sturen.</p>
          )}
        </Card>
      )}

      <Bevestig
        open={bevestigGereed}
        titel="Afspraken klaar melden?"
        tekst={openA > 0
          ? `Let op: er ${openA === 1 ? "staat" : "staan"} nog ${openA} afspra${openA === 1 ? "ak" : "ken"} niet gemaakt. Weet je zeker dat je het project gereed meldt voor controle? De beheerder controleert je werk.`
          : `Alle ${totaal} afspraken zijn gemaakt. Weet je zeker dat je het project gereed meldt voor controle?`}
        bevestigLabel="Ja, klaar melden"
        bevestigTone="brand"
        onBevestig={() => { setBevestigGereed(false); naarControle(); }}
        onAnnuleer={() => setBevestigGereed(false)}
      />
      <Bevestig
        open={verwijder}
        titel="Sanering-project verwijderen"
        tekst={`Weet je het zeker dat je "${sanering.naam}" wilt verwijderen? Alle ${totaal} adressen gaan verloren.`}
        onBevestig={() => { deleteSanering(sanering.id); setVerwijder(false); onTerug(); }}
        onAnnuleer={() => setVerwijder(false)}
      />
      <Bevestig
        open={naarDb}
        titel="Naar de database versturen"
        tekst={`Project "${sanering.naam}" naar de database versturen? Het verdwijnt uit deze lijst en wordt bewaard in de database.`}
        bevestigLabel="Naar database"
        bevestigTone="brand"
        onBevestig={naarDatabase}
        onAnnuleer={() => setNaarDb(false)}
      />
      {scan.fase && <ScanOverlay fase={scan.fase} aantal={scan.aantal} />}
    </div>
  );
}

// ── Hoofdcomponent: overzicht per werkweek (TAUW-layout) ──
export function Saneren({ initieelSanering }: { initieelSanering?: string }) {
  const { saneringen, users, currentUser, addSanering } = useApp();
  const [openId, setOpenId] = useState<string | null>(initieelSanering ?? null);
  const importInput = useRef<HTMLInputElement | null>(null);
  const scan = useSaneerScan();

  const importeerNieuw = (file: File) => void scan.run(file, (adressen, naam) => {
    const eerste = adressen.find((a) => a.postcode.trim());
    const id = addSanering({
      aangemaakt: new Date().toISOString(),
      naam,
      regio: afleidRegio(eerste?.postcode ?? "", eerste?.plaats ?? ""),
      status: "nieuw",
      adressen,
    });
    setOpenId(id);
  });
  const nieuwLeeg = () => {
    const id = addSanering({ aangemaakt: new Date().toISOString(), naam: "Nieuw project", regio: "", status: "nieuw", adressen: [] });
    setOpenId(id);
  };

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  const zichtbaar = (isLeiding ? saneringen : saneringen.filter((s) => s.toegewezenAan === currentUser.id)).filter((s) => !s.gearchiveerd);

  const open = zichtbaar.find((s) => s.id === openId);
  if (open) return <SaneringDetail sanering={open} onTerug={() => setOpenId(null)} />;

  const isOpen = (s: Sanering) => s.status !== "verstuurd";
  const openProjecten = zichtbaar.filter(isOpen).length;
  const openAdr = zichtbaar.filter(isOpen).reduce((sum, s) => sum + openAdressen(s), 0);
  const vandaag = vandaagISO();
  const gesorteerd = [...zichtbaar].sort((a, b) => {
    const pa = peilSanering(a), pb = peilSanering(b);
    if (pa !== pb) return pa < pb ? -1 : 1;
    return a.naam.localeCompare(b.naam, "nl");
  });
  const weken: { key: string; label: string; items: Sanering[] }[] = [];
  for (const s of gesorteerd) {
    const wk = weekStartISO(peilSanering(s)) || "zonder";
    let w = weken.find((x) => x.key === wk);
    if (!w) { w = { key: wk, label: weekLabel(wk), items: [] }; weken.push(w); }
    w.items.push(s);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Saneren</h2>
          <p className="text-sm text-ink-500">Importeer Excel → project per wijk → werknemer maakt de afspraken → beheerder controleert en rondt af.</p>
        </div>
        {isLeiding && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => importInput.current?.click()} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700" title="Excel-bestand inlezen als nieuw project"><FileUp className="h-4 w-4" /> Importeer Excel</button>
            <input ref={importInput} type="file" accept=".xlsx,.xls,.csv" aria-label="Excel inlezen" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) importeerNieuw(f); }} />
            <button type="button" onClick={nieuwLeeg} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Nieuw project</button>
          </div>
        )}
      </div>

      {scan.fout && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{scan.fout}</div>}

      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <Recycle className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">
            {isLeiding ? "Nog geen saneringsprojecten. Klik op " : "Geen saneringen aan jou toegewezen."}
            {isLeiding && <span className="font-semibold">Importeer Excel</span>}
            {isLeiding && " om te beginnen."}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap gap-3">
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{openProjecten}</div>
              <div className="text-xs text-ink-500">{openProjecten === 1 ? "project open" : "projecten open"}</div>
            </div>
            <div className="rounded-xl border border-ink-200 bg-white px-4 py-2.5 shadow-card">
              <div className="text-lg font-bold text-ink-900">{openAdr}</div>
              <div className="text-xs text-ink-500">afspraken te maken</div>
            </div>
          </div>

          {weken.map((wg) => {
            const openInWeek = wg.items.filter(isOpen).length;
            return (
              <div key={wg.key}>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-ink-700">{wg.label}</h3>
                  <span className="text-xs font-medium text-ink-500">{openInWeek} open · {wg.items.length} {wg.items.length === 1 ? "project" : "projecten"}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {wg.items.map((s) => {
                    const tot = s.adressen.length;
                    const klaarA = tot - openAdressen(s);
                    const monteur = users.find((u) => u.id === s.toegewezenAan);
                    const pct = tot ? Math.round((klaarA / tot) * 100) : 0;
                    const teLaat = !!s.deadline && s.deadline < vandaag && s.status !== "verstuurd";
                    return (
                      <div key={s.id} onClick={() => setOpenId(s.id)} className="cursor-pointer rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-card transition-shadow hover:shadow-cardhover">
                        <div className="flex items-center gap-3">
                          <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600"><Recycle className="h-5 w-5" /></div>
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-semibold text-ink-900">{s.naam}</div>
                            <div className="truncate text-xs text-ink-500">{[s.regio, `${tot} adres${tot === 1 ? "" : "sen"}`].filter(Boolean).join(" · ")}</div>
                          </div>
                          <Badge tone={STATUS_TONE[s.status]}>{TAUW_STATUS_LABEL[s.status]}</Badge>
                          <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 text-ink-500"><MapPin className="h-3.5 w-3.5" /> {monteur ? monteur.naam : "Niet toegewezen"}</span>
                          <span className="text-ink-500">{klaarA}/{tot} afspraak gemaakt{s.deadline && <span className={`ml-2 inline-flex items-center gap-1 font-semibold ${teLaat ? "text-red-600" : "text-ink-500"}`}><CalendarClock className="h-3.5 w-3.5" /> {teLaat ? "Te laat" : datumKort(s.deadline)}</span>}</span>
                        </div>
                        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-ink-100">
                          <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {scan.fase && <ScanOverlay fase={scan.fase} aantal={scan.aantal} />}
    </div>
  );
}

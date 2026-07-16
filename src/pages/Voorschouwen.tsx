import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Plus,
  FileText,
  Download,
  Pencil,
  Trash2,
  MapPin,
  ClipboardCheck,
  FolderArchive,
  Loader2,
  X,
  Folder,
  FolderPlus,
  Search,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ScanLine,
  ArrowUp,
  ArrowDown,
  AlertTriangle,
  ImageOff,
  Send,
  CheckCircle2,
  ArrowLeft,
  Calendar,
  User,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { VoorschouwForm } from "../components/VoorschouwForm";
import { VoorschouwScanModal } from "../components/VoorschouwScanModal";
import { Keuze } from "../components/Keuze";
import {
  downloadVoorschouwPdf,
  downloadVoorschouwenZip,
  verstuurVoorschouwenNaarStedin,
} from "../lib/voorschouwPdf";
import type { Voorschouw, VoorschouwMap } from "../lib/types";

// Maandag (weekstart) van een datum — voor de "Per week"-navigator.
function vsWeekStart(iso: string): string {
  const d = new Date((iso || "").slice(0, 10) + "T00:00:00");
  if (isNaN(d.getTime())) return "";
  const dag = (d.getDay() + 6) % 7; // maandag = 0
  d.setDate(d.getDate() - dag);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
// ISO-weeknummer + datumbereik voor de week-navigator (maandag → zondag).
function vsWeekNr(maandagISO: string): number {
  const [j, m, d] = maandagISO.split("-").map(Number);
  if (!j) return 0;
  const t = new Date(Date.UTC(j, m - 1, d));
  const dag = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dag + 3); // donderdag van deze week
  const eersteDo = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const ed = (eersteDo.getUTCDay() + 6) % 7;
  eersteDo.setUTCDate(eersteDo.getUTCDate() - ed + 3);
  return 1 + Math.round((t.getTime() - eersteDo.getTime()) / (7 * 24 * 3600 * 1000));
}
function vsWeekBereik(maandagISO: string): string {
  const ma = new Date(maandagISO + "T00:00:00");
  if (isNaN(ma.getTime())) return "";
  const zo = new Date(ma); zo.setDate(zo.getDate() + 6);
  return `${ma.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${zo.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;
}

// "Open" = nog geen foto toegevoegd (deze vragen nog aandacht).
const vsZonderFoto = (v: Voorschouw) => !v.fotos || v.fotos.length === 0;

// Grote pop-up: map een naam geven en in één keer adressen aanvinken (met zoekbalk) om 'm te vullen.
function NieuweMapModal({ voorschouwen, naamVan, voorinvulIds, onAnnuleer, onMaak }: {
  voorschouwen: Voorschouw[];
  naamVan: (id: string) => string;
  voorinvulIds: string[];
  onAnnuleer: () => void;
  onMaak: (naam: string, ids: string[]) => void;
}) {
  const [naam, setNaam] = useState("");
  const [zoek, setZoek] = useState("");
  const [sel, setSel] = useState<Set<string>>(() => new Set(voorinvulIds));
  const q = zoek.trim().toLowerCase();
  const lijst = voorschouwen.filter((v) => !q || `${v.straatnaam} ${v.postcode} ${v.plaats}`.toLowerCase().includes(q));
  const toggle = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const allesZichtbaarGekozen = lijst.length > 0 && lijst.every((v) => sel.has(v.id));
  const toggleAlles = () => setSel((p) => {
    const n = new Set(p);
    if (lijst.every((v) => n.has(v.id))) lijst.forEach((v) => n.delete(v.id));
    else lijst.forEach((v) => n.add(v.id));
    return n;
  });
  const kanMaken = naam.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/50 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-ink-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <div className="rounded-xl bg-brand-50 p-2 text-brand-600"><FolderPlus className="h-5 w-5" /></div>
            <div>
              <h3 className="text-base font-bold text-ink-900">Nieuwe map</h3>
              <p className="text-xs text-ink-500">Geef de map een naam en kies de adressen die erin horen.</p>
            </div>
          </div>
          <button type="button" onClick={onAnnuleer} aria-label="Sluiten" className="rounded-lg p-1.5 text-ink-400 hover:bg-ink-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Naam van de map</span>
            <input autoFocus value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="bijv. Wijk Noord, Gemeente Barendrecht of 2993…" className="w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
            <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op straat, postcode of plaats…" aria-label="Zoek adres" className="w-full rounded-lg border border-ink-200 py-2 pl-9 pr-9 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
            {zoek && <button type="button" onClick={() => setZoek("")} aria-label="Zoekopdracht wissen" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100"><X className="h-4 w-4" /></button>}
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-medium text-ink-600">{sel.size} adres{sel.size === 1 ? "" : "sen"} geselecteerd</span>
            {lijst.length > 0 && (
              <button type="button" onClick={toggleAlles} className="font-semibold text-brand-600 hover:text-brand-700">{allesZichtbaarGekozen ? "Selectie wissen" : "Alles selecteren"}</button>
            )}
          </div>
        </div>

        <div className="scrollbar-thin min-h-0 flex-1 space-y-1.5 overflow-y-auto border-y border-ink-100 bg-ink-50/40 px-5 py-3">
          {lijst.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-400">Geen adressen gevonden{zoek ? ` voor “${zoek.trim()}”` : ""}.</p>
          ) : (
            lijst.map((v) => {
              const aan = sel.has(v.id);
              return (
                <button type="button" key={v.id} onClick={() => toggle(v.id)} className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${aan ? "border-brand-400 bg-brand-50" : "border-ink-200 bg-white hover:bg-ink-50"}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${aan ? "border-brand-500 bg-brand-500 text-white" : "border-ink-300 bg-white"}`}>{aan && <Check className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink-900">{v.straatnaam || "Onbekende straat"}{v.postcode || v.plaats ? `, ${[v.postcode, v.plaats].filter(Boolean).join(" ")}` : ""}</span>
                    <span className="block truncate text-xs text-ink-500">{naamVan(v.ingevuldDoor)} · {v.status}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button type="button" onClick={onAnnuleer} className="rounded-lg border border-ink-200 bg-white px-4 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Annuleren</button>
          <button type="button" disabled={!kanMaken} onClick={() => onMaak(naam.trim(), [...sel])} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
            <FolderPlus className="h-4 w-4" /> Map aanmaken{sel.size > 0 ? ` · ${sel.size} adres${sel.size === 1 ? "" : "sen"}` : ""}
          </button>
        </div>
      </div>
    </div>
  );
}

// Ronde map-dropdown voor een adresrij. Het menu wordt via een portal getoond zodat het niet
// wordt afgeknipt door de overflow-hidden van de mapkaart. Waarde "" = geen map, "__nieuw__" = nieuwe map.
function MapSelect({ value, mappen, onKies }: {
  value: string;
  mappen: { id: string; naam: string }[];
  onKies: (waarde: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const zoekRef = useRef<HTMLInputElement | null>(null);
  const breedte = 224; // px (w-56)
  const zoekbaar = mappen.length > 4; // bij een paar mappen heeft zoeken geen zin

  const openMenu = () => {
    setZoek("");
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - breedte) });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    if (zoekbaar) setTimeout(() => zoekRef.current?.focus(), 0); // meteen kunnen typen
    const buiten = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    // Bij scrollen/resizen het menu MEEVERPLAATSEN (niet sluiten). Alleen sluiten als de knop
    // helemaal uit beeld raakt — anders zou het menu los in beeld blijven zweven.
    const volg = (e?: Event) => {
      if (e && menuRef.current?.contains(e.target as Node)) return; // scrollen ín het menu zelf: niets doen
      const r = btnRef.current?.getBoundingClientRect();
      if (!r) return;
      if (r.bottom < 0 || r.top > window.innerHeight) { setOpen(false); return; }
      setPos({ top: r.bottom + 6, left: Math.max(8, r.right - breedte) });
    };
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", volg, true);
    window.addEventListener("resize", volg);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", volg, true);
      window.removeEventListener("resize", volg);
    };
  }, [open, zoekbaar]);

  const huidig = mappen.find((m) => m.id === value);
  const kies = (w: string) => { onKies(w); setOpen(false); setZoek(""); };
  const q = zoek.trim().toLowerCase();
  const gefilterd = q ? mappen.filter((m) => m.naam.toLowerCase().includes(q)) : mappen;

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openMenu())} aria-haspopup="listbox" aria-expanded={open} title="In welke map hoort dit adres?" className="flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 outline-none hover:bg-ink-50 focus:border-brand-400">
        <Folder className={`h-3.5 w-3.5 shrink-0 ${huidig ? "text-brand-600" : "text-ink-400"}`} />
        <span className={`truncate ${huidig ? "" : "text-ink-500"}`}>{huidig ? huidig.naam : "Geen map"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: breedte }} className="z-50 overflow-hidden rounded-xl border border-ink-200 bg-white shadow-cardhover">
          {zoekbaar && (
            <div className="flex items-center gap-1.5 border-b border-ink-100 px-2.5 py-2">
              <Search className="h-4 w-4 shrink-0 text-ink-400" />
              <input
                ref={zoekRef}
                value={zoek}
                onChange={(e) => setZoek(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && gefilterd[0]) { e.preventDefault(); kies(gefilterd[0].id); } }}
                placeholder="Zoek een map…"
                aria-label="Map zoeken"
                className="w-full bg-transparent text-sm text-ink-800 outline-none placeholder:text-ink-400"
              />
            </div>
          )}
          <div className="max-h-72 overflow-auto p-1">
            <button type="button" onClick={() => kies("")} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${value === "" ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-600 hover:bg-ink-50"}`}>
              <span className="flex-1">Geen map</span>
              {value === "" && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
            </button>
            {q && gefilterd.length === 0 ? (
              <div className="px-3 py-4 text-center text-sm text-ink-400">Geen map gevonden</div>
            ) : gefilterd.map((m) => {
              const actief = m.id === value;
              return (
                <button key={m.id} type="button" onClick={() => kies(m.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}>
                  <Folder className={`h-4 w-4 shrink-0 ${actief ? "text-brand-600" : "text-ink-400"}`} />
                  <span className="flex-1 truncate">{m.naam}</span>
                  {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              );
            })}
            <div className="my-1 border-t border-ink-100" />
            <button type="button" onClick={() => kies("__nieuw__")} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-700 outline-none hover:bg-brand-50 focus-visible:bg-brand-50">
              <FolderPlus className="h-4 w-4 shrink-0" />
              <span className="flex-1">Nieuwe map…</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export function Voorschouwen({ initieelMap }: { initieelMap?: string }) {
  const { voorschouwen, voorschouwMappen, users, currentUser, deleteVoorschouw, updateVoorschouw, addVoorschouwMap, updateVoorschouwMap, deleteVoorschouwMap } = useApp();
  const [modus, setModus] = useState<"lijst" | "formulier">("lijst");
  const [bewerk, setBewerk] = useState<Voorschouw | undefined>(undefined);
  const [scanOpen, setScanOpen] = useState(false);
  const [voorinvul, setVoorinvul] = useState<Partial<Voorschouw> | undefined>(undefined);
  const [selectie, setSelectie] = useState<Set<string>>(new Set());
  const [bezig, setBezig] = useState(false);
  const [nieuweMapOpen, setNieuweMapOpen] = useState(false);
  const [voorinvulIds, setVoorinvulIds] = useState<string[]>([]);
  const [openMappen, setOpenMappen] = useState<Set<string>>(() => new Set(initieelMap ? [initieelMap] : [])); // standaard dicht; een map die je via "Mijn werk" opent, staat meteen open
  const [bewerkMapId, setBewerkMapId] = useState<string | null>(null);
  const [mapNaamConcept, setMapNaamConcept] = useState("");
  // Mappen zoeken/filteren + sorteren (sorteervoorkeur lokaal per apparaat, NIET in de gesyncte store).
  const [mapZoek, setMapZoek] = useState("");
  const [sorteerModus, setSorteerModus] = useState<"eigen" | "naam" | "naamOmgekeerd" | "aantal" | "nieuw" | "open">(() => {
    try {
      const v = localStorage.getItem("vs-mapSort");
      return v === "eigen" || v === "naam" || v === "naamOmgekeerd" || v === "aantal" || v === "nieuw" || v === "open" ? v : "open";
    } catch { return "open"; }
  });
  const [teVerwijderenMap, setTeVerwijderenMap] = useState<{ id: string; naam: string; aantal: number } | null>(null);
  const [tab, setTab] = useState<"overzicht" | "stedin">("overzicht");
  const [alleenOpen, setAlleenOpen] = useState(false); // alleen adressen zónder foto tonen
  const [perWeek, setPerWeek] = useState(false); // week-navigator (één week tegelijk) i.p.v. alles op gebied
  const [weekISO, setWeekISO] = useState(() => vsWeekStart(new Date().toISOString())); // maandag van de gekozen week
  const [teVersturenMap, setTeVersturenMap] = useState<VoorschouwMap | null>(null); // bevestiging vóór versturen
  const [mapDetailId, setMapDetailId] = useState<string | null>(initieelMap ?? null); // geopende map-detailpagina (ook via "Mijn werk")
  const [naamZoek, setNaamZoek] = useState(""); // zoekterm voor het toewijzen-op-naam-veld
  const [naamBewerk, setNaamBewerk] = useState(false); // mapnaam in bewerk-modus (alleen via het potlood)
  const [vraagToewijzingWeg, setVraagToewijzingWeg] = useState(false); // bevestiging vóór toewijzing verwijderen
  useEffect(() => { try { localStorage.setItem("vs-mapSort", sorteerModus); } catch { /* opslag niet beschikbaar */ } }, [sorteerModus]);
  // Kwam je via "Mijn werk" recht op jóuw map? Die staat al open; scroll er meteen naartoe.
  useEffect(() => {
    if (!initieelMap) return;
    const el = document.getElementById(`vsmap-${initieelMap}`);
    el?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  // Gearchiveerde mappen (en hun adressen) verdwijnen uit de actieve lijst — ze staan in de database.
  // Mappen die uit het actieve overzicht horen: gearchiveerd (in de database) óf klaargezet voor Stedin —
  // hun losse adressen mogen dus ook niet meer als "zonder map" opduiken.
  const archiefMapIds = new Set(voorschouwMappen.filter((m) => m.gearchiveerd || m.gereedVoorStedin).map((m) => m.id));
  // Een monteur ziet: z'n eigen ingevulde voorschouwen én álle voorschouwen in mappen die aan hém zijn toegewezen.
  const mijnMapIds = new Set(voorschouwMappen.filter((m) => m.toegewezenAan === currentUser.id).map((m) => m.id));
  const zichtbaar = (isLeiding
    ? voorschouwen
    : voorschouwen.filter((v) => v.ingevuldDoor === currentUser.id || (v.mapId ? mijnMapIds.has(v.mapId) : false))
  ).filter((v) => !(v.mapId && archiefMapIds.has(v.mapId)));

  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  const nieuw = () => {
    setBewerk(undefined);
    setVoorinvul(undefined);
    setModus("formulier");
  };
  const open = (v: Voorschouw) => {
    setBewerk(v);
    setVoorinvul(undefined);
    setModus("formulier");
  };
  // Na het scannen: open een nieuw formulier dat vooraf is ingevuld met de afgelezen velden + foto's.
  const naScan = (velden: Partial<Voorschouw>, fotos: string[]) => {
    setScanOpen(false);
    setBewerk(undefined);
    setVoorinvul({ ...velden, fotos });
    setModus("formulier");
  };

  if (modus === "formulier") {
    return <VoorschouwForm bestaande={bewerk} voorinvul={voorinvul} onKlaar={() => setModus("lijst")} />;
  }

  // ── Selectie ──
  const toggle = (id: string) =>
    setSelectie((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const alleGeselecteerd = zichtbaar.length > 0 && zichtbaar.every((v) => selectie.has(v.id));
  const toggleAlle = () =>
    setSelectie(alleGeselecteerd ? new Set() : new Set(zichtbaar.map((v) => v.id)));
  const wis = () => setSelectie(new Set());

  const geselecteerd = () => zichtbaar.filter((v) => selectie.has(v.id));

  const exporteerZip = async () => {
    setBezig(true);
    try {
      await downloadVoorschouwenZip(geselecteerd());
    } finally {
      setBezig(false);
    }
  };
  const ingediend = zichtbaar.filter((v) => v.status === "Ingediend").length;
  const concept = zichtbaar.filter((v) => v.status === "Concept").length;

  // ── Eigen mappen (buurt/wijk/gemeente/postcode) ──
  const nieuweMap = () => { setVoorinvulIds([]); setNieuweMapOpen(true); };
  const maakMap = (naam: string, ids: string[]) => {
    const id = addVoorschouwMap(naam);
    ids.forEach((vid) => updateVoorschouw(vid, { mapId: id }));
    setNieuweMapOpen(false);
  };
  const slaMapNaamOp = () => {
    if (bewerkMapId && mapNaamConcept.trim()) updateVoorschouwMap(bewerkMapId, { naam: mapNaamConcept.trim() });
    setBewerkMapId(null);
  };
  const verwijderMap = (id: string, naam: string, aantal: number) => setTeVerwijderenMap({ id, naam, aantal });
  const bevestigVerwijderMap = () => {
    if (teVerwijderenMap) deleteVoorschouwMap(teVerwijderenMap.id);
    setTeVerwijderenMap(null);
  };
  // Handmatige volgorde, met de mapnaam en tenslotte het id als stabiele tie-breaks (zo is de volgorde
  // altijd deterministisch — ook als twee mappen tijdelijk hetzelfde volgnummer hebben).
  const opEigenVolgorde = (a: VoorschouwMap, b: VoorschouwMap) =>
    ((a.volgorde ?? Infinity) - (b.volgorde ?? Infinity)) || a.naam.localeCompare(b.naam, "nl") || a.id.localeCompare(b.id);
  // Map omhoog/omlaag verplaatsen. Zodra alle mappen een volgnummer hebben wisselen we alléén de twee buren
  // (2 schrijfacties) — zo raakt een pijl-klik geen mappen die de gebruiker niet verplaatst. Alleen als er
  // nog oude mappen zonder volgnummer zijn, nummeren we eenmalig de hele lijst netjes 0..n-1.
  const verplaatsMap = (id: string, richting: "omhoog" | "omlaag") => {
    const rij = [...actieveMappen].sort(opEigenVolgorde);
    const i = rij.findIndex((m) => m.id === id);
    if (i === -1) return;
    const doel = richting === "omhoog" ? i - 1 : i + 1;
    if (doel < 0 || doel >= rij.length) return;
    if (rij.every((m) => typeof m.volgorde === "number") && rij[i].volgorde !== rij[doel].volgorde) {
      // Alle volgnummers aanwezig en verschillend → alleen de twee buren van volgnummer wisselen.
      updateVoorschouwMap(rij[i].id, { volgorde: rij[doel].volgorde });
      updateVoorschouwMap(rij[doel].id, { volgorde: rij[i].volgorde });
    } else {
      // Eenmalige nette nummering (met de gevraagde wissel meteen verwerkt).
      [rij[i], rij[doel]] = [rij[doel], rij[i]];
      rij.forEach((m, n) => { if (m.volgorde !== n) updateVoorschouwMap(m.id, { volgorde: n }); });
    }
  };
  const kiesMap = (v: Voorschouw, waarde: string) => {
    if (waarde === "__nieuw__") { setVoorinvulIds([v.id]); setNieuweMapOpen(true); return; }
    updateVoorschouw(v.id, { mapId: waarde || undefined });
  };
  // Map in-/uitklappen + een hele map in één keer selecteren of downloaden.
  const toggleMap = (key: string) => setOpenMappen((p) => { const n = new Set(p); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const mapGeselecteerd = (items: Voorschouw[]) => items.length > 0 && items.every((v) => selectie.has(v.id));
  const mapDeels = (items: Voorschouw[]) => items.some((v) => selectie.has(v.id)) && !mapGeselecteerd(items);
  const toggleMapSelectie = (items: Voorschouw[]) => setSelectie((p) => {
    const n = new Set(p);
    if (items.length > 0 && items.every((v) => n.has(v.id))) items.forEach((v) => n.delete(v.id));
    else items.forEach((v) => n.add(v.id));
    return n;
  });
  const downloadMap = async (items: Voorschouw[]) => {
    if (!items.length) return;
    setBezig(true);
    try { await downloadVoorschouwenZip(items); } finally { setBezig(false); }
  };

  // Groepeer de zichtbare voorschouwen per eigen map; losse adressen onder "Zonder map".
  const actieveMappen = voorschouwMappen.filter((m) => !m.gearchiveerd && !m.gereedVoorStedin);
  const geldigeMapIds = new Set(actieveMappen.map((m) => m.id));
  // Mappen die klaarstaan voor de controle-/verstuurpagina "Klaar voor Stedin".
  const gereedeMappen = voorschouwMappen.filter((m) => !m.gearchiveerd && m.gereedVoorStedin);
  const itemsVanMap = (id: string) => voorschouwen.filter((v) => v.mapId === id);
  // Voortgang: "gedaan" = mét foto toegevoegd.
  const metFoto = zichtbaar.filter((v) => !vsZonderFoto(v)).length;
  const pctFoto = zichtbaar.length ? Math.round((metFoto / zichtbaar.length) * 100) : 0;
  // Geselecteerde adressen → hun mappen klaarzetten op de Stedin-pagina.
  const klaarzettenVoorStedin = () => {
    const mapIds = new Set(geselecteerd().map((v) => v.mapId).filter((x): x is string => !!x));
    if (mapIds.size === 0) return;
    const nu = new Date().toISOString();
    mapIds.forEach((id) => updateVoorschouwMap(id, { gereedVoorStedin: true, gereedOp: nu }));
    wis();
    setTab("stedin");
  };
  const terugUitStedin = (m: VoorschouwMap) => updateVoorschouwMap(m.id, { gereedVoorStedin: false, gereedOp: undefined });
  const verstuurMapNaarStedin = async (m: VoorschouwMap) => {
    setBezig(true);
    try {
      const res = await verstuurVoorschouwenNaarStedin(itemsVanMap(m.id));
      if (res === "gedeeld" || res === "gedownload") updateVoorschouwMap(m.id, { verzondenOp: new Date().toISOString() });
    } finally { setBezig(false); setTeVersturenMap(null); }
  };
  const afrondenStedin = (m: VoorschouwMap) => updateVoorschouwMap(m.id, { gereedVoorStedin: false, gearchiveerd: true, gearchiveerdOp: new Date().toISOString() });
  const gesorteerdeMappen = [...actieveMappen].sort((a, b) => a.naam.localeCompare(b.naam, "nl")); // voor het map-menu (voorspelbaar A–Z)
  // Handmatige volgorde (voor de omhoog/omlaag-knoppen): bepaalt of een map boven- of onderaan staat.
  const eigenVolgordeIds = [...actieveMappen].sort(opEigenVolgorde).map((m) => m.id);
  // Binnen een map staan de adressen altijd op postcode (dan straatnaam + huisnummer) — zo loop je
  // netjes de route af én zit de download in dezelfde volgorde. Adressen zónder postcode komen onderaan.
  const opPostcode = (a: Voorschouw, b: Voorschouw) =>
    (a.postcode?.trim() || "￿").localeCompare(b.postcode?.trim() || "￿", "nl", { numeric: true, sensitivity: "base" })
    || (a.straatnaam || "").localeCompare(b.straatnaam || "", "nl", { numeric: true, sensitivity: "base" });
  // Mapgroepen in de gekozen sorteervolgorde; "Zonder map" komt altijd als laatste.
  const opNaam = (a: VoorschouwMap, b: VoorschouwMap) => a.naam.localeCompare(b.naam, "nl");
  // Welke mappen tonen we? Leiding: alle. Monteur: alleen mappen die aan hem zijn toegewezen of waar
  // z'n eigen voorschouwen in zitten — zo ziet hij precies wat hij moet oppakken (óók nog lege mappen).
  const zichtbareMappen = isLeiding
    ? actieveMappen
    : actieveMappen.filter((m) => m.toegewezenAan === currentUser.id || zichtbaar.some((v) => v.mapId === m.id));
  const mapGroepen = zichtbareMappen.map((m) => ({ map: m, items: zichtbaar.filter((v) => v.mapId === m.id).sort(opPostcode) }));
  const zetMapToegewezen = (id: string, userId: string) => updateVoorschouwMap(id, { toegewezenAan: userId || undefined });
  // Open = nog niet ingediend (concept) óf zonder foto — deze mappen vragen nog aandacht.
  const nOpen = (items: Voorschouw[]) => items.filter((v) => v.status !== "Ingediend" || !v.fotos || v.fotos.length === 0).length;
  mapGroepen.sort((ga, gb) => {
    switch (sorteerModus) {
      case "open": return nOpen(gb.items) - nOpen(ga.items) || opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id);
      case "naamOmgekeerd": return opNaam(gb.map, ga.map) || ga.map.id.localeCompare(gb.map.id);
      case "aantal": return gb.items.length - ga.items.length || opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id);
      case "nieuw": return (gb.map.aangemaakt ?? "").localeCompare(ga.map.aangemaakt ?? "") || opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id);
      case "eigen": return opEigenVolgorde(ga.map, gb.map);
      default: return opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id); // "naam" (A–Z)
    }
  });
  const groepen: { map: VoorschouwMap | null; items: Voorschouw[] }[] = mapGroepen;
  const zonderMap = zichtbaar.filter((v) => !v.mapId || !geldigeMapIds.has(v.mapId)).sort(opPostcode);
  if (zonderMap.length) groepen.push({ map: null, items: zonderMap });

  // Tekstfilter over de mappen-weergave: een map is zichtbaar als de naam matcht (dan alle adressen) of
  // een adres matcht (dan alleen die adressen in de body). Puur cosmetisch — raakt de bulk-selectie niet.
  const q = mapZoek.trim().toLowerCase();
  const itemMatch = (v: Voorschouw) => `${v.straatnaam} ${v.postcode} ${v.plaats}`.toLowerCase().includes(q);
  const weekVanGroep = (g: { items: Voorschouw[] }) => {
    const ds = g.items.map((v) => v.aangemaakt).filter(Boolean).sort();
    return ds.length ? vsWeekStart(ds[ds.length - 1]) : "";
  };
  const weergave = groepen
    .map((g) => {
      const naamMatch = q === "" || (g.map?.naam ?? "zonder map").toLowerCase().includes(q);
      let body = naamMatch ? g.items : g.items.filter(itemMatch);
      if (alleenOpen) body = body.filter(vsZonderFoto); // alleen adressen zónder foto
      const zoekOk = q === "" || naamMatch || body.length > 0;
      return { map: g.map, items: g.items, body, toon: zoekOk && (!alleenOpen || body.length > 0) };
    })
    .filter((g) => g.toon);
  // Per week: alleen de mappen van de gekozen week (mappen zonder datum tonen we in de huidige week).
  const huidigeWeekISO = vsWeekStart(new Date().toISOString());
  const weergaveGetoond = perWeek
    ? weergave.filter((g) => { const wk = weekVanGroep(g); return wk ? wk === weekISO : weekISO === huidigeWeekISO; })
    : weergave;
  const verschuifWeek = (dagen: number) => { const d = new Date(weekISO + "T00:00:00"); d.setDate(d.getDate() + dagen); setWeekISO(vsWeekStart(d.toISOString())); };
  const eigenModus = !perWeek && sorteerModus === "eigen" && q === ""; // herordenen alleen in de gebied-weergave

  // Eén adres-rij (in de lijst, binnen een map-groep).
  const rij = (v: Voorschouw) => {
    const gekozen = selectie.has(v.id);
    return (
      <Card key={v.id} className={`flex flex-wrap items-center gap-4 p-4 ${gekozen ? "ring-2 ring-brand-400" : ""}`}>
        <input type="checkbox" checked={gekozen} onChange={() => toggle(v.id)} aria-label="Voorschouw selecteren" className="h-4 w-4 shrink-0 accent-brand-600" />
        <div className="rounded-lg bg-ink-100 p-2.5 text-ink-600"><MapPin className="h-5 w-5" /></div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink-900">
            {v.straatnaam || "Onbekende straat"}
            {v.postcode || v.plaats ? `, ${[v.postcode, v.plaats].filter(Boolean).join(" ")}` : ""}
          </div>
          <div className="truncate text-xs text-ink-500">
            {naamVan(v.ingevuldDoor)} · {new Date(v.aangemaakt).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}
            {v.fotos.length > 0 && ` · ${v.fotos.length} foto${v.fotos.length > 1 ? "'s" : ""}`}
          </div>
        </div>

        <MapSelect value={v.mapId && geldigeMapIds.has(v.mapId) ? v.mapId : ""} mappen={gesorteerdeMappen} onKies={(w) => kiesMap(v, w)} />

        {(!v.fotos || v.fotos.length === 0) && (
          <span title="Er is geen foto toegevoegd bij deze voorschouw" className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700 ring-1 ring-amber-200">
            <ImageOff className="h-3.5 w-3.5" /> Geen foto
          </span>
        )}

        <Badge tone={v.status === "Ingediend" ? "green" : "amber"}>{v.status}</Badge>

        <div className="flex items-center gap-1">
          <button type="button" onClick={() => void downloadVoorschouwPdf(v)} title="Download PDF" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
            <Download className="h-3.5 w-3.5" /> PDF
          </button>
          <button type="button" onClick={() => open(v)} title="Bewerken" className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Pencil className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={() => {
              if (confirm("Deze voorschouw verwijderen?")) {
                deleteVoorschouw(v.id);
                setSelectie((prev) => { const next = new Set(prev); next.delete(v.id); return next; });
              }
            }}
            title="Verwijderen"
            className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"
          ><Trash2 className="h-4 w-4" /></button>
        </div>
      </Card>
    );
  };

  // ── Controle-/verstuurpagina "Klaar voor Stedin" ──
  if (tab === "stedin" && isLeiding) {
    return (
      <div key="stedin" className="space-y-6 animate-slide-in-right">
        <button type="button" onClick={() => setTab("overzicht")} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar overzicht</button>
        <div>
          <h2 className="text-xl font-bold text-ink-900">Klaar voor Stedin</h2>
          <p className="text-sm text-ink-500">Controleer elke map en verstuur 'm dan. Op de telefoon voegt de deel-knop de PDF's meteen als bijlage toe in je mail-app; op de laptop download ik de map (ZIP) en open ik een kant-en-klaar mailconcept.</p>
        </div>

        {gereedeMappen.length === 0 ? (
          <Card className="p-10 text-center">
            <Send className="mx-auto h-10 w-10 text-ink-300" />
            <p className="mt-3 text-sm text-ink-500">Nog geen mappen klaargezet. Ga naar het overzicht, selecteer een map en klik op <span className="font-semibold">"Naar Stedin klaarzetten"</span>.</p>
          </Card>
        ) : (
          <div className="space-y-4">
            {gereedeMappen.map((m) => {
              const items = itemsVanMap(m.id).sort(opPostcode);
              const zonder = items.filter(vsZonderFoto).length;
              return (
                <div key={m.id} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
                  <div className="flex flex-wrap items-center gap-3 p-4">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-600"><Folder className="h-5 w-5" /></span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-bold text-ink-900">{m.naam}</div>
                      <div className="truncate text-xs text-ink-500">{items.length} {items.length === 1 ? "adres" : "adressen"}{zonder > 0 ? ` · ${zonder} zonder foto` : " · alle met foto"}{m.verzondenOp ? " · ✓ verstuurd" : ""}</div>
                    </div>
                    {zonder > 0 && <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"><AlertTriangle className="h-3 w-3" /> {zonder} zonder foto</span>}
                  </div>
                  <div className="border-t border-ink-100 bg-ink-50/30 p-3">
                    <div className="space-y-1.5">
                      {items.map((v) => (
                        <div key={v.id} className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm">
                          <MapPin className="h-4 w-4 shrink-0 text-ink-400" />
                          <span className="min-w-0 flex-1 truncate text-ink-800">{v.straatnaam || "Onbekend"}{v.postcode || v.plaats ? `, ${[v.postcode, v.plaats].filter(Boolean).join(" ")}` : ""}</span>
                          {vsZonderFoto(v)
                            ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-600"><ImageOff className="h-3.5 w-3.5" /> geen foto</span>
                            : <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> {v.fotos.length} foto{v.fotos.length > 1 ? "'s" : ""}</span>}
                          <button type="button" onClick={() => open(v)} title="Bekijken/bewerken" className="shrink-0 rounded p-1 text-ink-400 hover:bg-ink-100 hover:text-ink-700"><Pencil className="h-3.5 w-3.5" /></button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <button type="button" disabled={bezig || items.length === 0} onClick={() => setTeVersturenMap(m)} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
                        {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Deze map versturen naar Stedin
                      </button>
                      <button type="button" disabled={bezig || items.length === 0} onClick={() => void downloadMap(items)} className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40"><FolderArchive className="h-4 w-4" /> Download (ZIP)</button>
                      {m.verzondenOp && <button type="button" onClick={() => afrondenStedin(m)} className="inline-flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-4 py-2.5 text-sm font-semibold text-green-700 hover:bg-green-100"><CheckCircle2 className="h-4 w-4" /> Afronden (uit lijst)</button>}
                      <button type="button" onClick={() => terugUitStedin(m)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-500 hover:bg-ink-100"><ArrowLeft className="h-4 w-4" /> Terug naar overzicht</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <Bevestig
          open={!!teVersturenMap}
          titel="Deze map versturen naar Stedin?"
          tekst={teVersturenMap ? `"${teVersturenMap.naam}" (${itemsVanMap(teVersturenMap.id).length} adressen) wordt klaargezet om te versturen. Op de telefoon opent de deel-knop je mail-app met de PDF's als bijlage; op de laptop download ik de ZIP en open ik een mailconcept naar Stedin.` : ""}
          bevestigLabel="Versturen"
          bevestigTone="brand"
          onBevestig={() => teVersturenMap && void verstuurMapNaarStedin(teVersturenMap)}
          onAnnuleer={() => setTeVersturenMap(null)}
        />
      </div>
    );
  }

  // ── Map-detailpagina: werkruimte voor één map (naam, toewijzen, nieuwe voorschouw, adressen) ──
  // Zichtbaar voor de leiding én voor de medewerker aan wie de map is toegewezen (die komt hier via "Mijn werk").
  const detailMap = mapDetailId ? voorschouwMappen.find((m) => m.id === mapDetailId) : null;
  if (detailMap && (isLeiding || detailMap.toegewezenAan === currentUser.id)) {
    const items = itemsVanMap(detailMap.id).sort(opPostcode);
    const toegewezen = detailMap.toegewezenAan ? users.find((u) => u.id === detailMap.toegewezenAan) : null;
    const zoek = naamZoek.trim().toLowerCase();
    const kandidaten = zoek
      ? [...users].filter((u) => u.naam.toLowerCase().includes(zoek)).sort((a, b) => {
          const av = a.naam.toLowerCase().startsWith(zoek) ? 0 : 1;
          const bv = b.naam.toLowerCase().startsWith(zoek) ? 0 : 1;
          return av - bv || a.naam.localeCompare(b.naam, "nl");
        })
      : [];
    const sluit = () => { setMapDetailId(null); setNaamZoek(""); setNaamBewerk(false); };
    const nieuweInMap = () => { setBewerk(undefined); setVoorinvul({ mapId: detailMap.id }); setModus("formulier"); };
    const bewaarNaam = () => { const n = mapNaamConcept.trim(); if (n && n !== detailMap.naam) updateVoorschouwMap(detailMap.id, { naam: n }); setNaamBewerk(false); };
    return (
      <div className="space-y-6">
        <button type="button" onClick={sluit} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar overzicht</button>

        {/* Kop: de naam is alleen met het potlood te wijzigen (niet zomaar aanklikken) */}
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Folder className="h-6 w-6" /></span>
          {naamBewerk ? (
            <>
              <input autoFocus value={mapNaamConcept} onChange={(e) => setMapNaamConcept(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") bewaarNaam(); if (e.key === "Escape") setNaamBewerk(false); }} onBlur={bewaarNaam} aria-label="Mapnaam" className="min-w-0 flex-1 rounded-lg border border-brand-300 px-3 py-2 text-xl font-bold text-ink-900 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={bewaarNaam} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"><Check className="h-4 w-4" /> Opslaan</button>
            </>
          ) : (
            <>
              <h2 className="min-w-0 flex-1 truncate text-2xl font-bold text-ink-900">{detailMap.naam}</h2>
              {isLeiding && <button type="button" onClick={() => { setMapNaamConcept(detailMap.naam); setNaamBewerk(true); }} title="Naam wijzigen" aria-label="Naam wijzigen" className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600"><Pencil className="h-5 w-5" /></button>}
            </>
          )}
        </div>

        {/* Werken in deze map: nieuwe voorschouw toevoegen (komt automatisch in deze map) */}
        <button type="button" onClick={nieuweInMap} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700">
          <Plus className="h-4 w-4" /> Nieuwe voorschouw in deze map
        </button>

        {/* Toewijzen op naam — alleen de leiding */}
        {isLeiding && (
          <Card className="space-y-3 p-5">
            <div>
              <h3 className="text-sm font-bold text-ink-900">Wie moet deze map oppakken?</h3>
              <p className="mt-0.5 text-xs text-ink-500">Typ een naam en klik op de juiste persoon. Hij ziet de map dan bij <b>Mijn werk</b>.</p>
            </div>
            {toegewezen && (
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1 text-sm font-semibold text-brand-700 ring-1 ring-brand-200"><User className="h-4 w-4" /> {toegewezen.naam}</span>
                <button type="button" onClick={() => setVraagToewijzingWeg(true)} className="text-xs font-medium text-red-500 hover:underline">Toewijzing verwijderen</button>
              </div>
            )}
            <div>
              <input value={naamZoek} onChange={(e) => setNaamZoek(e.target.value)} placeholder="Typ een naam…" aria-label="Zoek medewerker" className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              {zoek && (
                <div className="mt-2 max-h-72 space-y-1 overflow-auto rounded-lg border border-ink-100 p-1">
                  {kandidaten.length === 0 ? (
                    <p className="px-3 py-2 text-sm text-ink-400">Geen medewerker gevonden voor “{naamZoek.trim()}”.</p>
                  ) : kandidaten.map((u) => {
                    const gekozen = detailMap.toegewezenAan === u.id;
                    return (
                      <button key={u.id} type="button" onClick={() => { zetMapToegewezen(detailMap.id, u.id); setNaamZoek(""); }} className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-brand-50 ${gekozen ? "bg-brand-50" : ""}`}>
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{u.initialen}</span>
                        <span className="min-w-0 flex-1 truncate font-medium text-ink-800">{u.naam}</span>
                        {gekozen && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Card>
        )}

        {/* Adressen in deze map — klik op een adres om het te openen/bewerken */}
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-bold text-ink-900">Adressen in deze map ({items.length})</h3>
          {items.length === 0 ? (
            <p className="text-sm text-ink-500">Nog geen adressen. Klik op <b>Nieuwe voorschouw in deze map</b> om te beginnen.</p>
          ) : (
            <div className="space-y-1.5">
              {items.map((v) => (
                <button key={v.id} type="button" onClick={() => open(v)} title="Openen / bewerken" className="flex w-full items-center gap-2 rounded-lg bg-ink-50/60 px-3 py-2 text-left text-sm hover:bg-ink-100">
                  <MapPin className="h-4 w-4 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1 truncate text-ink-800">{v.straatnaam || "Onbekend"}{v.postcode || v.plaats ? `, ${[v.postcode, v.plaats].filter(Boolean).join(" ")}` : ""}</span>
                  {vsZonderFoto(v)
                    ? <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-600"><ImageOff className="h-3.5 w-3.5" /> geen foto</span>
                    : <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-green-600"><CheckCircle2 className="h-3.5 w-3.5" /> {v.fotos.length}</span>}
                  <Pencil className="h-3.5 w-3.5 shrink-0 text-ink-300" />
                </button>
              ))}
            </div>
          )}
        </Card>

        <Bevestig
          open={vraagToewijzingWeg}
          titel="Toewijzing verwijderen"
          tekst={toegewezen ? `Weet je zeker dat je ${toegewezen.naam} wilt loskoppelen van de map "${detailMap.naam}"? Deze map verdwijnt dan bij hem uit Mijn werk.` : ""}
          bevestigLabel="Ja, verwijderen"
          onBevestig={() => { zetMapToegewezen(detailMap.id, ""); setVraagToewijzingWeg(false); }}
          onAnnuleer={() => setVraagToewijzingWeg(false)}
        />
      </div>
    );
  }

  return (
    <div key="overzicht" className="space-y-6 animate-slide-in-left">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Voorschouwen</h2>
          <p className="text-sm text-ink-500">
            {isLeiding
              ? "Alle ingevulde voorschouwen van het team."
              : "Jouw voorschouwen. Vul er een in bij de klant thuis."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setScanOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
          >
            <ScanLine className="h-4 w-4" />
            Formulier scannen
          </button>
          <button
            type="button"
            onClick={nieuw}
            className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Nieuwe voorschouw
          </button>
        </div>
      </div>
      <VoorschouwScanModal open={scanOpen} onSluit={() => setScanOpen(false)} onResultaat={naScan} />

      {isLeiding && (
        <div className="flex gap-1 rounded-xl border border-ink-200 bg-white p-1 shadow-card">
          <button type="button" onClick={() => setTab("overzicht")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === "overzicht" ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>Overzicht</button>
          <button type="button" onClick={() => setTab("stedin")} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors ${tab === "stedin" ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>Klaar voor Stedin{gereedeMappen.length ? ` (${gereedeMappen.length})` : ""}</button>
        </div>
      )}

      {/* Mini-overzicht */}
      <div className="grid grid-cols-3 gap-4">
        <Card className="flex flex-col items-start gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
          <div className="rounded-xl bg-brand-50 p-2.5 text-brand-600">
            <ClipboardCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-ink-900">{zichtbaar.length}</div>
            <div className="text-xs text-ink-500">Totaal</div>
          </div>
        </Card>
        <Card className="flex flex-col items-start gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
          <div className="rounded-xl bg-green-50 p-2.5 text-green-600">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-ink-900">{ingediend}</div>
            <div className="text-xs text-ink-500">Ingediend</div>
          </div>
        </Card>
        <Card className="flex flex-col items-start gap-1.5 p-3 sm:flex-row sm:items-center sm:gap-3 sm:p-4">
          <div className="rounded-xl bg-orange-50 p-2.5 text-orange-600">
            <Pencil className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-ink-900">{concept}</div>
            <div className="text-xs text-ink-500">Concept</div>
          </div>
        </Card>
      </div>

      {/* Voortgang: hoeveel adressen al mét foto (= gedaan) */}
      {zichtbaar.length > 0 && (
        <div className="rounded-xl border border-ink-200 bg-white p-4 shadow-card">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span className="font-semibold text-ink-700">Voortgang — adressen mét foto</span>
            <span className="text-ink-500">{metFoto} van {zichtbaar.length} ({pctFoto}%)</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-ink-100"><div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pctFoto}%` }} /></div>
        </div>
      )}

      {/* Mappen op postcode — automatisch versturen zodra een map vol is */}

      {/* Selectie- en actiebalk */}
      {zichtbaar.length > 0 && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-card">
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
            <input
              type="checkbox"
              checked={alleGeselecteerd}
              onChange={toggleAlle}
              className="h-4 w-4 accent-brand-600"
            />
            {selectie.size > 0 ? `${selectie.size} geselecteerd` : "Alles selecteren"}
          </label>

          {selectie.size > 0 && (
            <button
              type="button"
              onClick={wis}
              className="inline-flex items-center gap-1 text-xs text-ink-400 hover:text-ink-600"
            >
              <X className="h-3.5 w-3.5" />
              Wissen
            </button>
          )}

          <div className="flex w-full flex-wrap items-center gap-2 sm:ml-auto sm:w-auto">
            <span className="hidden text-xs text-ink-400 sm:inline">Met selectie:</span>
            {isLeiding && (
              <button
                type="button"
                disabled={!geselecteerd().some((v) => v.mapId && geldigeMapIds.has(v.mapId))}
                onClick={klaarzettenVoorStedin}
                title="Zet de mappen van de geselecteerde adressen klaar op de controle-/verstuurpagina (kies adressen die in een map zitten)"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-2"
              >
                <Send className="h-4 w-4" /> Naar Stedin klaarzetten
              </button>
            )}
            <button
              type="button"
              disabled={selectie.size === 0 || bezig}
              onClick={exporteerZip}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-2"
            >
              {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderArchive className="h-4 w-4" />}
              Download als map (ZIP)
            </button>
          </div>
        </div>
      )}

      {/* Lijst — gegroepeerd per eigen map */}
      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <ClipboardCheck className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">
            Nog geen voorschouwen. Klik op <span className="font-medium">Nieuwe voorschouw</span> om te beginnen.
          </p>
        </Card>
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-ink-700">Adressen in mappen</h3>
            <button type="button" onClick={nieuweMap} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <FolderPlus className="h-4 w-4" /> Nieuwe map
            </button>
          </div>

          {/* Filters: alles vs alleen open (zonder foto) + gebied vs per week */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 rounded-lg border border-ink-200 bg-white p-0.5">
              <button type="button" onClick={() => setAlleenOpen(false)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!alleenOpen ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>Alles</button>
              <button type="button" onClick={() => setAlleenOpen(true)} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${alleenOpen ? "bg-amber-500 text-white" : "text-ink-600 hover:bg-ink-50"}`}><ImageOff className="h-3.5 w-3.5" /> Alleen open (zonder foto)</button>
            </div>
            <div className="flex gap-1 rounded-lg border border-ink-200 bg-white p-0.5">
              <button type="button" onClick={() => setPerWeek(false)} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${!perWeek ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}>Op gebied</button>
              <button type="button" onClick={() => setPerWeek(true)} className={`inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${perWeek ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-ink-50"}`}><Calendar className="h-3.5 w-3.5" /> Per week</button>
            </div>
          </div>

          {/* Week-navigator — alleen in de "Per week"-weergave: stap per week door je werk */}
          {perWeek && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-ink-200 bg-white p-2 shadow-card">
              <button type="button" onClick={() => verschuifWeek(-7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><ChevronLeft className="h-4 w-4" /> Vorige</button>
              <div className="flex min-w-0 flex-1 items-center justify-center gap-1.5 px-2 text-center">
                <Calendar className="h-4 w-4 shrink-0 text-ink-400" />
                <span className="text-sm font-bold text-ink-900">Week {vsWeekNr(weekISO)} · {vsWeekBereik(weekISO)}</span>
              </div>
              <button type="button" onClick={() => verschuifWeek(7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Volgende <ChevronRight className="h-4 w-4" /></button>
              {weekISO !== huidigeWeekISO && <button type="button" onClick={() => setWeekISO(huidigeWeekISO)} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Deze week</button>}
            </div>
          )}

          {/* Mappen zoeken/filteren + sorteren — zichtbaar voor iedereen */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
              <input value={mapZoek} onChange={(e) => setMapZoek(e.target.value)} placeholder="Zoek map, straat of postcode…" aria-label="Mappen zoeken" className="w-full rounded-lg border border-ink-200 bg-white py-2 pl-9 pr-9 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              {mapZoek && <button type="button" onClick={() => setMapZoek("")} aria-label="Zoekopdracht wissen" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100"><X className="h-4 w-4" /></button>}
            </div>
            {actieveMappen.length > 1 && (
              <div className="flex shrink-0 items-center gap-1.5 sm:ml-auto">
                <span className="text-xs text-ink-400">Sorteer</span>
                <Keuze
                  size="sm"
                  value={sorteerModus}
                  onChange={(w) => setSorteerModus(w as typeof sorteerModus)}
                  title="Mappen sorteren"
                  className="w-40 font-semibold"
                  opties={[
                    { waarde: "open", label: "Open eerst" },
                    { waarde: "eigen", label: "Eigen volgorde" },
                    { waarde: "naam", label: "Naam (A–Z)" },
                    { waarde: "naamOmgekeerd", label: "Naam (Z–A)" },
                    { waarde: "aantal", label: "Meeste adressen" },
                    { waarde: "nieuw", label: "Nieuwste eerst" },
                  ]}
                />
              </div>
            )}
          </div>
          {eigenModus && actieveMappen.length > 1 && isLeiding && (
            <p className="-mt-2 text-xs text-ink-400">Gebruik de pijltjes ▲▼ om mappen te verslepen naar de gewenste volgorde.</p>
          )}

          {weergave.length === 0 ? (
            <Card className="p-8 text-center">
              <Search className="mx-auto h-8 w-8 text-ink-300" />
              <p className="mt-2 text-sm text-ink-500">Geen mappen of adressen gevonden voor “{mapZoek.trim()}”.</p>
              <button type="button" onClick={() => setMapZoek("")} className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50"><X className="h-3.5 w-3.5" /> Zoekopdracht wissen</button>
            </Card>
          ) : perWeek && weergaveGetoond.length === 0 ? (
            <Card className="p-8 text-center">
              <Calendar className="mx-auto h-8 w-8 text-ink-300" />
              <p className="mt-2 text-sm text-ink-500">Geen mappen in deze week.</p>
            </Card>
          ) : weergaveGetoond.map((g) => {
            const key = g.map?.id ?? "zonder";
            const uitgeklapt = q !== "" ? true : openMappen.has(key);
            const idx = g.map ? eigenVolgordeIds.indexOf(g.map.id) : -1;
            const zonderFoto = g.items.filter((v) => !v.fotos || v.fotos.length === 0).length;
            return (
              <div key={key} id={g.map ? `vsmap-${g.map.id}` : undefined} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
                <div className="flex flex-wrap items-center gap-3 px-4 py-4">
                  <input
                    type="checkbox"
                    checked={mapGeselecteerd(g.body)}
                    ref={(el) => { if (el) el.indeterminate = mapDeels(g.body); }}
                    onChange={() => toggleMapSelectie(g.body)}
                    disabled={g.body.length === 0}
                    aria-label={`Map ${g.map ? g.map.naam : "zonder map"} selecteren`}
                    className="h-5 w-5 shrink-0 accent-brand-600 disabled:opacity-40"
                  />
                  {g.map && bewerkMapId === g.map.id ? (
                    <>
                      <Folder className="h-4 w-4 shrink-0 text-brand-600" />
                      <input
                        autoFocus
                        value={mapNaamConcept}
                        onChange={(e) => setMapNaamConcept(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") { e.preventDefault(); slaMapNaamOp(); }
                          else if (e.key === "Escape") { e.preventDefault(); setBewerkMapId(null); }
                        }}
                        onBlur={slaMapNaamOp}
                        aria-label="Mapnaam"
                        className="min-w-0 flex-1 rounded-lg border border-brand-300 px-2.5 py-1.5 text-sm font-bold text-ink-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                      />
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={slaMapNaamOp} title="Opslaan" aria-label="Naam opslaan" className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-700"><Check className="h-3.5 w-3.5" /> Opslaan</button>
                      <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setBewerkMapId(null)} title="Annuleren" aria-label="Annuleren" className="rounded-lg px-2 py-1.5 text-xs font-medium text-ink-500 hover:bg-ink-100 hover:text-ink-800">Annuleer</button>
                    </>
                  ) : (
                    <>
                      <button type="button" onClick={() => toggleMap(key)} className="flex min-w-0 flex-1 items-center gap-3 text-left" aria-expanded={uitgeklapt}>
                        <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${uitgeklapt ? "" : "-rotate-90"}`} />
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${g.map ? "bg-brand-50 text-brand-600" : "bg-ink-100 text-ink-400"}`}><Folder className="h-5 w-5" /></span>
                        <span className="truncate text-base font-bold text-ink-900">{g.map ? g.map.naam : "Zonder map"}</span>
                        <span className="shrink-0 rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-500">{q !== "" && g.body.length !== g.items.length ? `${g.body.length} van ${g.items.length}` : g.items.length}</span>
                        {zonderFoto > 0 && (
                          <span title={`${zonderFoto} ${zonderFoto === 1 ? "adres" : "adressen"} zonder foto`} className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 ring-1 ring-amber-200"><AlertTriangle className="h-3 w-3" /> {zonderFoto} zonder foto</span>
                        )}
                        {g.map?.toegewezenAan && (
                          <span title="Toegewezen aan" className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-xs font-semibold text-brand-700 ring-1 ring-brand-200"><User className="h-3 w-3" /> {naamVan(g.map.toegewezenAan)}</span>
                        )}
                      </button>
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        {isLeiding && g.map && (
                          <>
                            {eigenModus && (
                              <>
                                <button type="button" onClick={() => verplaatsMap(g.map!.id, "omhoog")} disabled={idx <= 0} title="Map omhoog" aria-label="Map omhoog verplaatsen" className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                                <button type="button" onClick={() => verplaatsMap(g.map!.id, "omlaag")} disabled={idx < 0 || idx >= eigenVolgordeIds.length - 1} title="Map omlaag" aria-label="Map omlaag verplaatsen" className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700 disabled:cursor-not-allowed disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                              </>
                            )}
                            <button type="button" onClick={() => { setMapDetailId(g.map!.id); setMapNaamConcept(g.map!.naam); }} title="Map openen (naam + toewijzen)" aria-label="Map openen" className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
                            <button type="button" onClick={() => verwijderMap(g.map!.id, g.map!.naam, g.items.length)} title="Map verwijderen" aria-label="Map verwijderen" className="shrink-0 rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button>
                          </>
                        )}
                        <button type="button" onClick={() => void downloadMap(g.body)} disabled={g.body.length === 0 || bezig} title="Download deze map (ZIP)" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-2">
                          {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderArchive className="h-4 w-4 shrink-0" />}
                          Download
                        </button>
                      </div>
                    </>
                  )}
                </div>
                {uitgeklapt && (
                  <div className="border-t border-ink-100 bg-ink-50/30 p-3">
                    {g.body.length === 0 ? (
                      <p className="rounded-lg bg-white px-3 py-2 text-xs text-ink-400">Nog geen adressen in deze map. Kies bij een adres “{g.map?.naam}” in het map-menu.</p>
                    ) : (
                      <div className="space-y-3">{g.body.map(rij)}</div>
                    )}
                  </div>
                )}
                </div>
            );
          })}
        </div>
      )}

      {nieuweMapOpen && (
        <NieuweMapModal
          voorschouwen={zichtbaar}
          naamVan={naamVan}
          voorinvulIds={voorinvulIds}
          onAnnuleer={() => setNieuweMapOpen(false)}
          onMaak={maakMap}
        />
      )}


      <Bevestig
        open={!!teVerwijderenMap}
        titel="Map verwijderen"
        tekst={
          teVerwijderenMap
            ? `Map “${teVerwijderenMap.naam}” verwijderen? De ${teVerwijderenMap.aantal} adres${teVerwijderenMap.aantal === 1 ? "" : "sen"} ${teVerwijderenMap.aantal === 1 ? "blijft" : "blijven"} bestaan en ${teVerwijderenMap.aantal === 1 ? "komt" : "komen"} onder “Zonder map”.`
            : ""
        }
        bevestigLabel="Verwijderen"
        bevestigTone="rood"
        onBevestig={bevestigVerwijderMap}
        onAnnuleer={() => setTeVerwijderenMap(null)}
      />
    </div>
  );
}

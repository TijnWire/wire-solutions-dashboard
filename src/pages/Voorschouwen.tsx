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
  Mail,
  FolderArchive,
  Loader2,
  X,
  Folder,
  FolderPlus,
  Search,
  Check,
  ChevronDown,
  ScanLine,
  ArrowUp,
  ArrowDown,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { VoorschouwForm } from "../components/VoorschouwForm";
import { VoorschouwScanModal } from "../components/VoorschouwScanModal";
import { Keuze } from "../components/Keuze";
import {
  downloadVoorschouwPdf,
  downloadVoorschouwenZip,
  mailVoorschouwenNaarStedin,
} from "../lib/voorschouwPdf";
import type { Voorschouw, VoorschouwMap } from "../lib/types";

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
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const breedte = 224; // px (w-56)

  const openMenu = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: Math.max(8, r.right - breedte) });
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const buiten = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node) || menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    const dicht = () => setOpen(false); // bij scrollen/resizen sluiten (positie zou anders verlopen)
    document.addEventListener("mousedown", buiten);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", dicht, true);
    window.addEventListener("resize", dicht);
    return () => {
      document.removeEventListener("mousedown", buiten);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", dicht, true);
      window.removeEventListener("resize", dicht);
    };
  }, [open]);

  const huidig = mappen.find((m) => m.id === value);
  const kies = (w: string) => { onKies(w); setOpen(false); };

  return (
    <>
      <button ref={btnRef} type="button" onClick={() => (open ? setOpen(false) : openMenu())} aria-haspopup="listbox" aria-expanded={open} title="In welke map hoort dit adres?" className="flex max-w-[11rem] items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-medium text-ink-700 outline-none hover:bg-ink-50 focus:border-brand-400">
        <Folder className={`h-3.5 w-3.5 shrink-0 ${huidig ? "text-brand-600" : "text-ink-400"}`} />
        <span className={`truncate ${huidig ? "" : "text-ink-500"}`}>{huidig ? huidig.naam : "Geen map"}</span>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && pos && createPortal(
        <div ref={menuRef} style={{ position: "fixed", top: pos.top, left: pos.left, width: breedte }} className="z-50 max-h-72 overflow-auto rounded-xl border border-ink-200 bg-white p-1 shadow-cardhover">
          <button type="button" onClick={() => kies("")} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${value === "" ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-600 hover:bg-ink-50"}`}>
            <span className="flex-1">Geen map</span>
            {value === "" && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
          </button>
          {mappen.map((m) => {
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
        </div>,
        document.body
      )}
    </>
  );
}

export function Voorschouwen() {
  const { voorschouwen, voorschouwMappen, users, currentUser, deleteVoorschouw, updateVoorschouw, addVoorschouwMap, updateVoorschouwMap, deleteVoorschouwMap } = useApp();
  const [modus, setModus] = useState<"lijst" | "formulier">("lijst");
  const [bewerk, setBewerk] = useState<Voorschouw | undefined>(undefined);
  const [scanOpen, setScanOpen] = useState(false);
  const [voorinvul, setVoorinvul] = useState<Partial<Voorschouw> | undefined>(undefined);
  const [selectie, setSelectie] = useState<Set<string>>(new Set());
  const [bezig, setBezig] = useState(false);
  const [nieuweMapOpen, setNieuweMapOpen] = useState(false);
  const [voorinvulIds, setVoorinvulIds] = useState<string[]>([]);
  const [openMappen, setOpenMappen] = useState<Set<string>>(new Set()); // standaard alle mappen dicht
  const [bewerkMapId, setBewerkMapId] = useState<string | null>(null);
  const [mapNaamConcept, setMapNaamConcept] = useState("");
  // Mappen zoeken/filteren + sorteren (sorteervoorkeur lokaal per apparaat, NIET in de gesyncte store).
  const [mapZoek, setMapZoek] = useState("");
  const [sorteerModus, setSorteerModus] = useState<"eigen" | "naam" | "naamOmgekeerd" | "aantal" | "nieuw">(() => {
    try {
      const v = localStorage.getItem("vs-mapSort");
      return v === "eigen" || v === "naam" || v === "naamOmgekeerd" || v === "aantal" || v === "nieuw" ? v : "naam";
    } catch { return "naam"; }
  });
  const [teVerwijderenMap, setTeVerwijderenMap] = useState<{ id: string; naam: string; aantal: number } | null>(null);
  useEffect(() => { try { localStorage.setItem("vs-mapSort", sorteerModus); } catch { /* opslag niet beschikbaar */ } }, [sorteerModus]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";

  // Gearchiveerde mappen (en hun adressen) verdwijnen uit de actieve lijst — ze staan in de database.
  const archiefMapIds = new Set(voorschouwMappen.filter((m) => m.gearchiveerd).map((m) => m.id));
  const zichtbaar = (isLeiding
    ? voorschouwen
    : voorschouwen.filter((v) => v.ingevuldDoor === currentUser.id)
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
  const exporteerMail = async () => {
    setBezig(true);
    try {
      await mailVoorschouwenNaarStedin(geselecteerd());
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
  const startBewerkMap = (id: string, huidig: string) => {
    setBewerkMapId(id);
    setMapNaamConcept(huidig);
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
  const actieveMappen = voorschouwMappen.filter((m) => !m.gearchiveerd);
  const geldigeMapIds = new Set(actieveMappen.map((m) => m.id));
  const gesorteerdeMappen = [...actieveMappen].sort((a, b) => a.naam.localeCompare(b.naam, "nl")); // voor het map-menu (voorspelbaar A–Z)
  // Handmatige volgorde (voor de omhoog/omlaag-knoppen): bepaalt of een map boven- of onderaan staat.
  const eigenVolgordeIds = [...actieveMappen].sort(opEigenVolgorde).map((m) => m.id);
  // Mapgroepen in de gekozen sorteervolgorde; "Zonder map" komt altijd als laatste.
  const opNaam = (a: VoorschouwMap, b: VoorschouwMap) => a.naam.localeCompare(b.naam, "nl");
  const mapGroepen = actieveMappen.map((m) => ({ map: m, items: zichtbaar.filter((v) => v.mapId === m.id) }));
  mapGroepen.sort((ga, gb) => {
    switch (sorteerModus) {
      case "naamOmgekeerd": return opNaam(gb.map, ga.map) || ga.map.id.localeCompare(gb.map.id);
      case "aantal": return gb.items.length - ga.items.length || opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id);
      case "nieuw": return (gb.map.aangemaakt ?? "").localeCompare(ga.map.aangemaakt ?? "") || opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id);
      case "eigen": return opEigenVolgorde(ga.map, gb.map);
      default: return opNaam(ga.map, gb.map) || ga.map.id.localeCompare(gb.map.id); // "naam" (A–Z)
    }
  });
  const groepen: { map: { id: string; naam: string } | null; items: Voorschouw[] }[] = mapGroepen;
  const zonderMap = zichtbaar.filter((v) => !v.mapId || !geldigeMapIds.has(v.mapId));
  if (zonderMap.length) groepen.push({ map: null, items: zonderMap });

  // Tekstfilter over de mappen-weergave: een map is zichtbaar als de naam matcht (dan alle adressen) of
  // een adres matcht (dan alleen die adressen in de body). Puur cosmetisch — raakt de bulk-selectie niet.
  const q = mapZoek.trim().toLowerCase();
  const itemMatch = (v: Voorschouw) => `${v.straatnaam} ${v.postcode} ${v.plaats}`.toLowerCase().includes(q);
  const weergave = groepen
    .map((g) => {
      const naamMatch = q === "" || (g.map?.naam ?? "zonder map").toLowerCase().includes(q);
      const body = naamMatch ? g.items : g.items.filter(itemMatch);
      return { map: g.map, items: g.items, body, toon: q === "" || naamMatch || body.length > 0 };
    })
    .filter((g) => g.toon);
  const eigenModus = sorteerModus === "eigen" && q === ""; // alleen dan mag je met de pijlen herordenen

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

  return (
    <div className="space-y-6">
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
            <span className="hidden text-xs text-ink-400 sm:inline">Verstuur naar Stedin:</span>
            <button
              type="button"
              disabled={selectie.size === 0 || bezig}
              onClick={exporteerMail}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-brand-600 px-3.5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40 sm:flex-none sm:py-2"
            >
              {bezig ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
              Mail naar Stedin
            </button>
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
          ) : weergave.map((g) => {
            const key = g.map?.id ?? "zonder";
            const uitgeklapt = q !== "" ? true : openMappen.has(key);
            const idx = g.map ? eigenVolgordeIds.indexOf(g.map.id) : -1;
            return (
              <div key={key} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
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
                            <button type="button" onClick={() => startBewerkMap(g.map!.id, g.map!.naam)} title="Naam wijzigen" aria-label="Map hernoemen" className="shrink-0 rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-brand-600"><Pencil className="h-4 w-4" /></button>
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

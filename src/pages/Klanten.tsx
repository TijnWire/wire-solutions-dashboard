import { useState } from "react";
import {
  Search, Plus, ArrowLeft, MapPin, Phone, Trash2, X,
  CalendarCheck, Mailbox, ClipboardCheck, Database, Image as ImageIcon, Download,
  Building2, ChevronDown, ChevronRight, FlaskConical, Recycle, RotateCcw, FolderArchive,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { FotoKnoppen } from "../components/FotoKnoppen";
import { fileNaarDataUrl } from "../lib/image";
import { downloadVoorschouwPdf } from "../lib/voorschouwPdf";
import { datumLabel } from "../lib/afspraak";
import { TAUW_TYPE_LABEL } from "../lib/types";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

const normKey = (straat: string, huisnummer: string) => `${straat.trim()} ${String(huisnummer).trim()}`.toLowerCase();

type AdresItem = { key: string; naam: string; straat: string; huisnummer: string; postcode: string; plaats: string; telefoon: string; klantId?: string };

// ── Nieuw klant ──
function KlantForm({ onKlaar }: { onKlaar: () => void }) {
  const { addKlant } = useApp();
  const [d, setD] = useState({ naam: "", straat: "", huisnummer: "", postcode: "", plaats: "", telefoon: "", notitie: "" });
  const [fotos, setFotos] = useState<string[]>([]);
  const [bezig, setBezig] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));

  const upload = async (files: FileList | null) => {
    if (!files) return;
    setBezig(true);
    try { const n: string[] = []; for (const f of Array.from(files)) n.push(await fileNaarDataUrl(f)); setFotos((p) => [...p, ...n]); }
    finally { setBezig(false); }
  };
  const opslaan = () => { if (!d.straat.trim() || !d.huisnummer.trim()) return; addKlant({ ...d, fotos }); onKlaar(); };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug</button>
      <h2 className="text-xl font-bold text-ink-900">Nieuwe klant / adres</h2>
      <Card className="space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <div><label className={labelCls}>Naam</label><input value={d.naam} onChange={(e) => set({ naam: e.target.value })} placeholder="Naam klant" className={veld} /></div>
          <div><label className={labelCls}>Telefoon</label><input value={d.telefoon} onChange={(e) => set({ telefoon: e.target.value })} placeholder="06 …" className={veld} /></div>
          <div><label className={labelCls}>Straat</label><input value={d.straat} onChange={(e) => set({ straat: e.target.value })} placeholder="Straatnaam" className={veld} /></div>
          <div><label className={labelCls}>Huisnummer</label><input value={d.huisnummer} onChange={(e) => set({ huisnummer: e.target.value })} placeholder="12" className={veld} /></div>
          <div><label className={labelCls}>Postcode</label><input value={d.postcode} onChange={(e) => set({ postcode: e.target.value })} placeholder="1234 AB" className={veld} /></div>
          <div><label className={labelCls}>Plaats</label><input value={d.plaats} onChange={(e) => set({ plaats: e.target.value })} placeholder="Rotterdam" className={veld} /></div>
        </div>
        <div><label className={labelCls}>Notitie (bijv. waar zit de meterkast)</label><textarea value={d.notitie} onChange={(e) => set({ notitie: e.target.value })} rows={2} className={veld + " resize-none"} /></div>
        <div>
          <label className={labelCls}>Meterkast-foto's</label>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {fotos.map((f, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-ink-200">
                <img src={f} alt="" className="h-full w-full object-cover" />
                <button type="button" onClick={() => setFotos((p) => p.filter((_, idx) => idx !== i))} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
              </div>
            ))}
            <FotoKnoppen onFiles={upload} bezig={bezig} />
          </div>
        </div>
      </Card>
      <button type="button" onClick={opslaan} disabled={!d.straat.trim() || !d.huisnummer.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40"><Plus className="h-4 w-4" /> Opslaan in database</button>
    </div>
  );
}

export function Klanten({ initieelKey }: { initieelKey?: string }) {
  const { klanten, afspraken, rondes, voorschouwen, voorschouwMappen, saneringen, tauwOpdrachten, currentUser, addKlant, updateKlant, deleteKlant, updateRonde, updateSanering, updateTauw, updateVoorschouwMap } = useApp();
  const [zoek, setZoek] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(initieelKey ?? null);
  const [nieuw, setNieuw] = useState(false);
  const [verwijder, setVerwijder] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [sorteer, setSorteer] = useState<"straat" | "postcode">("straat");
  const [geopend, setGeopend] = useState<Set<string>>(new Set());
  const [geopendStraat, setGeopendStraat] = useState<Set<string>>(new Set());
  const [geopendCat, setGeopendCat] = useState<Set<string>>(new Set()); // projectmappen — standaard dicht
  const [geopendArchief, setGeopendArchief] = useState<Set<string>>(new Set()); // los gearchiveerd project
  const [tab, setTab] = useState<"adressen" | "projecten">("projecten");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";

  // Aggregatie: bouw één adressenindex uit klanten + afspraken + brieven
  const map = new Map<string, AdresItem>();
  const merge = (it: AdresItem) => {
    const best = map.get(it.key);
    if (!best) { map.set(it.key, it); return; }
    map.set(it.key, {
      ...best,
      naam: best.naam || it.naam, postcode: best.postcode || it.postcode, plaats: best.plaats || it.plaats,
      telefoon: best.telefoon || it.telefoon, klantId: best.klantId || it.klantId,
    });
  };
  for (const k of klanten) merge({ key: normKey(k.straat, k.huisnummer), naam: k.naam, straat: k.straat, huisnummer: k.huisnummer, postcode: k.postcode, plaats: k.plaats, telefoon: k.telefoon, klantId: k.id });
  for (const a of afspraken) if (a.straat && a.huisnummer) merge({ key: normKey(a.straat, a.huisnummer), naam: a.klantNaam, straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, telefoon: a.telefoon });
  for (const r of rondes) for (const ad of r.adressen) merge({ key: normKey(r.straat, String(ad.huisnummer)), naam: "", straat: r.straat, huisnummer: String(ad.huisnummer), postcode: r.postcode, plaats: r.plaats, telefoon: "" });

  const alle = [...map.values()].sort((a, b) => a.straat.localeCompare(b.straat, "nl", { numeric: true }) || Number(a.huisnummer) - Number(b.huisnummer));

  // Historie per adres
  const historie = (it: AdresItem) => ({
    afspraken: afspraken.filter((a) => normKey(a.straat, a.huisnummer) === it.key),
    brieven: rondes.flatMap((r) => r.adressen.filter((ad) => normKey(r.straat, String(ad.huisnummer)) === it.key).map((ad) => ({ ronde: r, adres: ad }))),
    voorschouwen: voorschouwen.filter((v) => v.straatnaam.trim().toLowerCase() === it.straat.trim().toLowerCase()),
    klant: it.klantId ? klanten.find((k) => k.id === it.klantId) : undefined,
  });

  if (nieuw) return <KlantForm onKlaar={() => setNieuw(false)} />;

  // ── Detailweergave ──
  const open = openKey ? alle.find((a) => a.key === openKey) : undefined;
  if (open) {
    const h = historie(open);
    const vsFotos = h.voorschouwen.flatMap((v) => v.fotos.map((f) => ({ f, bron: "voorschouw" as const })));
    const klantFotos = (h.klant?.fotos ?? []).map((f) => ({ f, bron: "klant" as const }));
    const fotos = [...klantFotos, ...vsFotos];

    const zorgKlant = (): string => {
      if (h.klant) return h.klant.id;
      return addKlant({ naam: open.naam, straat: open.straat, huisnummer: open.huisnummer, postcode: open.postcode, plaats: open.plaats, telefoon: open.telefoon, notitie: "", fotos: [] });
    };
    const uploadFotos = async (files: FileList | null) => {
      if (!files) return;
      setBezig(true);
      try {
        const n: string[] = []; for (const f of Array.from(files)) n.push(await fileNaarDataUrl(f));
        const id = zorgKlant();
        const huidig = klanten.find((k) => k.id === id)?.fotos ?? [];
        updateKlant(id, { fotos: [...huidig, ...n] });
      } finally { setBezig(false); }
    };

    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setOpenKey(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar database</button>

        <Card className="flex flex-wrap items-center gap-4 p-5">
          <div className="rounded-xl bg-brand-50 p-3 text-brand-600"><MapPin className="h-6 w-6" /></div>
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-bold text-ink-900">{open.straat} {open.huisnummer}</h2>
            <div className="flex flex-wrap items-center gap-x-4 text-sm text-ink-500">
              {open.naam && <span>{open.naam}</span>}
              <span>{[open.postcode, open.plaats].filter(Boolean).join(" ")}</span>
              {open.telefoon && <a href={`tel:${open.telefoon}`} className="inline-flex items-center gap-1 text-brand-600"><Phone className="h-3.5 w-3.5" />{open.telefoon}</a>}
            </div>
          </div>
          {isLeiding && h.klant && (
            <button type="button" onClick={() => setVerwijder(h.klant!.id)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Klantrecord verwijderen"><Trash2 className="h-5 w-5" /></button>
          )}
        </Card>

        {/* Notitie */}
        <Card className="space-y-2 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Notitie</h3>
            {!h.klant && <span className="text-xs text-ink-400">Wordt opgeslagen in de database</span>}
          </div>
          <textarea
            value={h.klant?.notitie ?? ""}
            onChange={(e) => { const id = zorgKlant(); updateKlant(id, { notitie: e.target.value }); }}
            rows={2}
            placeholder="bijv. waar zit de meterkast, bijzonderheden, sleutel…"
            className={veld + " resize-none"}
          />
        </Card>

        {/* Meterkast-foto's */}
        <Card className="space-y-3 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><ImageIcon className="h-4 w-4 text-ink-500" /> Meterkast-foto's ({fotos.length})</h3>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {fotos.map((x, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-ink-200">
                <img src={x.f} alt="" className="h-full w-full object-cover" />
                <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1 text-[8px] text-white">{x.bron === "klant" ? "database" : "voorschouw"}</span>
                {x.bron === "klant" && h.klant && (
                  <button type="button" onClick={() => updateKlant(h.klant!.id, { fotos: h.klant!.fotos.filter((ff) => ff !== x.f) })} className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 group-hover:opacity-100"><X className="h-3.5 w-3.5" /></button>
                )}
              </div>
            ))}
            <FotoKnoppen onFiles={uploadFotos} bezig={bezig} />
          </div>
        </Card>

        {/* Historie */}
        <Card className="space-y-4 p-5">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Database className="h-4 w-4 text-ink-500" /> Volledige historie</h3>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-500"><CalendarCheck className="h-3.5 w-3.5" /> Afspraken</div>
            {h.afspraken.length === 0 ? <p className="text-sm text-ink-400">Geen.</p> : h.afspraken.map((a) => (
              <div key={a.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-ink-200 p-2.5 text-sm">
                <span className="font-medium text-ink-800">{a.datum ? datumLabel(a.datum) : "—"}{a.tijd ? ` ${a.tijd}` : ""}</span>
                <span className="text-ink-500">· {a.locatie}</span>
                <Badge tone={a.status === "Bevestigd" ? "green" : a.status === "Afgerond" ? "slate" : a.status === "Geannuleerd" ? "red" : "amber"}>{a.status}</Badge>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-500"><Mailbox className="h-3.5 w-3.5" /> Brieven</div>
            {h.brieven.length === 0 ? <p className="text-sm text-ink-400">Geen.</p> : h.brieven.map(({ ronde, adres }) => (
              <div key={adres.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-ink-200 p-2.5 text-sm">
                <span className="font-medium text-ink-800">{ronde.straat} {adres.huisnummer}</span>
                <span className="text-ink-500">· {ronde.plaats}</span>
                <Badge tone={adres.status === "Gegooid" ? "green" : adres.status === "Blanco" ? "amber" : adres.status === "Niet thuis" ? "red" : "slate"}>{adres.status}</Badge>
                {adres.type === "bedrijf" && <span className="text-xs text-brand-600">bedrijfspand</span>}
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-500"><ClipboardCheck className="h-3.5 w-3.5" /> Voorschouwen (straat)</div>
            {h.voorschouwen.length === 0 ? <p className="text-sm text-ink-400">Geen.</p> : h.voorschouwen.map((v) => (
              <div key={v.id} className="mb-1.5 flex items-center gap-2 rounded-lg border border-ink-200 p-2.5 text-sm">
                <span className="font-medium text-ink-800">{v.straatnaam}</span>
                <span className="text-ink-500">· {new Date(v.aangemaakt).toLocaleDateString("nl-NL")}</span>
                <Badge tone={v.status === "Ingediend" ? "green" : "amber"}>{v.status}</Badge>
                <button type="button" onClick={() => void downloadVoorschouwPdf(v)} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-ink-200 px-2.5 py-1 text-xs font-medium text-ink-700 hover:bg-ink-50"><Download className="h-3.5 w-3.5" /> PDF</button>
              </div>
            ))}
          </div>
        </Card>

        <Bevestig open={!!verwijder} titel="Klantrecord verwijderen" tekst="Dit verwijdert de opgeslagen notitie en foto's voor dit adres. De afspraken/brieven/voorschouwen blijven bestaan." onBevestig={() => { if (verwijder) deleteKlant(verwijder); setVerwijder(null); }} onAnnuleer={() => setVerwijder(null)} />
      </div>
    );
  }

  // ── Lijst ──
  const q = zoek.trim().toLowerCase();
  const zichtbaar = q ? alle.filter((a) => `${a.naam} ${a.straat} ${a.huisnummer} ${a.postcode} ${a.plaats}`.toLowerCase().includes(q)) : alle;

  // ── Projectarchief: 4 mappen met afgeronde projecten die naar de database zijn verstuurd ──
  type ArchiefRij = { id: string; titel: string; subtitel: string; datum?: string; regels: string[]; herstel: () => void };
  const projectMappen: { key: string; label: string; Icon: typeof Mailbox; rijen: ArchiefRij[] }[] = [
    {
      key: "brieven", label: "Brieven & Routes", Icon: Mailbox,
      rijen: rondes.filter((r) => r.gearchiveerd).map((r) => {
        const te = r.adressen.filter((a) => !a.ontbreekt);
        return {
          id: r.id,
          titel: r.straat || "Ronde",
          subtitel: [[r.postcode, r.plaats].filter(Boolean).join(" "), `${te.length} adres${te.length === 1 ? "" : "sen"}`].filter(Boolean).join(" · "),
          datum: r.gearchiveerdOp,
          regels: te.map((a) => `${r.straat} ${a.huisnummer}${a.toevoeging || ""} — ${a.status}`),
          herstel: () => updateRonde(r.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
        };
      }),
    },
    {
      key: "saneren", label: "Saneren", Icon: Recycle,
      rijen: saneringen.filter((s) => s.gearchiveerd).map((s) => {
        const adr = s.adressen ?? [];
        return {
          id: s.id,
          titel: s.naam || "Sanering",
          subtitel: [s.regio, `${adr.length} adres${adr.length === 1 ? "" : "sen"}`].filter(Boolean).join(" · "),
          datum: s.gearchiveerdOp,
          regels: adr.map((a) => `${a.straat} ${a.huisnummer}`.trim() + (a.naam ? ` — ${a.naam}` : "") + (a.bevestigd ? " ✓" : "")),
          herstel: () => updateSanering(s.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
        };
      }),
    },
    {
      key: "voorschouwen", label: "Voorschouwen", Icon: ClipboardCheck,
      rijen: voorschouwMappen.filter((m) => m.gearchiveerd).map((m) => {
        const items = voorschouwen.filter((v) => v.mapId === m.id);
        return {
          id: m.id,
          titel: m.naam,
          subtitel: `${items.length} voorschouw${items.length === 1 ? "" : "en"}`,
          datum: m.gearchiveerdOp,
          regels: items.map((v) => `${v.straatnaam || "Onbekende straat"}${v.plaats ? `, ${v.plaats}` : ""} — ${v.status}`),
          herstel: () => updateVoorschouwMap(m.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
        };
      }),
    },
    {
      key: "tauw", label: "TAUW", Icon: FlaskConical,
      rijen: tauwOpdrachten.filter((o) => o.gearchiveerd).map((o) => ({
        id: o.id,
        titel: o.referentie || o.regio || "TAUW-opdracht",
        subtitel: [TAUW_TYPE_LABEL[o.type], o.regio, `${o.adressen.length} adres${o.adressen.length === 1 ? "" : "sen"}`].filter(Boolean).join(" · "),
        datum: o.gearchiveerdOp,
        regels: o.adressen.map((a) => `${a.straat} ${a.huisnummer}${a.plaats ? `, ${a.plaats}` : ""}`),
        herstel: () => updateTauw(o.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
      })),
    },
  ];
  const totaalGearchiveerd = projectMappen.reduce((s, c) => s + c.rijen.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Klanten & Database</h2>
          <p className="text-sm text-ink-500">Eén centraal archief — zoek elk adres terug met alle historie en foto's.</p>
        </div>
        {isLeiding && <button type="button" onClick={() => setNieuw(true)} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700"><Plus className="h-4 w-4" /> Nieuwe klant</button>}
      </div>

      {/* Twee even grote tabbladen: Projecten (afgeronde projecten) eerst, dan Adressen (centraal adresarchief) */}
      <div className="grid w-full grid-cols-2 gap-1 rounded-xl border border-ink-200 bg-ink-100 p-1 shadow-card sm:w-80">
        <button type="button" onClick={() => setTab("projecten")} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${tab === "projecten" ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-white"}`}>
          <FolderArchive className="h-4 w-4" /> Projecten
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tab === "projecten" ? "bg-white/20 text-white" : "bg-ink-200 text-ink-600"}`}>{totaalGearchiveerd}</span>
        </button>
        <button type="button" onClick={() => setTab("adressen")} className={`flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-brand-400 ${tab === "adressen" ? "bg-brand-600 text-white" : "text-ink-600 hover:bg-white"}`}>
          <MapPin className="h-4 w-4" /> Adressen
          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tab === "adressen" ? "bg-white/20 text-white" : "bg-ink-200 text-ink-600"}`}>{alle.length}</span>
        </button>
      </div>

      {tab === "projecten" && (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs text-ink-400">{totaalGearchiveerd} bewaard · gegroepeerd per projectsoort</span>
          <span className="ml-auto hidden text-xs text-ink-400 sm:block">Afgeronde projecten verstuur je vanuit de projectpagina naar de database.</span>
        </div>
        {projectMappen.map((cat) => {
          const openCat = geopendCat.has(cat.key);
          const Icon = cat.Icon;
          return (
            <div key={cat.key} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
              <button type="button" onClick={() => setGeopendCat((p) => { const n = new Set(p); n.has(cat.key) ? n.delete(cat.key) : n.add(cat.key); return n; })} className="flex w-full items-center gap-3 px-5 py-4 text-left outline-none hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400" aria-expanded={openCat}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-base font-bold text-ink-900">{cat.label}</span>
                  <span className="block text-xs text-ink-500">{cat.rijen.length} {cat.rijen.length === 1 ? "project" : "projecten"} bewaard</span>
                </span>
                <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-500">{cat.rijen.length}</span>
                <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${openCat ? "" : "-rotate-90"}`} />
              </button>
              {openCat && (
                <div className="space-y-2 border-t border-ink-100 bg-ink-50/30 p-3">
                    {cat.rijen.length === 0 ? (
                      <p className="rounded-lg bg-white px-3 py-2.5 text-xs text-ink-400">Nog niets gearchiveerd. Klik bij een afgerond {cat.label}-project op “Naar database”.</p>
                    ) : (
                      cat.rijen.map((rij) => {
                        const rijOpen = geopendArchief.has(rij.id);
                        return (
                          <div key={rij.id} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                            <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
                              <button type="button" onClick={() => setGeopendArchief((p) => { const n = new Set(p); n.has(rij.id) ? n.delete(rij.id) : n.add(rij.id); return n; })} className="flex min-w-0 flex-1 items-center gap-2 text-left" aria-expanded={rijOpen}>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${rijOpen ? "" : "-rotate-90"}`} />
                                <span className="min-w-0">
                                  <span className="block truncate text-sm font-semibold text-ink-900">{rij.titel}</span>
                                  <span className="block truncate text-xs text-ink-500">{rij.subtitel}{rij.datum ? ` · gearchiveerd ${new Date(rij.datum).toLocaleDateString("nl-NL")}` : ""}</span>
                                </span>
                              </button>
                              {isLeiding && (
                                <button type="button" onClick={() => rij.herstel()} title="Terugzetten naar het project" className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                                  <RotateCcw className="h-3.5 w-3.5" /> Terugzetten
                                </button>
                              )}
                            </div>
                            {rijOpen && (
                              rij.regels.length > 0 ? (
                                <ul className="divide-y divide-ink-100 border-t border-ink-100 text-sm">
                                  {rij.regels.map((r, i) => (<li key={i} className="px-3 py-2 text-ink-700">{r}</li>))}
                                </ul>
                              ) : (
                                <p className="border-t border-ink-100 px-3 py-2 text-xs text-ink-400">Geen details.</p>
                              )
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}
      </div>
      )}

      {tab === "adressen" && (
      <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
        <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, adres, postcode of plaats…" className="w-full rounded-2xl border border-ink-200 bg-white py-3.5 pl-12 pr-4 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
      </div>

      {/* Sorteren */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs text-ink-400">{zichtbaar.length} adres{zichtbaar.length === 1 ? "" : "sen"} · gegroepeerd per gemeente</span>
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-ink-400">Sorteer op</span>
          {([["straat", "Straatnaam"], ["postcode", "Postcode"]] as const).map(([k, l]) => (
            <button key={k} type="button" onClick={() => setSorteer(k)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${sorteer === k ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"}`}>{l}</button>
          ))}
        </div>
      </div>

      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-500">Geen adressen gevonden.</Card>
      ) : (
        (() => {
          // Niveau 1: gemeente → Niveau 2: straat → Niveau 3: huisnummers
          const perGemeente = new Map<string, Map<string, AdresItem[]>>();
          for (const it of zichtbaar) {
            const g = it.plaats?.trim() || "Onbekende gemeente";
            const s = it.straat?.trim() || "Onbekende straat";
            if (!perGemeente.has(g)) perGemeente.set(g, new Map());
            const straatMap = perGemeente.get(g)!;
            (straatMap.get(s) ?? straatMap.set(s, []).get(s)!).push(it);
          }
          const gemeenteLijst = [...perGemeente.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
          const postcodeVan = (items: AdresItem[]) => items.map((i) => i.postcode).filter(Boolean).sort()[0] ?? "";

          return (
            <div className="space-y-4">
              {gemeenteLijst.map(([gemeente, straatMap]) => {
                const openG = q.length > 0 || geopend.has(gemeente);
                const totaal = [...straatMap.values()].reduce((s, a) => s + a.length, 0);
                const straten = [...straatMap.entries()].sort((a, b) =>
                  sorteer === "postcode"
                    ? postcodeVan(a[1]).localeCompare(postcodeVan(b[1]), "nl", { numeric: true }) || a[0].localeCompare(b[0], "nl")
                    : a[0].localeCompare(b[0], "nl", { numeric: true })
                );
                return (
                  <div key={gemeente} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
                    <button type="button" onClick={() => setGeopend((p) => { const n = new Set(p); n.has(gemeente) ? n.delete(gemeente) : n.add(gemeente); return n; })} className="flex w-full items-center gap-3 px-5 py-4 text-left outline-none hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400" aria-expanded={openG}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Building2 className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-bold text-ink-900">{gemeente}</span>
                        <span className="block text-xs text-ink-500">{straten.length} {straten.length === 1 ? "straat" : "straten"} · {totaal} adres{totaal === 1 ? "" : "sen"}</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${openG ? "" : "-rotate-90"}`} />
                    </button>

                    {openG && (
                      <div className="divide-y divide-ink-100 border-t border-ink-100">
                        {straten.map(([straat, items]) => {
                          const sKey = gemeente + "|" + straat;
                          const openS = q.length > 0 || geopendStraat.has(sKey);
                          const huisnrs = [...items].sort((a, b) => Number(a.huisnummer) - Number(b.huisnummer) || a.huisnummer.localeCompare(b.huisnummer, "nl"));
                          const pc = postcodeVan(items);
                          return (
                            <div key={sKey}>
                              <button type="button" onClick={() => setGeopendStraat((p) => { const n = new Set(p); n.has(sKey) ? n.delete(sKey) : n.add(sKey); return n; })} className="flex w-full items-center gap-3 px-5 py-3.5 text-left outline-none hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400" aria-expanded={openS}>
                                <MapPin className="h-4 w-4 shrink-0 text-ink-400" />
                                <span className="flex-1 truncate text-[15px] font-semibold text-ink-900">{straat}</span>
                                {pc && <span className="hidden text-xs text-ink-400 sm:block">{pc}</span>}
                                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">{huisnrs.length}</span>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${openS ? "" : "-rotate-90"}`} />
                              </button>
                              {openS && (
                                <div className="divide-y divide-ink-100 border-t border-ink-100 bg-ink-50/40">
                                  {huisnrs.map((it) => {
                                    const h = historie(it);
                                    const fotoN = (h.klant?.fotos.length ?? 0) + h.voorschouwen.reduce((s, v) => s + v.fotos.length, 0);
                                    return (
                                      <button key={it.key} type="button" onClick={() => setOpenKey(it.key)} className="flex w-full items-center gap-3 py-3 pl-6 pr-5 text-left outline-none hover:bg-brand-50 focus-visible:bg-brand-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400 sm:pl-12">
                                        <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-ink-700 ring-1 ring-ink-200">{it.huisnummer}</span>
                                        <div className="min-w-0 flex-1">
                                          <div className="truncate text-sm font-semibold text-ink-900">{it.straat} {it.huisnummer}{it.naam ? ` · ${it.naam}` : ""}</div>
                                          <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-500">
                                            {h.afspraken.length > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5">{h.afspraken.length} afspr.</span>}
                                            {h.brieven.length > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5">{h.brieven.length} brief</span>}
                                            {h.voorschouwen.length > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5">{h.voorschouwen.length} voorsch.</span>}
                                            {fotoN > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{fotoN} foto{fotoN === 1 ? "" : "'s"}</span>}
                                            {h.afspraken.length + h.brieven.length + h.voorschouwen.length + fotoN === 0 && <span>geen historie</span>}
                                          </div>
                                        </div>
                                        {it.klantId && <Database className="h-4 w-4 shrink-0 text-brand-500" />}
                                        <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                                      </button>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })()
      )}
      </div>
      )}
    </div>
  );
}

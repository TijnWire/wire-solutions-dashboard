import { useState } from "react";
import {
  Search, Plus, ArrowLeft, MapPin, Phone, Trash2, X,
  CalendarCheck, Mailbox, ClipboardCheck, Database, Image as ImageIcon, Download,
  ChevronDown, ChevronRight, FlaskConical, Recycle, FolderArchive, Layers, Hash, Map as MapIcon,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { FotoKnoppen } from "../components/FotoKnoppen";
import { fileNaarDataUrl } from "../lib/image";
import { downloadVoorschouwPdf } from "../lib/voorschouwPdf";
import { datumLabel } from "../lib/afspraak";
import { TAUW_TYPE_LABEL } from "../lib/types";
import { PeriodeNavigator, periodeRange, type Periode } from "../components/PeriodeNavigator";
import { afleidRegio, afleidProvincie } from "../lib/regio";

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
  const { klanten, afspraken, rondes, voorschouwen, voorschouwMappen, saneringen, tauwOpdrachten, buurtaanpak, currentUser, addKlant, updateKlant, deleteKlant, updateRonde, updateSanering, updateTauw, updateVoorschouwMap } = useApp();
  const [zoek, setZoek] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(initieelKey ?? null);
  const [nieuw, setNieuw] = useState(false);
  const [verwijder, setVerwijder] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set()); // uitgeklapte mappen in de adres-boom (pad-sleutel)
  const [detailCat, setDetailCat] = useState<string | null>(null); // geopende projectsoort-filterpagina
  const [detailZoek, setDetailZoek] = useState("");
  const [tab, setTab] = useState<"adressen" | "projecten">("projecten");
  const [periode, setPeriode] = useState<Periode>("maand");
  const [anker, setAnker] = useState(() => new Date().toISOString().slice(0, 10));

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
  for (const s of saneringen) for (const a of (s.adressen ?? [])) if (a.straat && a.huisnummer) merge({ key: normKey(a.straat, a.huisnummer), naam: a.naam || "", straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, telefoon: a.telefoon || "" });
  for (const o of tauwOpdrachten) for (const a of o.adressen) if (a.straat && a.huisnummer) merge({ key: normKey(a.straat, a.huisnummer), naam: a.bewoner || "", straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, telefoon: a.telefoon || "" });
  for (const b of buurtaanpak) for (const a of b.adressen) if (a.straat && a.huisnummer) merge({ key: normKey(a.straat, a.huisnummer), naam: "", straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: "", telefoon: a.telefoon || "" });

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
  type ArchiefRij = { id: string; titel: string; subtitel: string; datum?: string; peil: string; regels: string[]; gearchiveerd: boolean; herstel: () => void };
  const peilVan = (...kandidaten: (string | undefined)[]) => (kandidaten.find((d) => d) ?? "").slice(0, 10);
  const projectMappen: { key: string; label: string; Icon: typeof Mailbox; rijen: ArchiefRij[] }[] = [
    {
      key: "brieven", label: "Brieven & Routes", Icon: Mailbox,
      rijen: rondes.map((r) => {
        const te = r.adressen.filter((a) => !a.ontbreekt);
        return {
          id: r.id,
          titel: r.straat || "Ronde",
          subtitel: [[r.postcode, r.plaats].filter(Boolean).join(" "), `${te.length} adres${te.length === 1 ? "" : "sen"}`].filter(Boolean).join(" · "),
          datum: r.gearchiveerdOp,
          peil: peilVan(r.gearchiveerdOp, r.verstuurdOp, r.aangemaakt),
          regels: te.map((a) => `${r.straat} ${a.huisnummer}${a.toevoeging || ""} — ${a.status}`),
          gearchiveerd: !!r.gearchiveerd,
          herstel: () => updateRonde(r.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
        };
      }),
    },
    {
      key: "saneren", label: "Saneren", Icon: Recycle,
      rijen: saneringen.map((s) => {
        const adr = s.adressen ?? [];
        return {
          id: s.id,
          titel: s.naam || "Sanering",
          subtitel: [s.regio, `${adr.length} adres${adr.length === 1 ? "" : "sen"}`].filter(Boolean).join(" · "),
          datum: s.gearchiveerdOp,
          peil: peilVan(s.gearchiveerdOp, s.verstuurdOp, s.afgerondOp, s.aangemaakt),
          regels: adr.map((a) => `${a.straat} ${a.huisnummer}`.trim() + (a.naam ? ` — ${a.naam}` : "") + (a.bevestigd ? " ✓" : "")),
          gearchiveerd: !!s.gearchiveerd,
          herstel: () => updateSanering(s.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
        };
      }),
    },
    {
      key: "voorschouwen", label: "Voorschouwen", Icon: ClipboardCheck,
      rijen: voorschouwMappen.map((m) => {
        const items = voorschouwen.filter((v) => v.mapId === m.id);
        return {
          id: m.id,
          titel: m.naam,
          subtitel: `${items.length} voorschouw${items.length === 1 ? "" : "en"}`,
          datum: m.gearchiveerdOp,
          peil: peilVan(m.gearchiveerdOp, m.aangemaakt),
          regels: items.map((v) => `${v.straatnaam || "Onbekende straat"}${v.plaats ? `, ${v.plaats}` : ""} — ${v.status}`),
          gearchiveerd: !!m.gearchiveerd,
          herstel: () => {
            // Zet de teruggehaalde map achteraan de handmatige volgorde (vers volgnummer), zodat het
            // niet botst met de 0..n-1-nummering van de actieve mappen.
            const maxActief = voorschouwMappen.filter((x) => !x.gearchiveerd).reduce((mx, x) => Math.max(mx, x.volgorde ?? -1), -1);
            updateVoorschouwMap(m.id, { gearchiveerd: false, gearchiveerdOp: undefined, volgorde: maxActief + 1 });
          },
        };
      }),
    },
    {
      key: "tauw", label: "TAUW", Icon: FlaskConical,
      rijen: tauwOpdrachten.map((o) => ({
        id: o.id,
        titel: o.referentie || o.regio || "TAUW-opdracht",
        subtitel: [TAUW_TYPE_LABEL[o.type], o.regio, `${o.adressen.length} adres${o.adressen.length === 1 ? "" : "sen"}`].filter(Boolean).join(" · "),
        datum: o.gearchiveerdOp,
        peil: peilVan(o.gearchiveerdOp, o.verstuurdOp, o.aangemaakt),
        regels: o.adressen.map((a) => `${a.straat} ${a.huisnummer}${a.plaats ? `, ${a.plaats}` : ""}`),
        gearchiveerd: !!o.gearchiveerd,
        herstel: () => updateTauw(o.id, { gearchiveerd: false, gearchiveerdOp: undefined }),
      })),
    },
  ];
  const totaalGearchiveerd = projectMappen.reduce((s, c) => s + c.rijen.length, 0);

  // ── Periodefilter (week/maand/kwartaal) — houdt de database opgeruimd ──
  const range = periodeRange(periode, anker);
  const inPeriode = (peil: string) => !range || (!!peil && peil >= range.start && peil <= range.eind);
  const gefilterdeCats = projectMappen.map((c) => ({ ...c, rijen: c.rijen.filter((r) => inPeriode(r.peil)) }));
  const totaalPeriode = gefilterdeCats.reduce((s, c) => s + c.rijen.length, 0);

  // Alle adressen binnen een projectsoort (voor de filterpagina): straat/huisnummer/postcode/plaats.
  type AdresCat = { straat: string; huisnummer: string; postcode: string; plaats: string; extra: string };
  const adressenVanCat = (key: string): AdresCat[] => {
    if (key === "brieven") return rondes.flatMap((r) => r.adressen.filter((a) => !a.ontbreekt).map((a) => ({ straat: r.straat, huisnummer: `${a.huisnummer}${a.toevoeging || ""}`, postcode: r.postcode, plaats: r.plaats, extra: a.status })));
    if (key === "saneren") return saneringen.flatMap((s) => (s.adressen ?? []).map((a) => ({ straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, extra: a.naam || "" })));
    if (key === "voorschouwen") return voorschouwen.map((v) => ({ straat: v.straatnaam, huisnummer: "", postcode: v.postcode, plaats: v.plaats, extra: v.status }));
    if (key === "tauw") return tauwOpdrachten.flatMap((o) => o.adressen.map((a) => ({ straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, extra: "" })));
    return [];
  };
  const detailProjectMap = projectMappen.find((c) => c.key === detailCat);

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

      {/* Filterpagina per projectsoort — zoek direct op straat/huisnummer/postcode/plaats */}
      {tab === "projecten" && detailCat && detailProjectMap && (() => {
        const Icon = detailProjectMap.Icon;
        const dq = detailZoek.trim().toLowerCase();
        const items = adressenVanCat(detailCat)
          .filter((a) => !dq || `${a.straat} ${a.huisnummer} ${a.postcode} ${a.plaats} ${a.extra}`.toLowerCase().includes(dq))
          .sort((a, b) => (a.plaats || "").localeCompare(b.plaats || "", "nl") || a.straat.localeCompare(b.straat, "nl", { numeric: true }) || a.huisnummer.localeCompare(b.huisnummer, "nl", { numeric: true }));
        return (
          <div className="space-y-4">
            <button type="button" onClick={() => { setDetailCat(null); setDetailZoek(""); }} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar projecten</button>
            <div className="flex items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
              <div><h3 className="text-lg font-bold text-ink-900">{detailProjectMap.label}</h3><p className="text-xs text-ink-500">{items.length} adres{items.length === 1 ? "" : "sen"}</p></div>
            </div>
            <div className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
              <input autoFocus value={detailZoek} onChange={(e) => setDetailZoek(e.target.value)} placeholder="Zoek op straat, huisnummer, postcode of plaats…" className="w-full rounded-2xl border border-ink-200 bg-white py-3 pl-12 pr-10 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
              {detailZoek && <button type="button" onClick={() => setDetailZoek("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100" title="Wissen"><X className="h-4 w-4" /></button>}
            </div>
            {items.length === 0 ? (
              <Card className="p-8 text-center text-sm text-ink-500">Geen adressen gevonden.</Card>
            ) : (
              <Card className="divide-y divide-ink-100 overflow-hidden">
                {items.map((a, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                    <span className="flex h-9 w-11 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-sm font-bold text-ink-700">{a.huisnummer || "—"}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-ink-900">{a.straat} {a.huisnummer}</div>
                      <div className="truncate text-xs text-ink-500">{[a.postcode, a.plaats].filter(Boolean).join(" ")}{a.extra ? ` · ${a.extra}` : ""}</div>
                    </div>
                  </div>
                ))}
              </Card>
            )}
          </div>
        );
      })()}

      {tab === "projecten" && !detailCat && (
      <div className="space-y-4">
        {/* Periode-schakelaar + navigator — houdt het overzicht opgeruimd */}
        <PeriodeNavigator
          periode={periode}
          setPeriode={setPeriode}
          anker={anker}
          setAnker={setAnker}
          rechts={<span className="text-xs text-ink-400">{totaalPeriode} van {totaalGearchiveerd} {totaalGearchiveerd === 1 ? "project" : "projecten"}</span>}
        />
        {totaalPeriode === 0 ? (
          <Card className="p-8 text-center text-sm text-ink-500">Geen projecten in deze periode.</Card>
        ) : gefilterdeCats.filter((c) => c.rijen.length > 0).map((cat) => {
          const Icon = cat.Icon;
          return (
            <button key={cat.key} type="button" onClick={() => { setDetailCat(cat.key); setDetailZoek(""); }} className="flex w-full items-center gap-3 rounded-2xl border border-ink-200 bg-white px-5 py-4 text-left shadow-card outline-none transition-all hover:border-brand-300 hover:shadow-cardhover focus-visible:ring-2 focus-visible:ring-brand-400">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600"><Icon className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-ink-900">{cat.label}</span>
                <span className="block text-xs text-ink-500">{cat.rijen.length} {cat.rijen.length === 1 ? "project" : "projecten"} · klik om te filteren</span>
              </span>
              <span className="rounded-full bg-ink-100 px-2.5 py-0.5 text-xs font-medium text-ink-500">{cat.rijen.length}</span>
              <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
            </button>
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

      <p className="text-xs text-ink-400">{zichtbaar.length} adres{zichtbaar.length === 1 ? "" : "sen"} · gestructureerd op provincie → regio → postcode → straat</p>

      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center text-sm text-ink-500">Geen adressen gevonden.</Card>
      ) : (
        (() => {
          const toggle = (k: string) => setOpenNodes((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
          const isOpen = (k: string) => q !== "" || openNodes.has(k); // bij zoeken alles open
          // Boom: provincie → regio → postcode → straat → adressen
          const boom = new Map<string, Map<string, Map<string, Map<string, AdresItem[]>>>>();
          for (const it of zichtbaar) {
            const prov = afleidProvincie(it.postcode);
            const reg = afleidRegio(it.postcode, it.plaats);
            const pc = (it.postcode || "").replace(/\s/g, "").slice(0, 4) || "Onbekend";
            const straat = it.straat?.trim() || "Onbekende straat";
            const regM = boom.get(prov) ?? boom.set(prov, new Map()).get(prov)!;
            const pcM = regM.get(reg) ?? regM.set(reg, new Map()).get(reg)!;
            const sM = pcM.get(pc) ?? pcM.set(pc, new Map()).get(pc)!;
            (sM.get(straat) ?? sM.set(straat, []).get(straat)!).push(it);
          }
          const telAdres = (m: Map<string, unknown>): number => { let n = 0; for (const x of m.values()) n += x instanceof Map ? telAdres(x as Map<string, unknown>) : (x as AdresItem[]).length; return n; };
          const provList = [...boom.entries()].sort((a, b) => (a[0].startsWith("Overig") ? 1 : b[0].startsWith("Overig") ? -1 : a[0].localeCompare(b[0], "nl")));

          return (
            <div className="space-y-3">
              {provList.map(([prov, regM]) => {
                const openP = isOpen(prov);
                const regList = [...regM.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
                return (
                  <div key={prov} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
                    <button type="button" onClick={() => toggle(prov)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-400" aria-expanded={openP}>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Layers className="h-5 w-5" /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-base font-bold text-ink-900">{prov}</span>
                        <span className="block text-xs text-ink-500">{regList.length} regio{regList.length === 1 ? "" : "'s"} · {telAdres(regM)} adres{telAdres(regM) === 1 ? "" : "sen"}</span>
                      </span>
                      <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${openP ? "" : "-rotate-90"}`} />
                    </button>
                    {openP && (
                      <div className="space-y-1.5 border-t border-ink-100 bg-ink-50/40 p-2">
                        {regList.map(([reg, pcM]) => {
                          const kReg = prov + "|" + reg;
                          const openR = isOpen(kReg);
                          const pcList = [...pcM.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl", { numeric: true }));
                          return (
                            <div key={kReg} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                              <button type="button" onClick={() => toggle(kReg)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-ink-50" aria-expanded={openR}>
                                <MapIcon className="h-4 w-4 shrink-0 text-brand-500" />
                                <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-800">{reg}</span>
                                <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">{telAdres(pcM)}</span>
                                <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${openR ? "" : "-rotate-90"}`} />
                              </button>
                              {openR && (
                                <div className="space-y-1 border-t border-ink-100 p-1.5">
                                  {pcList.map(([pc, sM]) => {
                                    const kPc = kReg + "|" + pc;
                                    const openPc = isOpen(kPc);
                                    const sList = [...sM.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl", { numeric: true }));
                                    return (
                                      <div key={kPc} className="overflow-hidden rounded-lg border border-ink-100">
                                        <button type="button" onClick={() => toggle(kPc)} className="flex w-full items-center gap-2 bg-ink-50/60 px-3 py-2 text-left hover:bg-ink-100" aria-expanded={openPc}>
                                          <Hash className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                                          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-700">{pc}</span>
                                          <span className="text-[11px] text-ink-400">{sList.length} straat{sList.length === 1 ? "" : "en"}</span>
                                          <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${openPc ? "" : "-rotate-90"}`} />
                                        </button>
                                        {openPc && (
                                          <div className="divide-y divide-ink-100 border-t border-ink-100">
                                            {sList.map(([straat, items]) => {
                                              const kStraat = kPc + "|" + straat;
                                              const openStr = isOpen(kStraat);
                                              const huisnrs = [...items].sort((a, b) => Number(a.huisnummer) - Number(b.huisnummer) || a.huisnummer.localeCompare(b.huisnummer, "nl"));
                                              return (
                                                <div key={kStraat}>
                                                  <button type="button" onClick={() => toggle(kStraat)} className="flex w-full items-center gap-2 px-3 py-2 pl-5 text-left hover:bg-brand-50/50" aria-expanded={openStr}>
                                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                                                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{straat}</span>
                                                    <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">{huisnrs.length}</span>
                                                    <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${openStr ? "" : "-rotate-90"}`} />
                                                  </button>
                                                  {openStr && (
                                                    <div className="divide-y divide-ink-100 border-t border-ink-100 bg-ink-50/40">
                                                      {huisnrs.map((it) => {
                                                        const h = historie(it);
                                                        const fotoN = (h.klant?.fotos.length ?? 0) + h.voorschouwen.reduce((s, v) => s + v.fotos.length, 0);
                                                        return (
                                                          <button key={it.key} type="button" onClick={() => setOpenKey(it.key)} className="flex w-full items-center gap-3 py-2.5 pl-7 pr-4 text-left hover:bg-brand-50 sm:pl-10">
                                                            <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-ink-700 ring-1 ring-ink-200">{it.huisnummer}</span>
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

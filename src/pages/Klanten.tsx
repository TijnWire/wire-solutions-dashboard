import { useState } from "react";
import {
  Search, Plus, ArrowLeft, MapPin, Phone, Mail, Trash2, X,
  CalendarCheck, Mailbox, ClipboardCheck, Database, Image as ImageIcon, Download,
  ChevronRight, FlaskConical, Recycle, FolderArchive,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge, Bevestig } from "../components/ui";
import { FotoKnoppen } from "../components/FotoKnoppen";
import { fileNaarDataUrl } from "../lib/image";
import { downloadVoorschouwPdf } from "../lib/voorschouwPdf";
import { datumLabel } from "../lib/afspraak";
import { TAUW_TYPE_LABEL } from "../lib/types";
import { PeriodeNavigator, periodeRange, type Periode } from "../components/PeriodeNavigator";
import { AdresBoom } from "../components/AdresBoom";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

const normKey = (straat: string, huisnummer: string) => `${straat.trim()} ${String(huisnummer).trim()}`.toLowerCase();

type AdresItem = { key: string; naam: string; straat: string; huisnummer: string; postcode: string; plaats: string; telefoon: string; email?: string; klantId?: string };

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
  const [detailCat, setDetailCat] = useState<string | null>(null); // geopende projectsoort-filterpagina
  const [detailZoek, setDetailZoek] = useState("");
  const [tab, setTab] = useState<"adressen" | "projecten">("projecten");
  const [periode, setPeriode] = useState<Periode>("maand");
  const [anker, setAnker] = useState(() => new Date().toISOString().slice(0, 10));

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";

  // Aggregatie: bouw één adressenindex uit klanten + afspraken + brieven
  const map = new Map<string, AdresItem>();
  const merge = (it: AdresItem) => {
    const best = map.get(it.key);
    if (!best) { map.set(it.key, it); return; }
    map.set(it.key, {
      ...best,
      naam: best.naam || it.naam, postcode: best.postcode || it.postcode, plaats: best.plaats || it.plaats,
      telefoon: best.telefoon || it.telefoon, email: best.email || it.email, klantId: best.klantId || it.klantId,
    });
  };
  for (const k of klanten) merge({ key: normKey(k.straat, k.huisnummer), naam: k.naam, straat: k.straat, huisnummer: k.huisnummer, postcode: k.postcode, plaats: k.plaats, telefoon: k.telefoon, email: k.email, klantId: k.id });
  for (const a of afspraken) if (a.straat && a.huisnummer) merge({ key: normKey(a.straat, a.huisnummer), naam: a.klantNaam, straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, telefoon: a.telefoon, email: a.email });
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
      return addKlant({ naam: open.naam, straat: open.straat, huisnummer: open.huisnummer, postcode: open.postcode, plaats: open.plaats, telefoon: open.telefoon, email: open.email ?? "", notitie: "", fotos: [] });
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

        {/* Contactgegevens — telefoon + e-mail, opgeslagen op dit adres in de database */}
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-ink-900">Contactgegevens</h3>
            {!h.klant && <span className="text-xs text-ink-400">Wordt opgeslagen in de database</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-600"><Phone className="h-3.5 w-3.5" /> Telefoon</span>
              <input value={h.klant?.telefoon ?? open.telefoon ?? ""} onChange={(e) => { const id = zorgKlant(); updateKlant(id, { telefoon: e.target.value }); }} placeholder="06-…" inputMode="tel" className={veld} />
            </label>
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-ink-600"><Mail className="h-3.5 w-3.5" /> E-mail</span>
              <input value={h.klant?.email ?? open.email ?? ""} onChange={(e) => { const id = zorgKlant(); updateKlant(id, { email: e.target.value }); }} placeholder="naam@voorbeeld.nl" inputMode="email" className={veld} />
            </label>
          </div>
          <p className="text-xs text-ink-400">Met toekomstige projecten worden telefoon en e-mail automatisch aangevuld; je kunt ze hier altijd aanpassen.</p>
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
  type AdresCat = { straat: string; huisnummer: string; postcode: string; plaats: string; extra: string; telefoon?: string; email?: string };
  const adressenVanCat = (key: string): AdresCat[] => {
    if (key === "brieven") return rondes.flatMap((r) => r.adressen.filter((a) => !a.ontbreekt).map((a) => ({ straat: r.straat, huisnummer: `${a.huisnummer}${a.toevoeging || ""}`, postcode: r.postcode, plaats: r.plaats, extra: a.status })));
    if (key === "saneren") return saneringen.flatMap((s) => (s.adressen ?? []).map((a) => ({ straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, extra: a.naam || "", telefoon: a.telefoon })));
    if (key === "voorschouwen") return voorschouwen.map((v) => ({ straat: v.straatnaam, huisnummer: "", postcode: v.postcode, plaats: v.plaats, extra: v.status }));
    if (key === "tauw") return tauwOpdrachten.flatMap((o) => o.adressen.map((a) => ({ straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats, extra: a.bewoner || "", telefoon: a.telefoon })));
    if (key === "buurtaanpak") return buurtaanpak.flatMap((b) => b.adressen.map((a) => ({ straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: "", extra: "", telefoon: a.telefoon })));
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
              <AdresBoom
                zoekOpen={dq !== ""}
                items={items.map((a, i) => ({
                  id: `${a.straat}-${a.huisnummer}-${i}`,
                  straat: a.straat, huisnummer: a.huisnummer, postcode: a.postcode, plaats: a.plaats,
                  telefoon: a.telefoon || undefined,
                  onder: a.extra ? <span>{a.extra}</span> : undefined,
                }))}
              />
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
        <AdresBoom
          zoekOpen={q !== ""}
          items={zichtbaar.map((it) => {
            const h = historie(it);
            const fotoN = (h.klant?.fotos.length ?? 0) + h.voorschouwen.reduce((s, v) => s + v.fotos.length, 0);
            const totaal = h.afspraken.length + h.brieven.length + h.voorschouwen.length + fotoN;
            return {
              id: it.key, straat: it.straat, huisnummer: it.huisnummer, postcode: it.postcode, plaats: it.plaats,
              telefoon: it.telefoon || undefined, email: it.email || undefined, titelExtra: it.naam || undefined,
              onder: (
                <>
                  {h.afspraken.length > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5">{h.afspraken.length} afspr.</span>}
                  {h.brieven.length > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5">{h.brieven.length} brief</span>}
                  {h.voorschouwen.length > 0 && <span className="rounded-full bg-ink-100 px-2 py-0.5">{h.voorschouwen.length} voorsch.</span>}
                  {fotoN > 0 && <span className="rounded-full bg-brand-50 px-2 py-0.5 font-medium text-brand-700">{fotoN} foto{fotoN === 1 ? "" : "'s"}</span>}
                  {totaal === 0 && <span>geen historie</span>}
                </>
              ),
              rechts: it.klantId ? <Database className="h-4 w-4 shrink-0 text-brand-500" /> : undefined,
              onClick: () => setOpenKey(it.key),
            };
          })}
        />
      )}
      </div>
      )}
    </div>
  );
}

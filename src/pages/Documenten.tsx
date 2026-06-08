import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, ArrowUp, ArrowDown, Search, ChevronDown } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Keuze } from "../components/Keuze";
import { exporteerExcel } from "../lib/excel";

type Item = { id: string; data: Record<string, string | number> };
type CatKey = "afspraken" | "voorschouwen" | "brieven";

const CATS: { key: CatKey; label: string; primair: string; groep: string; bestand: string }[] = [
  { key: "afspraken", label: "Afspraken", primair: "Adres", groep: "Locatie", bestand: "Afspraken" },
  { key: "voorschouwen", label: "Voorschouwen", primair: "Straat", groep: "Plaats", bestand: "Voorschouwen" },
  { key: "brieven", label: "Brieven (adressen)", primair: "Adres", groep: "Straat", bestand: "Brieven_adressen" },
];

export function Documenten() {
  const { afspraken, voorschouwen, rondes, users } = useApp();
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "";

  const [cat, setCat] = useState<CatKey>("afspraken");
  const [zoek, setZoek] = useState("");
  const [sorteer, setSorteer] = useState("Adres");
  const [asc, setAsc] = useState(true);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [geopend, setGeopend] = useState<Set<string>>(new Set());

  const items: Item[] = useMemo(() => {
    if (cat === "afspraken")
      return afspraken.map((a) => ({
        id: a.id,
        data: {
          Locatie: a.locatie, Soort: a.soort, Adres: `${a.straat} ${a.huisnummer}`.trim(),
          Postcode: a.postcode, Plaats: a.plaats, Klant: a.klantNaam, Telefoon: a.telefoon,
          Type: a.type, Datum: a.datum, Tijd: a.tijd, Status: a.status,
          Werknemer: naamVan(a.toegewezenAan), Notitie: a.notitie,
        },
      }));
    if (cat === "voorschouwen")
      return voorschouwen.map((v) => ({
        id: v.id,
        data: {
          Straat: v.straatnaam, Postcode: v.postcode, Plaats: v.plaats || "Onbekend",
          "Aantal woningen": v.aantalWoningen, Gasloos: v.gasloos, Blokverwarming: v.blokverwarming,
          Stijgleidingen: v.aantalStijgleidingen, "Foto's": v.fotos.length, Status: v.status,
          "Ingevuld door": naamVan(v.ingevuldDoor),
          Datum: new Date(v.aangemaakt).toLocaleDateString("nl-NL"),
        },
      }));
    return rondes.flatMap((r) =>
      r.adressen.map((a) => ({
        id: a.id,
        data: {
          Adres: `${r.straat} ${a.huisnummer}${a.toevoeging ? "-" + a.toevoeging : ""}`,
          Straat: r.straat, Huisnummer: a.huisnummer, Type: a.type, Status: a.status,
          Ontbreekt: a.ontbreekt ? "Ja" : "Nee", Wijk: r.plaats, Notitie: a.notitie,
        },
      }))
    );
  }, [cat, afspraken, voorschouwen, rondes, users]);

  const huidige = CATS.find((c) => c.key === cat)!;
  const kolommen = items.length ? Object.keys(items[0].data) : [];
  const sorteerKey = kolommen.includes(sorteer) ? sorteer : huidige.primair;

  const q = zoek.trim().toLowerCase();
  const gefilterd = items.filter((i) => !q || Object.values(i.data).some((v) => String(v).toLowerCase().includes(q)));
  const gesorteerd = [...gefilterd].sort((x, y) => {
    const a = x.data[sorteerKey];
    const b = y.data[sorteerKey];
    const r = typeof a === "number" && typeof b === "number" ? a - b : String(a ?? "").localeCompare(String(b ?? ""), "nl", { numeric: true });
    return asc ? r : -r;
  });

  // Groeperen op locatie/straat/wijk/status
  const groepen = new Map<string, Item[]>();
  for (const i of gesorteerd) {
    const g = String(i.data[huidige.groep] ?? "Overig");
    if (!groepen.has(g)) groepen.set(g, []);
    groepen.get(g)!.push(i);
  }
  const groepLijst = [...groepen.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl", { numeric: true }));

  const alleGeselecteerd = gesorteerd.length > 0 && gesorteerd.every((i) => sel.has(i.id));

  const wisselCat = (k: CatKey) => {
    const c = CATS.find((x) => x.key === k)!;
    setCat(k);
    setSel(new Set());
    setGeopend(new Set());
    setZoek("");
    setSorteer(c.primair);
    setAsc(true);
  };
  const toggle = (id: string) =>
    setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleVeel = (its: Item[], aan: boolean) =>
    setSel((p) => { const n = new Set(p); its.forEach((i) => (aan ? n.add(i.id) : n.delete(i.id))); return n; });
  const toggleOpen = (g: string) =>
    setGeopend((p) => { const n = new Set(p); n.has(g) ? n.delete(g) : n.add(g); return n; });

  const exporteer = () => {
    const gekozen = gesorteerd.filter((i) => sel.has(i.id));
    if (gekozen.length === 0) return;
    exporteerExcel(gekozen.map((i) => i.data), huidige.bestand, huidige.label);
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Documenten</h2>
        <p className="text-sm text-ink-500">Kies een soort, zoek of sorteer, vink aan en download als Excel (.xlsx).</p>
      </div>

      {/* Soort */}
      <div className="flex flex-wrap gap-2">
        {CATS.map((c) => (
          <button key={c.key} type="button" onClick={() => wisselCat(c.key)} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${cat === c.key ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
            {c.label}
          </button>
        ))}
      </div>

      {/* Zoeken */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder={`Zoek in ${huidige.label.toLowerCase()}… (straat, naam, status, datum)`}
          className="w-full rounded-xl border border-ink-200 bg-white py-2.5 pl-10 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-card">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
          <input type="checkbox" checked={alleGeselecteerd} onChange={() => toggleVeel(gesorteerd, !alleGeselecteerd)} className="h-4 w-4 accent-brand-600" />
          {sel.size > 0 ? `${sel.size} geselecteerd` : "Alles selecteren"}
        </label>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="text-xs text-ink-400">Sorteer</span>
          <div className="w-40"><Keuze value={sorteerKey} onChange={setSorteer} opties={kolommen.map((k) => ({ waarde: k, label: k }))} size="sm" title="Sorteer op" /></div>
          <button type="button" onClick={() => setAsc((a) => !a)} className="rounded-lg border border-ink-200 p-1.5 text-ink-600 hover:bg-ink-50" title={asc ? "Oplopend" : "Aflopend"}>
            {asc ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
          <button type="button" onClick={exporteer} disabled={sel.size === 0} className="inline-flex items-center gap-2 rounded-lg bg-green-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40">
            <Download className="h-4 w-4" /> Excel ({sel.size})
          </button>
        </div>
      </div>

      {/* Groepen */}
      {gesorteerd.length === 0 ? (
        <div className="rounded-xl border border-ink-200 bg-white p-10 text-center text-sm text-ink-500">
          {q ? "Niets gevonden voor je zoekopdracht." : `Geen ${huidige.label.toLowerCase()}.`}
        </div>
      ) : (
        <div className="space-y-4">
          {groepLijst.map(([groep, its]) => {
            const groepAan = its.every((i) => sel.has(i.id));
            const aantalGekozen = its.filter((i) => sel.has(i.id)).length;
            const open = q.length > 0 || geopend.has(groep);
            return (
              <div key={groep} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                <div className="flex items-center gap-3 border-b border-ink-100 bg-ink-50/60 px-3 py-2.5">
                  <input type="checkbox" checked={groepAan} onChange={() => toggleVeel(its, !groepAan)} className="h-4 w-4 accent-brand-600" title="Hele groep selecteren" />
                  <button type="button" onClick={() => toggleOpen(groep)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "" : "-rotate-90"}`} />
                    <span className="truncate text-sm font-bold text-ink-900">{groep}</span>
                    <span className="shrink-0 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">
                      {aantalGekozen > 0 ? `${aantalGekozen}/${its.length}` : its.length}
                    </span>
                  </button>
                </div>
                {open && (
                  <div className="divide-y divide-ink-100">
                    {its.map((i) => {
                      const gekozen = sel.has(i.id);
                      const rest = kolommen.filter((k) => k !== huidige.primair && k !== huidige.groep).slice(0, 4);
                      return (
                        <label key={i.id} className={`flex cursor-pointer items-center gap-3 px-3 py-2.5 ${gekozen ? "bg-brand-50" : "hover:bg-ink-50"}`}>
                          <input type="checkbox" checked={gekozen} onChange={() => toggle(i.id)} className="h-4 w-4 shrink-0 accent-brand-600" />
                          <FileSpreadsheet className="h-4 w-4 shrink-0 text-green-600" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-ink-900">{String(i.data[huidige.primair] || "—")}</div>
                            <div className="truncate text-xs text-ink-500">
                              {rest.map((k) => `${i.data[k]}`).filter((s) => s && s !== "undefined" && s !== "").join(" · ")}
                            </div>
                          </div>
                        </label>
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
}

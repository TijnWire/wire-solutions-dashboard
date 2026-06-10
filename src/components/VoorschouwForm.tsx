import { useEffect, useRef, useState } from "react";
import { ArrowLeft, X, Save, Send, Folder, FolderPlus, Check, Search, ChevronDown } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "./ui";
import { FotoKnoppen } from "./FotoKnoppen";
import { fileNaarDataUrl } from "../lib/image";
import { legeVoorschouw, type Voorschouw, type JaNee } from "../lib/types";

function Tekstveld({
  label,
  value,
  onChange,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={2}
          className="w-full resize-none rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-lg border border-ink-200 px-3 py-2.5 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      )}
    </label>
  );
}

function JaNeeKnop({
  label,
  value,
  onChange,
}: {
  label: string;
  value: JaNee;
  onChange: (v: JaNee) => void;
}) {
  return (
    <div>
      <span className="mb-1.5 block text-sm font-medium text-ink-700">{label}</span>
      <div className="inline-flex overflow-hidden rounded-lg border border-ink-200">
        {(["JA", "NEE"] as const).map((optie) => (
          <button
            key={optie}
            type="button"
            onClick={() => onChange(value === optie ? "" : optie)}
            className={`px-5 py-2 text-sm font-medium transition-colors ${
              value === optie
                ? optie === "JA"
                  ? "bg-green-600 text-white"
                  : "bg-ink-700 text-white"
                : "bg-white text-ink-500 hover:bg-ink-50"
            }`}
          >
            {optie}
          </button>
        ))}
      </div>
    </div>
  );
}

// Dropdown om de map te kiezen, met zoek-/typveld (handig bij veel mappen) en "typ om aan te maken".
function MapKiezer({ mappen, value, onChange, onNieuw }: {
  mappen: { id: string; naam: string }[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  onNieuw: (naam: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [zoek, setZoek] = useState("");
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const buitenklik = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", buitenklik);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", buitenklik); document.removeEventListener("keydown", esc); };
  }, [open]);
  const huidig = mappen.find((m) => m.id === value);
  const q = zoek.trim();
  const ql = q.toLowerCase();
  const gefilterd = mappen.filter((m) => !ql || m.naam.toLowerCase().includes(ql));
  const bestaatAl = mappen.some((m) => m.naam.toLowerCase() === ql);
  const sluit = () => { setOpen(false); setZoek(""); };
  const kies = (id: string | undefined) => { onChange(id); sluit(); };
  const maak = () => { if (q) { onNieuw(q); sluit(); } };
  return (
    <div ref={ref} className="relative max-w-md">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-haspopup="listbox" aria-expanded={open} className="flex w-full items-center gap-2 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-left text-sm font-semibold text-ink-800 outline-none hover:bg-ink-50 focus:border-brand-400 focus:ring-2 focus:ring-brand-100">
        <Folder className={`h-4 w-4 shrink-0 ${huidig ? "text-brand-600" : "text-ink-400"}`} />
        <span className={`flex-1 truncate ${huidig ? "" : "text-ink-500"}`}>{huidig ? huidig.naam : "Geen map"}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1.5 w-full overflow-hidden rounded-xl border border-ink-200 bg-white shadow-cardhover">
          <div className="flex items-center gap-2 border-b border-ink-100 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-ink-400" />
            <input
              autoFocus
              value={zoek}
              onChange={(e) => setZoek(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); if (q && !bestaatAl) maak(); else if (gefilterd[0]) kies(gefilterd[0].id); } }}
              placeholder="Zoek of typ een nieuwe mapnaam…"
              aria-label="Map zoeken of aanmaken"
              className="min-w-0 flex-1 text-sm outline-none placeholder:text-ink-400"
            />
          </div>
          <div className="max-h-64 overflow-auto p-1">
            <button type="button" onClick={() => kies(undefined)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${value === undefined ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-600 hover:bg-ink-50"}`}>
              <span className="flex-1">Geen map</span>
              {value === undefined && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
            </button>
            {gefilterd.map((m) => {
              const actief = m.id === value;
              return (
                <button key={m.id} type="button" onClick={() => kies(m.id)} className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm outline-none focus-visible:bg-ink-50 ${actief ? "bg-brand-50 font-semibold text-brand-700" : "text-ink-700 hover:bg-ink-50"}`}>
                  <Folder className={`h-4 w-4 shrink-0 ${actief ? "text-brand-600" : "text-ink-400"}`} />
                  <span className="flex-1 truncate">{m.naam}</span>
                  {actief && <Check className="h-4 w-4 shrink-0 text-brand-600" />}
                </button>
              );
            })}
            {q && !bestaatAl && (
              <button type="button" onClick={maak} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold text-brand-700 outline-none hover:bg-brand-50 focus-visible:bg-brand-50">
                <FolderPlus className="h-4 w-4 shrink-0" />
                <span className="flex-1 truncate">Map “{q}” aanmaken</span>
              </button>
            )}
            {!q && gefilterd.length === 0 && (
              <p className="px-3 py-2 text-xs text-ink-400">Nog geen mappen. Typ een naam om er een te maken.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function VoorschouwForm({
  bestaande,
  onKlaar,
}: {
  bestaande?: Voorschouw;
  onKlaar: () => void;
}) {
  const { currentUser, addVoorschouw, updateVoorschouw, voorschouwMappen, addVoorschouwMap } = useApp();
  const [data, setData] = useState(() =>
    bestaande
      ? { ...bestaande }
      : { ...legeVoorschouw(), fotos: [] as string[] }
  );
  const [bezig, setBezig] = useState(false);
  // In welke map komt dit document — vooraf te kiezen (en later nog te wijzigen).
  const [mapId, setMapId] = useState<string | undefined>(bestaande?.mapId);
  const actieveMappen = voorschouwMappen.filter((m) => !m.gearchiveerd);
  const kiesNieuweMap = (naam: string) => { setMapId(addVoorschouwMap(naam)); };

  const set = (patch: Partial<typeof data>) => setData((d) => ({ ...d, ...patch }));

  const voegFotosToe = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBezig(true);
    try {
      const nieuwe: string[] = [];
      for (const file of Array.from(files)) {
        nieuwe.push(await fileNaarDataUrl(file));
      }
      set({ fotos: [...data.fotos, ...nieuwe] });
    } finally {
      setBezig(false);
    }
  };

  const verwijderFoto = (i: number) =>
    set({ fotos: data.fotos.filter((_, idx) => idx !== i) });

  const opslaan = (status: "Concept" | "Ingediend") => {
    if (!currentUser) return;
    if (bestaande) {
      updateVoorschouw(bestaande.id, { ...data, status, mapId });
    } else {
      addVoorschouw({
        ...(data as Omit<Voorschouw, "id" | "ingevuldDoor" | "aangemaakt" | "status">),
        mapId,
        ingevuldDoor: currentUser.id,
        aangemaakt: new Date().toISOString(),
        status,
      });
    }
    onKlaar();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button
        type="button"
        onClick={onKlaar}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"
      >
        <ArrowLeft className="h-4 w-4" />
        Terug naar overzicht
      </button>

      <div>
        <h2 className="text-xl font-bold text-ink-900">
          {bestaande ? "Voorschouw bewerken" : "Nieuwe voorschouw"}
        </h2>
        <p className="text-sm text-ink-500">Informatie voorschouw — Stedin</p>
      </div>

      {/* Map kiezen — waar moet dit document terechtkomen */}
      <Card className="space-y-3 p-5">
        <div>
          <h3 className="text-sm font-bold uppercase tracking-wide text-brand-700">In welke map?</h3>
          <p className="mt-1 text-xs text-ink-500">Kies eerst waar deze voorschouw bij hoort. Typ om te zoeken of een nieuwe map te maken. Je kunt dit later nog wijzigen.</p>
        </div>
        <MapKiezer mappen={actieveMappen} value={mapId} onChange={setMapId} onNieuw={kiesNieuweMap} />
      </Card>

      {/* Algemene informatie */}
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-brand-700">
          Algemene informatie
        </h3>
        <Tekstveld label="Straatnaam" value={data.straatnaam} onChange={(v) => set({ straatnaam: v })} placeholder="bijv. Dorpsstraat" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tekstveld label="Postcode" value={data.postcode} onChange={(v) => set({ postcode: v })} placeholder="1234 AB" />
          <Tekstveld label="Plaats" value={data.plaats} onChange={(v) => set({ plaats: v })} placeholder="Rotterdam" />
        </div>
        <JaNeeKnop label="Gebouw aan meerdere straten verbonden" value={data.meerdereStraten} onChange={(v) => set({ meerdereStraten: v })} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Tekstveld label="Aantal woningen / adressen" value={data.aantalWoningen} onChange={(v) => set({ aantalWoningen: v })} placeholder="bijv. 24" />
          <Tekstveld label="Aantal entrees" value={data.aantalEntrees} onChange={(v) => set({ aantalEntrees: v })} placeholder="bijv. 3" />
        </div>
        <Tekstveld label="Namen huisbaas / VVE" value={data.namenHuisbaasVVE} onChange={(v) => set({ namenHuisbaasVVE: v })} textarea />
        <Tekstveld label="Adressen huisbaas / VVE" value={data.adressenHuisbaasVVE} onChange={(v) => set({ adressenHuisbaasVVE: v })} textarea />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <JaNeeKnop label="Gasloos" value={data.gasloos} onChange={(v) => set({ gasloos: v })} />
          <JaNeeKnop label="Blokverwarming" value={data.blokverwarming} onChange={(v) => set({ blokverwarming: v })} />
        </div>
        <Tekstveld
          label="Bijzondere locatie (verzorgingstehuis / woon- of leefgroep)"
          value={data.bijzondereLocatieZorg}
          onChange={(v) => set({ bijzondereLocatieZorg: v })}
          textarea
        />
        <Tekstveld
          label="Bijzondere locatie (zelfvoorzienend / 1 centrale keuken)"
          value={data.bijzondereLocatieKeuken}
          onChange={(v) => set({ bijzondereLocatieKeuken: v })}
          textarea
        />
      </Card>

      {/* Technische informatie */}
      <Card className="space-y-4 p-5">
        <h3 className="text-sm font-bold uppercase tracking-wide text-brand-700">
          Technische informatie
        </h3>
        <Tekstveld
          label="Aantal stijgleidingen (globale inschatting)"
          value={data.aantalStijgleidingen}
          onChange={(v) => set({ aantalStijgleidingen: v })}
          placeholder="bijv. 6"
        />

        {/* Foto's */}
        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink-700">Foto's van gasbordjes</span>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
            {data.fotos.map((foto, i) => (
              <div key={i} className="group relative aspect-square overflow-hidden rounded-lg border border-ink-200">
                <img src={foto} alt={`Gasbordje ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => verwijderFoto(i)}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}

            <FotoKnoppen onFiles={voegFotosToe} bezig={bezig} />
          </div>
          <p className="mt-1.5 text-xs text-ink-400">
            Tip: maak een foto met de camera óf kies bestaande foto's uit je galerij. Je kunt er meerdere tegelijk toevoegen.
          </p>
        </div>
      </Card>

      {/* Acties */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => opslaan("Ingediend")}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          <Send className="h-4 w-4" />
          Indienen
        </button>
        <button
          type="button"
          onClick={() => opslaan("Concept")}
          className="inline-flex items-center gap-2 rounded-lg border border-ink-200 bg-white px-5 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50"
        >
          <Save className="h-4 w-4" />
          Opslaan als concept
        </button>
      </div>
    </div>
  );
}

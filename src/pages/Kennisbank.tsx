import { useState } from "react";
import { Search, Plus, Pencil, Trash2, ChevronDown, BookOpen, ArrowLeft } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Bevestig } from "../components/ui";
import type { KennisArtikel } from "../lib/types";

const veld = "w-full rounded-xl border border-ink-200 px-3.5 py-2.5 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

function ArtikelForm({ bestaande, categorieën, onKlaar }: { bestaande?: KennisArtikel; categorieën: string[]; onKlaar: () => void }) {
  const { addKennis, updateKennis } = useApp();
  const [titel, setTitel] = useState(bestaande?.titel ?? "");
  const [categorie, setCategorie] = useState(bestaande?.categorie ?? categorieën[0] ?? "Veelgestelde vragen");
  const [inhoud, setInhoud] = useState(bestaande?.inhoud ?? "");

  const opslaan = () => {
    if (!titel.trim() || !inhoud.trim()) return;
    if (bestaande) updateKennis(bestaande.id, { titel: titel.trim(), categorie: categorie.trim(), inhoud: inhoud.trim() });
    else addKennis({ titel: titel.trim(), categorie: categorie.trim() || "Overig", inhoud: inhoud.trim() });
    onKlaar();
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">{bestaande ? "Artikel bewerken" : "Nieuw artikel"}</h2>
      <Card className="space-y-4 p-5">
        <div>
          <label className={labelCls}>Titel / vraag</label>
          <input value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="bijv. Moet de klant thuis zijn?" className={veld} />
        </div>
        <div>
          <label className={labelCls}>Categorie</label>
          <input list="kb-cats" value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Kies of typ een categorie" className={veld} />
          <datalist id="kb-cats">{categorieën.map((c) => (<option key={c} value={c} />))}</datalist>
        </div>
        <div>
          <label className={labelCls}>Antwoord / instructie</label>
          <textarea value={inhoud} onChange={(e) => setInhoud(e.target.value)} rows={6} placeholder="Schrijf hier het antwoord of de werkinstructie…" className={veld + " resize-none"} />
        </div>
      </Card>
      <button type="button" onClick={opslaan} disabled={!titel.trim() || !inhoud.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
        <Plus className="h-4 w-4" /> Opslaan
      </button>
    </div>
  );
}

export function Kennisbank() {
  const { kennis, currentUser, deleteKennis } = useApp();
  const [zoek, setZoek] = useState("");
  const [categorie, setCategorie] = useState("Alle");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [modus, setModus] = useState<"lijst" | "formulier">("lijst");
  const [bewerk, setBewerk] = useState<KennisArtikel | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<KennisArtikel | null>(null);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const categorieën = [...new Set(kennis.map((k) => k.categorie))];

  if (modus === "formulier") return <ArtikelForm bestaande={bewerk} categorieën={categorieën} onKlaar={() => setModus("lijst")} />;

  const q = zoek.trim().toLowerCase();
  const gefilterd = kennis.filter((k) => {
    if (categorie !== "Alle" && k.categorie !== categorie) return false;
    if (!q) return true;
    return (k.titel + " " + k.inhoud + " " + k.categorie).toLowerCase().includes(q);
  });

  const toggle = (id: string) => setOpen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="rounded-xl bg-brand-50 p-2 text-brand-600"><BookOpen className="h-5 w-5" /></div>
          <div>
            <h2 className="text-xl font-bold text-ink-900">Kennisbank</h2>
            <p className="text-sm text-ink-500">Antwoorden op standaardvragen en werkinstructies voor in het veld.</p>
          </div>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => { setBewerk(undefined); setModus("formulier"); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuw artikel
          </button>
        )}
      </div>

      {/* Zoeken */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-400" />
        <input
          value={zoek}
          onChange={(e) => setZoek(e.target.value)}
          placeholder="Zoek een vraag of onderwerp… (bijv. 'thuis', 'hond', 'meterkast')"
          className="w-full rounded-2xl border border-ink-200 bg-white py-3.5 pl-12 pr-4 text-base outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
        />
      </div>

      {/* Categorie-filter */}
      <div className="flex flex-wrap gap-2">
        {["Alle", ...categorieën].map((c) => (
          <button key={c} type="button" onClick={() => setCategorie(c)} className={`rounded-full px-3.5 py-1.5 text-sm font-semibold ${categorie === c ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"}`}>{c}</button>
        ))}
      </div>

      {/* Artikelen */}
      {gefilterd.length === 0 ? (
        <Card className="p-10 text-center">
          <BookOpen className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">{q ? "Niets gevonden. Probeer een ander woord." : "Nog geen artikelen in deze categorie."}</p>
        </Card>
      ) : (
        <div className="space-y-2.5">
          {gefilterd.map((k) => {
            const uit = open.has(k.id);
            return (
              <Card key={k.id} className="overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <button type="button" onClick={() => toggle(k.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                    <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${uit ? "rotate-180" : ""}`} />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-ink-900">{k.titel}</div>
                      <span className="text-xs text-ink-400">{k.categorie}</span>
                    </div>
                  </button>
                  {isLeiding && (
                    <div className="flex shrink-0 items-center gap-1">
                      <button type="button" onClick={() => { setBewerk(k); setModus("formulier"); }} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Bewerken"><Pencil className="h-4 w-4" /></button>
                      <button type="button" onClick={() => setVerwijder(k)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  )}
                </div>
                {uit && (
                  <div className="border-t border-ink-100 px-4 py-3.5 pl-12 text-sm leading-relaxed text-ink-700">
                    {k.inhoud.split("\n").map((r, i) => (<p key={i} className={i > 0 ? "mt-2" : ""}>{r}</p>))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Bevestig
        open={!!verwijder}
        titel="Artikel verwijderen"
        tekst={`Weet je het zeker dat je "${verwijder?.titel}" wilt verwijderen?`}
        onBevestig={() => { if (verwijder) deleteKennis(verwijder.id); setVerwijder(null); }}
        onAnnuleer={() => setVerwijder(null)}
      />
    </div>
  );
}

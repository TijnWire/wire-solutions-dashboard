import { useState } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { BOETE_STATUSSEN, type Boete, type BoeteStatus } from "../lib/types";

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";
const statusTone: Record<BoeteStatus, string> = { Open: "red", Betaald: "green", Kwijtgescholden: "slate" };

function BoeteForm({ bestaande, onKlaar }: { bestaande?: Boete; onKlaar: () => void }) {
  const { users, addBoete, updateBoete } = useApp();
  const [d, setD] = useState<Omit<Boete, "id">>(
    bestaande ?? {
      medewerkerId: users[0]?.id ?? "",
      datum: new Date().toISOString().slice(0, 10),
      omschrijving: "",
      bedrag: 0,
      status: "Open",
      notitie: "",
    }
  );
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const opslaan = () => {
    if (!d.medewerkerId || !d.omschrijving.trim()) return;
    if (bestaande) updateBoete(bestaande.id, d);
    else addBoete(d);
    onKlaar();
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">{bestaande ? "Boete bewerken" : "Nieuwe boete"}</h2>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Medewerker</label>
            <Keuze value={d.medewerkerId} onChange={(w) => set({ medewerkerId: w })} altijdZoeken opties={users.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker" />
          </div>
          <div>
            <label className={labelCls}>Datum</label>
            <DatumKiezer value={d.datum} onChange={(iso) => set({ datum: iso })} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Omschrijving</label>
          <input value={d.omschrijving} onChange={(e) => set({ omschrijving: e.target.value })} placeholder="bijv. Parkeerboete bedrijfsbus" className={veld} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Bedrag (€)</label>
            <input type="number" step="0.01" value={d.bedrag} onChange={(e) => set({ bedrag: Number(e.target.value) })} className={veld} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <Keuze value={d.status} onChange={(w) => set({ status: w as BoeteStatus })} opties={BOETE_STATUSSEN.map((s) => ({ waarde: s, label: s }))} title="Status" />
          </div>
        </div>
        <div>
          <label className={labelCls}>Notitie</label>
          <input value={d.notitie} onChange={(e) => set({ notitie: e.target.value })} className={veld} />
        </div>
      </Card>

      <button type="button" onClick={opslaan} disabled={!d.medewerkerId || !d.omschrijving.trim()} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
        <Plus className="h-4 w-4" /> Opslaan
      </button>
    </div>
  );
}

export function Boetes() {
  const { boetes, users, currentUser, updateBoete, deleteBoete } = useApp();
  const [modus, setModus] = useState<"lijst" | "formulier">("lijst");
  const [bewerk, setBewerk] = useState<Boete | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<Boete | null>(null);
  const [medewerker, setMedewerker] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  if (modus === "formulier") return <BoeteForm bestaande={bewerk} onKlaar={() => setModus("lijst")} />;

  let zichtbaar = isLeiding ? boetes : boetes.filter((b) => b.medewerkerId === currentUser.id);
  if (isLeiding && medewerker) zichtbaar = zichtbaar.filter((b) => b.medewerkerId === medewerker);
  zichtbaar = [...zichtbaar].sort((a, b) => b.datum.localeCompare(a.datum));
  const openBedrag = zichtbaar.filter((b) => b.status === "Open").reduce((s, b) => s + b.bedrag, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Boetes</h2>
          <p className="text-sm text-ink-500">{isLeiding ? "Registreer en beheer boetes van het team." : "Jouw boetes."}</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => { setBewerk(undefined); setModus("formulier"); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe boete
          </button>
        )}
      </div>

      {isLeiding && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-ink-600">Medewerker:</span>
          <div className="w-52"><Keuze value={medewerker} onChange={setMedewerker} altijdZoeken opties={[{ waarde: "", label: "Alle medewerkers" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Filter op medewerker" /></div>
        </div>
      )}

      {zichtbaar.length > 0 && (
        <Card className="flex items-center gap-3 p-4">
          <div className="rounded-xl bg-red-50 p-2.5 text-red-600">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <div className="text-xl font-bold text-ink-900">{euro(openBedrag)}</div>
            <div className="text-xs text-ink-500">
              openstaand{medewerker ? ` · ${naamVan(medewerker)}` : ""} · {zichtbaar.length} boete{zichtbaar.length === 1 ? "" : "s"}
            </div>
          </div>
        </Card>
      )}

      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Geen boetes. 🎉</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {zichtbaar.map((b) => (
            <Card key={b.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink-900">{b.omschrijving}</span>
                  <Badge tone={statusTone[b.status]}>{b.status}</Badge>
                </div>
                <div className="truncate text-xs text-ink-500">
                  {isLeiding && `${naamVan(b.medewerkerId)} · `}
                  {new Date(b.datum + "T00:00:00").toLocaleDateString("nl-NL")}
                  {b.notitie ? ` · ${b.notitie}` : ""}
                </div>
              </div>
              <div className="font-bold text-ink-900">{euro(b.bedrag)}</div>
              {isLeiding && (
                <div className="flex items-center gap-1">
                  <div className="w-36"><Keuze value={b.status} onChange={(w) => updateBoete(b.id, { status: w as BoeteStatus })} opties={BOETE_STATUSSEN.map((s) => ({ waarde: s, label: s }))} size="sm" title="Status" /></div>
                  <button type="button" onClick={() => { setBewerk(b); setModus("formulier"); }} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Bewerken">
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setVerwijder(b)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      <Bevestig
        open={!!verwijder}
        titel="Boete verwijderen"
        tekst={`Weet je het zeker dat je deze boete (${verwijder?.omschrijving}) wilt verwijderen?`}
        onBevestig={() => { if (verwijder) deleteBoete(verwijder.id); setVerwijder(null); }}
        onAnnuleer={() => setVerwijder(null)}
      />
    </div>
  );
}

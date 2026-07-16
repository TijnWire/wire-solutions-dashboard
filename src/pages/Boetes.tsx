import { useState } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, AlertTriangle, Paperclip, Download, X, Wallet } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { BOETE_STATUSSEN, boeteRest, type Boete, type BoeteStatus } from "../lib/types";
import { leesBijlage, downloadBijlage } from "../lib/bijlage";

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";
const statusTone: Record<BoeteStatus, string> = { Open: "red", "Via loon": "amber", Betaald: "green", Kwijtgescholden: "slate" };

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
  const [fout, setFout] = useState("");
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));

  const kiesBestand = async (file: File | undefined) => {
    if (!file) return;
    setFout("");
    const r = await leesBijlage(file);
    if (!r.ok) { setFout(r.fout); return; }
    set({ bestand: r.dataUrl, bestandsnaam: r.naam });
  };

  const opslaan = () => {
    if (!d.medewerkerId || !d.omschrijving.trim()) return;
    // Termijnbedrag hoort alleen bij "Via loon"; anders laten we het niet rondslingeren.
    const schoon = d.status === "Via loon" ? d : { ...d, termijnBedrag: undefined };
    if (bestaande) updateBoete(bestaande.id, schoon);
    else addBoete(schoon);
    onKlaar();
  };

  const alIngehouden = d.ingehouden ?? 0;
  const restBedrag = Math.max(0, d.bedrag - alIngehouden);
  const termijn = d.termijnBedrag && d.termijnBedrag > 0 ? d.termijnBedrag : 0;
  const aantalTermijnen = termijn > 0 ? Math.ceil(restBedrag / termijn) : 0;

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
            {/* Leeg als er nog niets is ingevuld — een voorgevulde 0 moet je eerst wegpoetsen. */}
            <input
              type="number"
              step="0.01"
              inputMode="decimal"
              value={d.bedrag || ""}
              onChange={(e) => set({ bedrag: e.target.value === "" ? 0 : Number(e.target.value) })}
              placeholder="0,00"
              className={veld}
            />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <Keuze value={d.status} onChange={(w) => set({ status: w as BoeteStatus })} opties={BOETE_STATUSSEN.map((s) => ({ waarde: s, label: s }))} title="Status" />
          </div>
        </div>

        {/* Via loon: in termijnen inhouden op de loonstrook */}
        {d.status === "Via loon" && (
          <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700">
              <Wallet className="h-3.5 w-3.5" /> Inhouden via het loon
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelCls}>Per loonstrook inhouden (€)</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={d.termijnBedrag || ""}
                  onChange={(e) => set({ termijnBedrag: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="bijv. 25,00"
                  className={veld}
                />
              </div>
              <div>
                <label className={labelCls}>Al ingehouden (€)</label>
                <input
                  type="number"
                  step="0.01"
                  inputMode="decimal"
                  value={d.ingehouden || ""}
                  onChange={(e) => set({ ingehouden: e.target.value === "" ? undefined : Number(e.target.value) })}
                  placeholder="0,00"
                  className={veld}
                />
              </div>
            </div>
            <p className="text-xs text-amber-700">
              {restBedrag <= 0
                ? "Het hele bedrag is al ingehouden."
                : termijn > 0
                  ? `Nog ${euro(restBedrag)} te gaan — dat zijn ${aantalTermijnen} loonstrook${aantalTermijnen === 1 ? "" : "en"} van ${euro(Math.min(termijn, restBedrag))}. Bij elke nieuwe loonstrook gaat er automatisch een termijn af; zodra alles binnen is, springt de boete op "Betaald".`
                  : `Vul in hoeveel er per loonstrook afgaat. Laat je dit leeg, dan gaat de hele ${euro(restBedrag)} er in één keer af.`}
            </p>
          </div>
        )}

        {/* De binnengekomen boete zelf */}
        <div>
          <label className={labelCls}>Boete als PDF of foto</label>
          {d.bestand ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-ink-200 bg-ink-50/60 p-2.5">
              <Paperclip className="h-4 w-4 shrink-0 text-ink-400" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink-700">{d.bestandsnaam}</span>
              <button type="button" onClick={() => downloadBijlage(d.bestand as string, d.bestandsnaam ?? "boete")} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink-700 hover:bg-ink-50">
                <Download className="h-3.5 w-3.5" /> Openen
              </button>
              <button type="button" onClick={() => set({ bestand: undefined, bestandsnaam: undefined })} title="Bijlage verwijderen" className="rounded-lg p-1.5 text-red-400 hover:bg-red-50 hover:text-red-600">
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-ink-300 bg-white px-3 py-3 text-sm font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700">
              <Paperclip className="h-4 w-4" /> Kies een bestand
              <input type="file" accept="application/pdf,image/*" onChange={(e) => void kiesBestand(e.target.files?.[0])} className="hidden" />
            </label>
          )}
          {fout && <p className="mt-1.5 text-xs font-semibold text-red-600">{fout}</p>}
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
  // Openstaand = wat er nog moet komen: bij "Via loon" telt alleen het deel dat nog niet is ingehouden.
  const openBedrag = zichtbaar.filter((b) => b.status === "Open" || b.status === "Via loon").reduce((s, b) => s + boeteRest(b), 0);

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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink-900">{b.omschrijving}</span>
                  <Badge tone={statusTone[b.status]}>{b.status}</Badge>
                  {b.bestand && (
                    <button type="button" onClick={() => downloadBijlage(b.bestand as string, b.bestandsnaam ?? "boete")} title={b.bestandsnaam} className="inline-flex items-center gap-1 rounded-full bg-ink-100 px-2 py-0.5 text-xs font-semibold text-ink-600 hover:bg-ink-200">
                      <Paperclip className="h-3 w-3" /> PDF
                    </button>
                  )}
                </div>
                <div className="truncate text-xs text-ink-500">
                  {isLeiding && `${naamVan(b.medewerkerId)} · `}
                  {new Date(b.datum + "T00:00:00").toLocaleDateString("nl-NL")}
                  {b.notitie ? ` · ${b.notitie}` : ""}
                </div>
                {/* Loopt de boete via het loon, dan zie je hier hoever de aflossing is. */}
                {b.status === "Via loon" && (
                  <div className="mt-1.5 max-w-xs space-y-1">
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${b.bedrag > 0 ? Math.min(100, Math.round(((b.ingehouden ?? 0) / b.bedrag) * 100)) : 0}%` }} />
                    </div>
                    <div className="text-xs text-amber-700">
                      {euro(b.ingehouden ?? 0)} van {euro(b.bedrag)} ingehouden · nog {euro(boeteRest(b))}
                      {b.termijnBedrag ? ` (${euro(b.termijnBedrag)} per loonstrook)` : ""}
                    </div>
                  </div>
                )}
              </div>
              <div className="text-right">
                <div className="font-bold text-ink-900">{euro(b.bedrag)}</div>
                {b.status === "Via loon" && boeteRest(b) !== b.bedrag && <div className="text-xs text-ink-400">nog {euro(boeteRest(b))}</div>}
              </div>
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

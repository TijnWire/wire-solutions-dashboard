import { useState } from "react";
import { Plus, ArrowLeft, Download, Pencil, Trash2, Upload, Wallet, Car, AlertTriangle } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { PERIODE_TYPES, type Loonstrook, type PeriodeType, type User } from "../lib/types";

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";

function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fnDay = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - fnDay + 3);
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / 604800000);
}

function periodeLabel(type: PeriodeType, iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (type === "Week") return `Week ${isoWeek(d)} ${d.getFullYear()}`;
  if (type === "Jaar") return `${d.getFullYear()}`;
  const m = d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" });
  return m.charAt(0).toUpperCase() + m.slice(1);
}

const uitbetaald = (l: Loonstrook) => l.netto - (l.boetes || 0);

function downloadBestand(l: Loonstrook) {
  if (!l.bestand) return;
  const a = document.createElement("a");
  a.href = l.bestand;
  a.download = l.bestandsnaam || `Loonstrook_${l.periode}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function LoonstrookForm({ bestaande, onKlaar }: { bestaande?: Loonstrook; onKlaar: () => void }) {
  const { users, boetes, addLoonstrook, updateLoonstrook, updateBoete } = useApp();
  // Standaardbedragen uit het contract van de medewerker (Medewerkers-pagina).
  const contractWaarden = (u?: User) => ({
    periodeType: (u?.contract?.periodeType ?? "Maand") as PeriodeType,
    bruto: u?.contract?.bruto ?? 0,
    bijtelling: u?.contract?.bijtelling ?? 0,
    netto: u?.contract?.netto ?? 0,
    uren: u?.contract?.uren ?? 0,
  });
  const [d, setD] = useState<Omit<Loonstrook, "id">>(
    bestaande ?? {
      medewerkerId: users[0]?.id ?? "",
      refDatum: new Date().toISOString().slice(0, 10),
      periode: "",
      boetes: 0,
      notitie: "",
      ...contractWaarden(users[0]),
    }
  );
  const [verreken, setVerreken] = useState<Set<string>>(new Set());
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));

  const openBoetes = boetes.filter((b) => b.medewerkerId === d.medewerkerId && b.status === "Open");

  const toggleVerreken = (id: string, bedrag: number) =>
    setVerreken((prev) => {
      const next = new Set(prev);
      let som = d.boetes;
      if (next.has(id)) { next.delete(id); som -= bedrag; }
      else { next.add(id); som += bedrag; }
      set({ boetes: Math.max(0, Math.round(som * 100) / 100) });
      return next;
    });

  const upload = (file: File | undefined) => {
    if (!file) return;
    const r = new FileReader();
    r.onloadend = () => set({ bestand: r.result as string, bestandsnaam: file.name });
    r.readAsDataURL(file);
  };

  const opslaan = () => {
    if (!d.medewerkerId || !d.refDatum) return;
    const compleet = { ...d, periode: periodeLabel(d.periodeType, d.refDatum) };
    if (bestaande) updateLoonstrook(bestaande.id, compleet);
    else addLoonstrook(compleet);
    // Verrekende boetes op betaald zetten
    verreken.forEach((id) => updateBoete(id, { status: "Betaald", notitie: "Verrekend met loon" }));
    onKlaar();
  };

  const fiscaal = d.bruto + d.bijtelling;

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug
      </button>
      <h2 className="text-xl font-bold text-ink-900">{bestaande ? "Loonstrook bewerken" : "Nieuwe loonstrook"}</h2>

      <Card className="space-y-4 p-4">
        <div>
          <label className={labelCls}>Medewerker</label>
          <Keuze value={d.medewerkerId} onChange={(w) => { set({ medewerkerId: w, boetes: 0, bestand: undefined, bestandsnaam: undefined, ...contractWaarden(users.find((u) => u.id === w)) }); setVerreken(new Set()); }} opties={users.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Periode</label>
            <div className="flex gap-1.5">
              {PERIODE_TYPES.map((p) => (
                <button key={p} type="button" onClick={() => set({ periodeType: p })} className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${d.periodeType === p ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Datum in periode</label>
            <DatumKiezer value={d.refDatum} onChange={(iso) => set({ refDatum: iso })} />
          </div>
        </div>
        <p className="-mt-2 text-xs text-ink-500">Periode wordt: <span className="font-semibold text-ink-700">{periodeLabel(d.periodeType, d.refDatum) || "—"}</span></p>

        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className={labelCls}>Bruto (€)</label>
            <input type="number" step="0.01" value={d.bruto || ""} onChange={(e) => set({ bruto: e.target.value === "" ? 0 : Number(e.target.value) })} className={veld} />
          </div>
          <div>
            <label className={labelCls}>Bijtelling auto (€)</label>
            <input type="number" step="0.01" value={d.bijtelling || ""} onChange={(e) => set({ bijtelling: e.target.value === "" ? 0 : Number(e.target.value) })} className={veld} />
          </div>
          <div>
            <label className={labelCls}>Uren</label>
            <input type="number" value={d.uren || ""} onChange={(e) => set({ uren: e.target.value === "" ? 0 : Number(e.target.value) })} className={veld} />
          </div>
          <div>
            <label className={labelCls}>Netto (€)</label>
            <input type="number" step="0.01" value={d.netto || ""} onChange={(e) => set({ netto: e.target.value === "" ? 0 : Number(e.target.value) })} className={veld} />
          </div>
          <div>
            <label className={labelCls}>Ingehouden boetes (€)</label>
            <input type="number" step="0.01" value={d.boetes || ""} onChange={(e) => set({ boetes: e.target.value === "" ? 0 : Number(e.target.value) })} className={veld} />
          </div>
        </div>

        {/* Openstaande boetes verrekenen */}
        {openBoetes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Openstaande boetes — aanvinken om te verrekenen
            </div>
            <div className="space-y-1.5">
              {openBoetes.map((b) => (
                <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                  <input type="checkbox" checked={verreken.has(b.id)} onChange={() => toggleVerreken(b.id, b.bedrag)} className="h-4 w-4 accent-brand-600" />
                  <span className="flex-1">{b.omschrijving} · {new Date(b.datum + "T00:00:00").toLocaleDateString("nl-NL")}</span>
                  <span className="font-semibold">{euro(b.bedrag)}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-lg bg-ink-50 p-3 text-sm">
          <div className="flex justify-between text-ink-500"><span>Bruto + bijtelling (fiscaal loon)</span><span className="text-ink-800">{euro(fiscaal)}</span></div>
          <div className="flex justify-between text-ink-500"><span>Netto</span><span className="text-ink-800">{euro(d.netto)}</span></div>
          {d.boetes > 0 && <div className="flex justify-between text-red-600"><span>− Ingehouden boetes</span><span>−{euro(d.boetes)}</span></div>}
          <div className="mt-1 flex justify-between border-t border-ink-200 pt-1 text-base font-bold text-brand-700"><span>Uit te betalen</span><span>{euro(d.netto - d.boetes)}</span></div>
        </div>

        <div>
          <label className={labelCls}>Notitie</label>
          <input value={d.notitie} onChange={(e) => set({ notitie: e.target.value })} className={veld} />
        </div>
        <div>
          <label className={labelCls}>Loonstrook-bestand (PDF of afbeelding)</label>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-ink-300 px-3 py-2.5 text-sm text-ink-600 hover:border-brand-400 hover:bg-brand-50">
            <Upload className="h-4 w-4" />
            {d.bestandsnaam ? d.bestandsnaam : "Bestand kiezen…"}
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
        </div>
      </Card>

      <button type="button" onClick={opslaan} disabled={!d.medewerkerId || !d.refDatum} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
        <Plus className="h-4 w-4" /> Opslaan
      </button>
    </div>
  );
}

export function Loonstroken() {
  const { loonstroken, users, currentUser, deleteLoonstrook } = useApp();
  const [modus, setModus] = useState<"lijst" | "formulier">("lijst");
  const [bewerk, setBewerk] = useState<Loonstrook | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<Loonstrook | null>(null);
  const [filter, setFilter] = useState<"Alle" | PeriodeType>("Alle");
  const [medewerker, setMedewerker] = useState("");

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  if (modus === "formulier") return <LoonstrookForm bestaande={bewerk} onKlaar={() => setModus("lijst")} />;

  let zichtbaar = isLeiding ? loonstroken : loonstroken.filter((l) => l.medewerkerId === currentUser.id);
  if (filter !== "Alle") zichtbaar = zichtbaar.filter((l) => l.periodeType === filter);
  if (isLeiding && medewerker) zichtbaar = zichtbaar.filter((l) => l.medewerkerId === medewerker);
  zichtbaar = [...zichtbaar].sort((a, b) => b.refDatum.localeCompare(a.refDatum));

  const som = (f: (l: Loonstrook) => number) => zichtbaar.reduce((s, l) => s + f(l), 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Loonstroken</h2>
          <p className="text-sm text-ink-500">{isLeiding ? "Beheer loonstroken, bijtelling en boetes." : "Jouw loonstroken."}</p>
        </div>
        {isLeiding && (
          <button type="button" onClick={() => { setBewerk(undefined); setModus("formulier"); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
            <Plus className="h-4 w-4" /> Nieuwe loonstrook
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {(["Alle", ...PERIODE_TYPES] as const).map((p) => (
          <button key={p} type="button" onClick={() => setFilter(p)} className={`rounded-lg px-3.5 py-2 text-sm font-semibold ${filter === p ? "bg-brand-600 text-white" : "bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50"}`}>
            {p}
          </button>
        ))}
        {isLeiding && (
          <div className="ml-auto w-52"><Keuze value={medewerker} onChange={setMedewerker} opties={[{ waarde: "", label: "Alle medewerkers" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Medewerker" /></div>
        )}
      </div>

      {/* Totalen-overzicht */}
      {zichtbaar.length > 0 && (
        <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <div><div className="text-lg font-bold text-ink-900">{euro(som((l) => l.bruto))}</div><div className="text-xs text-ink-500">Bruto totaal</div></div>
          <div><div className="text-lg font-bold text-ink-900">{euro(som((l) => l.bijtelling))}</div><div className="text-xs text-ink-500">Bijtelling auto</div></div>
          <div><div className="text-lg font-bold text-red-600">{euro(som((l) => l.boetes))}</div><div className="text-xs text-ink-500">Boetes ingehouden</div></div>
          <div><div className="text-lg font-bold text-brand-700">{euro(som(uitbetaald))}</div><div className="text-xs text-ink-500">Uitbetaald</div></div>
        </Card>
      )}

      {zichtbaar.length === 0 ? (
        <Card className="p-10 text-center">
          <Wallet className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">Geen loonstroken voor deze selectie.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {zichtbaar.map((l) => (
            <Card key={l.id} className="flex flex-wrap items-center gap-4 p-4">
              <div className="rounded-lg bg-brand-50 p-2.5 text-brand-600">
                <Wallet className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-ink-900">{l.periode}</span>
                  <Badge tone="slate">{l.periodeType}</Badge>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 text-xs text-ink-500">
                  {isLeiding && <span>{naamVan(l.medewerkerId)}</span>}
                  <span>{l.uren} uur</span>
                  {l.bijtelling > 0 && <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5" />{euro(l.bijtelling)}</span>}
                  {l.boetes > 0 && <span className="inline-flex items-center gap-1 text-red-500"><AlertTriangle className="h-3.5 w-3.5" />−{euro(l.boetes)}</span>}
                </div>
              </div>
              <div className="text-right text-sm">
                <div className="font-bold text-ink-900">{euro(uitbetaald(l))}</div>
                <div className="text-xs text-ink-400">uitbetaald · netto {euro(l.netto)}</div>
              </div>
              <div className="flex items-center gap-1">
                {l.bestand && (
                  <button type="button" onClick={() => downloadBestand(l)} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                    <Download className="h-3.5 w-3.5" /> PDF
                  </button>
                )}
                {isLeiding && (
                  <>
                    <button type="button" onClick={() => { setBewerk(l); setModus("formulier"); }} className="rounded-lg p-2 text-ink-400 hover:bg-ink-100 hover:text-ink-700" title="Bewerken">
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button type="button" onClick={() => setVerwijder(l)} className="rounded-lg p-2 text-red-400 hover:bg-red-50 hover:text-red-600" title="Verwijderen">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      <Bevestig
        open={!!verwijder}
        titel="Loonstrook verwijderen"
        tekst={`Weet je het zeker dat je de loonstrook (${verwijder?.periode}) wilt verwijderen?`}
        onBevestig={() => { if (verwijder) deleteLoonstrook(verwijder.id); setVerwijder(null); }}
        onAnnuleer={() => setVerwijder(null)}
      />
    </div>
  );
}

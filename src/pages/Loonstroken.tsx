import { useEffect, useState } from "react";
import { Plus, ArrowLeft, Download, Pencil, Trash2, Upload, Wallet, Car, AlertTriangle, Clock, Wand2, Check, CheckSquare, Square } from "lucide-react";
import { useApp } from "../store/AppContext";
import { DatumKiezer } from "../components/DatumKiezer";
import { Keuze } from "../components/Keuze";
import { Card, Badge, Bevestig } from "../components/ui";
import { PERIODE_TYPES, boeteRest, boeteTermijn, type Loonstrook, type PeriodeType, type User } from "../lib/types";
import { leesBijlage } from "../lib/bijlage";

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";
const labelCls = "mb-1 block text-xs font-semibold text-ink-600";
const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const maandagVan = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace(".", ","));

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
  const [uploadFout, setUploadFout] = useState("");
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));

  // Zowel losse open boetes als boetes die in termijnen via het loon lopen.
  const openBoetes = boetes.filter((b) => b.medewerkerId === d.medewerkerId && (b.status === "Open" || b.status === "Via loon") && boeteRest(b) > 0);

  const toggleVerreken = (id: string, bedrag: number) =>
    setVerreken((prev) => {
      const next = new Set(prev);
      let som = d.boetes;
      if (next.has(id)) { next.delete(id); som -= bedrag; }
      else { next.add(id); som += bedrag; }
      set({ boetes: Math.max(0, Math.round(som * 100) / 100) });
      return next;
    });

  const upload = async (file: File | undefined) => {
    if (!file) return;
    setUploadFout("");
    const r = await leesBijlage(file);
    if (!r.ok) { setUploadFout(r.fout); return; }
    set({ bestand: r.dataUrl, bestandsnaam: r.naam });
  };

  const opslaan = () => {
    if (!d.medewerkerId || !d.refDatum) return;
    // Leg per aangevinkte boete vast wat er van deze strook af is gegaan, zodat op de loonstrook
    // terug te zien is waarvóór er is ingehouden (en bij termijnen: de hoeveelste termijn).
    const regels: NonNullable<Loonstrook["boeteRegels"]> = [];
    for (const b of openBoetes) {
      if (!verreken.has(b.id)) continue;
      const af = boeteTermijn(b);
      const nuIngehouden = Math.round(((b.ingehouden ?? 0) + af) * 100) / 100;
      const klaarMee = nuIngehouden + 0.001 >= b.bedrag;
      const aantal = b.status === "Via loon" && b.termijnBedrag ? Math.ceil(b.bedrag / b.termijnBedrag) : 1;
      const nummer = b.status === "Via loon" && b.termijnBedrag ? Math.ceil(nuIngehouden / b.termijnBedrag) : 1;
      regels.push({ boeteId: b.id, omschrijving: b.omschrijving, bedrag: af, termijn: aantal > 1 ? `termijn ${nummer} van ${aantal}` : undefined });
      updateBoete(b.id, {
        ingehouden: nuIngehouden,
        status: klaarMee ? "Betaald" : b.status,
        notitie: klaarMee ? "Volledig verrekend met loon" : b.notitie,
      });
    }
    const compleet = { ...d, periode: periodeLabel(d.periodeType, d.refDatum), boeteRegels: regels.length ? regels : undefined };
    if (bestaande) updateLoonstrook(bestaande.id, compleet);
    else addLoonstrook(compleet);
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
          <Keuze value={d.medewerkerId} onChange={(w) => { set({ medewerkerId: w, boetes: 0, bestand: undefined, bestandsnaam: undefined, ...contractWaarden(users.find((u) => u.id === w)) }); setVerreken(new Set()); }} altijdZoeken opties={users.map((u) => ({ waarde: u.id, label: u.naam }))} title="Medewerker" />
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

        {/* Openstaande boetes verrekenen. Loopt een boete in termijnen via het loon, dan gaat er
            precies één termijn af en houdt de boete zelf bij hoeveel er nog te gaan is. */}
        {openBoetes.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-amber-700">
              <AlertTriangle className="h-3.5 w-3.5" /> Openstaande boetes — aanvinken om te verrekenen
            </div>
            <div className="space-y-1.5">
              {openBoetes.map((b) => {
                const af = boeteTermijn(b);
                const termijnen = b.status === "Via loon" && b.termijnBedrag ? Math.ceil(b.bedrag / b.termijnBedrag) : 0;
                const nummer = b.status === "Via loon" && b.termijnBedrag ? Math.floor((b.ingehouden ?? 0) / b.termijnBedrag) + 1 : 0;
                return (
                  <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                    <input type="checkbox" checked={verreken.has(b.id)} onChange={() => toggleVerreken(b.id, af)} className="h-4 w-4 accent-brand-600" />
                    <span className="min-w-0 flex-1">
                      {b.omschrijving} · {new Date(b.datum + "T00:00:00").toLocaleDateString("nl-NL")}
                      {termijnen > 1 && <span className="text-amber-700"> · termijn {nummer} van {termijnen} (nog {euro(boeteRest(b))})</span>}
                    </span>
                    <span className="shrink-0 font-semibold">{euro(af)}</span>
                  </label>
                );
              })}
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
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => void upload(e.target.files?.[0])} />
          </label>
          {uploadFout && <p className="mt-1.5 text-xs font-semibold text-red-600">{uploadFout}</p>}
        </div>
      </Card>

      <button type="button" onClick={opslaan} disabled={!d.medewerkerId || !d.refDatum} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white hover:bg-brand-700 disabled:opacity-40">
        <Plus className="h-4 w-4" /> Opslaan
      </button>
    </div>
  );
}

// ── Automatisch loonstroken aanmaken op basis van de gewerkte uren (Urenstaat) ──
function LoonstrookGenerator({ startWeek, onKlaar }: { startWeek?: string; onKlaar: () => void }) {
  const { users, urenstaat, loonstroken, addLoonstrook } = useApp();
  const [periodeType, setPeriodeType] = useState<PeriodeType>("Maand");
  const [anker, setAnker] = useState(() => startWeek || new Date().toISOString().slice(0, 10));
  const [gekozen, setGekozen] = useState<Set<string>>(new Set());
  const [klaar, setKlaar] = useState(0);

  // Periode-grenzen (van–tot) bepalen uit type + ankerdatum. urenregel.week = maandag van die week.
  const d0 = new Date(anker + "T00:00:00");
  const y = d0.getFullYear();
  let van = "", tot = "";
  if (periodeType === "Week") {
    const mon = maandagVan(d0); van = toISO(mon);
    const sun = new Date(mon); sun.setDate(sun.getDate() + 6); tot = toISO(sun);
  } else if (periodeType === "Jaar") {
    van = `${y}-01-01`; tot = `${y}-12-31`;
  } else {
    const mm = String(d0.getMonth() + 1).padStart(2, "0");
    const laatste = new Date(y, d0.getMonth() + 1, 0).getDate();
    van = `${y}-${mm}-01`; tot = `${y}-${mm}-${String(laatste).padStart(2, "0")}`;
  }
  const label = periodeLabel(periodeType, anker);

  const urenVan = (userId: string) =>
    urenstaat.filter((x) => x.medewerkerId === userId && x.datum >= van && x.datum <= tot).reduce((s, x) => s + (Number(x.uren) || 0), 0);
  const alBestaat = (userId: string) => loonstroken.some((l) => l.medewerkerId === userId && l.periodeType === periodeType && l.periode === label);

  const rijen = [...users]
    .sort((a, b) => a.naam.localeCompare(b.naam, "nl"))
    .map((u) => ({ u, uren: urenVan(u.id), bestaat: alBestaat(u.id) }));

  // Standaard aangevinkt: iedereen met uren die nog geen loonstrook voor deze periode heeft.
  useEffect(() => {
    setGekozen(new Set(rijen.filter((r) => r.uren > 0 && !r.bestaat).map((r) => r.u.id)));
    setKlaar(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodeType, anker, loonstroken.length]);

  const toggle = (id: string) => { setKlaar(0); setGekozen((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; }); };
  const teMaken = rijen.filter((r) => gekozen.has(r.u.id) && !r.bestaat).length;

  const genereer = () => {
    let n = 0;
    for (const r of rijen) {
      if (!gekozen.has(r.u.id) || r.bestaat) continue;
      const c = r.u.contract ?? {};
      addLoonstrook({
        medewerkerId: r.u.id,
        periodeType,
        refDatum: tot,
        periode: label,
        bruto: c.bruto ?? 0,
        bijtelling: c.bijtelling ?? 0,
        netto: c.netto ?? 0,
        boetes: 0,
        uren: Math.round(r.uren * 100) / 100,
        notitie: `Automatisch aangemaakt uit de urenstaat (${label})`,
      });
      n++;
    }
    setKlaar(n);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <button type="button" onClick={onKlaar} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800"><ArrowLeft className="h-4 w-4" /> Terug naar loonstroken</button>
      <div>
        <h2 className="text-xl font-bold text-ink-900">Loonstroken uit urenstaat</h2>
        <p className="text-sm text-ink-500">Kies een periode. De app telt de gewerkte uren per medewerker uit de Urenstaat en maakt per persoon een concept-loonstrook (met bruto/netto/bijtelling uit hun contract). Alles blijft daarna handmatig aanpasbaar.</p>
      </div>

      <Card className="space-y-4 p-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Periode</label>
            <div className="flex gap-1.5">
              {PERIODE_TYPES.map((p) => (
                <button key={p} type="button" onClick={() => setPeriodeType(p)} className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${periodeType === p ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>{p}</button>
              ))}
            </div>
          </div>
          <div>
            <label className={labelCls}>Datum in periode</label>
            <DatumKiezer value={anker} onChange={setAnker} />
          </div>
        </div>
        <p className="-mt-1 text-xs text-ink-500">Periode wordt: <span className="font-semibold text-ink-700">{label}</span> <span className="text-ink-400">({new Date(van + "T00:00:00").toLocaleDateString("nl-NL")} – {new Date(tot + "T00:00:00").toLocaleDateString("nl-NL")})</span></p>

        <div className="overflow-hidden rounded-xl border border-ink-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-ink-50/60 text-xs text-ink-500">
                <th className="px-3 py-2 text-left font-semibold">Medewerker</th>
                <th className="px-3 py-2 text-right font-semibold">Uren</th>
                <th className="px-3 py-2 text-right font-semibold">Bruto (contract)</th>
                <th className="px-3 py-2 text-right font-semibold">Netto</th>
                <th className="px-3 py-2 text-center font-semibold">Aanmaken</th>
              </tr>
            </thead>
            <tbody>
              {rijen.map((r) => (
                <tr key={r.u.id} className={`border-t border-ink-100 ${r.uren === 0 && !r.bestaat ? "text-ink-300" : ""}`}>
                  <td className="px-3 py-2">{r.u.naam}</td>
                  <td className="px-3 py-2 text-right font-medium text-ink-800">{r.uren ? `${uurTekst(r.uren)} u` : "0 u"}</td>
                  <td className="px-3 py-2 text-right">{euro(r.u.contract?.bruto ?? 0)}</td>
                  <td className="px-3 py-2 text-right">{euro(r.u.contract?.netto ?? 0)}</td>
                  <td className="px-3 py-2 text-center">
                    {r.bestaat ? (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" /> al aangemaakt</span>
                    ) : (
                      <button type="button" onClick={() => toggle(r.u.id)} aria-label={`${r.u.naam} ${gekozen.has(r.u.id) ? "niet" : "wel"} aanmaken`} className="inline-flex">
                        {gekozen.has(r.u.id) ? <CheckSquare className="h-5 w-5 text-brand-600" /> : <Square className="h-5 w-5 text-ink-300" />}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-ink-100 pt-3">
          <button type="button" onClick={genereer} disabled={teMaken === 0} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40">
            <Wand2 className="h-4 w-4" /> {teMaken} loonstro{teMaken === 1 ? "ok" : "ken"} aanmaken
          </button>
          {klaar > 0 && <span className="text-sm font-semibold text-emerald-600">✓ {klaar} loonstro{klaar === 1 ? "ok" : "ken"} aangemaakt — bewerk ze in de lijst.</span>}
        </div>
      </Card>
      <p className="text-xs text-ink-400">Bruto, netto en bijtelling komen uit het contract van de medewerker (Medewerkers-pagina). De uren komen uit de Urenstaat. Pas elke loonstrook daarna nog aan waar nodig.</p>
    </div>
  );
}

export function Loonstroken({ loonWeek }: { loonWeek?: string }) {
  const { loonstroken, users, currentUser, deleteLoonstrook } = useApp();
  const [modus, setModus] = useState<"lijst" | "formulier" | "genereer">("lijst");
  const [bewerk, setBewerk] = useState<Loonstrook | undefined>(undefined);
  const [verwijder, setVerwijder] = useState<Loonstrook | null>(null);
  const [filter, setFilter] = useState<"Alle" | PeriodeType>("Alle");
  const [medewerker, setMedewerker] = useState("");
  const [selectie, setSelectie] = useState<Set<string>>(new Set());
  const [vraagSelectieWeg, setVraagSelectieWeg] = useState(false); // bevestiging vóór meerdere tegelijk verwijderen

  // Deep-link vanuit de Urenstaat: open meteen de generator (voorgevuld op de meegegeven week).
  useEffect(() => { if (loonWeek) setModus("genereer"); }, [loonWeek]);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  const naamVan = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  if (modus === "formulier") return <LoonstrookForm bestaande={bewerk} onKlaar={() => setModus("lijst")} />;
  if (modus === "genereer") return <LoonstrookGenerator startWeek={loonWeek} onKlaar={() => setModus("lijst")} />;

  let zichtbaar = isLeiding ? loonstroken : loonstroken.filter((l) => l.medewerkerId === currentUser.id);
  if (filter !== "Alle") zichtbaar = zichtbaar.filter((l) => l.periodeType === filter);
  if (isLeiding && medewerker) zichtbaar = zichtbaar.filter((l) => l.medewerkerId === medewerker);
  zichtbaar = [...zichtbaar].sort((a, b) => b.refDatum.localeCompare(a.refDatum));

  const som = (f: (l: Loonstrook) => number) => zichtbaar.reduce((s, l) => s + f(l), 0);

  // Selecteren: per stuk of alles tegelijk. We rekenen altijd met wat je nú ziet, zodat een
  // selectie van vóór een filterwissel nooit stiekem iets meeneemt dat buiten beeld staat.
  const geselecteerd = zichtbaar.filter((l) => selectie.has(l.id));
  const allesAan = zichtbaar.length > 0 && geselecteerd.length === zichtbaar.length;
  const toggle = (id: string) => setSelectie((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAlles = () => setSelectie(allesAan ? new Set() : new Set(zichtbaar.map((l) => l.id)));
  const verwijderSelectie = () => { for (const l of geselecteerd) deleteLoonstrook(l.id); setSelectie(new Set()); setVraagSelectieWeg(false); };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-ink-900">Loonstroken</h2>
          <p className="text-sm text-ink-500">{isLeiding ? "Beheer loonstroken, bijtelling en boetes." : "Jouw loonstroken."}</p>
        </div>
        {isLeiding && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => setModus("genereer")} className="inline-flex items-center gap-2 rounded-xl border border-ink-200 bg-white px-4 py-2.5 text-sm font-semibold text-ink-700 hover:bg-ink-50">
              <Clock className="h-4 w-4 text-ink-500" /> Uit urenstaat
            </button>
            <button type="button" onClick={() => { setBewerk(undefined); setModus("formulier"); }} className="inline-flex items-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-brand-700">
              <Plus className="h-4 w-4" /> Nieuwe loonstrook
            </button>
          </div>
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
          <div className="ml-auto w-52"><Keuze value={medewerker} onChange={setMedewerker} altijdZoeken opties={[{ waarde: "", label: "Alle medewerkers" }, ...users.map((u) => ({ waarde: u.id, label: u.naam }))]} title="Medewerker" /></div>
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
          {/* Selecteren + in één keer verwijderen */}
          {isLeiding && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-ink-200 bg-white p-3 shadow-card">
              <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink-700">
                <input type="checkbox" checked={allesAan} onChange={toggleAlles} className="h-4 w-4 accent-brand-600" />
                Alles selecteren
              </label>
              <span className="text-xs text-ink-400">{geselecteerd.length} van de {zichtbaar.length} geselecteerd</span>
              <button
                type="button"
                disabled={geselecteerd.length === 0}
                onClick={() => setVraagSelectieWeg(true)}
                className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-600 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:border-ink-200 disabled:bg-white disabled:text-ink-300"
              >
                <Trash2 className="h-3.5 w-3.5" /> Verwijder selectie{geselecteerd.length ? ` (${geselecteerd.length})` : ""}
              </button>
            </div>
          )}
          {zichtbaar.map((l) => (
            <Card key={l.id} className={`flex flex-wrap items-center gap-4 p-4 ${selectie.has(l.id) ? "ring-2 ring-brand-400" : ""}`}>
              {isLeiding && (
                <input type="checkbox" checked={selectie.has(l.id)} onChange={() => toggle(l.id)} aria-label={`Loonstrook ${l.periode} selecteren`} className="h-4 w-4 shrink-0 accent-brand-600" />
              )}
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
                {/* Waarvóór er is ingehouden — ook voor de medewerker zelf zichtbaar. */}
                {l.boeteRegels && l.boeteRegels.length > 0 && (
                  <ul className="mt-1 space-y-0.5">
                    {l.boeteRegels.map((r) => (
                      <li key={r.boeteId} className="flex flex-wrap items-center gap-1.5 text-xs text-ink-500">
                        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-500" />
                        <span className="min-w-0 truncate">{r.omschrijving}</span>
                        {r.termijn && <span className="rounded-full bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-700">{r.termijn}</span>}
                        <span className="font-semibold text-red-500">−{euro(r.bedrag)}</span>
                      </li>
                    ))}
                  </ul>
                )}
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

      <Bevestig
        open={vraagSelectieWeg}
        titel={`${geselecteerd.length} ${geselecteerd.length === 1 ? "loonstrook" : "loonstroken"} verwijderen`}
        tekst={`Je verwijdert ${geselecteerd.length} ${geselecteerd.length === 1 ? "loonstrook" : "loonstroken"} in één keer${geselecteerd.length === 1 ? ` (${geselecteerd[0]?.periode})` : ""}. Dit kan niet ongedaan worden gemaakt.`}
        bevestigLabel={`Verwijder ${geselecteerd.length}`}
        onBevestig={verwijderSelectie}
        onAnnuleer={() => setVraagSelectieWeg(false)}
      />
    </div>
  );
}

import { useState, type ComponentType } from "react";
import {
  ArrowLeft,
  ChevronRight,
  ChevronDown,
  Mail,
  Briefcase,
  ListTodo,
  Mailbox,
  CalendarCheck,
  Wallet,
  AlertTriangle,
  ClipboardCheck,
  Download,
  UserCog,
  Clock,
  FolderKanban,
  Building2,
  Waypoints,
  CalendarClock,
  Shovel,
  Flame,
} from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Badge } from "../components/ui";
import { PERIODE_TYPES, type User, type AfspraakStatus, type PeriodeType } from "../lib/types";
import { isToegewezen } from "../lib/toewijzing";

// Op Medewerkers staat bij iedereen dezelfde aanduiding: werknemer · medewerker.
const ROL_TEKST = "Werknemer · Medewerker";

// Alle lopende projecten waar iemand op staat, uit elk onderdeel. Afgeronde en gearchiveerde zaken tellen niet mee.
type ProjectRegel = { key: string; titel: string; sub: string; navKey: string; target?: Record<string, string>; Icon: ComponentType<{ className?: string }> };
type AppData = ReturnType<typeof useApp>;
const useProjectenVan = (userId: string) => projectenVan(userId, useApp());
function projectenVan(userId: string, { projects, rondes, afspraken, buurtaanpak, saneringen, voorschouwMappen, schouwafspraken, gasProjecten, gasAdressen }: AppData): ProjectRegel[] {
  const uit: ProjectRegel[] = [];
  for (const p of projects) if (p.toegewezenAan?.includes(userId) && !p.afgerondOp) uit.push({ key: "p" + p.id, titel: p.naam, sub: `Project${p.wijk ? ` · ${p.wijk}` : ""}`, navKey: "projecten", target: { project: p.id }, Icon: FolderKanban });
  // Brieven per map (of straat als er geen map is)
  const mappen = new Map<string, typeof rondes>();
  for (const r of rondes) if (isToegewezen(r, userId) && !r.gearchiveerd) { const k = r.mapNaam || r.straat; mappen.set(k, [...(mappen.get(k) ?? []), r]); }
  for (const [naam, rs] of mappen) {
    const te = rs.flatMap((r) => r.adressen.filter((a) => !a.ontbreekt));
    uit.push({ key: "b" + naam, titel: naam, sub: `Brieven · ${te.filter((a) => a.status === "Gegooid").length}/${te.length} gegooid`, navKey: "brieven", target: rs.length === 1 ? { ronde: rs[0].id } : { brievenMap: naam }, Icon: Mailbox });
  }
  for (const loc of new Set(afspraken.filter((a) => isToegewezen(a, userId)).map((a) => a.locatie))) {
    const rijen = afspraken.filter((a) => isToegewezen(a, userId) && a.locatie === loc);
    const bevestigd = rijen.filter((a) => a.status === ("Bevestigd" as AfspraakStatus) || a.status === ("Afgerond" as AfspraakStatus)).length;
    uit.push({ key: "a" + loc, titel: loc, sub: `Afspraken · ${bevestigd}/${rijen.length} bevestigd`, navKey: "afspraken", target: { locatie: loc }, Icon: CalendarCheck });
  }
  for (const b of buurtaanpak) if (isToegewezen(b, userId) && !b.afgerondOp && !b.gearchiveerd) uit.push({ key: "ba" + b.id, titel: b.naam, sub: `Buurtaanpak · ${b.adressen.length} adressen`, navKey: "buurtaanpak", target: { buurtaanpakId: b.id }, Icon: Waypoints });
  for (const s of saneringen) if (isToegewezen(s, userId) && !s.afgerondOp && !s.gearchiveerd) uit.push({ key: "s" + s.id, titel: s.naam, sub: `Saneren · ${s.adressen.length} adressen`, navKey: "saneren", target: { saneringId: s.id }, Icon: Building2 });
  for (const m of voorschouwMappen) if (isToegewezen(m, userId) && !m.gearchiveerd) uit.push({ key: "v" + m.id, titel: m.naam, sub: "Voorschouwen", navKey: "voorschouwen", target: { voorschouwMap: m.id }, Icon: ClipboardCheck });
  for (const g of gasProjecten) if (isToegewezen(g, userId) && !g.gearchiveerd) {
    const lijst = gasAdressen.filter((a) => a.projectId === g.id);
    uit.push({ key: "g" + g.id, titel: g.naam, sub: `Gasleidingen · ${lijst.filter((a) => a.status === "afgesproken").length}/${lijst.length} afgesproken`, navKey: "gas", target: { gasProject: g.id }, Icon: Flame });
  }
  const schouw = new Map<string, { bodem: boolean; n: number }>();
  for (const a of schouwafspraken) if (isToegewezen(a, userId) && !a.gearchiveerd && a.status !== "Geannuleerd") { const k = `${a.soort ?? ""}|${a.plaats}`; const g = schouw.get(k) ?? { bodem: a.soort === "bodem", n: 0 }; g.n++; schouw.set(k, g); }
  for (const [k, g] of schouw) { const plaats = k.split("|")[1]; uit.push({ key: "sa" + k, titel: plaats, sub: `${g.bodem ? "Bodemonderzoek" : "Schouwafspraken"} · ${g.n} afspraken`, navKey: g.bodem ? "tauw" : "schouwafspraken", Icon: g.bodem ? Shovel : CalendarClock }); }
  return uit;
}

function ProjectenKaart({ userId }: { userId: string }) {
  const lijst = useProjectenVan(userId);
  const { navigeer } = useNav();
  return (
    <Card className="p-5">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><FolderKanban className="h-4 w-4 text-ink-500" /> Projecten</h3>
      {lijst.length === 0 ? (
        <p className="text-sm text-ink-400">Geen lopende projecten.</p>
      ) : (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {lijst.map(({ key, titel, sub, navKey, target, Icon }) => (
            <button key={key} type="button" onClick={() => navigeer(navKey, target ?? null)} className="flex items-center gap-3 rounded-lg border border-ink-200 p-3 text-left hover:border-brand-300 hover:bg-ink-50">
              <Icon className="h-4 w-4 shrink-0 text-brand-600" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-ink-900">{titel}</div>
                <div className="truncate text-xs text-ink-500">{sub}</div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}

const euro = (n: number) => n.toLocaleString("nl-NL", { style: "currency", currency: "EUR" });
const veldCls = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";
const labelMini = "mb-1 block text-xs font-semibold text-ink-600";

// Vast contract / standaardloon per medewerker — wordt automatisch in een nieuwe loonstrook gezet.
function ContractKaart({ user }: { user: User }) {
  const { updateUser } = useApp();
  const c = user.contract;
  const [periodeType, setPeriodeType] = useState<PeriodeType>(c?.periodeType ?? "Maand");
  const [bruto, setBruto] = useState(c?.bruto ?? 0);
  const [netto, setNetto] = useState(c?.netto ?? 0);
  const [bijtelling, setBijtelling] = useState(c?.bijtelling ?? 0);
  const [uren, setUren] = useState(c?.uren ?? 0);
  const [bewaard, setBewaard] = useState(false);
  const [open, setOpen] = useState(!c); // nog geen contract? meteen open om in te vullen; anders ingeklapt
  const opslaan = () => {
    updateUser(user.id, { contract: { periodeType, bruto, netto, bijtelling, uren } });
    setBewaard(true);
    setOpen(false); // na opslaan inklappen
    setTimeout(() => setBewaard(false), 2500);
  };
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-ink-500" />
          <h3 className="text-sm font-bold text-ink-900">Contract / standaardloon</h3>
          {bewaard && <span className="text-sm font-medium text-green-600">Opgeslagen ✓</span>}
        </div>
        <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:text-brand-700">
          {open ? "Inklappen" : c ? "Bewerken" : "Invullen"}
          <ChevronDown className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} />
        </button>
      </div>

      {!open ? (
        <p className="mt-1 text-sm text-ink-500">{c ? `${c.periodeType ?? "Maand"} · bruto ${euro(c.bruto ?? 0)} · netto ${euro(c.netto ?? 0)}${c.uren ? ` · ${c.uren} uur` : ""}` : "Nog geen contract ingevuld."}</p>
      ) : (
        <>
      <p className="mb-3 mt-1 text-xs text-ink-500">Vul dit één keer in. Bij een nieuwe loonstrook voor {user.naam.split(" ")[0]} staan deze bedragen er dan automatisch al in — je hoeft het alleen nog na te checken.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className={labelMini}>Periode</label>
          <div className="flex gap-1.5">
            {PERIODE_TYPES.map((p) => (
              <button key={p} type="button" onClick={() => setPeriodeType(p)} className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold ${periodeType === p ? "bg-brand-600 text-white" : "bg-ink-100 text-ink-600 hover:bg-ink-200"}`}>{p}</button>
            ))}
          </div>
        </div>
        <div>
          <label className={labelMini}>Uren per {periodeType.toLowerCase()}</label>
          <input type="number" value={uren || ""} onChange={(e) => setUren(e.target.value === "" ? 0 : Number(e.target.value))} title="Uren per periode" placeholder="0" className={veldCls} />
        </div>
        <div>
          <label className={labelMini}>Bruto (€)</label>
          <input type="number" step="0.01" value={bruto || ""} onChange={(e) => setBruto(e.target.value === "" ? 0 : Number(e.target.value))} title="Bruto" placeholder="0" className={veldCls} />
        </div>
        <div>
          <label className={labelMini}>Netto (€)</label>
          <input type="number" step="0.01" value={netto || ""} onChange={(e) => setNetto(e.target.value === "" ? 0 : Number(e.target.value))} title="Netto" placeholder="0" className={veldCls} />
        </div>
        <div>
          <label className={labelMini}>Bijtelling auto (€)</label>
          <input type="number" step="0.01" value={bijtelling || ""} onChange={(e) => setBijtelling(e.target.value === "" ? 0 : Number(e.target.value))} title="Bijtelling auto" placeholder="0" className={veldCls} />
        </div>
      </div>
      <div className="mt-3">
        <button type="button" onClick={opslaan} className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700">Contract opslaan</button>
      </div>
        </>
      )}
    </Card>
  );
}

function MedewerkerDetail({ user, onTerug }: { user: User; onTerug: () => void }) {
  const { taken, loonstroken, boetes, voorschouwen } = useApp();
  const { navigeer } = useNav();

  const mijnTaken = taken.filter((t) => isToegewezen(t, user.id) || t.toegewezenAan === ""); // "" = hele team
  const openTaken = mijnTaken.filter((t) => t.status !== "Klaar");
  const mijnLoon = loonstroken.filter((l) => l.medewerkerId === user.id);
  const mijnBoetes = boetes.filter((b) => b.medewerkerId === user.id);
  const openBoetes = mijnBoetes.filter((b) => b.status === "Open").reduce((s, b) => s + b.bedrag, 0);
  const mijnVoorschouwen = voorschouwen.filter((v) => v.ingevuldDoor === user.id);
  const projecten = useProjectenVan(user.id);

  const stats = [
    { label: "Open taken", value: String(openTaken.length), icon: ListTodo, tone: "bg-red-50 text-red-600" },
    { label: "Projecten", value: String(projecten.length), icon: FolderKanban, tone: "bg-brand-50 text-brand-600" },
    { label: "Loonstroken", value: String(mijnLoon.length), icon: Wallet, tone: "bg-green-50 text-green-600" },
    { label: "Open boetes", value: euro(openBoetes), icon: AlertTriangle, tone: "bg-amber-50 text-amber-600" },
  ];

  return (
    <div className="space-y-5">
      <button type="button" onClick={onTerug} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
        <ArrowLeft className="h-4 w-4" /> Terug naar medewerkers
      </button>

      {/* Header */}
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-ink-800 text-lg font-bold text-white">{user.initialen}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-ink-900">{user.naam}</h2>
            <Badge tone="slate">{ROL_TEKST}</Badge>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-4 text-sm text-ink-500">
            <span className="inline-flex items-center gap-1"><Briefcase className="h-4 w-4" />{user.functie}</span>
            <span className="inline-flex items-center gap-1"><Mail className="h-4 w-4" />{user.email}</span>
          </div>
        </div>
        <button type="button" onClick={() => navigeer("beheer")} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-50">
          <UserCog className="h-4 w-4" /> Account beheren
        </button>
      </Card>

      {/* Stat-tiles */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label} className="flex items-center gap-3 p-4">
              <div className={`rounded-xl p-2.5 ${s.tone}`}><Icon className="h-5 w-5" /></div>
              <div>
                <div className="text-lg font-bold text-ink-900">{s.value}</div>
                <div className="text-xs text-ink-500">{s.label}</div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Contract / standaardloon */}
      <ContractKaart key={user.id} user={user} />

      {/* Openstaande taken */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><ListTodo className="h-4 w-4 text-ink-500" /> Openstaande taken & deadlines</h3>
        {openTaken.length === 0 ? (
          <p className="text-sm text-ink-400">Geen openstaande taken. 🎉</p>
        ) : (
          <div className="space-y-2">
            {openTaken.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-lg border border-ink-200 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-ink-900">{t.titel}</div>
                  <div className="inline-flex items-center gap-1 text-xs text-ink-500"><Clock className="h-3.5 w-3.5" />{t.deadline}</div>
                </div>
                <Badge tone={t.status === "Mee bezig" ? "amber" : "slate"}>{t.status}</Badge>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Projecten: al het lopende werk waar deze medewerker op staat */}
      <ProjectenKaart userId={user.id} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Loonstroken */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Wallet className="h-4 w-4 text-ink-500" /> Loonstroken</h3>
            <button type="button" onClick={() => navigeer("loonstroken")} className="text-xs font-semibold text-brand-600 hover:underline">Beheren</button>
          </div>
          {mijnLoon.length === 0 ? (
            <p className="text-sm text-ink-400">Nog geen loonstroken.</p>
          ) : (
            <div className="space-y-2">
              {mijnLoon.slice(0, 5).map((l) => (
                <div key={l.id} className="flex items-center justify-between rounded-lg border border-ink-200 p-2.5">
                  <div>
                    <div className="text-sm font-medium text-ink-900">{l.periode}</div>
                    <div className="text-xs text-ink-500">{euro(l.netto - (l.boetes || 0))} uitbetaald</div>
                  </div>
                  {l.bestand && (
                    <a href={l.bestand} download={l.bestandsnaam || `Loonstrook_${l.periode}.pdf`} className="inline-flex items-center gap-1.5 rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-medium text-ink-700 hover:bg-ink-50">
                      <Download className="h-3.5 w-3.5" /> PDF
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Boetes */}
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-bold text-ink-900"><AlertTriangle className="h-4 w-4 text-ink-500" /> Boetes</h3>
            <button type="button" onClick={() => navigeer("boetes")} className="text-xs font-semibold text-brand-600 hover:underline">Beheren</button>
          </div>
          {mijnBoetes.length === 0 ? (
            <p className="text-sm text-ink-400">Geen boetes. 🎉</p>
          ) : (
            <div className="space-y-2">
              {mijnBoetes.map((b) => (
                <div key={b.id} className="flex items-center justify-between rounded-lg border border-ink-200 p-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-900">{b.omschrijving}</div>
                    <div className="text-xs text-ink-500">{new Date(b.datum + "T00:00:00").toLocaleDateString("nl-NL")}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-ink-800">{euro(b.bedrag)}</span>
                    <Badge tone={b.status === "Open" ? "red" : b.status === "Betaald" ? "green" : "slate"}>{b.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Voorschouwen */}
      <Card className="p-5">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><ClipboardCheck className="h-4 w-4 text-ink-500" /> Voorschouwen ({mijnVoorschouwen.length})</h3>
        {mijnVoorschouwen.length === 0 ? (
          <p className="text-sm text-ink-400">Nog geen voorschouwen ingevuld.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {mijnVoorschouwen.map((v) => (
              <span key={v.id} className="rounded-lg bg-ink-100 px-2.5 py-1 text-xs text-ink-700">
                {v.straatnaam || "—"} {v.plaats ? `· ${v.plaats}` : ""} <span className={v.status === "Ingediend" ? "text-green-600" : "text-amber-600"}>({v.status})</span>
              </span>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

export function Medewerkers({ initieelMedewerker }: { initieelMedewerker?: string }) {
  const app = useApp();
  const { users, taken, boetes, currentUser } = app;
  const projectenAantal = (id: string) => projectenVan(id, app).length;
  const [selId, setSelId] = useState<string | null>(initieelMedewerker ?? null);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) {
    return <Card className="p-8 text-center text-sm text-ink-500">Je hebt geen toegang tot deze pagina.</Card>;
  }

  const gekozen = users.find((u) => u.id === selId);
  if (gekozen) return <MedewerkerDetail user={gekozen} onTerug={() => setSelId(null)} />;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Medewerkers</h2>
        <p className="text-sm text-ink-500">Persoonlijk dashboard per medewerker — klik op iemand voor het volledige overzicht.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {users.map((u) => {
          const openTaken = taken.filter((t) => (isToegewezen(t, u.id) || t.toegewezenAan === "") && t.status !== "Klaar").length; // "" = hele team
          const werk = projectenAantal(u.id);
          const openBoetes = boetes.filter((b) => b.medewerkerId === u.id && b.status === "Open").reduce((s, b) => s + b.bedrag, 0);
          return (
            <button key={u.id} type="button" onClick={() => setSelId(u.id)} className="rounded-2xl border border-ink-200 bg-white p-4 text-left shadow-card transition-all hover:border-brand-300 hover:shadow-cardhover">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">{u.initialen}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-ink-900">{u.naam}</div>
                  <div className="truncate text-xs text-ink-500">{ROL_TEKST}</div>
                </div>
                <ChevronRight className="h-5 w-5 shrink-0 text-ink-300" />
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                <div className="rounded-lg bg-ink-50 py-2">
                  <div className="text-sm font-bold text-ink-900">{openTaken}</div>
                  <div className="text-[11px] text-ink-500">taken</div>
                </div>
                <div className="rounded-lg bg-ink-50 py-2">
                  <div className="text-sm font-bold text-ink-900">{werk}</div>
                  <div className="text-[11px] text-ink-500">projecten</div>
                </div>
                <div className="rounded-lg bg-ink-50 py-2">
                  <div className={`text-sm font-bold ${openBoetes > 0 ? "text-red-600" : "text-ink-900"}`}>{openBoetes > 0 ? euro(openBoetes) : "—"}</div>
                  <div className="text-[11px] text-ink-500">boetes</div>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarCheck, CheckCircle2, ChevronDown, ClipboardCheck, Flame, Lock, Loader2, Mailbox, Medal, Trophy, ListTodo } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "./ui";
import { Keuze } from "./Keuze";
import { berekenStatistieken, type Mijlpaal, type Statistieken, type WerkFase, type WerkItem } from "../lib/statistieken";

// Kleuren per fase — gelijk aan de oude tellers bovenaan Mijn werk (rood / oranje / groen).
const FASE: Record<WerkFase, { label: string; hex: string; tekst: string; zacht: string; icoon: typeof ListTodo }> = {
  open: { label: "Nog open", hex: "#ef4444", tekst: "text-red-600", zacht: "bg-red-50", icoon: ListTodo },
  bezig: { label: "Mee bezig", hex: "#f59e0b", tekst: "text-amber-600", zacht: "bg-amber-50", icoon: Loader2 },
  klaar: { label: "Klaar", hex: "#22c55e", tekst: "text-green-600", zacht: "bg-green-50", icoon: CheckCircle2 },
};

const reduceer = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
const nl = (n: number) => n.toLocaleString("nl-NL");
const vandaagISO = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };

// Telt van 0 op naar de waarde — een kleine beloning als de cijfers binnenkomen.
function useTelOp(doel: number, ms = 900): number {
  const [n, setN] = useState(reduceer() ? doel : 0);
  useEffect(() => {
    if (reduceer()) { setN(doel); return; }
    let raf = 0;
    const t0 = performance.now();
    const stap = (nu: number) => {
      const p = Math.min(1, (nu - t0) / ms);
      setN(Math.round(doel * (1 - Math.pow(1 - p, 3)))); // snel beginnen, zacht afremmen
      if (p < 1) raf = requestAnimationFrame(stap);
    };
    raf = requestAnimationFrame(stap);
    return () => cancelAnimationFrame(raf);
  }, [doel, ms]);
  return n;
}

// Zet `aan` na de eerste render, zodat CSS-overgangen (donut) zichtbaar worden afgespeeld.
function useAan(): boolean {
  const [aan, setAan] = useState(reduceer());
  useEffect(() => { const id = requestAnimationFrame(() => setAan(true)); return () => cancelAnimationFrame(id); }, []);
  return aan;
}

function Getal({ waarde }: { waarde: number }) {
  return <>{nl(useTelOp(waarde))}</>;
}

// ── Donut: open / bezig / klaar ──
function Donut({ s }: { s: Statistieken }) {
  const aan = useAan();
  const R = 54, C = 2 * Math.PI * R;
  const delen: { fase: WerkFase; n: number }[] = [
    { fase: "klaar", n: s.werk.klaar.length },
    { fase: "bezig", n: s.werk.bezig.length },
    { fase: "open", n: s.werk.open.length },
  ];
  let start = 0;
  const pct = useTelOp(s.klaarPct);
  return (
    <div className="relative mx-auto h-40 w-40 shrink-0">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90" role="img" aria-label={`${s.werk.klaar.length} klaar, ${s.werk.bezig.length} bezig, ${s.werk.open.length} open`}>
        <circle cx="70" cy="70" r={R} fill="none" stroke="#f1f5f9" strokeWidth="16" />
        {s.totaalWerk > 0 && delen.map((d) => {
          const lengte = (d.n / s.totaalWerk) * C;
          const el = (
            <circle
              key={d.fase}
              cx="70" cy="70" r={R} fill="none" stroke={FASE[d.fase].hex} strokeWidth="16" strokeLinecap="butt"
              strokeDasharray={`${aan ? Math.max(0, lengte - (d.n > 0 && delen.filter((x) => x.n > 0).length > 1 ? 2 : 0)) : 0} ${C}`}
              strokeDashoffset={-start}
              style={{ transition: "stroke-dasharray 1s cubic-bezier(.22,1,.36,1)" }}
            />
          );
          start += lengte;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="text-3xl font-extrabold text-ink-900">{pct}<span className="text-lg">%</span></div>
        <div className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">klaar</div>
      </div>
    </div>
  );
}

function FaseKolom({ fase, items }: { fase: WerkFase; items: WerkItem[] }) {
  const [alles, setAlles] = useState(false);
  const f = FASE[fase];
  const Icoon = f.icoon;
  const getoond = alles ? items : items.slice(0, 4);
  return (
    <div className="min-w-0">
      <div className={`mb-2 flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${f.zacht}`}>
        <Icoon className={`h-4 w-4 ${f.tekst}`} />
        <span className={`text-sm font-bold ${f.tekst}`}>{f.label}</span>
        <span className={`ml-auto rounded-full bg-white px-2 text-xs font-bold ${f.tekst}`}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <p className="px-1 text-xs text-ink-400">{fase === "open" ? "Niets meer open 🎉" : fase === "bezig" ? "Nu niets onderhanden." : "Nog niets afgerond."}</p>
      ) : (
        <ul className="space-y-2">
          {getoond.map((w, i) => (
            <li key={w.id} className="st-in" style={{ animationDelay: `${i * 60}ms` }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-semibold text-ink-800" title={w.titel}>{w.titel}</span>
                <span className="shrink-0 text-[11px] font-semibold text-ink-400">{w.pct}%</span>
              </div>
              <div className="truncate text-[11px] text-ink-400">{w.onderdeel}{w.sub ? ` · ${w.sub}` : ""}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-100"><div className="st-groei h-full rounded-full" style={{ width: `${Math.max(w.pct, 3)}%`, background: f.hex }} /></div>
            </li>
          ))}
        </ul>
      )}
      {items.length > 4 && (
        <button type="button" onClick={() => setAlles((a) => !a)} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-brand-600 hover:underline">
          {alles ? "Minder tonen" : `Toon alle ${items.length}`} <ChevronDown className={`h-3 w-3 transition-transform ${alles ? "rotate-180" : ""}`} />
        </button>
      )}
    </div>
  );
}

// ── Afspraken: trechter + weekgrafiek ──
function TrechterBalk({ label, n, max, kleur, vertraging }: { label: string; n: number; max: number; kleur: string; vertraging: number }) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between text-sm">
        <span className="font-semibold text-ink-700">{label}</span>
        <span className="font-bold text-ink-900"><Getal waarde={n} /></span>
      </div>
      <div className="h-3.5 overflow-hidden rounded-full bg-ink-100">
        <div className="st-groei h-full rounded-full" style={{ width: `${max > 0 ? Math.max((n / max) * 100, n > 0 ? 4 : 0) : 0}%`, background: kleur, animationDelay: `${vertraging}ms` }} />
      </div>
    </div>
  );
}

function WeekGrafiek({ punten }: { punten: Statistieken["afspraken"]["perWeek"] }) {
  const max = Math.max(1, ...punten.map((p) => p.gemaakt));
  const H = 96;
  return (
    <div>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: H + 18 }} role="img" aria-label="Afspraken per week">
        {punten.map((p, i) => {
          const hg = (p.gemaakt / max) * H;
          const hd = (p.doorgegaan / max) * H;
          return (
            <div key={p.maandag} className="flex min-w-0 flex-1 flex-col items-center justify-end" title={`${p.label}: ${p.gemaakt} gemaakt, ${p.doorgegaan} doorgegaan`}>
              <div className="relative w-full max-w-[34px]" style={{ height: Math.max(hg, p.gemaakt ? 4 : 2) }}>
                <div className="st-op absolute inset-x-0 bottom-0 rounded-t-md bg-brand-200" style={{ height: "100%", animationDelay: `${i * 70}ms` }} />
                <div className="st-op absolute inset-x-0 bottom-0 rounded-t-md bg-brand-600" style={{ height: hg > 0 ? `${(hd / hg) * 100}%` : 0, animationDelay: `${i * 70 + 150}ms` }} />
              </div>
              <div className={`mt-1 text-[10px] font-semibold ${i === punten.length - 1 ? "text-brand-700" : "text-ink-400"}`}>{p.label.replace("wk ", "")}</div>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-ink-500">
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-200" /> gemaakt</span>
        <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-brand-600" /> doorgegaan</span>
        <span className="ml-auto text-ink-400">per week (weeknummer)</span>
      </div>
    </div>
  );
}

// ── Brieven: puntenraster (elk blokje = 2% van alle brieven) ──
function BriefRaster({ b }: { b: Statistieken["brieven"] }) {
  const N = 50;
  const delen = [
    { n: b.bezorgd, kleur: "#22c55e", label: "Bezorgd" },
    { n: b.blanco, kleur: "#94a3b8", label: "Blanco" },
    { n: b.nietThuis, kleur: "#f59e0b", label: "Niet thuis" },
    { n: b.nogTeDoen, kleur: "#e2e8f0", label: "Nog te doen" },
  ];
  const kleuren: string[] = [];
  if (b.totaal > 0) {
    for (const d of delen) { const k = Math.round((d.n / b.totaal) * N); for (let i = 0; i < k && kleuren.length < N; i++) kleuren.push(d.kleur); }
    while (kleuren.length < N) kleuren.push(delen[3].kleur);
  }
  return (
    <div>
      <div className="grid grid-cols-10 gap-1.5" role="img" aria-label={`${b.bezorgd} van ${b.totaal} brieven bezorgd`}>
        {(b.totaal > 0 ? kleuren : Array<string>(N).fill("#f1f5f9")).map((k, i) => (
          <span key={i} className="st-in aspect-square rounded-[5px]" style={{ background: k, animationDelay: `${i * 14}ms` }} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-600">
        {delen.map((d) => (<span key={d.label} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: d.kleur }} /> {d.label} <b className="text-ink-900">{nl(d.n)}</b></span>))}
      </div>
    </div>
  );
}

// ── Mijlpaal-badge: ring vult zich naarmate je dichterbij komt ──
function Badge({ m }: { m: Mijlpaal }) {
  const p = Math.min(1, m.huidig / m.doel);
  return (
    <div className={`flex w-24 shrink-0 flex-col items-center text-center ${m.behaald ? "" : "opacity-90"}`} title={`${m.uitleg} — ${nl(Math.min(m.huidig, m.doel))}/${nl(m.doel)}`}>
      <div className="relative h-16 w-16 rounded-full p-1" style={{ background: `conic-gradient(${m.behaald ? "#ea580c" : "#fdba74"} ${p * 360}deg, #e2e8f0 0)` }}>
        <div className={`flex h-full w-full items-center justify-center rounded-full ${m.behaald ? "bg-gradient-to-br from-amber-100 to-brand-100 text-brand-700" : "bg-white text-ink-300"}`}>
          {m.behaald ? <Trophy className="h-6 w-6" /> : <Lock className="h-5 w-5" />}
        </div>
      </div>
      <div className={`mt-1.5 text-xs font-bold leading-tight ${m.behaald ? "text-ink-900" : "text-ink-500"}`}>{m.titel}</div>
      <div className="text-[10px] leading-tight text-ink-400">{m.uitleg}</div>
    </div>
  );
}

function Kpi({ icoon: Icoon, label, waarde, sub, tint }: { icoon: typeof Mailbox; label: string; waarde: number; sub: string; tint: string }) {
  return (
    <Card className="p-3.5 sm:p-4">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${tint}`}><Icoon className="h-[18px] w-[18px]" /></span>
        <span className="text-xs font-semibold leading-tight text-ink-500">{label}</span>
      </div>
      <div className="mt-2 text-3xl font-extrabold tracking-tight text-ink-900"><Getal waarde={waarde} /></div>
      <div className="text-xs text-ink-400">{sub}</div>
    </Card>
  );
}

export function MijnStatistieken() {
  const { currentUser, users, taken, projects, rondes, afspraken, schouwafspraken, tauwOpdrachten, buurtaanpak, voorschouwen, voorschouwMappen } = useApp();
  const [wie, setWie] = useState("__ik");
  const isLeiding = !!currentUser && (currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr");

  const wieId = wie === "__team" ? null : wie === "__ik" ? currentUser?.id ?? null : wie;
  const s = useMemo(
    () => berekenStatistieken({ taken, projects, rondes, afspraken, schouwafspraken, tauwOpdrachten, buurtaanpak, voorschouwen, voorschouwMappen }, wieId, vandaagISO()),
    [taken, projects, rondes, afspraken, schouwafspraken, tauwOpdrachten, buurtaanpak, voorschouwen, voorschouwMappen, wieId],
  );
  if (!currentUser) return null;

  const naam = wie === "__team" ? "het hele team" : wie === "__ik" ? "jou" : users.find((u) => u.id === wie)?.naam ?? "";
  const gelukt = s.afspraken.gemaakt - s.afspraken.geannuleerd;
  const behaald = s.mijlpalen.filter((m) => m.behaald).length;

  return (
    <section className="space-y-4" aria-label="Statistieken">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-ink-700"><BarChart3 className="h-4 w-4 text-brand-600" /> Statistieken van {naam}</h3>
        {isLeiding && (
          <div className="ml-auto w-52">
            <Keuze value={wie} onChange={setWie} altijdZoeken title="Statistieken van" opties={[{ waarde: "__ik", label: "Mijn cijfers" }, { waarde: "__team", label: "Hele team" }, ...users.filter((u) => u.id !== currentUser.id).map((u) => ({ waarde: u.id, label: u.naam }))]} />
          </div>
        )}
      </div>

      {/* Kerncijfers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icoon={Mailbox} label="Brieven bezorgd" waarde={s.brieven.bezorgd} sub={`${s.brieven.rondesKlaar} van ${s.brieven.rondesTotaal} routes klaar`} tint="bg-green-50 text-green-600" />
        <Kpi icoon={CalendarCheck} label="Afspraken doorgegaan" waarde={s.afspraken.doorgegaan} sub={gelukt > 0 ? `${s.afspraken.doorgegaanPct}% van ${nl(gelukt)} gemaakt` : "nog geen afspraken"} tint="bg-brand-50 text-brand-600" />
        <Kpi icoon={CheckCircle2} label="Werk afgerond" waarde={s.werk.klaar.length} sub={`${s.klaarPct}% van ${nl(s.totaalWerk)} onderdelen`} tint="bg-indigo-50 text-indigo-600" />
        <Kpi icoon={ClipboardCheck} label="Voorschouwen ingevuld" waarde={s.voorschouwen} sub="met foto's en gegevens" tint="bg-amber-50 text-amber-600" />
      </div>

      {/* Open / bezig / klaar */}
      <Card className="p-4 sm:p-5">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><Flame className="h-4 w-4 text-brand-600" /> Open, bezig en klaar</h4>
        {s.totaalWerk === 0 ? (
          <p className="py-4 text-center text-sm text-ink-400">Er is nog geen werk toegewezen.</p>
        ) : (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-[auto_1fr] md:items-start">
            <Donut s={s} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              {(["open", "bezig", "klaar"] as WerkFase[]).map((f) => <FaseKolom key={f} fase={f} items={s.werk[f]} />)}
            </div>
          </div>
        )}
      </Card>

      {/* Afspraken en brieven naast elkaar */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="p-4 sm:p-5">
          <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><CalendarCheck className="h-4 w-4 text-brand-600" /> Afspraken: gemaakt → doorgegaan</h4>
          {s.afspraken.gemaakt === 0 ? (
            <p className="py-4 text-center text-sm text-ink-400">Nog geen afspraken.</p>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2.5">
                <TrechterBalk label="Gemaakt" n={s.afspraken.gemaakt} max={s.afspraken.gemaakt} kleur="#fdba74" vertraging={0} />
                <TrechterBalk label="Bevestigd" n={s.afspraken.bevestigd} max={s.afspraken.gemaakt} kleur="#fb923c" vertraging={120} />
                <TrechterBalk label="Daadwerkelijk doorgegaan" n={s.afspraken.doorgegaan} max={s.afspraken.gemaakt} kleur="#ea580c" vertraging={240} />
                {s.afspraken.geannuleerd > 0 && <TrechterBalk label="Geannuleerd" n={s.afspraken.geannuleerd} max={s.afspraken.gemaakt} kleur="#cbd5e1" vertraging={360} />}
              </div>
              <WeekGrafiek punten={s.afspraken.perWeek} />
              {s.afspraken.perSoort.length > 1 && (
                <div className="flex flex-wrap gap-1.5 border-t border-ink-100 pt-3">
                  {s.afspraken.perSoort.map((x) => (
                    <span key={x.naam} className="rounded-full bg-ink-100 px-2.5 py-1 text-xs font-medium text-ink-600">{x.naam}: <b className="text-ink-900">{x.doorgegaan}</b>/{x.gemaakt}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="mb-3 flex items-center gap-2">
            <h4 className="flex items-center gap-2 text-sm font-bold text-ink-900"><Mailbox className="h-4 w-4 text-brand-600" /> Brieven bezorgd</h4>
            <span className="ml-auto text-2xl font-extrabold text-green-600"><Getal waarde={s.brieven.bezorgd} /></span>
          </div>
          {s.brieven.totaal === 0 ? (
            <p className="py-4 text-center text-sm text-ink-400">Nog geen brievenroutes.</p>
          ) : (
            <>
              <BriefRaster b={s.brieven} />
              <p className="mt-3 text-xs text-ink-500">{s.brieven.rondesKlaar} van {s.brieven.rondesTotaal} routes helemaal doorlopen · elk blokje is 2% van alle brieven.</p>
            </>
          )}
        </Card>
      </div>

      {/* Mijlpalen */}
      <Card className="p-4 sm:p-5">
        <h4 className="mb-3 flex items-center gap-2 text-sm font-bold text-ink-900"><Medal className="h-4 w-4 text-brand-600" /> Mijlpalen <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-bold text-brand-700">{behaald}/{s.mijlpalen.length}</span></h4>
        <div className="scrollbar-thin -mx-1 flex gap-3 overflow-x-auto px-1 pb-1">
          {s.mijlpalen.map((m) => <Badge key={m.id} m={m} />)}
        </div>
      </Card>
    </section>
  );
}

import { useState } from "react";
import { ArrowLeft, ChevronRight, Sun, Plane, CalendarDays, Clock } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card, Badge } from "../components/ui";
import { StatCard } from "../components/StatCard";
import type { User, Verlof } from "../lib/types";
import { werkdagenExclFeestdagen } from "../lib/feestdagen";

const STANDAARD_VRIJE_DAGEN = 25;
const STANDAARD_CONTRACT = 40;
const werkdagenTussen = werkdagenExclFeestdagen; // ma–vr, excl. feestdagen
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace(".", ","));
const inputCls = "w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-center text-sm font-semibold text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

const contractUren = (u: User) => (u.contract?.uren != null ? u.contract.uren : STANDAARD_CONTRACT);
const vrijeDagen = (u: User) => u.verlofDagenPerJaar ?? STANDAARD_VRIJE_DAGEN;

// Opgenomen vakantie/verlof (werkdagen) binnen een periode; ziekte telt niet mee tegen de vrije dagen.
function opgenomenDagen(verlof: Verlof[], userId: string, van: string, tot: string): number {
  return verlof
    .filter((v) => v.medewerkerId === userId && v.status === "Goedgekeurd" && (v.type === "Vakantie" || v.type === "Verlof"))
    .reduce((s, v) => {
      const a = v.van < van ? van : v.van;
      const b = v.tot > tot ? tot : v.tot;
      if (b < van || a > tot) return s;
      return s + werkdagenTussen(a, b);
    }, 0);
}
function urenTussen(urenstaat: { medewerkerId: string; datum: string; uren: number }[], userId: string, van?: string, tot?: string): number {
  return urenstaat
    .filter((x) => x.medewerkerId === userId && (!van || x.datum >= van) && (!tot || x.datum <= tot))
    .reduce((s, x) => s + (Number(x.uren) || 0), 0);
}

const dagLabel = (iso: string) => new Date(iso + "T00:00:00").toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
const verlofTint: Record<string, "green" | "indigo" | "red"> = { Vakantie: "green", Verlof: "indigo", Ziek: "red" };

export function VrijeDagen() {
  const { users, verlof, urenstaat, currentUser, updateUser } = useApp();
  const [detailId, setDetailId] = useState<string | null>(null);

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer" || currentUser.rol === "hr";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">Dit overzicht is alleen voor de boekhouding/leiding.</Card>;

  const jaar = new Date().getFullYear();
  const jaarStart = `${jaar}-01-01`, jaarEind = `${jaar}-12-31`;
  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  // ── Detailpagina van één medewerker ──
  const detail = detailId ? medewerkers.find((u) => u.id === detailId) : undefined;
  if (detail) {
    const u = detail;
    const totaal = vrijeDagen(u);
    const op = opgenomenDagen(verlof, u.id, jaarStart, jaarEind);
    const over = totaal - op;
    const dagUren = contractUren(u) / 5;
    const urenJaar = urenTussen(urenstaat, u.id, jaarStart, jaarEind);
    const urenTotaal = urenTussen(urenstaat, u.id);
    const historie = verlof
      .filter((v) => v.medewerkerId === u.id)
      .sort((a, b) => (a.van < b.van ? 1 : -1));

    return (
      <div className="space-y-5">
        <button type="button" onClick={() => setDetailId(null)} className="inline-flex items-center gap-1.5 text-sm font-medium text-ink-500 hover:text-ink-800">
          <ArrowLeft className="h-4 w-4" /> Terug naar overzicht
        </button>

        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-ink-800 text-base font-semibold text-white">{u.initialen}</span>
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-ink-900">{u.naam}</h2>
            <p className="truncate text-sm text-ink-500">{u.functie || "Medewerker"} · vrije dagen & uren {jaar}</p>
          </div>
        </div>

        {/* Bewerkbaar: contract + vrije dagen/jaar */}
        <Card className="grid gap-3 p-4 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="block text-xs font-semibold text-ink-500">Contract (uur/week)</span>
            <input inputMode="numeric" value={String(contractUren(u))} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); updateUser(u.id, { contract: { ...(u.contract ?? {}), uren: Number.isFinite(n) ? n : 0 } }); }} className={inputCls} />
          </label>
          <label className="space-y-1">
            <span className="block text-xs font-semibold text-ink-500">Vrije dagen per jaar</span>
            <input inputMode="numeric" value={String(totaal)} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); updateUser(u.id, { verlofDagenPerJaar: Number.isFinite(n) ? n : 0 }); }} className={inputCls} />
          </label>
        </Card>

        {/* Kerncijfers: dagen + uren */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard icon={Sun} label={`Vrije dagen ${jaar}`} value={`${totaal}`} sub={`${uurTekst(totaal * dagUren)} u`} tone="indigo" />
          <StatCard icon={Plane} label="Opgenomen" value={`${op} ${op === 1 ? "dag" : "dagen"}`} sub={`${uurTekst(op * dagUren)} u`} tone="amber" />
          <StatCard icon={CalendarDays} label="Nog over" value={`${over} ${over === 1 ? "dag" : "dagen"}`} sub={`${uurTekst(over * dagUren)} u`} tone={over < 0 ? "red" : "green"} />
          <StatCard icon={Clock} label={`Gewerkt ${jaar}`} value={`${uurTekst(urenJaar)} u`} sub={`totaal ${uurTekst(urenTotaal)} u`} tone="green" />
        </div>

        {/* Verlofhistorie: wanneer is er verlof opgenomen */}
        <Card className="overflow-hidden">
          <div className="flex items-center gap-2 border-b border-ink-100 bg-ink-50/60 px-5 py-3.5">
            <CalendarDays className="h-4 w-4 text-ink-500" />
            <h3 className="text-sm font-bold text-ink-900">Verlofhistorie</h3>
            <span className="hidden text-xs text-ink-400 sm:inline">wanneer er vrij/ziek is opgenomen</span>
            {historie.length > 0 && <span className="ml-auto rounded-full bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-500">{historie.length}</span>}
          </div>
          {historie.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-400">Nog geen verlof opgenomen.</p>
          ) : (
            <div className="divide-y divide-ink-100">
              {historie.map((v) => {
                const dagen = werkdagenTussen(v.van, v.tot);
                const eenDag = v.van === v.tot;
                return (
                  <div key={v.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3">
                    <Badge tone={verlofTint[v.type] ?? "slate"}>{v.type}</Badge>
                    <span className="text-sm font-medium text-ink-800">{eenDag ? dagLabel(v.van) : `${dagLabel(v.van)} – ${dagLabel(v.tot)}`}</span>
                    <span className="text-xs text-ink-500">{dagen} {dagen === 1 ? "werkdag" : "werkdagen"}{v.type !== "Ziek" ? "" : " · telt niet mee"}</span>
                    {v.notitie && <span className="text-xs italic text-ink-400">“{v.notitie}”</span>}
                    <span className={`ml-auto text-xs font-semibold ${v.status === "Goedgekeurd" ? "text-emerald-600" : v.status === "Afgewezen" ? "text-red-500" : "text-amber-600"}`}>{v.status}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        <p className="text-xs text-ink-400">"Nog over" = vrije dagen/jaar − opgenomen (goedgekeurde vakantie/verlof, werkdagen). Uren = dagen × (contract ÷ 5). Gewerkte uren komen uit de Urenstaat.</p>
      </div>
    );
  }

  // ── Overzicht: klikbare kaarten ──
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Vrije dagen</h2>
        <p className="text-sm text-ink-500">Per medewerker de vrije dagen, opgenomen verlof en gewerkte uren. Klik op een kaart voor alle details en om het contract of de vrije dagen aan te passen.</p>
      </div>

      {medewerkers.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">Nog geen medewerkers. Voeg ze toe bij Gebruikersbeheer.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {medewerkers.map((u) => {
            const totaal = vrijeDagen(u);
            const op = opgenomenDagen(verlof, u.id, jaarStart, jaarEind);
            const over = totaal - op;
            return (
              <button key={u.id} type="button" onClick={() => setDetailId(u.id)} className="block w-full text-left">
                <Card className="space-y-3 p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/30">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">{u.initialen}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-ink-900">{u.naam}</div>
                      <div className="truncate text-xs text-ink-400">{u.functie || "Medewerker"}</div>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />
                  </div>

                  <div className="flex items-stretch gap-2 rounded-xl bg-ink-50 p-2 text-center">
                    <div className="flex-1">
                      <div className="text-lg font-bold text-ink-800">{op}</div>
                      <div className="text-[11px] text-ink-500">opgenomen</div>
                    </div>
                    <div className="w-px bg-ink-200" />
                    <div className="flex-1">
                      <div className={`text-lg font-bold ${over < 0 ? "text-red-600" : over <= 3 ? "text-amber-600" : "text-emerald-600"}`}>{over}</div>
                      <div className="text-[11px] text-ink-500">nog over</div>
                    </div>
                    <div className="w-px bg-ink-200" />
                    <div className="flex-1">
                      <div className="text-lg font-bold text-ink-800">{uurTekst(urenTussen(urenstaat, u.id, jaarStart, jaarEind))}</div>
                      <div className="text-[11px] text-ink-500">uur {jaar}</div>
                    </div>
                  </div>
                </Card>
              </button>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-400">"Opgenomen" telt de goedgekeurde vakantie- en verlofdagen (werkdagen ma–vr) van dit jaar; ziekte telt niet mee. De gewerkte uren komen uit de Urenstaat.</p>
    </div>
  );
}

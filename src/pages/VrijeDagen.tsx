import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import type { User } from "../lib/types";

const STANDAARD_VRIJE_DAGEN = 25;
const STANDAARD_CONTRACT = 40;

// Werkdagen (ma–vr) tussen twee ISO-datums, beide inclusief.
const werkdagenTussen = (vanISO: string, totISO: string) => {
  const d = new Date(vanISO + "T00:00:00");
  const eind = new Date(totISO + "T00:00:00");
  let n = 0;
  while (d <= eind) { const dow = d.getDay(); if (dow >= 1 && dow <= 5) n++; d.setDate(d.getDate() + 1); }
  return n;
};
const somUren = (uren?: number[]) => (uren ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace(".", ","));

export function VrijeDagen() {
  const { users, verlof, urenstaat, currentUser, updateUser } = useApp();

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">Dit overzicht is alleen voor de boekhouding/leiding.</Card>;

  const jaar = new Date().getFullYear();
  const jaarStart = `${jaar}-01-01`, jaarEind = `${jaar}-12-31`;
  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  const contractUren = (u: User) => (u.contract?.uren != null ? u.contract.uren : STANDAARD_CONTRACT);
  const vrijeDagen = (u: User) => u.verlofDagenPerJaar ?? STANDAARD_VRIJE_DAGEN;
  const opgenomenDagen = (userId: string) => verlof
    .filter((v) => v.medewerkerId === userId && v.status === "Goedgekeurd" && (v.type === "Vakantie" || v.type === "Verlof"))
    .reduce((s, v) => {
      const van = v.van < jaarStart ? jaarStart : v.van;
      const tot = v.tot > jaarEind ? jaarEind : v.tot;
      if (tot < jaarStart || van > jaarEind) return s;
      return s + werkdagenTussen(van, tot);
    }, 0);
  const urenDitJaar = (userId: string) => urenstaat
    .filter((x) => x.medewerkerId === userId && x.week >= jaarStart && x.week <= jaarEind)
    .reduce((s, x) => s + somUren(x.uren), 0);
  const zetContract = (u: User, n: number) => updateUser(u.id, { contract: { ...(u.contract ?? {}), uren: n } });

  const inputCls = "w-full rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-center text-sm font-semibold text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Vrije dagen</h2>
        <p className="text-sm text-ink-500">Per medewerker het contract, de vrije dagen en hoeveel er nog over is — automatisch berekend uit het goedgekeurde verlof. Klik in een veld om contract of vrije dagen aan te passen.</p>
      </div>

      {medewerkers.length === 0 ? (
        <Card className="p-8 text-center text-sm text-ink-500">Nog geen medewerkers. Voeg ze toe bij Gebruikersbeheer.</Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {medewerkers.map((u) => {
            const totaal = vrijeDagen(u);
            const op = opgenomenDagen(u.id);
            const over = totaal - op;
            return (
              <Card key={u.id} className="space-y-3 p-4">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-ink-800 text-sm font-semibold text-white">{u.initialen}</span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold text-ink-900">{u.naam}</div>
                    <div className="truncate text-xs text-ink-400">{u.functie || "Medewerker"}</div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="block text-[11px] font-semibold text-ink-500">Contract (u/week)</span>
                    <input inputMode="numeric" value={String(contractUren(u))} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); zetContract(u, Number.isFinite(n) ? n : 0); }} aria-label={`Contracturen ${u.naam}`} className={inputCls} />
                  </label>
                  <label className="space-y-1">
                    <span className="block text-[11px] font-semibold text-ink-500">Vrije dagen/jaar</span>
                    <input inputMode="numeric" value={String(totaal)} onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); updateUser(u.id, { verlofDagenPerJaar: Number.isFinite(n) ? n : 0 }); }} aria-label={`Vrije dagen ${u.naam}`} className={inputCls} />
                  </label>
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
                    <div className="text-lg font-bold text-ink-800">{uurTekst(urenDitJaar(u.id))}</div>
                    <div className="text-[11px] text-ink-500">uur {jaar}</div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-ink-400">"Opgenomen" telt de goedgekeurde vakantie- en verlofdagen (werkdagen ma–vr) van dit jaar; ziekte telt niet mee. De gewerkte uren komen uit de Urenstaat.</p>
    </div>
  );
}

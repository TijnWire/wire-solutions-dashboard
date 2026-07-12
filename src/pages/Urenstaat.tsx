import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plane } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const STANDAARD_VRIJE_DAGEN = 25;

const toISO = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// Maandag van de week waar deze datum in valt.
const maandagVan = (d: Date) => { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x; };
// ISO-weeknummer (ma–zo).
const weekNr = (d: Date) => {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dag = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dag + 3);
  const eersteDonderdag = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  const fd = (eersteDonderdag.getUTCDay() + 6) % 7;
  eersteDonderdag.setUTCDate(eersteDonderdag.getUTCDate() - fd + 3);
  return 1 + Math.round((t.getTime() - eersteDonderdag.getTime()) / (7 * 24 * 3600 * 1000));
};
// Werkdagen (ma–vr) tussen twee ISO-datums, beide inclusief.
const werkdagenTussen = (vanISO: string, totISO: string) => {
  const d = new Date(vanISO + "T00:00:00");
  const eind = new Date(totISO + "T00:00:00");
  let n = 0;
  while (d <= eind) { const dow = d.getDay(); if (dow >= 1 && dow <= 5) n++; d.setDate(d.getDate() + 1); }
  return n;
};
const somUren = (uren?: number[]) => (uren ?? []).reduce((a, b) => a + (Number(b) || 0), 0);
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace(".", ","));

export function Urenstaat() {
  const { users, urenstaat, verlof, currentUser, addUren, updateUren, updateUser } = useApp();
  const [weekISO, setWeekISO] = useState(() => toISO(maandagVan(new Date())));

  if (!currentUser) return null;
  const isLeiding = currentUser.rol === "eigenaar" || currentUser.rol === "beheer";
  if (!isLeiding) return <Card className="p-8 text-center text-sm text-ink-500">De urenstaat is alleen voor de boekhouding/leiding.</Card>;

  const weekDate = new Date(weekISO + "T00:00:00");
  const weekEinde = new Date(weekDate); weekEinde.setDate(weekEinde.getDate() + 6);
  const verschuif = (dagen: number) => { const d = new Date(weekDate); d.setDate(d.getDate() + dagen); setWeekISO(toISO(maandagVan(d))); };
  const dezeWeek = toISO(maandagVan(new Date())) === weekISO;
  const weekLabel = `${weekDate.toLocaleDateString("nl-NL", { day: "numeric", month: "short" })} – ${weekEinde.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" })}`;

  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  // ── Uren van de gekozen week (upsert per medewerker) ──
  const regelVan = (userId: string) => urenstaat.find((x) => x.medewerkerId === userId && x.week === weekISO);
  const urenVan = (userId: string) => regelVan(userId)?.uren ?? [0, 0, 0, 0, 0, 0, 0];
  const zetUur = (userId: string, dag: number, waarde: number) => {
    const bestaand = regelVan(userId);
    const uren = [...(bestaand?.uren ?? [0, 0, 0, 0, 0, 0, 0])];
    uren[dag] = waarde;
    if (bestaand) updateUren(bestaand.id, { uren });
    else addUren({ medewerkerId: userId, week: weekISO, uren });
  };
  const weekTotaalAlles = medewerkers.reduce((s, u) => s + somUren(urenVan(u.id)), 0);

  // ── Vrije dagen & jaartotaal ──
  const jaar = new Date().getFullYear();
  const jaarStart = `${jaar}-01-01`, jaarEind = `${jaar}-12-31`;
  const vrijeDagen = (userId: string) => users.find((u) => u.id === userId)?.verlofDagenPerJaar ?? STANDAARD_VRIJE_DAGEN;
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Urenstaat</h2>
        <p className="text-sm text-ink-500">Vul per week de gewerkte uren in. Onderaan zie je per persoon het jaartotaal en hoeveel vrije dagen er nog over zijn.</p>
      </div>

      {/* Week-navigatie */}
      <Card className="flex flex-wrap items-center gap-2 p-3">
        <button type="button" onClick={() => verschuif(-7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50"><ChevronLeft className="h-4 w-4" /> Vorige</button>
        <div className="flex min-w-0 flex-1 flex-col items-center px-2 text-center">
          <span className="text-sm font-bold text-ink-900">Week {weekNr(weekDate)} · {jaar}</span>
          <span className="text-xs text-ink-500">{weekLabel}</span>
        </div>
        <button type="button" onClick={() => verschuif(7)} className="inline-flex items-center gap-1 rounded-lg border border-ink-200 bg-white px-3 py-2 text-sm font-semibold text-ink-700 hover:bg-ink-50">Volgende <ChevronRight className="h-4 w-4" /></button>
        {!dezeWeek && <button type="button" onClick={() => setWeekISO(toISO(maandagVan(new Date())))} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700">Deze week</button>}
      </Card>

      {/* Urentabel */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <CalendarDays className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-bold text-ink-900">Uren week {weekNr(weekDate)}</span>
          <span className="ml-auto text-sm font-semibold text-ink-500">Totaal: <span className="text-ink-900">{uurTekst(weekTotaalAlles)} u</span></span>
        </div>
        {medewerkers.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">Nog geen medewerkers. Voeg ze toe bij Gebruikersbeheer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                  <th className="sticky left-0 z-10 bg-ink-50/60 px-4 py-2.5 text-left font-semibold">Medewerker</th>
                  {DAGEN.map((d, i) => (
                    <th key={d} className={`px-1 py-2.5 text-center font-semibold ${i >= 5 ? "text-ink-400" : ""}`}>{d}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">Totaal</th>
                </tr>
              </thead>
              <tbody>
                {medewerkers.map((u) => {
                  const uren = urenVan(u.id);
                  const tot = somUren(uren);
                  return (
                    <tr key={u.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-white">{u.initialen}</span>
                          <span className="truncate font-medium text-ink-900">{u.naam}</span>
                        </div>
                      </td>
                      {DAGEN.map((d, i) => (
                        <td key={d} className={`px-1 py-2 text-center ${i >= 5 ? "bg-ink-50/40" : ""}`}>
                          <input
                            inputMode="decimal"
                            value={uren[i] ? uurTekst(uren[i]) : ""}
                            onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); zetUur(u.id, i, Number.isFinite(n) && n >= 0 ? n : 0); }}
                            placeholder="0"
                            aria-label={`${u.naam} ${d}`}
                            className="w-12 rounded-lg border border-ink-200 bg-white px-1.5 py-1.5 text-center text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                          />
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right font-bold text-ink-900">{tot > 0 ? `${uurTekst(tot)} u` : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Vrije dagen & jaartotaal */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <Plane className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-bold text-ink-900">Vrije dagen &amp; jaartotaal {jaar}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="px-4 py-2.5 text-left font-semibold">Medewerker</th>
                <th className="px-3 py-2.5 text-right font-semibold">Gewerkt dit jaar</th>
                <th className="px-3 py-2.5 text-center font-semibold">Vrije dagen/jaar</th>
                <th className="px-3 py-2.5 text-right font-semibold">Opgenomen</th>
                <th className="px-3 py-2.5 text-right font-semibold">Nog over</th>
              </tr>
            </thead>
            <tbody>
              {medewerkers.map((u) => {
                const totaal = vrijeDagen(u.id);
                const op = opgenomenDagen(u.id);
                const over = totaal - op;
                return (
                  <tr key={u.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-white">{u.initialen}</span>
                        <span className="truncate font-medium text-ink-900">{u.naam}</span>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-ink-800">{uurTekst(urenDitJaar(u.id))} u</td>
                    <td className="px-3 py-2.5 text-center">
                      <input
                        inputMode="numeric"
                        value={String(totaal)}
                        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); updateUser(u.id, { verlofDagenPerJaar: Number.isFinite(n) ? n : 0 }); }}
                        aria-label={`Vrije dagen per jaar voor ${u.naam}`}
                        className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-center text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
                    </td>
                    <td className="px-3 py-2.5 text-right text-ink-700">{op} {op === 1 ? "dag" : "dagen"}</td>
                    <td className={`px-3 py-2.5 text-right font-bold ${over < 0 ? "text-red-600" : over <= 3 ? "text-amber-600" : "text-emerald-600"}`}>{over} {over === 1 ? "dag" : "dagen"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="border-t border-ink-100 px-4 py-2.5 text-xs text-ink-400">
          "Opgenomen" telt de goedgekeurde vakantie- en verlofdagen (werkdagen ma–vr) van dit jaar. Ziekte telt niet mee. Pas het aantal vrije dagen per jaar per persoon aan in de kolom hierboven.
        </p>
      </Card>
    </div>
  );
}

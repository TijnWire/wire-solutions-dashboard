import { useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Plane, Wand2, RotateCcw } from "lucide-react";
import { useApp } from "../store/AppContext";
import { Card } from "../components/ui";
import type { User } from "../lib/types";

const DAGEN = ["Ma", "Di", "Wo", "Do", "Vr", "Za", "Zo"];
const STANDAARD_VRIJE_DAGEN = 25;
const STANDAARD_CONTRACT = 40; // u/week als er (nog) geen contract is ingesteld

// Kleur van een verlof-dag in het rooster.
const VERLOF_TINT: Record<string, string> = { Vakantie: "bg-green-50 text-green-700", Verlof: "bg-indigo-50 text-indigo-700", Ziek: "bg-red-50 text-red-700" };
const VERLOF_STIP: Record<string, string> = { Vakantie: "bg-green-500", Verlof: "bg-indigo-500", Ziek: "bg-red-500" };

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
const uurTekst = (n: number) => (Number.isInteger(n) ? String(n) : (Math.round(n * 10) / 10).toString().replace(".", ","));

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
  const weekISOs = Array.from({ length: 7 }, (_, i) => { const d = new Date(weekDate); d.setDate(d.getDate() + i); return toISO(d); });

  const medewerkers = [...users].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));

  // ── Contract & verlof: hieruit volgt het automatische voorstel ──
  const contractUren = (u: User) => (u.contract?.uren != null ? u.contract.uren : STANDAARD_CONTRACT);
  const contractDag = (u: User) => contractUren(u) / 5; // gelijk verdeeld over ma–vr
  const verlofOp = (userId: string, iso: string) => verlof.find((v) => v.medewerkerId === userId && v.status === "Goedgekeurd" && v.van <= iso && v.tot >= iso);
  // Automatisch voorstel: contracturen op ma–vr, behalve op verlof-/vakantie-/ziektedagen (dan 0).
  const autoUren = (u: User) => weekISOs.map((iso, i) => (i >= 5 || verlofOp(u.id, iso) ? 0 : contractDag(u)));

  // ── Uren van de gekozen week (record = door boekhouding ingevuld/bevestigd; anders het voorstel) ──
  const regelVan = (userId: string) => urenstaat.find((x) => x.medewerkerId === userId && x.week === weekISO);
  const toonUren = (u: User) => regelVan(u.id)?.uren ?? autoUren(u);
  const zetUur = (u: User, dag: number, waarde: number) => {
    const bestaand = regelVan(u.id);
    const uren = [...(bestaand?.uren ?? autoUren(u))]; // begin vanuit het voorstel, zodat de rest niet verdwijnt
    uren[dag] = waarde;
    if (bestaand) updateUren(bestaand.id, { uren });
    else addUren({ medewerkerId: u.id, week: weekISO, uren });
  };
  const zetRijAuto = (u: User) => {
    const bestaand = regelVan(u.id);
    const uren = autoUren(u);
    if (bestaand) updateUren(bestaand.id, { uren });
    else addUren({ medewerkerId: u.id, week: weekISO, uren });
  };
  const nogNietIngevuld = medewerkers.filter((u) => !regelVan(u.id)).length;
  const vulAllesAuto = () => medewerkers.forEach((u) => { if (!regelVan(u.id)) addUren({ medewerkerId: u.id, week: weekISO, uren: autoUren(u) }); });
  const weekTotaalAlles = medewerkers.reduce((s, u) => s + somUren(toonUren(u)), 0);

  // ── Vrije dagen & jaartotaal ──
  const jaar = new Date().getFullYear();
  const jaarStart = `${jaar}-01-01`, jaarEind = `${jaar}-12-31`;
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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Urenstaat</h2>
        <p className="text-sm text-ink-500">De uren vullen zich automatisch vanuit het contract per persoon; vakantie en verlof gaan er vanzelf af. Jij hoeft alleen nog te controleren en waar nodig bij te stellen.</p>
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
        <div className="flex flex-wrap items-center gap-2 border-b border-ink-100 px-4 py-3">
          <CalendarDays className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-bold text-ink-900">Uren week {weekNr(weekDate)}</span>
          <button
            type="button"
            onClick={vulAllesAuto}
            disabled={nogNietIngevuld === 0}
            title="Vul alle nog niet ingevulde rijen automatisch (contract − verlof)"
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Wand2 className="h-3.5 w-3.5" /> Uren automatisch invullen{nogNietIngevuld > 0 ? ` (${nogNietIngevuld})` : ""}
          </button>
          <span className="ml-auto text-sm font-semibold text-ink-500">Totaal: <span className="text-ink-900">{uurTekst(weekTotaalAlles)} u</span></span>
        </div>
        {medewerkers.length === 0 ? (
          <p className="p-8 text-center text-sm text-ink-400">Nog geen medewerkers. Voeg ze toe bij Gebruikersbeheer.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                  <th className="sticky left-0 z-10 bg-ink-50/60 px-4 py-2.5 text-left font-semibold">Medewerker</th>
                  {DAGEN.map((d, i) => (
                    <th key={d} className={`px-1 py-2.5 text-center font-semibold ${i >= 5 ? "text-ink-400" : ""}`}>{d}</th>
                  ))}
                  <th className="px-3 py-2.5 text-right font-semibold">Totaal</th>
                  <th className="px-2 py-2.5"><span className="sr-only">Acties</span></th>
                </tr>
              </thead>
              <tbody>
                {medewerkers.map((u) => {
                  const uren = toonUren(u);
                  const bevestigd = !!regelVan(u.id);
                  const tot = somUren(uren);
                  return (
                    <tr key={u.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/40">
                      <td className="sticky left-0 z-10 bg-white px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink-800 text-[11px] font-semibold text-white">{u.initialen}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-ink-900">{u.naam}</span>
                            <span className="block text-[11px] text-ink-400">{contractUren(u)} u/week{bevestigd ? "" : " · voorstel"}</span>
                          </span>
                        </div>
                      </td>
                      {DAGEN.map((d, i) => {
                        const v = verlofOp(u.id, weekISOs[i]);
                        const weekend = i >= 5;
                        return (
                          <td key={d} className={`px-1 py-2 text-center ${weekend ? "bg-ink-50/40" : ""}`}>
                            <div className="relative inline-block">
                              <input
                                inputMode="decimal"
                                value={uren[i] ? uurTekst(uren[i]) : ""}
                                onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); zetUur(u, i, Number.isFinite(n) && n >= 0 ? n : 0); }}
                                placeholder="0"
                                title={v ? `${v.type}${v.notitie ? ` · ${v.notitie}` : ""}` : `${u.naam} ${d}`}
                                aria-label={`${u.naam} ${d}`}
                                className={`w-12 rounded-lg border px-1.5 py-1.5 text-center text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100 ${v ? `border-transparent ${VERLOF_TINT[v.type]}` : "border-ink-200 bg-white text-ink-800"} ${!bevestigd ? "italic text-ink-400" : ""}`}
                              />
                              {v && <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${VERLOF_STIP[v.type]} ring-2 ring-white`} title={v.type} />}
                            </div>
                          </td>
                        );
                      })}
                      <td className={`px-3 py-2 text-right font-bold ${bevestigd ? "text-ink-900" : "text-ink-400"}`}>{tot > 0 ? `${uurTekst(tot)} u` : "—"}</td>
                      <td className="px-2 py-2 text-center">
                        <button type="button" onClick={() => zetRijAuto(u)} title="Deze rij (opnieuw) automatisch invullen vanuit contract − verlof" className="rounded-lg p-1.5 text-ink-300 hover:bg-ink-100 hover:text-brand-600"><RotateCcw className="h-4 w-4" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-ink-100 px-4 py-2.5 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Vakantie</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-indigo-500" /> Verlof</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Ziek</span>
          <span className="italic text-ink-400">Schuine grijze cijfers = automatisch voorstel (nog niet bevestigd).</span>
        </div>
      </Card>

      {/* Contract, vrije dagen & jaartotaal */}
      <Card className="overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-ink-100 px-4 py-3">
          <Plane className="h-4 w-4 text-brand-600" />
          <span className="text-sm font-bold text-ink-900">Contract, vrije dagen &amp; jaartotaal {jaar}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-ink-100 bg-ink-50/60 text-xs text-ink-500">
                <th className="px-4 py-2.5 text-left font-semibold">Medewerker</th>
                <th className="px-3 py-2.5 text-center font-semibold">Contract (u/week)</th>
                <th className="px-3 py-2.5 text-right font-semibold">Gewerkt dit jaar</th>
                <th className="px-3 py-2.5 text-center font-semibold">Vrije dagen/jaar</th>
                <th className="px-3 py-2.5 text-right font-semibold">Opgenomen</th>
                <th className="px-3 py-2.5 text-right font-semibold">Nog over</th>
              </tr>
            </thead>
            <tbody>
              {medewerkers.map((u) => {
                const totaal = vrijeDagen(u);
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
                    <td className="px-3 py-2.5 text-center">
                      <input
                        inputMode="numeric"
                        value={String(contractUren(u))}
                        onChange={(e) => { const n = parseInt(e.target.value.replace(/\D/g, ""), 10); zetContract(u, Number.isFinite(n) ? n : 0); }}
                        aria-label={`Contracturen per week voor ${u.naam}`}
                        className="w-16 rounded-lg border border-ink-200 bg-white px-2 py-1.5 text-center text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                      />
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
          "Opgenomen" telt de goedgekeurde vakantie- en verlofdagen (werkdagen ma–vr) van dit jaar; ziekte telt niet mee. Contracturen bepalen het automatische voorstel per week (gelijk verdeeld over ma–vr). Pas contract of vrije dagen per persoon hierboven aan.
        </p>
      </Card>
    </div>
  );
}

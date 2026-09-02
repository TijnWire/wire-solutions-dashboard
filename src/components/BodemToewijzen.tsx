import { useMemo, useState } from "react";
import { Search, X, UserPlus, CheckSquare, Square, Users } from "lucide-react";
import { Card } from "./ui";
import { sorteerRoute, voortgangVan } from "../lib/bodemonderzoek";
import type { TauwAdres, User } from "../lib/types";

// Adressen handmatig verdelen, met filters op locatie en status.
// ─────────────────────────────────────────────────────────────────────────────
// Automatisch verdelen dekt het gewone geval; dit scherm is voor alles daarbuiten: een medewerker die
// ziek wordt, een gebied dat uitloopt, of een wijk die je bewust bij één iemand wilt houden. Je filtert
// tot je precies de adressen ziet die je bedoelt, selecteert ze en wijst ze toe.

const knopKlein = "inline-flex items-center gap-1.5 rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-sm font-semibold text-ink-700 hover:bg-ink-50 disabled:cursor-not-allowed disabled:opacity-40";

type StatusFilter = "alle" | "open" | "afgerond" | "nietthuis" | "onverdeeld";

const statusVan = (a: TauwAdres): Exclude<StatusFilter, "alle" | "onverdeeld"> =>
  a.afgerond ? "afgerond" : a.geenGehoor ? "nietthuis" : "open";

export function BodemToewijzen({ adressen, users, team, onWijzig }: {
  adressen: TauwAdres[];
  users: User[];
  team: string[];
  onWijzig: (next: TauwAdres[]) => void;
}) {
  const [zoek, setZoek] = useState("");
  const [pc, setPc] = useState("");            // postcode: 4 cijfers of volledig
  const [wijk, setWijk] = useState("");
  const [status, setStatus] = useState<StatusFilter>("alle");
  const [wie, setWie] = useState("");          // toegewezen aan (user id, "-" = niemand)
  const [selectie, setSelectie] = useState<Set<string>>(new Set());

  const naamVan = (id?: string) => (id ? users.find((u) => u.id === id)?.naam ?? "Onbekend" : "");

  const wijken = useMemo(
    () => [...new Set(adressen.map((a) => (a.wijk ?? "").trim()).filter(Boolean))].sort(),
    [adressen],
  );

  const zichtbaar = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    const pcq = pc.trim().replace(/\s+/g, "").toLowerCase();
    return sorteerRoute(adressen).filter((a) => {
      if (q && !`${a.straat} ${a.huisnummer} ${a.postcode} ${a.plaats} ${a.bewoner}`.toLowerCase().includes(q)) return false;
      if (pcq && !a.postcode.replace(/\s+/g, "").toLowerCase().startsWith(pcq)) return false;
      if (wijk && (a.wijk ?? "").trim() !== wijk) return false;
      if (wie === "-" && a.toegewezenAan) return false;
      if (wie && wie !== "-" && a.toegewezenAan !== wie) return false;
      if (status === "onverdeeld" && a.toegewezenAan) return false;
      if (status !== "alle" && status !== "onverdeeld" && statusVan(a) !== status) return false;
      return true;
    });
  }, [adressen, zoek, pc, wijk, status, wie]);

  const allesGeselecteerd = zichtbaar.length > 0 && zichtbaar.every((a) => selectie.has(a.id));
  const toggle = (id: string) => setSelectie((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAlles = () => setSelectie((p) => {
    const n = new Set(p);
    if (allesGeselecteerd) zichtbaar.forEach((a) => n.delete(a.id));
    else zichtbaar.forEach((a) => n.add(a.id));
    return n;
  });

  const wijsToe = (userId: string | undefined) => {
    const nu = new Date().toISOString();
    onWijzig(adressen.map((a) => (selectie.has(a.id) ? { ...a, toegewezenAan: userId, bijgewerktOp: nu } : a)));
    setSelectie(new Set());
  };

  const filterActief = !!(zoek || pc || wijk || wie || status !== "alle");
  const wisFilters = () => { setZoek(""); setPc(""); setWijk(""); setWie(""); setStatus("alle"); };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-ink-900">Handmatig toewijzen</h3>
        <span className="text-xs text-ink-500">{zichtbaar.length} van {adressen.length} adressen zichtbaar</span>
      </div>

      {/* Filters */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Straat, plaats of bewoner…"
            aria-label="Zoeken"
            className="w-full rounded-lg border border-ink-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        </div>
        <input value={pc} onChange={(e) => setPc(e.target.value)} placeholder="Postcode (3011 of 3011 AB)"
          aria-label="Postcode"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100" />
        {wijken.length > 0 ? (
          <select value={wijk} onChange={(e) => setWijk(e.target.value)} aria-label="Wijk"
            className="rounded-lg border border-ink-200 px-3 py-2 text-sm">
            <option value="">Alle wijken</option>
            {wijken.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
        ) : <div className="hidden lg:block" />}
        <select value={wie} onChange={(e) => setWie(e.target.value)} aria-label="Toegewezen aan"
          className="rounded-lg border border-ink-200 px-3 py-2 text-sm">
          <option value="">Iedereen</option>
          <option value="-">Nog niet toegewezen</option>
          {team.map((id) => <option key={id} value={id}>{naamVan(id)}</option>)}
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {([
          ["alle", "Alles"], ["open", "Nog langs"], ["nietthuis", "Niet thuis"],
          ["afgerond", "Afgerond"], ["onverdeeld", "Onverdeeld"],
        ] as [StatusFilter, string][]).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setStatus(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              status === k ? "bg-brand-600 text-white" : "bg-ink-50 text-ink-600 hover:bg-ink-100"
            }`}>{label}</button>
        ))}
        {filterActief && (
          <button type="button" onClick={wisFilters} className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-ink-500 hover:text-ink-800">
            <X className="h-3.5 w-3.5" /> filters wissen
          </button>
        )}
      </div>

      {/* Selectiebalk — verschijnt zodra er iets geselecteerd is */}
      <div className="flex flex-wrap items-center gap-2 border-t border-ink-100 pt-2">
        <button type="button" onClick={toggleAlles} disabled={!zichtbaar.length} className={knopKlein}>
          {allesGeselecteerd ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          {allesGeselecteerd ? "Selectie opheffen" : `Alles in dit filter (${zichtbaar.length})`}
        </button>
        {selectie.size > 0 && (
          <>
            <span className="text-sm font-semibold text-ink-700">{selectie.size} geselecteerd →</span>
            {team.map((id) => (
              <button key={id} type="button" onClick={() => wijsToe(id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700">
                <UserPlus className="h-3.5 w-3.5" /> {naamVan(id)}
              </button>
            ))}
            <button type="button" onClick={() => wijsToe(undefined)} className={knopKlein}>Toewijzing weghalen</button>
          </>
        )}
        {!team.length && <span className="text-xs text-amber-700">Kies eerst hierboven wie er meelopen.</span>}
      </div>

      {/* Lijst */}
      <div className="max-h-96 overflow-auto rounded-lg border border-ink-200">
        {zichtbaar.length === 0 ? (
          <p className="p-6 text-center text-sm text-ink-400">Geen adressen die aan dit filter voldoen.</p>
        ) : zichtbaar.map((a, i) => {
          const aan = selectie.has(a.id);
          const st = statusVan(a);
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => toggle(a.id)}
              className={`flex w-full items-center gap-3 border-b border-ink-100 px-3 py-2 text-left last:border-0 ${
                aan ? "bg-brand-50" : i % 2 ? "bg-ink-50/40" : "bg-white"
              } hover:bg-brand-50/60`}
            >
              {aan ? <CheckSquare className="h-4 w-4 shrink-0 text-brand-600" /> : <Square className="h-4 w-4 shrink-0 text-ink-300" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-ink-800">{`${a.straat} ${a.huisnummer}`.trim()}</span>
                <span className="block truncate text-xs text-ink-500">
                  {[a.postcode, a.plaats, a.wijk].filter(Boolean).join(" · ")}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className={`block text-xs font-semibold ${
                  st === "afgerond" ? "text-green-700" : st === "nietthuis" ? "text-amber-700" : "text-ink-400"
                }`}>
                  {st === "afgerond" ? "afgerond" : st === "nietthuis" ? `niet thuis (${a.pogingen ?? 1}×)` : "nog langs"}
                </span>
                <span className="block text-xs text-ink-500">{a.toegewezenAan ? naamVan(a.toegewezenAan) : "niet toegewezen"}</span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Verdeling in één oogopslag */}
      {team.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-ink-100 pt-2">
          {team.map((id) => {
            const eigen = adressen.filter((a) => a.toegewezenAan === id);
            const v = voortgangVan(eigen);
            return (
              <span key={id} className="inline-flex items-center gap-1.5 rounded-full border border-ink-200 bg-white px-3 py-1 text-xs">
                <Users className="h-3 w-3 text-ink-400" />
                <span className="font-semibold text-ink-700">{naamVan(id)}</span>
                <span className="text-ink-500">{v.afgerond}/{v.totaal}</span>
              </span>
            );
          })}
          {adressen.some((a) => !a.toegewezenAan) && (
            <span className="inline-flex items-center rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              {adressen.filter((a) => !a.toegewezenAan).length} onverdeeld
            </span>
          )}
        </div>
      )}
    </Card>
  );
}

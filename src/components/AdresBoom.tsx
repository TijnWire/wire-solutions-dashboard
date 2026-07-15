import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Layers, Map as MapIcon, Hash, MapPin, Phone, Mail } from "lucide-react";
import { afleidRegio, afleidProvincie } from "../lib/regio";

// Eén adres in de boom. Herbruikbaar voor zowel het centrale adresarchief als de project-adressen.
export type BoomAdres = {
  id: string;
  straat: string;
  huisnummer: string;
  postcode: string;
  plaats: string;
  telefoon?: string;
  email?: string;
  titelExtra?: string; // achter "straat huisnummer" (bv. bewonersnaam)
  onder?: ReactNode;   // extra regel onder de titel (bv. historie-badges of status)
  rechts?: ReactNode;  // los icoon rechts (bv. database-markering)
  onClick?: () => void; // klik op de rij (bv. open detail)
};

// Adressen gestructureerd in mappen: Provincie → Regio → Postcode → Straat → adres.
export function AdresBoom({ items, zoekOpen }: { items: BoomAdres[]; zoekOpen?: boolean }) {
  const [openNodes, setOpenNodes] = useState<Set<string>>(new Set());
  const toggle = (k: string) => setOpenNodes((p) => { const n = new Set(p); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const isOpen = (k: string) => !!zoekOpen || openNodes.has(k);

  const boom = new Map<string, Map<string, Map<string, Map<string, BoomAdres[]>>>>();
  for (const it of items) {
    const prov = afleidProvincie(it.postcode);
    const reg = afleidRegio(it.postcode, it.plaats);
    const pc = (it.postcode || "").replace(/\s/g, "").slice(0, 4) || "Onbekend";
    const straat = it.straat?.trim() || "Onbekende straat";
    const regM = boom.get(prov) ?? boom.set(prov, new Map()).get(prov)!;
    const pcM = regM.get(reg) ?? regM.set(reg, new Map()).get(reg)!;
    const sM = pcM.get(pc) ?? pcM.set(pc, new Map()).get(pc)!;
    (sM.get(straat) ?? sM.set(straat, []).get(straat)!).push(it);
  }
  const telAdres = (m: Map<string, unknown>): number => { let n = 0; for (const x of m.values()) n += x instanceof Map ? telAdres(x as Map<string, unknown>) : (x as BoomAdres[]).length; return n; };
  const provList = [...boom.entries()].sort((a, b) => (a[0].startsWith("Overig") ? 1 : b[0].startsWith("Overig") ? -1 : a[0].localeCompare(b[0], "nl")));

  const contact = (it: BoomAdres) =>
    (it.telefoon || it.email) ? (
      <div className="flex flex-wrap items-center gap-1.5">
        {it.telefoon && <a href={`tel:${it.telefoon.replace(/\s/g, "")}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-brand-50 hover:text-brand-700"><Phone className="h-3 w-3" /> {it.telefoon}</a>}
        {it.email && <a href={`mailto:${it.email}`} onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-200 hover:bg-brand-50 hover:text-brand-700"><Mail className="h-3 w-3" /> <span className="max-w-[10rem] truncate">{it.email}</span></a>}
      </div>
    ) : null;

  const leafInner = (it: BoomAdres) => (
    <>
      <span className="flex h-8 w-10 shrink-0 items-center justify-center rounded-lg bg-white text-sm font-bold text-ink-700 ring-1 ring-ink-200">{it.huisnummer || "—"}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink-900">{it.straat} {it.huisnummer}{it.titelExtra ? ` · ${it.titelExtra}` : ""}</div>
        {it.onder && <div className="mt-0.5 flex flex-wrap gap-1.5 text-[11px] text-ink-500">{it.onder}</div>}
      </div>
    </>
  );

  return (
    <div className="space-y-3">
      {provList.map(([prov, regM]) => {
        const openP = isOpen(prov);
        const regList = [...regM.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl"));
        return (
          <div key={prov} className="overflow-hidden rounded-2xl border border-ink-200 bg-white shadow-card">
            <button type="button" onClick={() => toggle(prov)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-ink-50" aria-expanded={openP}>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white"><Layers className="h-5 w-5" /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-base font-bold text-ink-900">{prov}</span>
                <span className="block text-xs text-ink-500">{regList.length} regio{regList.length === 1 ? "" : "'s"} · {telAdres(regM)} adres{telAdres(regM) === 1 ? "" : "sen"}</span>
              </span>
              <ChevronDown className={`h-5 w-5 shrink-0 text-ink-400 transition-transform ${openP ? "" : "-rotate-90"}`} />
            </button>
            {openP && (
              <div className="space-y-1.5 border-t border-ink-100 bg-ink-50/40 p-2">
                {regList.map(([reg, pcM]) => {
                  const kReg = prov + "|" + reg;
                  const openR = isOpen(kReg);
                  const pcList = [...pcM.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl", { numeric: true }));
                  return (
                    <div key={kReg} className="overflow-hidden rounded-xl border border-ink-200 bg-white">
                      <button type="button" onClick={() => toggle(kReg)} className="flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-ink-50" aria-expanded={openR}>
                        <MapIcon className="h-4 w-4 shrink-0 text-brand-500" />
                        <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-800">{reg}</span>
                        <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">{telAdres(pcM)}</span>
                        <ChevronDown className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${openR ? "" : "-rotate-90"}`} />
                      </button>
                      {openR && (
                        <div className="space-y-1 border-t border-ink-100 p-1.5">
                          {pcList.map(([pc, sM]) => {
                            const kPc = kReg + "|" + pc;
                            const openPc = isOpen(kPc);
                            const sList = [...sM.entries()].sort((a, b) => a[0].localeCompare(b[0], "nl", { numeric: true }));
                            return (
                              <div key={kPc} className="overflow-hidden rounded-lg border border-ink-100">
                                <button type="button" onClick={() => toggle(kPc)} className="flex w-full items-center gap-2 bg-ink-50/60 px-3 py-2 text-left hover:bg-ink-100" aria-expanded={openPc}>
                                  <Hash className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink-700">{pc}</span>
                                  <span className="text-[11px] text-ink-400">{sList.length} straat{sList.length === 1 ? "" : "en"}</span>
                                  <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${openPc ? "" : "-rotate-90"}`} />
                                </button>
                                {openPc && (
                                  <div className="divide-y divide-ink-100 border-t border-ink-100">
                                    {sList.map(([straat, adr]) => {
                                      const kStraat = kPc + "|" + straat;
                                      const openStr = isOpen(kStraat);
                                      const huisnrs = [...adr].sort((a, b) => Number(a.huisnummer) - Number(b.huisnummer) || a.huisnummer.localeCompare(b.huisnummer, "nl", { numeric: true }));
                                      return (
                                        <div key={kStraat}>
                                          <button type="button" onClick={() => toggle(kStraat)} className="flex w-full items-center gap-2 px-3 py-2 pl-5 text-left hover:bg-brand-50/50" aria-expanded={openStr}>
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-ink-400" />
                                            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink-800">{straat}</span>
                                            <span className="rounded-full bg-ink-100 px-2 py-0.5 text-[11px] font-medium text-ink-500">{huisnrs.length}</span>
                                            <ChevronDown className={`h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform ${openStr ? "" : "-rotate-90"}`} />
                                          </button>
                                          {openStr && (
                                            <div className="divide-y divide-ink-100 border-t border-ink-100 bg-ink-50/40">
                                              {huisnrs.map((it) => (
                                                <div key={it.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5 pl-7 pr-4 hover:bg-brand-50 sm:pl-10">
                                                  {it.onClick ? (
                                                    <button type="button" onClick={it.onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left">{leafInner(it)}</button>
                                                  ) : (
                                                    <div className="flex min-w-0 flex-1 items-center gap-3">{leafInner(it)}</div>
                                                  )}
                                                  {contact(it)}
                                                  {it.rechts}
                                                  {it.onClick && <ChevronRight className="h-4 w-4 shrink-0 text-ink-300" />}
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

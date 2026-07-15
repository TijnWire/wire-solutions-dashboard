import { useMemo, useState } from "react";
import { Briefcase, Users, Receipt, AlertTriangle, Search, X, ArrowUpRight, Plus, FolderKanban } from "lucide-react";
import { useApp } from "../store/AppContext";
import { useNav } from "../store/NavContext";
import { Card, Badge } from "../components/ui";
import { StatCard } from "../components/StatCard";
import { euro, factuurTotalen } from "../lib/factuurPdf";
import type { Project } from "../lib/types";

const veld = "w-full rounded-lg border border-ink-200 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100";

// Boekhouding-overzicht van alle lopende projecten: bezetting, uurtarief, PD-nummer en gekoppelde facturen.
export function Projectbeheer() {
  const { projects, opdrachtgevers, taken, facturen, users, updateProject } = useApp();
  const { navigeer } = useNav();
  const [zoek, setZoek] = useState("");

  const naamVanOg = (id?: string) => (id ? opdrachtgevers.find((o) => o.id === id)?.naam ?? "" : "");
  const naamVanUser = (id: string) => users.find((u) => u.id === id)?.naam ?? "Onbekend";

  // Aantal mensen op een project = toegewezen personen + iedereen met een taak in dit project.
  const mensenVan = (p: Project) => {
    const set = new Set<string>(p.toegewezenAan ?? []);
    for (const t of taken) if (t.projectId === p.id && t.toegewezenAan) set.add(t.toegewezenAan);
    return [...set];
  };
  // Facturen die aan dit project hangen (via PD-nummer — de betrouwbaarste koppeling).
  const facturenVan = (p: Project) =>
    p.pdNummer ? facturen.filter((f) => f.pdNummer && f.pdNummer.trim().toLowerCase() === p.pdNummer!.trim().toLowerCase()) : [];

  // Alleen lopende projecten (gefactureerde staan in de Database bij Projecten). Open werk bovenaan.
  const lopende = useMemo(
    () =>
      projects
        .filter((p) => p.boekhouding !== "gefactureerd")
        .sort((a, b) => (a.afgerondOp ? 1 : 0) - (b.afgerondOp ? 1 : 0) || a.naam.localeCompare(b.naam, "nl")),
    [projects]
  );

  const q = zoek.trim().toLowerCase();
  const gefilterd = q
    ? lopende.filter((p) => {
        const og = opdrachtgevers.find((o) => o.id === p.opdrachtgeverId);
        const hooi = `${p.naam} ${p.pdNummer ?? ""} ${p.wijk} ${og?.naam ?? ""} ${og?.relatienummer ?? ""}`.toLowerCase();
        return hooi.includes(q);
      })
    : lopende;

  // Statistieken over alle lopende projecten.
  const alleMensen = new Set<string>();
  lopende.forEach((p) => mensenVan(p).forEach((id) => alleMensen.add(id)));
  const bijBoekhouding = lopende.filter((p) => p.boekhouding === "te_factureren").length;
  const zonderTarief = lopende.filter((p) => !p.uurtarief).length;

  const statusBadge = (p: Project) =>
    p.boekhouding === "te_factureren" ? <Badge tone="indigo">Bij boekhouding</Badge>
      : p.afgerondOp ? <Badge tone="amber">Afgerond</Badge>
      : <Badge tone="green">Lopend</Badge>;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Projectbeheer</h2>
        <p className="text-sm text-ink-500">Overzicht van alle lopende projecten — bezetting, uurtarief, PD-nummer en de gekoppelde facturen. Zoek op klant of project en maak er direct een factuur van.</p>
      </div>

      {/* Kerncijfers */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard icon={Briefcase} label="Lopende projecten" value={String(lopende.length)} tone="green" />
        <StatCard icon={Users} label="Mensen ingezet" value={String(alleMensen.size)} tone="indigo" />
        <StatCard icon={Receipt} label="Bij boekhouding" value={String(bijBoekhouding)} sub="klaar om te factureren" tone="amber" />
        <StatCard icon={AlertTriangle} label="Zonder uurtarief" value={String(zonderTarief)} sub={zonderTarief ? "tarief invullen vóór factureren" : "alles compleet"} tone={zonderTarief ? "red" : "green"} />
      </div>

      {/* Zoeken */}
      <Card className="p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
          <input value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op klant / opdrachtgever, projectnaam, PD-nummer of wijk…" className={veld + " pl-9 pr-9"} />
          {zoek && <button type="button" onClick={() => setZoek("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-400 hover:bg-ink-100" title="Wissen"><X className="h-4 w-4" /></button>}
        </div>
      </Card>

      {gefilterd.length === 0 ? (
        <Card className="p-10 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-ink-300" />
          <p className="mt-3 text-sm text-ink-500">{q ? "Geen projecten gevonden met deze zoekterm." : "Geen lopende projecten."}</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-ink-100 bg-ink-50/60 text-xs font-semibold text-ink-500">
                  <th className="px-4 py-2.5 text-left">PD-nummer</th>
                  <th className="px-4 py-2.5 text-left">Project</th>
                  <th className="px-4 py-2.5 text-left">Opdrachtgever</th>
                  <th className="px-4 py-2.5 text-right">Uurtarief</th>
                  <th className="px-4 py-2.5 text-center">Mensen</th>
                  <th className="px-4 py-2.5 text-left">Facturen</th>
                  <th className="px-4 py-2.5 text-left">Status</th>
                  <th className="px-4 py-2.5 text-right">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {gefilterd.map((p) => {
                  const mensen = mensenVan(p);
                  const fpr = facturenVan(p);
                  const fTotaal = fpr.reduce((s, f) => s + factuurTotalen(f).totaal, 0);
                  return (
                    <tr key={p.id} className="hover:bg-ink-50/40">
                      {/* PD-nummer (bewerkbaar) */}
                      <td className="px-4 py-2.5">
                        <input
                          value={p.pdNummer ?? ""}
                          onChange={(e) => updateProject(p.id, { pdNummer: e.target.value || undefined })}
                          placeholder="PD…"
                          className="w-28 rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-semibold text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                        />
                      </td>
                      {/* Naam + wijk */}
                      <td className="px-4 py-2.5">
                        <div className="font-semibold text-ink-900">{p.naam}</div>
                        {p.wijk && p.wijk !== "—" && <div className="text-xs text-ink-500">{p.wijk}</div>}
                      </td>
                      {/* Opdrachtgever */}
                      <td className="px-4 py-2.5 text-ink-700">{naamVanOg(p.opdrachtgeverId) || <span className="text-ink-300">— geen —</span>}</td>
                      {/* Uurtarief (bewerkbaar) */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-ink-400">€</span>
                          <input
                            value={p.uurtarief != null ? String(p.uurtarief).replace(".", ",") : ""}
                            onChange={(e) => { const n = parseFloat(e.target.value.replace(",", ".")); updateProject(p.id, { uurtarief: Number.isFinite(n) && n >= 0 ? n : undefined }); }}
                            placeholder="0"
                            inputMode="decimal"
                            title="Uurtarief (€ excl. btw)"
                            className="w-16 rounded-lg border border-ink-200 px-2 py-1.5 text-right text-sm text-ink-800 outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
                          />
                          <span className="text-xs text-ink-400">/u</span>
                        </div>
                      </td>
                      {/* Mensen */}
                      <td className="px-4 py-2.5 text-center">
                        <span
                          title={mensen.length ? mensen.map(naamVanUser).join(", ") : "Nog niemand toegewezen"}
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${mensen.length ? "bg-brand-50 text-brand-700" : "bg-ink-100 text-ink-400"}`}
                        >
                          <Users className="h-3 w-3" /> {mensen.length}
                        </span>
                      </td>
                      {/* Facturen */}
                      <td className="px-4 py-2.5">
                        {fpr.length ? (
                          <button type="button" onClick={() => navigeer("facturen", { factuur: fpr[0].id })} className="inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 text-xs font-semibold text-brand-700 hover:bg-brand-50" title="Facturen openen">
                            {fpr.length}× · {euro(fTotaal)} <ArrowUpRight className="h-3 w-3" />
                          </button>
                        ) : (
                          <span className="text-xs text-ink-300">nog geen</span>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-2.5">{statusBadge(p)}</td>
                      {/* Acties */}
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" onClick={() => navigeer("projecten", { project: p.id })} className="rounded-lg border border-ink-200 px-2.5 py-1.5 text-xs font-semibold text-ink-600 hover:border-brand-300 hover:bg-brand-50 hover:text-brand-700" title="Project openen">
                            Open
                          </button>
                          <button type="button" onClick={() => navigeer("facturen", { nieuwFactuurProject: p.id })} className="inline-flex items-center gap-1 rounded-lg bg-brand-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-brand-700" title="Direct een factuur maken voor dit project">
                            <Plus className="h-3.5 w-3.5" /> Factuur
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <p className="text-xs text-ink-400">
        PD-nummer en uurtarief pas je hier direct aan. Gefactureerde projecten verdwijnen automatisch uit dit overzicht en blijven bewaard in de Database bij <span className="font-semibold text-ink-500">Projecten</span>.
      </p>
    </div>
  );
}

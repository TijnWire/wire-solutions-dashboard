import { CalendarCheck, Mailbox, Receipt, HardHat, MessageCircle, CheckCircle2 } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card, CardHeader, Badge } from "../components/ui";
import { StatCard } from "../components/StatCard";
import { useApp } from "../store/AppContext";
import type { Factuur, AfspraakStatus } from "../lib/types";

const euro = (n: number) =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
function weekGrenzen() {
  const t = new Date();
  const dag = (t.getDay() + 6) % 7; // maandag = 0
  const ma = new Date(t); ma.setDate(t.getDate() - dag);
  const zo = new Date(ma); zo.setDate(ma.getDate() + 6);
  return { start: iso(ma), eind: iso(zo) };
}
function geleden(isoTijd: string): string {
  const d = new Date(isoTijd).getTime();
  if (isNaN(d)) return "";
  const min = Math.max(0, Math.round((Date.now() - d) / 60000));
  if (min < 1) return "zojuist";
  if (min < 60) return `${min} min geleden`;
  const u = Math.round(min / 60);
  if (u < 24) return `${u} uur geleden`;
  const dg = Math.round(u / 24);
  return `${dg} dag${dg === 1 ? "" : "en"} geleden`;
}
const factuurTotaal = (f: Factuur) => f.regels.reduce((s, r) => s + r.aantal * r.prijs, 0) * (1 + (f.btwPercentage ?? 21) / 100);

const AFSPRAAK_KLEUR: Record<AfspraakStatus, string> = {
  Open: "#fdba74",
  Bevestigd: "#ea580c",
  Afgerond: "#22c55e",
  Geannuleerd: "#cbd5e1",
};
const TAAK_TONE: Record<string, string> = { "Te doen": "slate", "Mee bezig": "amber", Klaar: "green" };

export function Overzicht() {
  const { afspraken, rondes, voorschouwen, facturen, taken, users, saneringen, tauwOpdrachten, verlof, projects, projectPosts } = useApp();
  const naamVan = (id?: string) => users.find((u) => u.id === id)?.naam ?? "—";
  const projectNaam = (id: string) => projects.find((p) => p.id === id)?.naam ?? "Project";

  const { start: wkStart, eind: wkEind } = weekGrenzen();
  const vandaag = iso(new Date());
  const actieveRondes = rondes.filter((r) => !r.gearchiveerd);
  const werknemers = users.filter((u) => u.rol === "monteur");

  // ── KPI's (afgeleid uit echte data) ──
  const afsprakenWeek = afspraken.filter((a) => a.datum >= wkStart && a.datum <= wkEind && a.status !== "Geannuleerd").length;
  const teBezorgen = actieveRondes.flatMap((r) => r.adressen.filter((a) => !a.ontbreekt));
  const gegooid = teBezorgen.filter((a) => a.status === "Gegooid").length;
  const openFacturen = facturen.filter((f) => f.status === "Verstuurd");
  const openBedrag = openFacturen.reduce((s, f) => s + factuurTotaal(f), 0);
  const opVerlof = new Set(verlof.filter((v) => v.status === "Goedgekeurd" && v.van <= vandaag && vandaag <= v.tot).map((v) => v.medewerkerId));
  const actief = werknemers.filter((w) => !opVerlof.has(w.id)).length;

  // ── Voorschouwen — voortgang per werknemer ──
  const vsIngediend = voorschouwen.filter((v) => v.status === "Ingediend").length;
  const vsConcept = voorschouwen.filter((v) => v.status === "Concept").length;
  const perMonteur = werknemers.map((u) => ({
    naam: u.naam,
    initialen: u.initialen,
    ingediend: voorschouwen.filter((v) => v.ingevuldDoor === u.id && v.status === "Ingediend").length,
    concept: voorschouwen.filter((v) => v.ingevuldDoor === u.id && v.status === "Concept").length,
  }));
  const maxPer = Math.max(1, ...perMonteur.map((m) => m.ingediend + m.concept));

  // ── Grafiek: brieven per wijk ──
  const wijkMap = new Map<string, { wijk: string; gegooid: number; open: number }>();
  for (const r of actieveRondes) {
    const w = wijkMap.get(r.plaats) ?? { wijk: r.plaats || "Onbekend", gegooid: 0, open: 0 };
    for (const a of r.adressen) {
      if (a.ontbreekt) continue;
      if (a.status === "Gegooid") w.gegooid++;
      else w.open++;
    }
    wijkMap.set(r.plaats, w);
  }
  const brievenPerWijk = [...wijkMap.values()].sort((a, b) => b.gegooid + b.open - (a.gegooid + a.open)).slice(0, 8);

  // ── Grafiek: afspraakstatus ──
  const afspraakStatusData = (Object.keys(AFSPRAAK_KLEUR) as AfspraakStatus[])
    .map((s) => ({ naam: s, waarde: afspraken.filter((a) => a.status === s).length, kleur: AFSPRAAK_KLEUR[s] }))
    .filter((x) => x.waarde > 0);

  // ── Recente activiteit: updates & vragen van het team ──
  const recente = [...projectPosts].sort((a, b) => (a.aangemaakt < b.aangemaakt ? 1 : -1)).slice(0, 6);

  // ── Werkvoorraad ──
  const werkvoorraad = [
    { label: "Brieven te gooien", n: teBezorgen.filter((a) => a.status !== "Gegooid").length },
    { label: "Afspraken open", n: afspraken.filter((a) => a.status === "Open" || a.status === "Bevestigd").length },
    { label: "Voorschouwen concept", n: vsConcept },
    { label: "Saneer-adressen te bellen", n: saneringen.filter((s) => !s.gearchiveerd).reduce((acc, s) => acc + s.adressen.filter((a) => !a.bevestigd).length, 0) },
    { label: "TAUW-opdrachten open", n: tauwOpdrachten.filter((o) => !o.gearchiveerd && o.status !== "verstuurd").length },
    { label: "Taken open", n: taken.filter((t) => t.status !== "Klaar").length },
  ];

  // ── Openstaande taken ──
  const openTaken = taken.filter((t) => t.status !== "Klaar");

  return (
    <div className="space-y-6">
      {/* KPI's */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard icon={CalendarCheck} label="Afspraken deze week" value={String(afsprakenWeek)} sub="Ma t/m zo" tone="green" />
        <StatCard icon={Mailbox} label="Brieven gegooid" value={gegooid.toLocaleString("nl-NL")} sub={`van ${teBezorgen.length.toLocaleString("nl-NL")} totaal`} tone="green" />
        <StatCard icon={Receipt} label="Openstaande facturen" value={String(openFacturen.length)} sub={`${euro(openBedrag)} totaal`} tone="amber" />
        <StatCard icon={HardHat} label="Werknemers actief" value={`${actief} / ${werknemers.length}`} sub="Niet met verlof vandaag" tone="green" />
      </div>

      {/* Voorschouwen — voortgang */}
      <Card>
        <CardHeader
          title="Voorschouwen — voortgang"
          subtitle="Live overzicht van het hele team"
          action={
            <div className="flex gap-2">
              <Badge tone="green">{vsIngediend} ingediend</Badge>
              <Badge tone="amber">{vsConcept} concept</Badge>
            </div>
          }
        />
        <div className="p-5">
          {perMonteur.length === 0 ? (
            <p className="text-sm text-ink-400">Nog geen werknemers.</p>
          ) : (
            <div className="space-y-3.5">
              {perMonteur.map((m) => {
                const totaal = m.ingediend + m.concept;
                return (
                  <div key={m.naam} className="flex items-center gap-2 sm:gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{m.initialen}</div>
                    <div className="w-20 shrink-0 truncate text-sm font-medium text-ink-700 sm:w-32">{m.naam}</div>
                    <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div className="h-full bg-green-500" style={{ width: `${(m.ingediend / maxPer) * 100}%` }} />
                      <div className="h-full bg-orange-400" style={{ width: `${(m.concept / maxPer) * 100}%` }} />
                    </div>
                    <div className="w-16 shrink-0 text-right text-xs text-ink-500 sm:w-24">
                      <span className="font-semibold text-ink-800">{totaal}</span> voorschouw{totaal === 1 ? "" : "en"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Ingediend</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Concept</span>
          </div>
        </div>
      </Card>

      {/* Grafieken */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Brieven per wijk" subtitle="Gegooid en nog te doen" />
          <div className="h-72 px-3 py-4">
            {brievenPerWijk.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-ink-400">Nog geen brievenrondes. Maak er een aan bij Brieven &amp; Routes.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={brievenPerWijk} barGap={4}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="wijk" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                  <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" width={32} />
                  <Tooltip cursor={{ fill: "#f1f5f9" }} contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12, boxShadow: "0 10px 30px -12px rgb(15 23 42 / 0.18)" }} />
                  <Bar dataKey="gegooid" name="Gegooid" fill="#ea580c" radius={[6, 6, 0, 0]} />
                  <Bar dataKey="open" name="Te doen" fill="#fdba74" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card>
          <CardHeader title="Afspraakstatus" subtitle="Alle afspraken" />
          <div className="h-72 px-3 py-4">
            {afspraakStatusData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-center text-sm text-ink-400">Nog geen afspraken.</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={afspraakStatusData} dataKey="waarde" nameKey="naam" innerRadius={55} outerRadius={85} paddingAngle={3}>
                    {afspraakStatusData.map((s) => (
                      <Cell key={s.naam} fill={s.kleur} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} formatter={(v) => <span className="text-ink-600">{v}</span>} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Onderste rij */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activiteit */}
        <Card className="lg:col-span-2">
          <CardHeader title="Recente activiteit" subtitle="Updates en vragen van het team" />
          {recente.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-ink-400">Nog geen activiteit. Zodra het team projecten bijwerkt, verschijnt het hier.</div>
          ) : (
            <ul className="divide-y divide-ink-100">
              {recente.map((post) => {
                const Icon = post.type === "vraag" ? MessageCircle : CheckCircle2;
                return (
                  <li key={post.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50/60">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600"><Icon className="h-[18px] w-[18px]" /></div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-ink-900">{post.type === "vraag" ? "Vraag" : "Update"} · {projectNaam(post.projectId)}</div>
                      <div className="truncate text-xs text-ink-500">{naamVan(post.auteurId)}: {post.tekst}</div>
                    </div>
                    <div className="shrink-0 text-xs text-ink-400">{geleden(post.aangemaakt)}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* Werkvoorraad */}
        <Card>
          <CardHeader title="Werkvoorraad" subtitle="Wat er openstaat" />
          <div className="divide-y divide-ink-100">
            {werkvoorraad.map((r) => (
              <div key={r.label} className="flex items-center justify-between px-5 py-3">
                <span className="text-sm text-ink-600">{r.label}</span>
                <span className={`text-sm font-bold ${r.n > 0 ? "text-ink-900" : "text-ink-300"}`}>{r.n}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Taken / deadlines */}
      <Card>
        <CardHeader title="Openstaande taken & deadlines" subtitle="Per medewerker" />
        {openTaken.length === 0 ? (
          <div className="px-5 py-10 text-center text-sm text-ink-400">Geen openstaande taken.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 text-xs uppercase tracking-wide text-ink-400">
                  <th className="px-5 py-3 font-medium">Medewerker</th>
                  <th className="px-5 py-3 font-medium">Taak</th>
                  <th className="px-5 py-3 font-medium">Deadline</th>
                  <th className="px-5 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-100">
                {openTaken.map((t) => {
                  const teamtaak = t.toegewezenAan === "";
                  const u = users.find((x) => x.id === t.toegewezenAan);
                  return (
                    <tr key={t.id} className="hover:bg-ink-50/60">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">{teamtaak ? "•" : u?.initialen ?? "?"}</div>
                          <span className="font-medium text-ink-800">{teamtaak ? "Hele team" : u?.naam ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-ink-600">{t.titel}</td>
                      <td className="px-5 py-3.5 text-ink-600">{t.deadline || "—"}</td>
                      <td className="px-5 py-3.5"><Badge tone={TAAK_TONE[t.status] ?? "slate"}>{t.status}</Badge></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

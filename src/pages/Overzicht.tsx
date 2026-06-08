import {
  CalendarCheck,
  Mailbox,
  Receipt,
  HardHat,
  Mail,
  Route,
  FileText,
  MessageCircle,
  Camera,
  MoreHorizontal,
} from "lucide-react";
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
import {
  kpis,
  brievenPerDag,
  afspraakStatus,
  wijken,
  activiteiten,
  taken,
  type Activiteit,
} from "../lib/data";

const euro = (n: number) =>
  n.toLocaleString("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

const activityIcon: Record<Activiteit["type"], typeof Mail> = {
  mail: Mail,
  route: Route,
  brief: Mailbox,
  factuur: FileText,
  whatsapp: MessageCircle,
  foto: Camera,
};

export function Overzicht() {
  const { voorschouwen, users } = useApp();
  const vsIngediend = voorschouwen.filter((v) => v.status === "Ingediend").length;
  const vsConcept = voorschouwen.filter((v) => v.status === "Concept").length;
  const perMonteur = users
    .filter((u) => u.rol === "monteur")
    .map((u) => ({
      naam: u.naam,
      initialen: u.initialen,
      ingediend: voorschouwen.filter((v) => v.ingevuldDoor === u.id && v.status === "Ingediend").length,
      concept: voorschouwen.filter((v) => v.ingevuldDoor === u.id && v.status === "Concept").length,
    }));
  const maxPer = Math.max(1, ...perMonteur.map((m) => m.ingediend + m.concept));

  return (
    <div className="space-y-6">
      {/* KPI's */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={CalendarCheck}
          label="Afspraken deze week"
          value={String(kpis.afsprakenWeek.value)}
          deltaPct={kpis.afsprakenWeek.deltaPct}
          trend={kpis.afsprakenWeek.trend}
          tone="green"
        />
        <StatCard
          icon={Mailbox}
          label="Brieven gegooid (maand)"
          value={kpis.brievenGegooid.value.toLocaleString("nl-NL")}
          deltaPct={kpis.brievenGegooid.deltaPct}
          trend={kpis.brievenGegooid.trend}
          tone="green"
        />
        <StatCard
          icon={Receipt}
          label="Openstaande facturen"
          value={String(kpis.openstaandeFacturen.value)}
          sub={`${euro(kpis.openstaandeFacturen.bedrag)} totaal`}
          trend={kpis.openstaandeFacturen.trend}
          tone="amber"
        />
        <StatCard
          icon={HardHat}
          label="Werknemers actief"
          value={`${kpis.actieveMonteurs.value} / ${kpis.actieveMonteurs.totaal}`}
          sub="Vandaag ingepland"
          tone="green"
        />
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
                  <div key={m.naam} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">
                      {m.initialen}
                    </div>
                    <div className="w-32 shrink-0 truncate text-sm font-medium text-ink-700">
                      {m.naam}
                    </div>
                    <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-ink-100">
                      <div
                        className="h-full bg-green-500"
                        style={{ width: `${(m.ingediend / maxPer) * 100}%` }}
                      />
                      <div
                        className="h-full bg-orange-400"
                        style={{ width: `${(m.concept / maxPer) * 100}%` }}
                      />
                    </div>
                    <div className="w-24 shrink-0 text-right text-xs text-ink-500">
                      <span className="font-semibold text-ink-800">{totaal}</span> voorschouw
                      {totaal === 1 ? "" : "en"}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="mt-4 flex items-center gap-4 border-t border-ink-100 pt-3 text-xs text-ink-500">
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-green-500" /> Ingediend
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-orange-400" /> Concept
            </span>
          </div>
        </div>
      </Card>

      {/* Grafieken */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title="Brieven bezorgd per dag"
            subtitle="Inclusief gemarkeerde blanco's"
            action={<Badge tone="green">Deze week</Badge>}
          />
          <div className="h-72 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={brievenPerDag} barGap={4}>
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="dag" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                <YAxis tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" width={32} />
                <Tooltip
                  cursor={{ fill: "#f1f5f9" }}
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                    boxShadow: "0 10px 30px -12px rgb(15 23 42 / 0.18)",
                  }}
                />
                <Bar dataKey="gegooid" name="Gegooid" fill="#ea580c" radius={[6, 6, 0, 0]} />
                <Bar dataKey="blanco" name="Blanco's" fill="#fdba74" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Afspraakstatus" subtitle="Deze week" />
          <div className="h-72 px-3 py-4">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={afspraakStatus}
                  dataKey="waarde"
                  nameKey="naam"
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={3}
                >
                  {afspraakStatus.map((s) => (
                    <Cell key={s.naam} fill={s.kleur} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: 12,
                    border: "1px solid #e2e8f0",
                    fontSize: 12,
                  }}
                />
                <Legend
                  iconType="circle"
                  wrapperStyle={{ fontSize: 12 }}
                  formatter={(v) => <span className="text-ink-600">{v}</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Onderste rij */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Activiteit */}
        <Card className="lg:col-span-2">
          <CardHeader
            title="Recente activiteit"
            subtitle="Mail → verwerking → route → administratie"
            action={
              <button className="text-ink-400 hover:text-ink-600">
                <MoreHorizontal className="h-5 w-5" />
              </button>
            }
          />
          <ul className="divide-y divide-ink-100">
            {activiteiten.map((a) => {
              const Icon = activityIcon[a.type];
              return (
                <li key={a.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-ink-50/60">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-ink-100 text-ink-600">
                    <Icon className="h-[18px] w-[18px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-ink-900">{a.titel}</div>
                    <div className="truncate text-xs text-ink-500">{a.detail}</div>
                  </div>
                  <div className="shrink-0 text-xs text-ink-400">{a.tijd}</div>
                </li>
              );
            })}
          </ul>
        </Card>

        {/* Wijk-voortgang */}
        <Card>
          <CardHeader title="Buren gesproken" subtitle="Voortgang per wijk" />
          <div className="space-y-4 px-5 py-5">
            {wijken.map((w) => {
              const pct = Math.round((w.gesproken / w.totaal) * 100);
              const done = w.gesproken === w.totaal;
              return (
                <div key={w.wijk}>
                  <div className="mb-1.5 flex items-center justify-between text-sm">
                    <span className="font-medium text-ink-700">{w.wijk}</span>
                    <span className={done ? "text-brand-600 font-semibold" : "text-ink-500"}>
                      {w.gesproken}/{w.totaal}
                    </span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-ink-100">
                    <div
                      className={`h-full rounded-full ${done ? "bg-brand-500" : "bg-brand-400"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Taken / deadlines */}
      <Card>
        <CardHeader title="Openstaande taken & deadlines" subtitle="Per medewerker" />
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
              {taken.map((t) => (
                <tr key={t.id} className="hover:bg-ink-50/60">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-ink-800 text-xs font-semibold text-white">
                        {t.initialen}
                      </div>
                      <span className="font-medium text-ink-800">{t.monteur}</span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5 text-ink-600">{t.taak}</td>
                  <td className="px-5 py-3.5 text-ink-600">{t.deadline}</td>
                  <td className="px-5 py-3.5">
                    <Badge
                      tone={
                        t.status === "Te laat"
                          ? "red"
                          : t.status === "Vandaag"
                          ? "amber"
                          : "green"
                      }
                    >
                      {t.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

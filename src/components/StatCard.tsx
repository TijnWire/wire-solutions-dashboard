import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card } from "./ui";

export function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  deltaPct,
  trend,
  tone = "green",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  sub?: string;
  deltaPct?: number;
  trend?: "up" | "down" | "flat";
  tone?: "green" | "amber" | "red" | "indigo";
}) {
  const toneBg: Record<string, string> = {
    green: "bg-brand-50 text-brand-600",
    amber: "bg-amber-50 text-amber-600",
    red: "bg-red-50 text-red-600",
    indigo: "bg-indigo-50 text-indigo-600",
  };

  const TrendIcon =
    trend === "up" ? ArrowUpRight : trend === "down" ? ArrowDownRight : Minus;
  const trendColor =
    trend === "up"
      ? "text-brand-600"
      : trend === "down"
      ? "text-red-500"
      : "text-ink-400";

  return (
    <Card className="p-3 sm:p-5">
      <div className="flex items-start justify-between">
        <div className={`rounded-lg p-2 sm:rounded-xl sm:p-2.5 ${toneBg[tone]}`}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
        {deltaPct !== undefined && (
          <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${trendColor}`}>
            <TrendIcon className="h-3.5 w-3.5" />
            {deltaPct}%
          </span>
        )}
      </div>
      <div className="mt-2 sm:mt-4">
        <div className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{value}</div>
        <div className="mt-0.5 text-xs text-ink-500 sm:text-sm">{label}</div>
        {sub && <div className="mt-0.5 text-xs text-ink-400 sm:mt-1">{sub}</div>}
      </div>
    </Card>
  );
}

import { Layers, Percent, Target, TrendingDown, Wallet } from "lucide-react";

import { cn } from "@/lib/utils";
import type { PerformanceSummary } from "@/types/performance";

interface KpiCardsProps {
  summary: PerformanceSummary | null;
  loading: boolean;
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1000) return `${value.toLocaleString("es", { maximumFractionDigits: 2 })}`;
  return value.toFixed(2);
}

export default function KpiCards({ summary, loading }: KpiCardsProps) {
  const empty = !summary || summary.total_trades === 0;

  const pnl = summary?.net_profit ?? 0;
  const pf = summary?.profit_factor ?? 0;

  const cards = [
    {
      label: "P&L Total",
      icon: <Wallet className="h-4 w-4" />,
      value: empty ? "Sin datos" : formatPnl(pnl),
      className: pnl >= 0 ? "text-emerald-400" : "text-red-400",
    },
    {
      label: "Win Rate",
      icon: <Percent className="h-4 w-4" />,
      value: empty ? "Sin datos" : `${summary.win_rate.toFixed(1)}%`,
      className: "text-slate-50",
    },
    {
      label: "Profit Factor",
      icon: <Target className="h-4 w-4" />,
      value: empty ? "Sin datos" : pf === null ? "∞" : pf.toFixed(2),
      className: pf >= 1 ? "text-emerald-400" : "text-amber-400",
    },
    {
      label: "Max Drawdown",
      icon: <TrendingDown className="h-4 w-4" />,
      value: empty ? "Sin datos" : `${summary.max_drawdown.toFixed(2)}%`,
      className: "text-slate-50",
    },
  ];

  if (loading) {
    return (
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className="animate-pulse rounded-2xl border border-slate-800 bg-slate-900 p-5"
          >
            <div className="h-4 w-24 rounded bg-slate-800" />
            <div className="mt-3 h-7 w-20 rounded bg-slate-800" />
          </div>
        ))}
      </section>
    );
  }

  return (
    <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <div
          key={card.label}
          className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
        >
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
            {card.icon}
            {card.label}
          </p>
          <p className={cn("mt-2 text-2xl font-bold", card.className)}>
            {card.value}
          </p>
          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-500">
            <Layers className="h-3 w-3" />
            {empty ? "Sin operaciones cerradas" : `${summary.total_trades} trades`}
          </p>
        </div>
      ))}
    </section>
  );
}
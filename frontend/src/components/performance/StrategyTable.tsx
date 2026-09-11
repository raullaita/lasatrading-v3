import { cn } from "@/lib/utils";
import type { StrategyPerformance } from "@/types/performance";

interface StrategyTableProps {
  strategies: StrategyPerformance[];
  loading: boolean;
}

export default function StrategyTable({ strategies, loading }: StrategyTableProps) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-11 animate-pulse rounded-lg bg-slate-800" />
        ))}
      </div>
    );
  }

  if (strategies.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-slate-400">
        No hay rendimiento por estrategia todavía.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
            <th className="px-4 py-3 font-medium">Estrategia</th>
            <th className="px-4 py-3 font-medium">Símbolo</th>
            <th className="px-4 py-3 font-medium">Trades</th>
            <th className="px-4 py-3 font-medium">Win Rate</th>
            <th className="px-4 py-3 font-medium">PF Real</th>
            <th className="px-4 py-3 text-right font-medium">PnL</th>
          </tr>
        </thead>
        <tbody>
          {strategies.map((s) => (
            <tr
              key={s.strategy_id ?? s.name}
              className={cn(
                "border-b border-slate-800/60 transition-colors",
                s.profit_factor !== null &&
                  s.profit_factor < 1 &&
                  "bg-red-950/40 hover:bg-red-950/60"
              )}
            >
              <td className="px-4 py-3 font-semibold text-slate-100">{s.name}</td>
              <td className="px-4 py-3 text-slate-400">{s.symbol}</td>
              <td className="px-4 py-3 text-slate-300">{s.trades}</td>
              <td className="px-4 py-3 text-slate-300">
                {s.trades > 0 ? `${s.win_rate.toFixed(1)}%` : "—"}
              </td>
              <td className="px-4 py-3">
                <span
                  className={cn(
                    "font-medium",
                    s.profit_factor === null
                      ? "text-amber-400"
                      : s.profit_factor >= 1
                        ? "text-emerald-400"
                        : "text-red-400"
                  )}
                >
                  {s.profit_factor === null ? "∞" : s.profit_factor.toFixed(2)}
                </span>
              </td>
              <td
                className={cn(
                  "px-4 py-3 text-right font-semibold",
                  s.pnl >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {s.pnl >= 0 ? "+" : ""}
                {s.pnl.toFixed(2)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
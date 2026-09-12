"use client";

import { useMemo, useState } from "react";
import { Eye, History, Loader2, Play, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { BacktestRun } from "@/types/backtest";

type SortableMetric =
  | "win_rate"
  | "profit_factor"
  | "max_drawdown"
  | "net_profit";

type SortKey =
  | "created_at"
  | "symbol"
  | "timeframe"
  | "strategy_name"
  | SortableMetric;

type SortDir = 1 | -1;

interface BacktestHistoryTableProps {
  runs: BacktestRun[];
  loading: boolean;
  onView: (run: BacktestRun) => void;
  onRerun: (run: BacktestRun) => void;
  onDelete: (run: BacktestRun) => void;
}

const SORTABLE: { key: SortKey; label: string; metric?: SortableMetric }[] = [
  { key: "created_at", label: "Fecha" },
  { key: "symbol", label: "Símbolo" },
  { key: "timeframe", label: "Timeframe" },
  { key: "strategy_name", label: "Estrategia" },
  { key: "net_profit", label: "Net Profit", metric: "net_profit" },
  { key: "win_rate", label: "Win Rate", metric: "win_rate" },
  { key: "profit_factor", label: "Profit Factor", metric: "profit_factor" },
  { key: "max_drawdown", label: "Max Drawdown", metric: "max_drawdown" },
];

function fieldValue(run: BacktestRun, key: SortKey): string | number {
  if (key === "created_at") return new Date(run.created_at).getTime();
  if (key === "symbol") return run.symbol;
  if (key === "timeframe") return run.timeframe;
  if (key === "strategy_name") return run.strategy_name;
  const metricKey = sortableMetric(key);
  const value = run.metrics[metricKey];
  return value === null ? Number.POSITIVE_INFINITY : value;
}

function sortableMetric(key: SortKey): SortableMetric {
  return SORTABLE.find((s) => s.key === key)?.metric ?? "net_profit";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatMoney(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} $`;
}

function formatPf(value: number | null): string {
  return value === null ? "∞" : value.toFixed(2);
}

export default function BacktestHistoryTable({
  runs,
  loading,
  onView,
  onRerun,
  onDelete,
}: BacktestHistoryTableProps) {
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "created_at",
    dir: -1,
  });
  const [strategyFilter, setStrategyFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const strategies = useMemo(
    () => [...new Set(runs.map((r) => r.strategy_name))].sort(),
    [runs]
  );
  const symbols = useMemo(
    () => [...new Set(runs.map((r) => r.symbol))].sort(),
    [runs]
  );

  const filtered = useMemo(() => {
    const next = runs.filter((run) => {
      if (strategyFilter && run.strategy_name !== strategyFilter) return false;
      if (symbolFilter && run.symbol !== symbolFilter) return false;
      if (dateFilter) {
        const runDay = new Date(run.created_at).toISOString().slice(0, 10);
        if (runDay < dateFilter) return false;
      }
      return true;
    });
    const { key, dir } = sort;
    next.sort((a, b) => {
      const va = fieldValue(a, key);
      const vb = fieldValue(b, key);
      const cmp =
        typeof va === "number" && typeof vb === "number"
          ? va - vb
          : String(va) < String(vb)
            ? -1
            : 1;
      return cmp * dir;
    });
    return next;
  }, [runs, sort, strategyFilter, symbolFilter, dateFilter]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );
  };

  const selectClass =
    "rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none";

  const headerCell = ({ key, label }: { key: SortKey; label: string }) => {
    const active = sort.key === key;
    return (
      <th
        key={key}
        onClick={() => toggleSort(key)}
        className="select-none cursor-pointer whitespace-nowrap px-4 py-3 font-medium transition-colors hover:bg-slate-800"
      >
        <span className="inline-flex items-center gap-1">
          {label}
          <span className={active ? "text-slate-100" : "text-slate-600"}>
            {active ? (sort.dir === 1 ? "↑" : "↓") : "↕"}
          </span>
        </span>
      </th>
    );
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-sm font-semibold text-slate-50">
          Backtests guardados ({filtered.length})
        </h2>
        <div className="flex flex-wrap gap-2">
          <select
            value={strategyFilter}
            onChange={(e) => setStrategyFilter(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por estrategia"
          >
            <option value="">Estrategia: todas</option>
            {strategies.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            value={symbolFilter}
            onChange={(e) => setSymbolFilter(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por símbolo"
          >
            <option value="">Símbolo: todos</option>
            {symbols.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por fecha"
          />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando historial…
        </div>
      ) : runs.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-14 text-center">
          <History className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">
            No hay backtests guardados. Ejecuta tu primer backtest.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-slate-500">
          No hay backtests que coincidan con los filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                {SORTABLE.map(headerCell)}
                <th className="px-4 py-3 text-right font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run) => {
                const positive = run.metrics.net_profit > 0;
                return (
                  <tr
                    key={run.id}
                    className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 text-slate-400">
                      {formatDate(run.created_at)}
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-50">
                      {run.symbol}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {run.timeframe}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {run.strategy_name}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-medium",
                        positive ? "text-emerald-400" : "text-red-400"
                      )}
                    >
                      {formatMoney(run.metrics.net_profit)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {run.metrics.win_rate} %
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {formatPf(run.metrics.profit_factor)}
                    </td>
                    <td className="px-4 py-3 text-red-400">
                      -{run.metrics.max_drawdown} %
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => onView(run)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-400"
                        >
                          <Eye className="h-3.5 w-3.5" />
                          Ver Detalle
                        </button>
                        <button
                          onClick={() => onRerun(run)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-sky-500/40 hover:text-sky-400"
                        >
                          <Play className="h-3.5 w-3.5" />
                          Re-ejecutar
                        </button>
                        <button
                          onClick={() => onDelete(run)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
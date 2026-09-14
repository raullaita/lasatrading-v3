"use client";

import { useMemo, useState } from "react";
import { Eye, FlaskConical, Loader2, Play, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { OptimizationRun } from "@/types/optimizer";

type SortKey =
  | "created_at"
  | "symbol"
  | "timeframe"
  | "strategy_name"
  | "total_combinations"
  | "robust_count"
  | "best_pf_oos";

type SortDir = 1 | -1;

interface OptimizationHistoryTableProps {
  runs: OptimizationRun[];
  loading: boolean;
  onView: (run: OptimizationRun) => void;
  onRerun: (run: OptimizationRun) => void;
  onDelete: (run: OptimizationRun) => void;
}

const SORTABLE: { key: SortKey; label: string }[] = [
  { key: "created_at", label: "Fecha" },
  { key: "symbol", label: "Símbolo" },
  { key: "timeframe", label: "Timeframe" },
  { key: "strategy_name", label: "Estrategia" },
  { key: "total_combinations", label: "Total Combinaciones" },
  { key: "robust_count", label: "Candidatos Robustos" },
  { key: "best_pf_oos", label: "Mejor PF OOS" },
];

function fieldValue(run: OptimizationRun, key: SortKey): number | string {
  switch (key) {
    case "created_at":
      return new Date(run.created_at).getTime();
    case "symbol":
      return run.symbol;
    case "timeframe":
      return run.timeframe;
    case "strategy_name":
      return run.strategy_name;
    case "total_combinations":
      return run.total_combinations;
    case "robust_count":
      return run.robust_count;
    case "best_pf_oos":
      return run.best_pf_oos ?? Number.NEGATIVE_INFINITY;
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatPf(value: number | null): string {
  return value === null ? "—" : value.toFixed(2);
}

export default function OptimizationHistoryTable({
  runs,
  loading,
  onView,
  onRerun,
  onDelete,
}: OptimizationHistoryTableProps) {
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
          Optimizaciones guardadas ({filtered.length})
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
          <FlaskConical className="h-8 w-8 text-slate-600" />
          <p className="text-sm text-slate-400">
            No hay optimizaciones guardadas. Ejecuta tu primera optimización.
          </p>
        </div>
      ) : filtered.length === 0 ? (
        <p className="px-5 py-12 text-center text-sm text-slate-500">
          No hay optimizaciones que coincidan con los filtros.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                {SORTABLE.map(headerCell)}
                <th className="px-4 py-3 text-center font-medium">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((run) => (
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
                  <td className="px-4 py-3 text-slate-300">
                    {run.total_combinations.toLocaleString("es-ES")}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
                      {run.robust_count}
                    </span>
                  </td>
                  <td
                    className={cn(
                      "px-4 py-3 font-semibold",
                      run.best_pf_oos !== null && run.best_pf_oos >= 1
                        ? "text-emerald-400"
                        : "text-slate-300"
                    )}
                  >
                    {formatPf(run.best_pf_oos)}
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
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
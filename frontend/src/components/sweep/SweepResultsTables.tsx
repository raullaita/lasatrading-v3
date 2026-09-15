"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type {
  NoGoReportRow,
  SweepResultsResponse,
  SweepResultRow,
  SweepSummaryRow,
} from "@/types/sweep";

type Tab = "results" | "summary" | "no_go";

function fmt(value: number | null | undefined, digits = 2): string {
  if (value === null || value === undefined) return "—";
  return Number(value).toFixed(digits);
}

function verdictBadge(verdict: string) {
  if (verdict === "robust")
    return (
      <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-semibold text-emerald-400">
        robust
      </span>
    );
  if (verdict === "overfit")
    return (
      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[11px] font-semibold text-amber-400">
        overfit
      </span>
    );
  return (
    <span className="inline-flex items-center rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-400">
      failed
    </span>
  );
}

const RESULT_COLUMNS = [
  { key: "symbol", label: "Símbolo" },
  { key: "timeframe", label: "TF" },
  { key: "strategy_name", label: "Estrategia" },
  { key: "params", label: "Parámetros" },
  { key: "is_pf", label: "IS PF" },
  { key: "oos_pf", label: "OOS PF" },
  { key: "oos_win_rate", label: "OOS WR%" },
  { key: "degradation", label: "Degrad." },
  { key: "verdict", label: "Veredicto" },
  { key: "confirm_pf", label: "Conf. PF" },
  { key: "confirm_net_profit", label: "Conf. Net $", numeric: true },
  { key: "holdout_pf", label: "Hold-out PF" },
  { key: "holdout_positives", label: "Hold-out OK" },
  { key: "generalized", label: "Generaliza" },
];

export default function SweepResultsTables({ data }: { data: SweepResultsResponse }) {
  const [tab, setTab] = useState<Tab>("results");
  const [strategyFilter, setStrategyFilter] = useState("");
  const [symbolFilter, setSymbolFilter] = useState("");

  const strategies = useMemo(
    () => [...new Set(data.results.map((r) => r.strategy_name))].sort(),
    [data.results]
  );
  const symbols = useMemo(
    () => [...new Set(data.results.map((r) => r.symbol))].sort(),
    [data.results]
  );

  const filteredResults = useMemo(
    () =>
      data.results.filter((r) => {
        if (strategyFilter && r.strategy_name !== strategyFilter) return false;
        if (symbolFilter && r.symbol !== symbolFilter) return false;
        return true;
      }),
    [data.results, strategyFilter, symbolFilter]
  );

  const selectClass =
    "rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none";

  const activeTab =
    "border-emerald-500/40 bg-emerald-500/10 text-emerald-400";
  const inactiveTab =
    "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200";

  const counts = {
    results: data.results.length,
    summary: data.summary.length,
    no_go: data.no_go.length,
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["results", "summary", "no_go"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "rounded-lg border px-4 py-2 text-sm font-semibold transition",
              tab === t ? activeTab : inactiveTab
            )}
          >
            {t === "results" && "Resultados"}
            {t === "summary" && "Resumen"}
            {t === "no_go" && "No-Go"}
            <span className="ml-1.5 text-xs opacity-70">({counts[t]})</span>
          </button>
        ))}

        {tab === "results" && (
          <div className="ml-auto flex flex-wrap gap-2">
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
          </div>
        )}
      </div>

      {tab === "results" && <ResultsTable rows={filteredResults} />}
      {tab === "summary" && <SummaryTable rows={data.summary} />}
      {tab === "no_go" && <NoGoTable rows={data.no_go} />}
    </div>
  );
}

function ResultsTable({ rows }: { rows: SweepResultRow[] }) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, 100);

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-50">
          Resultados del sweep ({rows.length})
        </h3>
        {rows.length > 100 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-400"
          >
            {showAll ? "Mostrar solo 100" : "Mostrar todos"}
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
              {RESULT_COLUMNS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td
                  colSpan={RESULT_COLUMNS.length}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  No hay resultados. Ejecuta un sweep para descubrir estrategias.
                </td>
              </tr>
            )}
            {visible.map((r, i) => (
              <tr
                key={`${r.symbol}-${r.timeframe}-${r.strategy_name}-${r.params}-${i}`}
                className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-50">
                  {r.symbol}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {r.timeframe}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {r.strategy_name}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">
                  {r.params}
                </td>
                <td className="px-3 py-2.5 text-slate-300">{fmt(r.is_pf)}</td>
                <td
                  className={cn(
                    "px-3 py-2.5 font-semibold",
                    (r.oos_pf ?? 0) >= 1.3 ? "text-emerald-400" : "text-slate-300"
                  )}
                >
                  {fmt(r.oos_pf)}
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {fmt(r.oos_win_rate)}%
                </td>
                <td className="px-3 py-2.5 text-slate-300">
                  {fmt(r.degradation, 1)}%
                </td>
                <td className="px-3 py-2.5">{verdictBadge(r.verdict)}</td>
                <td className="px-3 py-2.5 font-semibold text-slate-300">
                  {r.confirm_profit_factor === null
                    ? "—"
                    : fmt(r.confirm_profit_factor)}
                </td>
                <td
                  className={cn(
                    "px-3 py-2.5 font-semibold",
                    (r.confirm_net_profit ?? 0) > 0
                      ? "text-emerald-400"
                      : "text-red-400"
                  )}
                >
                  {r.confirm_net_profit === null ? "—" : fmt(r.confirm_net_profit, 0)}
                </td>
                <td className="px-3 py-2.5 text-slate-300">{fmt(r.holdout_avg_pf)}</td>
                <td className="px-3 py-2.5 text-slate-300">
                  {r.holdout_positives || 0}/{(
                    r.holdout_pairs ? r.holdout_pairs.split(";").length : 0
                  )}
                </td>
                <td className="px-3 py-2.5">
                  {String(r.generalized).toLowerCase() === "true" ? (
                    <span className="inline-flex items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                      SÍ
                    </span>
                  ) : (
                    <span className="text-slate-600">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SUMMARY_COLUMNS = [
  { key: "symbol", label: "Símbolo" },
  { key: "timeframe", label: "TF" },
  { key: "strategy_name", label: "Estrategia" },
  { key: "n_total", label: "Total" },
  { key: "n_failed", label: "Failed" },
  { key: "n_overfit", label: "Overfit" },
  { key: "n_robust", label: "Robustos" },
  { key: "mean_is_pf", label: "IS PF" },
  { key: "mean_oos_pf", label: "OOS PF" },
  { key: "mean_oos_dd", label: "OOS DD" },
  { key: "median_trades", label: "Med. Trades" },
];

function SummaryTable({ rows }: { rows: SweepSummaryRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-50">
          Resumen por dataset ({rows.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
              {SUMMARY_COLUMNS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={SUMMARY_COLUMNS.length}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  Sin datos de resumen todavía.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr
                key={`${r.symbol}-${r.timeframe}-${r.strategy_name}-${i}`}
                className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
              >
                <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-50">
                  {r.symbol}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {r.timeframe}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                  {r.strategy_name}
                </td>
                <td className="px-3 py-2.5 text-slate-300">{r.n_total}</td>
                <td className="px-3 py-2.5 text-red-400">{r.n_failed}</td>
                <td className="px-3 py-2.5 text-amber-400">{r.n_overfit}</td>
                <td className="px-3 py-2.5 font-semibold text-emerald-400">
                  {r.n_robust}
                </td>
                <td className="px-3 py-2.5 text-slate-300">{fmt(r.mean_is_pf)}</td>
                <td className="px-3 py-2.5 text-slate-300">{fmt(r.mean_oos_pf)}</td>
                <td className="px-3 py-2.5 text-slate-300">{fmt(r.mean_oos_dd)}</td>
                <td className="px-3 py-2.5 text-slate-300">
                  {r.median_trades === null ? "—" : String(r.median_trades)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const NOGO_COLUMNS = [
  { key: "strategy_name", label: "Estrategia" },
  { key: "timeframe", label: "TF" },
  { key: "n_datasets", label: "Datasets" },
  { key: "n_total", label: "Combos" },
  { key: "n_failed", label: "Failed" },
  { key: "n_overfit", label: "Overfit" },
  { key: "n_robust", label: "Robustos" },
  { key: "pct_robust", label: "% Robust" },
  { key: "mean_oos_pf", label: "OOS PF" },
  { key: "mean_oos_dd", label: "OOS DD" },
];

function NoGoTable({ rows }: { rows: NoGoReportRow[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="border-b border-slate-800 px-5 py-4">
        <h3 className="text-sm font-semibold text-slate-50">
          No-Go Report — qué NO hacer ({rows.length})
        </h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
              {NOGO_COLUMNS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-3 py-2.5 font-medium">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={NOGO_COLUMNS.length}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  Sin datos no-go todavía.
                </td>
              </tr>
            )}
            {rows.map((r, i) => {
              const risky = r.pct_robust < 5;
              return (
                <tr
                  key={`${r.strategy_name}-${r.timeframe}-${i}`}
                  className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-50">
                    {r.strategy_name}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                    {r.timeframe}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{r.n_datasets}</td>
                  <td className="px-3 py-2.5 text-slate-300">{r.n_total}</td>
                  <td className="px-3 py-2.5 text-red-400">{r.n_failed}</td>
                  <td className="px-3 py-2.5 text-amber-400">{r.n_overfit}</td>
                  <td className="px-3 py-2.5 text-slate-300">{r.n_robust}</td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        risky
                          ? "border border-red-500/30 bg-red-500/10 text-red-400"
                          : "border border-slate-700 bg-slate-800 text-slate-300"
                      )}
                    >
                      {r.pct_robust}%
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">{fmt(r.mean_oos_pf)}</td>
                  <td className="px-3 py-2.5 text-slate-300">{fmt(r.mean_oos_dd)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
"use client";

import { useMemo, useState, type ReactNode } from "react";
import {
  ArrowDown,
  ArrowUp,
  BadgeCheck,
  Plus,
  ShieldAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type {
  OptimizationCandidate,
  OptimizationResult,
  Verdict,
} from "@/types/optimizer";

type SortKey =
  | "rank"
  | "win_rate_is"
  | "pf_is"
  | "win_rate_oos"
  | "pf_oos"
  | "degradation";

type SortDir = 1 | -1;

const FILTERS: { value: Verdict | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "robust", label: "🟢 Robustos" },
  { value: "overfit", label: "🟡 Overfit" },
];

const VERDICT_STYLES: Record<Verdict, string> = {
  robust: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  overfit: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400",
  failed: "border-red-500/30 bg-red-500/10 text-red-400",
};

const VERDICT_LABELS: Record<Verdict, string> = {
  robust: "Robusto",
  overfit: "Overfit",
  failed: "Descartado",
};

const VERDICT_ICONS: Record<Verdict, ReactNode> = {
  robust: <BadgeCheck className="h-3.5 w-3.5 text-emerald-400" />,
  overfit: <ShieldAlert className="h-3.5 w-3.5 text-yellow-400" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-400" />,
};

function formatPf(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

function formatParams(params: Record<string, number>): string {
  return Object.entries(params)
    .map(([key, value]) => `${key}=${value}`)
    .join(", ");
}

function candidateValue(candidate: OptimizationCandidate, key: SortKey): number {
  switch (key) {
    case "rank":
      return candidate.rank;
    case "win_rate_is":
      return candidate.is_metrics.win_rate;
    case "pf_is":
      return candidate.is_metrics.profit_factor ?? 0;
    case "win_rate_oos":
      return candidate.oos_metrics.win_rate;
    case "pf_oos":
      return candidate.oos_metrics.profit_factor ?? Number.POSITIVE_INFINITY;
    case "degradation":
      return candidate.degradation;
  }
}

const SORT_LABELS: { key: SortKey; label: string }[] = [
  { key: "rank", label: "Rank" },
  { key: "win_rate_is", label: "Win Rate IS" },
  { key: "pf_is", label: "PF IS" },
  { key: "win_rate_oos", label: "Win Rate OOS" },
  { key: "pf_oos", label: "PF OOS" },
  { key: "degradation", label: "Degradación" },
];

export default function OptimizationResults({ result }: { result: OptimizationResult }) {
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({
    key: "pf_oos",
    dir: -1,
  });

  const counts = useMemo(() => {
    const robust = result.candidates.filter((c) => c.verdict === "robust").length;
    const overfit = result.candidates.filter((c) => c.verdict === "overfit").length;
    const failed = result.candidates.filter((c) => c.verdict === "failed").length;
    return { robust, overfit, failed };
  }, [result.candidates]);

  const filtered = useMemo(() => {
    const next =
      filter === "all"
        ? [...result.candidates]
        : result.candidates.filter((c) => c.verdict === filter);

    const { key, dir } = sort;
    next.sort((a, b) => {
      const va = candidateValue(a, key);
      const vb = candidateValue(b, key);
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return cmp * dir;
    });
    return next;
  }, [result.candidates, filter, sort]);

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: -1 }
    );
  };

  const handleSendToPortfolio = (candidate: OptimizationCandidate) => {
    console.log("Enviar al Portafolio (Módulo 5):", candidate);
  };

  const summaryCards = [
    {
      label: "Candidatos",
      value: result.candidates.length,
      className: "text-slate-50",
    },
    { label: "Robustos", value: counts.robust, className: "text-emerald-400" },
    { label: "Overfit", value: counts.overfit, className: "text-yellow-400" },
    { label: "Descartados", value: counts.failed, className: "text-red-400" },
  ];

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {card.label}
            </p>
            <p className={cn("mt-2 text-2xl font-bold", card.className)}>
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-sm font-semibold text-slate-50">
            Candidatos ({filtered.length})
          </h2>
          <div className="flex gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilter(f.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  filter === f.value
                    ? "bg-emerald-600 text-slate-950"
                    : "bg-slate-800 text-slate-300 hover:bg-slate-700"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-slate-500">
            No hay candidatos con este filtro.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs tracking-wide">
                  {SORT_LABELS.map(({ key, label }) => {
                    const active = sort.key === key;
                    return (
                      <th key={key} className="px-4 py-3 font-medium">
                        <button
                          onClick={() => toggleSort(key)}
                          className={cn(
                            "inline-flex items-center gap-1 uppercase transition",
                            active
                              ? "text-emerald-400"
                              : "text-slate-400 hover:text-slate-200"
                          )}
                        >
                          {label}
                          {active &&
                            (sort.dir === 1 ? (
                              <ArrowUp className="h-3 w-3" />
                            ) : (
                              <ArrowDown className="h-3 w-3" />
                            ))}
                        </button>
                      </th>
                    );
                  })}
                  <th className="px-4 py-3 font-medium text-slate-400">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((candidate) => (
                  <tr
                    key={candidate.rank}
                    className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
                  >
                    <td className="px-4 py-3 text-slate-500">{candidate.rank}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-300">
                      {formatParams(candidate.params)}
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {candidate.is_metrics.total_trades} IS /{" "}
                        {candidate.oos_metrics.total_trades} OOS trades
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {candidate.is_metrics.win_rate.toFixed(1)} %
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-100">
                      {formatPf(candidate.is_metrics.profit_factor)}
                    </td>
                    <td className="px-4 py-3 text-slate-300">
                      {candidate.oos_metrics.win_rate.toFixed(1)} %
                    </td>
                    <td className={cn(
                      "px-4 py-3 font-semibold",
                      (candidate.oos_metrics.profit_factor ?? Number.POSITIVE_INFINITY) >= 1
                        ? "text-emerald-400"
                        : "text-red-400"
                    )}>
                      {formatPf(candidate.oos_metrics.profit_factor)}
                    </td>
                    <td
                      className={cn(
                        "px-4 py-3 font-medium",
                        candidate.degradation >= 30
                          ? "text-yellow-400"
                          : "text-slate-300"
                      )}
                    >
                      {candidate.degradation.toFixed(1)} %
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium",
                          VERDICT_STYLES[candidate.verdict]
                        )}
                      >
                        {VERDICT_ICONS[candidate.verdict]}
                        {VERDICT_LABELS[candidate.verdict]}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {candidate.verdict !== "failed" && (
                        <button
                          onClick={() => handleSendToPortfolio(candidate)}
                          className="flex items-center gap-1 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1.5 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Enviar al Portafolio
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
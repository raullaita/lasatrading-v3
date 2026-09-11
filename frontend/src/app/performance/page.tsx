"use client";

import { useCallback, useEffect, useState } from "react";
import { AlarmClockCheck, Loader2 } from "lucide-react";

import EquityChart from "@/components/performance/EquityChart";
import KpiCards from "@/components/performance/KpiCards";
import StrategyTable from "@/components/performance/StrategyTable";
import {
  getEquityCurve,
  getPerformanceByStrategy,
  getPerformanceSummary,
  type PerformanceQueryParams,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  EquityPoint,
  PerformanceSummary,
  StrategyPerformance,
} from "@/types/performance";

const TYPE_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paper", label: "Paper" },
  { value: "real", label: "Real" },
];

export default function PerformancePage() {
  const [tradeType, setTradeType] = useState<string>("all");
  const [summary, setSummary] = useState<PerformanceSummary | null>(null);
  const [equity, setEquity] = useState<EquityPoint[]>([]);
  const [strategies, setStrategies] = useState<StrategyPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params: PerformanceQueryParams =
      tradeType === "all" ? {} : { trade_type: tradeType };
    try {
      const [summaryData, equityData, strategiesData] = await Promise.all([
        getPerformanceSummary(params),
        getEquityCurve(params),
        getPerformanceByStrategy(params),
      ]);
      setSummary(summaryData);
      setEquity(equityData);
      setStrategies(strategiesData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar las métricas."
      );
    } finally {
      setLoading(false);
    }
  }, [tradeType]);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, [load]);

  const hasTrades = (summary?.total_trades ?? 0) > 0;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Rendimiento
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Dashboard global con métricas de operaciones reales y paper
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            Tipo de operación
          </span>
          <div className="flex gap-1">
            {TYPE_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setTradeType(f.value)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                  tradeType === f.value
                    ? "bg-emerald-600 text-slate-950"
                    : "border border-slate-700 text-slate-400 hover:bg-slate-800"
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error && (
        <div
          className="mb-6 rounded-xl border border-red-900/60 bg-red-950/40 px-5 py-3 text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}

      {!loading && !hasTrades ? (
        <section className="flex flex-col items-center justify-center gap-3 py-24 text-center">
          <AlarmClockCheck className="h-10 w-10 text-slate-600" />
          <p className="text-sm text-slate-400">
            Aún no hay operaciones registradas. Ve al Monitor para empezar.
          </p>
        </section>
      ) : (
        <>
          <section className="mb-6">
            <KpiCards summary={summary} loading={loading} />
          </section>

          <section className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-100">
                Curva de Equidad
              </h2>
              {loading && (
                <span className="flex items-center gap-1.5 text-xs text-slate-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Actualizando…
                </span>
              )}
            </div>
            <EquityChart data={equity} height={400} />
          </section>

          <section className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-100">
                Rendimiento por Estrategia
              </h2>
            </div>
            <StrategyTable strategies={strategies} loading={loading} />
          </section>
        </>
      )}
    </main>
  );
}
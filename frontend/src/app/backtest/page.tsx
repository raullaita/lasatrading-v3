"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";

import BacktestForm from "@/components/backtest/BacktestForm";
import BacktestResults from "@/components/backtest/BacktestResults";
import { getBacktestResults, runBacktest } from "@/lib/api";
import type { BacktestRequest, BacktestResult } from "@/types/backtest";

export default function BacktestPage() {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlight = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleRun = useCallback(async (payload: BacktestRequest) => {
    stopPolling();
    setRunning(true);
    setResult(null);
    setError(null);

    let taskId: string;
    try {
      const queued = await runBacktest(payload);
      taskId = queued.task_id;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al lanzar el backtest."
      );
      setRunning(false);
      return;
    }

    const poll = async () => {
      if (pollInFlight.current) return;
      pollInFlight.current = true;
      try {
        const status = await getBacktestResults(taskId);
        if (status.status === "completed" && status.metrics) {
          setResult({
            metrics: status.metrics,
            equity_curve: status.equity_curve ?? [],
            trades: status.trades ?? [],
          });
          setRunning(false);
          return;
        }
        if (status.status === "error") {
          setError(status.detail ?? "El backtest terminó con un error.");
          setRunning(false);
          return;
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Error al consultar resultados."
        );
        setRunning(false);
        return;
      } finally {
        pollInFlight.current = false;
      }
      pollTimer.current = setTimeout(() => void poll(), 2000);
    };

    void poll();
  }, [stopPolling]);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Backtest
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Ejecuta estrategias sobre datos históricos y analiza los resultados
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full lg:w-1/3">
          <BacktestForm running={running} onRun={handleRun} />
        </aside>

        <section className="w-full lg:w-2/3">
          {error ? (
            <div
              className="flex flex-col items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-10 text-center"
              role="alert"
            >
              <p className="text-sm text-red-400">{error}</p>
            </div>
          ) : running && !result ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
              <p className="text-sm text-slate-300">
                Ejecutando backtest en segundo plano…
              </p>
              <p className="text-xs text-slate-500">
                Consultando resultados cada 2 segundos
              </p>
            </div>
          ) : result ? (
            <BacktestResults result={result} />
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center">
              <FlaskConical className="h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">
                Configura y ejecuta un backtest para ver los resultados aquí.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
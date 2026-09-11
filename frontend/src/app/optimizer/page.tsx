"use client";

import { useCallback, useState } from "react";
import { Ban, FlaskConical } from "lucide-react";

import OptimizationForm from "@/components/optimizer/OptimizationForm";
import OptimizationProgress from "@/components/optimizer/OptimizationProgress";
import OptimizationResults from "@/components/optimizer/OptimizationResults";
import { getOptimizationResults, runOptimization } from "@/lib/api";
import type {
  OptimizationRequest,
  OptimizationResult,
  OptimizationStatus,
} from "@/types/optimizer";

export default function OptimizerPage() {
  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [terminal, setTerminal] = useState<OptimizationStatus | null>(null);

  const handleRun = useCallback(async (payload: OptimizationRequest) => {
    setRunning(true);
    setResult(null);
    setError(null);
    setTerminal(null);

    try {
      const queued = await runOptimization(payload);
      setTaskId(queued.task_id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al lanzar la optimización."
      );
      setRunning(false);
    }
  }, []);

  const handleProgressComplete = useCallback(
    async (id: string) => {
      try {
        const results = await getOptimizationResults(id);
        setResult(results);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Error al consultar los resultados de la optimización."
        );
      }
    },
    []
  );

  const handleProgressDone = useCallback(
    (status: OptimizationStatus, statusError?: string | null) => {
      setRunning(false);
      setTerminal(status);
      if (status === "failed") {
        setError(statusError ?? "La optimización terminó con un error.");
      }
    },
    []
  );

  const handleNewRun = useCallback(() => {
    setTaskId(null);
    setTerminal(null);
    setError(null);
    setResult(null);
  }, []);

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Optimizador
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Grid search con validación Out-of-Sample para detectar overfitting y
          seleccionar configuraciones robustas
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:flex-row">
        <aside className="w-full lg:w-1/3">
          <OptimizationForm running={running} onRun={handleRun} />
        </aside>

        <section className="w-full lg:w-2/3">
          {error ? (
            <div
              className="flex flex-col items-center gap-2 rounded-2xl border border-red-500/30 bg-red-500/10 px-6 py-10 text-center"
              role="alert"
            >
              <p className="text-sm text-red-400">{error}</p>
              <button
                onClick={handleNewRun}
                className="mt-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Volver a intentar
              </button>
            </div>
          ) : terminal === "cancelled" ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
              <Ban className="h-8 w-8 text-slate-500" />
              <p className="text-sm text-slate-300">
                Optimización cancelada. Inicia una nueva para comparar
                resultados.
              </p>
              <button
                onClick={handleNewRun}
                className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
              >
                Nueva optimización
              </button>
            </div>
          ) : running && taskId && !result ? (
            <OptimizationProgress
              taskId={taskId}
              onComplete={() => void handleProgressComplete(taskId)}
              onDone={handleProgressDone}
            />
          ) : result ? (
            <div className="space-y-4">
              <OptimizationResults result={result} />
              <button
                onClick={handleNewRun}
                className="rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                Nueva optimización
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center">
              <FlaskConical className="h-8 w-8 text-slate-600" />
              <p className="text-sm text-slate-400">
                Configura los rangos de parámetros y la validación OOS para
                iniciar una optimización.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
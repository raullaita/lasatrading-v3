"use client";

import { useEffect, useRef, useState } from "react";
import { Ban, ListOrdered, TrendingUp } from "lucide-react";

import { cancelOptimization, getOptimizationStatus } from "@/lib/api";
import type {
  OptimizationCandidate,
  OptimizationStatus,
} from "@/types/optimizer";

interface OptimizationProgressProps {
  taskId: string;
  onComplete: () => void;
  onDone: (status: OptimizationStatus, error?: string | null) => void;
}

function formatPf(value: number | null): string {
  if (value === null) return "∞";
  return value.toFixed(2);
}

function VerdictBadge({ verdict }: { verdict: OptimizationCandidate["verdict"] }) {
  const map = {
    robust: { label: "🟢 Robusto", className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" },
    overfit: { label: "🟡 Overfit", className: "border-yellow-500/30 bg-yellow-500/10 text-yellow-400" },
    failed: { label: "🔴 Descartado", className: "border-red-500/30 bg-red-500/10 text-red-400" },
  } as const;
  const style = map[verdict];
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${style.className}`}>
      {style.label}
    </span>
  );
}

export default function OptimizationProgress({
  taskId,
  onComplete,
  onDone,
}: OptimizationProgressProps) {
  const [progressPct, setProgressPct] = useState(0);
  const [completed, setCompleted] = useState(0);
  const [total, setTotal] = useState(1);
  const [topCandidates, setTopCandidates] = useState<OptimizationCandidate[]>([]);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlight = useRef(false);
  const terminalRef = useRef(false);

  const stopPolling = () => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  };

  useEffect(() => {
    const poll = async () => {
      if (pollInFlight.current || terminalRef.current) return;
      pollInFlight.current = true;
      try {
        const status = await getOptimizationStatus(taskId);
        setProgressPct(status.progress_pct);
        setCompleted(status.completed_combinations);
        setTotal(status.total_combinations);
        setTopCandidates(status.top_candidates_partial ?? []);

        if (status.status === "completed") {
          terminalRef.current = true;
          stopPolling();
          onComplete();
          onDone("completed");
          return;
        }
        if (status.status === "cancelled" || status.status === "failed") {
          terminalRef.current = true;
          stopPolling();
          setCancelled(status.status === "cancelled");
          if (status.status === "failed") {
            setError(status.error ?? "La optimización falló.");
          }
          onDone(status.status, status.error);
          return;
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al consultar el estado.");
        stopPolling();
        return;
      } finally {
        pollInFlight.current = false;
      }
      pollTimer.current = setTimeout(() => void poll(), 2000);
    };

    void poll();
    return () => stopPolling();
  }, [taskId, onComplete, onDone]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelOptimization(taskId);
      terminalRef.current = true;
      stopPolling();
      setCancelled(true);
      onDone("cancelled");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cancelar la tarea.");
      setCancelling(false);
    }
  };

  if (cancelled) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
        <Ban className="h-8 w-8 text-slate-500" />
        <p className="text-sm text-slate-300">Optimización cancelada.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-50">Optimizando…</h2>
          <span className="text-xs font-bold text-emerald-400">{progressPct.toFixed(1)} %</span>
        </div>
        <div className="h-2.5 overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-600 to-emerald-400 transition-all duration-700"
            style={{ width: `${Math.min(progressPct, 100)}%` }}
          />
        </div>
        <p className="mt-3 text-sm text-slate-400">
          Combinaciones probadas:{" "}
          <span className="font-semibold text-slate-100">
            {completed.toLocaleString("es-ES")} / {total.toLocaleString("es-ES")}
          </span>
        </p>

        {error ? (
          <p className="mt-3 text-xs text-red-400" role="alert">
            {error}
          </p>
        ) : (
          <div className="mt-3 flex items-center gap-2 text-xs text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Consultando estado cada 2 segundos
          </div>
        )}

        <div className="mt-4 h-px bg-slate-800" />

        <button
          onClick={handleCancel}
          disabled={cancelling}
          className={`mt-4 flex items-center gap-2 rounded-lg border px-4 py-2 text-xs font-semibold transition disabled:opacity-60 ${
            cancelling
              ? "border-slate-700 bg-slate-800 text-slate-400"
              : "border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500/20"
          }`}
        >
          <Ban className="h-3.5 w-3.5" />
          {cancelling ? "Cancelando…" : "Cancelar"}
        </button>
      </div>

      <div className="rounded-2xl border border-slate-800 bg-slate-900">
        <h2 className="flex items-center gap-2 border-b border-slate-800 px-5 py-4 text-sm font-semibold text-slate-50">
          <ListOrdered className="h-4 w-4 text-emerald-400" />
          Top 3 candidatos parciales
        </h2>
        {topCandidates.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-500">
            Aún no hay candidatos que superen los umbrales IS…
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {topCandidates.map((candidate) => (
              <li
                key={candidate.rank}
                className="flex flex-col gap-2 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-800 text-xs font-bold text-slate-300">
                    {candidate.rank}
                  </span>
                  <span className="font-mono text-xs text-slate-300">
                    {Object.entries(candidate.params)
                      .map(([k, v]) => `${k}=${v}`)
                      .join(", ")}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-500" />
                    PF IS {formatPf(candidate.is_metrics.profit_factor)}
                  </span>
                  <span className="flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-sky-500" />
                    PF OOS {formatPf(candidate.oos_metrics.profit_factor)}
                  </span>
                  <VerdictBadge verdict={candidate.verdict} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
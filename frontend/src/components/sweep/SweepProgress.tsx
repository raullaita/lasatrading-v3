"use client";

import {
  CheckCircle2,
  Loader2,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { SweepStatusResponse } from "@/types/sweep";

interface SweepProgressProps {
  status: SweepStatusResponse;
}

const PHASE_LABELS: Record<string, string> = {
  init: "Inicializando",
  importing: "Importando datos",
  sweep: "Barriendo dataset",
  holdout: "Validación hold-out",
  reporting: "Generando reportes",
  registering: "Registrando en portafolio",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
};

const PHASE_ORDER = [
  "init",
  "importing",
  "sweep",
  "holdout",
  "reporting",
  "registering",
];

export default function SweepProgress({ status }: SweepProgressProps) {
  const phase = status.phase ?? "";
  const finished = status.status === "completed";
  const failed = status.status === "failed";
  const cancelled = status.status === "cancelled";

  const phaseIndex = PHASE_ORDER.indexOf(phase);
  const progress = Math.max(0, Math.min(100, status.progress_pct ?? 0));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {finished ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
            ) : failed || cancelled ? (
              <XCircle className="h-5 w-5 text-red-400" />
            ) : (
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
            )}
            <span className="font-semibold text-slate-50">
              {status.current_job || PHASE_LABELS[phase] || "Sweep en curso"}
            </span>
          </div>
          <span className="text-lg font-bold text-emerald-400">
            {progress.toFixed(1)}%
          </span>
        </div>

        <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>

        {status.total_jobs > 0 && (
          <p className="mt-3 text-xs text-slate-400">
            {status.done_jobs}/{status.total_jobs} datasets barridos ·{" "}
            {status.scan_count} scan · {status.holdout_count} hold-out
          </p>
        )}

        {status.error && (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
            {status.error}
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        {PHASE_ORDER.map((p, i) => {
          const reached = phaseIndex >= i;
          const done = phaseIndex > i;
          const active = phaseIndex === i && (phase === "sweep" || phase === "importing");
          return (
            <div key={p} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                  done || finished
                    ? "bg-emerald-500 text-slate-950"
                    : active
                      ? "bg-emerald-500/20 text-emerald-400 ring-1 ring-emerald-500 animate-pulse"
                      : "bg-slate-800 text-slate-500"
                )}
              >
                {done || (finished && i === PHASE_ORDER.length - 1) ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  "hidden text-[10px] uppercase tracking-wide sm:block",
                  reached ? "text-slate-300" : "text-slate-600"
                )}
              >
                {PHASE_LABELS[p]}
              </span>
              {i < PHASE_ORDER.length - 1 && (
                <span
                  className={cn(
                    "h-px flex-1",
                    done || finished ? "bg-emerald-500" : "bg-slate-800"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
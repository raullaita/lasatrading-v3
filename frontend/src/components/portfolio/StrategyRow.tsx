"use client";

import { Activity, Pause, Pencil, Trash2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { UserStrategy } from "@/types/portfolio";

interface StrategyRowProps {
  strategy: UserStrategy;
  onEdit: (strategy: UserStrategy) => void;
  onDelete: (strategy: UserStrategy) => void;
  onToggle: (strategy: UserStrategy) => Promise<void>;
}

function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onToggle}
      className={cn(
        "relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-60",
        on ? "bg-emerald-600" : "bg-slate-700"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
          on ? "left-[18px]" : "left-0.5"
        )}
      />
    </button>
  );
}

export default function StrategyRow({ strategy, onEdit, onDelete, onToggle }: StrategyRowProps) {
  const riskValue = strategy.risk_management?.value ?? 0;
  const riskType = strategy.risk_management?.type === "fixed" ? "fijo" : "riesgo";

  return (
    <div
      className={cn(
        "flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900 p-4 transition sm:flex-row sm:items-center sm:justify-between",
        strategy.is_active ? "border-emerald-500/30" : "border-slate-800"
      )}
    >
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center gap-1">
          <Toggle
            on={strategy.is_active}
            onToggle={() => void onToggle(strategy)}
          />
          <span className="flex items-center gap-1 text-[10px] text-slate-500">
            {strategy.is_active ? (
              <>
                <Activity className="h-3 w-3 text-emerald-400" />
                <span className="text-emerald-400">Activa</span>
              </>
            ) : (
              <>
                <Pause className="h-3 w-3" />
                <span>Pausada</span>
              </>
            )}
          </span>
        </div>

        <div>
          <p className="font-semibold text-slate-50">{strategy.name}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <span className="rounded-md bg-slate-800 px-2 py-0.5 text-[11px] font-medium text-slate-300">
              {strategy.symbol} {strategy.timeframe}
            </span>
            <span className="rounded-md bg-slate-800/70 px-2 py-0.5 text-[11px] text-slate-400">
              {strategy.base_strategy_name}
            </span>
            <span className="rounded-md bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-400">
              {riskType} {riskValue.toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onEdit(strategy)}
          className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
        >
          <Pencil className="h-3.5 w-3.5" />
          Editar
        </button>
        <button
          onClick={() => onDelete(strategy)}
          className="flex items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-400 transition hover:bg-red-500/20"
        >
          <Trash2 className="h-3.5 w-3.5" />
          Eliminar
        </button>
      </div>
    </div>
  );
}
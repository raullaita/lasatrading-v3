"use client";

import { CalendarDays, FlaskConical, Layers, ShieldCheck } from "lucide-react";

import OptimizationResults from "@/components/optimizer/OptimizationResults";
import type {
  OptimizationDetail,
  OptimizationRequest,
} from "@/types/optimizer";

const DEFAULT_EXIT_RULES = {
  stop_loss_type: "atr_multiplier",
  stop_loss_value: 1.5,
  take_profit_type: "risk_reward_ratio",
  take_profit_value: 2.0,
};

interface OptimizationDetailViewProps {
  detail: OptimizationDetail;
}

export default function OptimizationDetailView({
  detail,
}: OptimizationDetailViewProps) {
  const robustCount = detail.candidates.filter(
    (c) => c.verdict === "robust"
  ).length;

  const request: OptimizationRequest = {
    symbol: detail.symbol,
    timeframe: detail.timeframe,
    strategy_name: detail.strategy_name,
    param_ranges: detail.param_ranges,
    exit_rules:
      detail.exit_rules && Object.keys(detail.exit_rules).length > 0
        ? detail.exit_rules
        : DEFAULT_EXIT_RULES,
    oos_config: detail.oos_config,
    initial_capital: detail.initial_capital,
    commission_pct: detail.commission_pct,
    slippage_pct: detail.slippage_pct,
  };

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-base font-semibold text-slate-50">
              Optimización de {detail.symbol} {detail.timeframe} con{" "}
              {detail.strategy_name}
            </h2>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1">
                <CalendarDays className="h-3.5 w-3.5" />
                {new Date(detail.created_at).toLocaleString("es-ES", {
                  dateStyle: "full",
                  timeStyle: "short",
                })}
              </span>
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-slate-300">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              {detail.completed_combinations.toLocaleString("es-ES")}{" "}
              combinaciones probadas
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 font-medium text-emerald-400">
              <ShieldCheck className="h-3.5 w-3.5" />
              {robustCount} candidatos robustos
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-1.5 text-slate-300">
              <FlaskConical className="h-3.5 w-3.5 text-slate-400" />
              {detail.total_combinations.toLocaleString("es-ES")} combinaciones
            </span>
          </div>
        </div>
      </header>

      <OptimizationResults result={detail} request={request} />
    </div>
  );
}
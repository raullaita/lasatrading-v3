"use client";

import { CalendarDays, MapPin } from "lucide-react";

import BacktestResults from "@/components/backtest/BacktestResults";
import type { BacktestDetail } from "@/types/backtest";

interface BacktestDetailViewProps {
  detail: BacktestDetail;
}

export default function BacktestDetailView({
  detail,
}: BacktestDetailViewProps) {
  return (
    <div className="space-y-4">
      <header className="flex flex-col justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="text-base font-semibold text-slate-50">
            Backtest de {detail.symbol} {detail.timeframe} con{" "}
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
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              Ejecución {detail.id.slice(0, 8)}
            </span>
          </p>
        </div>
      </header>

      <BacktestResults result={detail} />
    </div>
  );
}
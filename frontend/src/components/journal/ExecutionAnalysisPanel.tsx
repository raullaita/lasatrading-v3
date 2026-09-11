"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingDown, Timer, Zap } from "lucide-react";

import { analyzeExecution } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { TradeDirection } from "@/types/journal";

interface ExecutionAnalysisPanelProps {
  expectedPrice: number | null;
  actualPrice: number | null;
  direction: TradeDirection;
  signalTimestamp: string | null;
  executionTimestamp: string | null;
}

export default function ExecutionAnalysisPanel({
  expectedPrice,
  actualPrice,
  direction,
  signalTimestamp,
  executionTimestamp,
}: ExecutionAnalysisPanelProps) {
  const [loading, setLoading] = useState(false);
  const [slippage, setSlippage] = useState<number | null>(null);
  const [latency, setLatency] = useState<number | null>(null);
  const [impact, setImpact] = useState<number | null>(null);

  const canAnalyze =
    expectedPrice !== null &&
    actualPrice !== null &&
    expectedPrice > 0 &&
    signalTimestamp !== null &&
    executionTimestamp !== null;

  const runAnalysis = useCallback(async () => {
    if (!canAnalyze) return;
    setLoading(true);
    try {
      const result = await analyzeExecution({
        signal_timestamp: signalTimestamp!,
        execution_timestamp: executionTimestamp!,
        expected_price: expectedPrice!,
        actual_price: actualPrice!,
        direction,
      });
      setSlippage(result.slippage_pct);
      setLatency(result.latency_seconds);
      setImpact(result.impact_pnl);
    } catch {
      setSlippage(null);
      setLatency(null);
      setImpact(null);
    } finally {
      setLoading(false);
    }
  }, [canAnalyze, signalTimestamp, executionTimestamp, expectedPrice, actualPrice, direction]);

  useEffect(() => {
    if (!canAnalyze) return;
    const t = setTimeout(() => void runAnalysis(), 600);
    return () => clearTimeout(t);
  }, [canAnalyze, runAnalysis]);

  if (!canAnalyze) return null;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
      <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
        Análisis de ejecución
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-emerald-400" />
          <span className="text-xs text-slate-400">Calculando…</span>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <TrendingDown className="h-3 w-3" />
              Slippage
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                slippage !== null && slippage > 0
                  ? "text-red-400"
                  : slippage !== null && slippage < 0
                    ? "text-emerald-400"
                    : "text-slate-300"
              )}
            >
              {slippage !== null ? `${slippage >= 0 ? "+" : ""}${slippage.toFixed(2)}%` : "—"}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <Timer className="h-3 w-3" />
              Latencia
            </p>
            <p className="mt-1 text-sm font-semibold text-slate-300">
              {latency !== null ? `${latency.toFixed(1)}s` : "—"}
            </p>
          </div>
          <div>
            <p className="flex items-center gap-1 text-[10px] text-slate-500">
              <Zap className="h-3 w-3" />
              Impacto P&L
            </p>
            <p
              className={cn(
                "mt-1 text-sm font-semibold",
                impact !== null && impact >= 0
                  ? "text-emerald-400"
                  : impact !== null
                    ? "text-red-400"
                    : "text-slate-300"
              )}
            >
              {impact !== null
                ? `${impact >= 0 ? "+" : ""}${impact.toFixed(4)}`
                : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
"use client";

import { useMemo, useState } from "react";
import { Radar } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MarketRegime } from "@/types/sweep";

const REGIME_STYLE: Record<string, string> = {
  trending_up: "border-emerald-500/30 bg-emerald-500/10 text-emerald-400",
  trending_down: "border-red-500/30 bg-red-500/10 text-red-400",
  ranging: "border-sky-500/30 bg-sky-500/10 text-sky-400",
  volatile: "border-amber-500/30 bg-amber-500/10 text-amber-400",
  no_data: "border-slate-700 bg-slate-800 text-slate-500",
  insufficient_data: "border-slate-700 bg-slate-800 text-slate-500",
};

const REGIME_LABEL: Record<string, string> = {
  trending_up: "Tendencia alcista",
  trending_down: "Tendencia bajista",
  ranging: "Laterales",
  volatile: "Volátil",
  no_data: "Sin datos",
  insufficient_data: "Datos insuficientes",
};

export default function RegimeTable({ regimes }: { regimes: MarketRegime[] }) {
  const [timeframeFilter, setTimeframeFilter] = useState("");
  const [regimeFilter, setRegimeFilter] = useState("");

  const timeframes = useMemo(
    () => [...new Set(regimes.map((r) => r.timeframe))].sort(),
    [regimes]
  );

  const filtered = useMemo(
    () =>
      regimes.filter((r) => {
        if (timeframeFilter && r.timeframe !== timeframeFilter) return false;
        if (regimeFilter && r.regime !== regimeFilter) return false;
        return true;
      }),
    [regimes, timeframeFilter, regimeFilter]
  );

  const selectClass =
    "rounded-lg border border-slate-800 bg-slate-950 px-3 py-1.5 text-xs text-slate-300 focus:border-emerald-500/50 focus:outline-none";

  return (
    <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
      <div className="flex flex-col gap-3 border-b border-slate-800 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Radar className="h-4 w-4 text-sky-400" />
          <h3 className="text-sm font-semibold text-slate-50">
            Análisis de régimen de mercado ({filtered.length})
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            value={timeframeFilter}
            onChange={(e) => setTimeframeFilter(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por timeframe"
          >
            <option value="">Timeframe: todos</option>
            {timeframes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select
            value={regimeFilter}
            onChange={(e) => setRegimeFilter(e.target.value)}
            className={selectClass}
            aria-label="Filtrar por régimen"
          >
            <option value="">Régimen: todos</option>
            {Object.entries(REGIME_LABEL).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-400">
              <th className="px-3 py-2.5 font-medium">Símbolo</th>
              <th className="px-3 py-2.5 font-medium">TF</th>
              <th className="px-3 py-2.5 font-medium">Régimen</th>
              <th className="px-3 py-2.5 font-medium">
                VS SMA20
              </th>
              <th className="px-3 py-2.5 font-medium">
                Slope SMA20
              </th>
              <th className="px-3 py-2.5 font-medium">
                Vol anual
              </th>
              <th className="px-3 py-2.5 font-medium">ATR%</th>
              <th className="px-3 py-2.5 font-medium">Vol trend</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  Sin datos. Ejecuta el análisis de régimen para empezar.
                </td>
              </tr>
            )}
            {filtered.map((r) => {
              const d = r.details ?? {};
              return (
                <tr
                  key={`${r.symbol}-${r.timeframe}`}
                  className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 font-medium text-slate-50">
                    {r.symbol}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-slate-300">
                    {r.timeframe}
                  </td>
                  <td className="px-3 py-2.5">
                    <span
                      className={cn(
                        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold",
                        REGIME_STYLE[r.regime] ?? "border-slate-700 bg-slate-800 text-slate-400"
                      )}
                    >
                      {REGIME_LABEL[r.regime] ?? r.regime}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {d.price_vs_sma20_pct !== undefined
                      ? `${d.price_vs_sma20_pct}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {d.sma20_slope_pct !== undefined
                      ? `${d.sma20_slope_pct}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {d.annualized_volatility_pct !== undefined
                      ? `${d.annualized_volatility_pct}%`
                      : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {d.atr_pct !== undefined ? `${d.atr_pct}%` : "—"}
                  </td>
                  <td className="px-3 py-2.5 text-slate-300">
                    {d.volume_trend !== undefined
                      ? `${Number(d.volume_trend).toFixed(2)}x`
                      : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from "lucide-react";

import EquityChart from "@/components/backtest/EquityChart";
import { cn } from "@/lib/utils";
import type { BacktestResult, BacktestTrade } from "@/types/backtest";

type TradeSortKey =
  | "entry_time"
  | "exit_time"
  | "pnl"
  | "pnl_pct"
  | "duration";

interface TradeSort {
  key: TradeSortKey;
  dir: 1 | -1;
}

function formatPrice(value: number): string {
  return value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatPnl(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toLocaleString("es-ES", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} $`;
}

function formatPct(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} %`;
}

export default function BacktestResults({ result }: { result: BacktestResult }) {
  const { metrics, equity_curve, trades } = result;
  const [sort, setSort] = useState<TradeSort>({ key: "entry_time", dir: 1 });

  const sortedTrades = useMemo(() => {
    const next = [...trades];
    next.sort((a, b) => {
      const valueA = a[sort.key];
      const valueB = b[sort.key];
      const cmp =
        valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
      return cmp * sort.dir;
    });
    return next;
  }, [trades, sort]);

  const toggleSort = (key: TradeSortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );
  };

  const netProfitPositive = metrics.net_profit > 0;

  const metricCards = [
    {
      label: "Net Profit",
      value: formatPnl(metrics.net_profit),
      className: cn(
        netProfitPositive ? "text-emerald-400" : "text-red-400",
        "text-2xl"
      ),
      icon: netProfitPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
    },
    { label: "Win Rate", value: `${metrics.win_rate} %`, className: "text-slate-50 text-2xl" },
    {
      label: "Profit Factor",
      value: metrics.profit_factor === null ? "∞" : String(metrics.profit_factor),
      className: "text-slate-50 text-2xl",
    },
    {
      label: "Max Drawdown",
      value: `-${metrics.max_drawdown} %`,
      className: "text-red-400 text-2xl",
    },
    { label: "Total Trades", value: String(metrics.total_trades), className: "text-slate-50 text-2xl" },
  ];

  const sortHeader = (label: string, key: TradeSortKey) => {
    const active = sort.key === key;
    return (
      <th className="px-4 py-3 font-medium">
        <button
          onClick={() => toggleSort(key)}
          className={cn(
            "inline-flex items-center gap-1 uppercase transition",
            active ? "text-emerald-400" : "text-slate-400 hover:text-slate-200"
          )}
        >
          {label}
          {active &&
            (sort.dir === 1 ? (
              <ArrowUp className="h-3 w-3" />
            ) : (
              <ArrowDown className="h-3 w-3" />
            ))}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {metricCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              {card.label}
              {card.icon}
            </p>
            <p className={cn("mt-2 font-bold", card.className)}>{card.value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
        <h2 className="mb-4 text-sm font-semibold text-slate-50">
          Equity Curve
        </h2>
        <EquityChart data={equity_curve} />
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <h2 className="border-b border-slate-800 px-5 py-4 text-sm font-semibold text-slate-50">
          Trades ({trades.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs tracking-wide">
                <th className="px-4 py-3 font-medium text-slate-400">#</th>
                {sortHeader("Entrada", "entry_time")}
                {sortHeader("Salida", "exit_time")}
                {sortHeader("P&L ($)", "pnl")}
                {sortHeader("P&L (%)", "pnl_pct")}
                {sortHeader("Duración", "duration")}
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map((trade, index) => (
                <TradeRow key={trade.entry_time + index} trade={trade} index={index} />
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function TradeRow({ trade, index }: { trade: BacktestTrade; index: number }) {
  const positive = trade.pnl >= 0;
  return (
    <tr className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40">
      <td className="px-4 py-3 text-slate-500">{index + 1}</td>
      <td className="px-4 py-3">
        <p className="text-slate-200">{formatDate(trade.entry_time)}</p>
        <p className="text-xs text-slate-500">{formatPrice(trade.entry_price)}</p>
      </td>
      <td className="px-4 py-3">
        <p className="text-slate-200">{formatDate(trade.exit_time)}</p>
        <p className="text-xs text-slate-500">{formatPrice(trade.exit_price)}</p>
      </td>
      <td
        className={cn(
          "px-4 py-3 font-medium",
          positive ? "text-emerald-400" : "text-red-400"
        )}
      >
        {formatPnl(trade.pnl)}
      </td>
      <td
        className={cn(
          "px-4 py-3 font-medium",
          positive ? "text-emerald-400" : "text-red-400"
        )}
      >
        {formatPct(trade.pnl_pct)}
      </td>
      <td className="px-4 py-3 text-slate-400">
        {trade.duration} velas
        <span className="ml-1.5 text-xs text-slate-600">{trade.exit_reason}</span>
      </td>
    </tr>
  );
}
"use client";

import { Pencil, Trash2, CheckCircle2 } from "lucide-react";

import { cn } from "@/lib/utils";
import type { Trade } from "@/types/journal";

const TYPE_BADGE: Record<Trade["trade_type"], { label: string; className: string }> = {
  paper: { label: "Paper", className: "bg-amber-500/10 text-amber-400" },
  real: { label: "Real", className: "bg-emerald-500/10 text-emerald-400" },
  backtest: { label: "Backtest", className: "bg-slate-700/50 text-slate-400" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

interface TradeRowProps {
  trade: Trade;
  onEdit: (trade: Trade) => void;
  onToggleStatus: (trade: Trade) => void;
  onDelete: (trade: Trade) => void;
}

export default function TradeRow({
  trade,
  onEdit,
  onToggleStatus,
  onDelete,
}: TradeRowProps) {
  const badge = TYPE_BADGE[trade.trade_type];
  const isLong = trade.direction === "long";

  const pnl = trade.pnl_net;
  const pnlColor =
    pnl === null
      ? "text-slate-500"
      : pnl >= 0
        ? "text-emerald-400"
        : "text-red-400";

  return (
    <tr className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40">
      <td className="px-4 py-3 text-xs text-slate-400">
        {formatDate(trade.entry_timestamp ?? trade.created_at)}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium",
            badge.className
          )}
        >
          {badge.label}
        </span>
      </td>
      <td className="px-4 py-3 text-sm font-semibold text-slate-50">
        {trade.symbol}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "text-xs font-semibold uppercase",
            isLong ? "text-emerald-400" : "text-red-400"
          )}
        >
          {trade.direction}
        </span>
      </td>
      <td className="px-4 py-3 text-xs text-slate-300">
        {trade.entry_price_actual ?? trade.entry_price_expected ?? "—"}
      </td>
      <td className="px-4 py-3 text-xs text-slate-300">
        {trade.exit_price_actual ?? trade.exit_price_expected ?? "—"}
      </td>
      <td className={cn("px-4 py-3 text-xs font-bold", pnlColor)}>
        {pnl !== null ? `${pnl >= 0 ? "+" : ""}${pnl.toFixed(4)}` : "—"}
      </td>
      <td className="px-4 py-3">
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium",
            trade.status === "open"
              ? "bg-blue-500/10 text-blue-400"
              : trade.status === "closed"
                ? "bg-emerald-500/10 text-emerald-400"
                : "bg-slate-700/50 text-slate-500"
          )}
        >
          {trade.status === "open" && "Abierto"}
          {trade.status === "closed" && "Cerrado"}
          {trade.status === "cancelled" && "Cancelado"}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(trade)}
            className="rounded-md border border-slate-700 p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            aria-label="Editar"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          {trade.status === "open" && (
            <button
              onClick={() => onToggleStatus(trade)}
              className="rounded-md border border-emerald-500/30 p-1.5 text-emerald-400 transition hover:bg-emerald-500/10"
              aria-label="Cerrar operación"
              title="Cerrar operación"
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => onDelete(trade)}
            className="rounded-md border border-slate-700 p-1.5 text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
            aria-label="Eliminar"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  );
}
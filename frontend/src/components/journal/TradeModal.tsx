"use client";

import { useState } from "react";
import { Loader2, Save, X } from "lucide-react";

import ExecutionAnalysisPanel from "@/components/journal/ExecutionAnalysisPanel";
import { cn } from "@/lib/utils";
import type { CreateTradePayload, Trade } from "@/types/journal";
import type { SignalLog } from "@/types/monitor";

interface TradeModalProps {
  trade: Trade | null;
  signal?: SignalLog | null;
  onClose: () => void;
  onSave: (data: CreateTradePayload) => Promise<void>;
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="mb-1.5 block text-xs font-medium text-slate-300">
        {label}
      </label>
      {children}
    </div>
  );
}

export default function TradeModal({
  trade,
  signal,
  onClose,
  onSave,
}: TradeModalProps) {
  const [tradeType, setTradeType] = useState(trade?.trade_type ?? "paper");
  const [symbol, setSymbol] = useState(trade?.symbol ?? signal?.symbol ?? "");
  const [direction, setDirection] = useState<"long" | "short">(
    trade?.direction ?? (signal?.signal_type === "sell" ? "short" : "long")
  );

  const [entryExpected, setEntryExpected] = useState<string>(
    trade?.entry_price_expected?.toString() ?? (signal ? signal.price.toString() : "")
  );
  const [entryActual, setEntryActual] = useState<string>(
    trade?.entry_price_actual?.toString() ?? ""
  );
  const [entryTimestamp, setEntryTimestamp] = useState<string>(
    trade?.entry_timestamp
      ? trade.entry_timestamp.slice(0, 16)
      : signal?.timestamp
        ? signal.timestamp.slice(0, 16)
        : ""
  );

  const [exitExpected, setExitExpected] = useState<string>(
    trade?.exit_price_expected?.toString() ?? ""
  );
  const [exitActual, setExitActual] = useState<string>(
    trade?.exit_price_actual?.toString() ?? ""
  );
  const [exitTimestamp, setExitTimestamp] = useState<string>(
    trade?.exit_timestamp ? trade.exit_timestamp.slice(0, 16) : ""
  );

  const [quantity, setQuantity] = useState<string>(trade?.quantity?.toString() ?? "");
  const [commission, setCommission] = useState<string>(trade?.commission?.toString() ?? "0");
  const [status, setStatus] = useState<"open" | "closed" | "cancelled">(
    trade?.status ?? "open"
  );
  const [notes, setNotes] = useState(trade?.notes ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tsToISO = (v: string): string | null => {
    if (!v) return null;
    return new Date(v).toISOString();
  };

  const numOrNull = (v: string): number | null => {
    if (!v) return null;
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  };

  const pnlPreview = (() => {
    const entry = numOrNull(entryActual) ?? numOrNull(entryExpected);
    const exit = numOrNull(exitActual) ?? numOrNull(exitExpected);
    const qty = numOrNull(quantity);
    const comm = numOrNull(commission) ?? 0;
    if (entry === null || exit === null || qty === null) return null;
    if (direction === "short") return (entry - exit) * qty - comm;
    return (exit - entry) * qty - comm;
  })();

  const handleSubmit = async () => {
    if (!symbol.trim()) {
      setError("El símbolo es obligatorio.");
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      setError("Introduce una cantidad válida.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        trade_type: tradeType,
        strategy_id: trade?.strategy_id ?? (signal?.job_id || null),
        signal_id: trade?.signal_id ?? (signal?.id || null),
        symbol: symbol.trim().toUpperCase(),
        direction,
        entry_price_expected: numOrNull(entryExpected),
        entry_price_actual: numOrNull(entryActual),
        entry_timestamp: tsToISO(entryTimestamp),
        exit_price_expected: numOrNull(exitExpected),
        exit_price_actual: numOrNull(exitActual),
        exit_timestamp: tsToISO(exitTimestamp),
        quantity: numOrNull(quantity),
        commission: numOrNull(commission) ?? 0,
        pnl_net: trade?.pnl_net ?? null,
        status,
        notes: notes || null,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar la operación.");
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-5">
          <h2 className="text-lg font-semibold text-slate-50">
            {trade ? "Editar Operación" : "Registrar Operación"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tipo">
              <select
                value={tradeType}
                onChange={(e) => setTradeType(e.target.value as CreateTradePayload["trade_type"])}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
              >
                <option value="paper">Paper</option>
                <option value="real">Real</option>
                <option value="backtest">Backtest</option>
              </select>
            </Field>
            <Field label="Símbolo">
              <input
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                placeholder="BTCUSDT"
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </Field>
            <Field label="Dirección">
              <select
                value={direction}
                onChange={(e) => setDirection(e.target.value as "long" | "short")}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
              >
                <option value="long">Long</option>
                <option value="short">Short</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Entrada
              </p>
              <Field label="Precio esperado">
                <input
                  type="number"
                  step="any"
                  value={entryExpected}
                  onChange={(e) => setEntryExpected(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </Field>
              <Field label="Precio real">
                <input
                  type="number"
                  step="any"
                  value={entryActual}
                  onChange={(e) => setEntryActual(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </Field>
              <Field label="Fecha/hora">
                <input
                  type="datetime-local"
                  value={entryTimestamp}
                  onChange={(e) => setEntryTimestamp(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
                />
              </Field>
            </div>

            <div className="space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Salida
              </p>
              <Field label="Precio esperado">
                <input
                  type="number"
                  step="any"
                  value={exitExpected}
                  onChange={(e) => setExitExpected(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </Field>
              <Field label="Precio real">
                <input
                  type="number"
                  step="any"
                  value={exitActual}
                  onChange={(e) => setExitActual(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
              </Field>
              <Field label="Fecha/hora">
                <input
                  type="datetime-local"
                  value={exitTimestamp}
                  onChange={(e) => setExitTimestamp(e.target.value)}
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
                />
              </Field>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <Field label="Cantidad">
              <input
                type="number"
                step="any"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </Field>
            <Field label="Comisión">
              <input
                type="number"
                step="any"
                value={commission}
                onChange={(e) => setCommission(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              />
            </Field>
            <Field label="Estado">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as typeof status)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
              >
                <option value="open">Abierto</option>
                <option value="closed">Cerrado</option>
                <option value="cancelled">Cancelado</option>
              </select>
            </Field>
          </div>

          <Field label="Notas">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
              placeholder="Observaciones de la operación…"
            />
          </Field>

          <ExecutionAnalysisPanel
            expectedPrice={numOrNull(entryExpected)}
            actualPrice={numOrNull(entryActual)}
            direction={direction}
            signalTimestamp={trade?.entry_timestamp ?? signal?.timestamp ?? null}
            executionTimestamp={tsToISO(entryTimestamp)}
          />

          {pnlPreview !== null && (
            <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-950/50 px-4 py-3">
              <span className="text-xs text-slate-400">P&L estimado</span>
              <span
                className={cn(
                  "text-sm font-bold",
                  pnlPreview >= 0 ? "text-emerald-400" : "text-red-400"
                )}
              >
                {pnlPreview >= 0 ? "+" : ""}
                {pnlPreview.toFixed(4)}
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-slate-800 px-6 py-4">
          {error && (
            <p className="mb-3 text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              Cancelar
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
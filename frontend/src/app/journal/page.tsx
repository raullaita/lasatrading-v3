"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  ArrowUpDown,
  Loader2,
  Plus,
  Trash2,
  TrendingDown,
  TrendingUp,
  Layers,
} from "lucide-react";

import TradeRow from "@/components/journal/TradeRow";
import TradeModal from "@/components/journal/TradeModal";
import { cn } from "@/lib/utils";
import {
  createTrade,
  deleteTrade,
  getTrades,
  updateTrade,
} from "@/lib/api";
import type { CreateTradePayload, Trade, TradeStatus, TradeType } from "@/types/journal";
import type { SignalLog } from "@/types/monitor";

const TYPE_FILTERS: { value: TradeType | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "paper", label: "Paper" },
  { value: "real", label: "Real" },
  { value: "backtest", label: "Backtest" },
];

const STATUS_FILTERS: { value: TradeStatus | "all"; label: string }[] = [
  { value: "all", label: "Todos" },
  { value: "open", label: "Abiertos" },
  { value: "closed", label: "Cerrados" },
  { value: "cancelled", label: "Cancelados" },
];

function parseSignalParams(sp: URLSearchParams): SignalLog | null {
  const newTrade = sp.get("new_trade");
  if (newTrade !== "true") return null;
  const symbol = sp.get("symbol");
  const price = sp.get("entry_price_expected");
  const signalTimestamp = sp.get("signal_timestamp");
  if (!symbol) return null;
  return {
    id: "",
    job_id: "",
    symbol,
    timeframe: sp.get("tf") ?? "1h",
    strategy_name: sp.get("strategy_name") ?? "",
    signal_type: sp.get("direction") === "short" ? "sell" : "buy",
    price: price ? parseFloat(price) : 0,
    timestamp: signalTimestamp ?? new Date().toISOString(),
    telegram_sent: false,
  };
}

function JournalContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const initialSignal = useMemo(() => parseSignalParams(searchParams), [searchParams]);

  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TradeType | "all">("all");
  const [statusFilter, setStatusFilter] = useState<TradeStatus | "all">("all");

  const [pendingSignal, setPendingSignal] = useState<SignalLog | null>(initialSignal);
  const [modalOpen, setModalOpen] = useState(initialSignal !== null);
  const [editingTrade, setEditingTrade] = useState<Trade | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Trade | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (initialSignal) router.replace("/journal");
  }, [initialSignal, router]);

  const loadTrades = useCallback(async () => {
    try {
      const data = await getTrades({
        trade_type: typeFilter === "all" ? undefined : typeFilter,
        status: statusFilter === "all" ? undefined : statusFilter,
      });
      setTrades(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar las operaciones."
      );
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    const initial = setTimeout(() => void loadTrades(), 0);
    return () => clearTimeout(initial);
  }, [loadTrades]);

  const closedTrades = trades.filter((t) => t.status === "closed");
  const totalTrades = trades.length;
  const wins = closedTrades.filter((t) => t.pnl_net !== null && t.pnl_net > 0).length;
  const winRate = closedTrades.length > 0 ? (wins / closedTrades.length) * 100 : 0;
  const totalPnl = closedTrades.reduce(
    (sum, t) => sum + (t.pnl_net ?? 0),
    0
  );

  const summaryCards = [
    {
      label: "Operaciones",
      value: totalTrades,
      icon: <Layers className="h-4 w-4" />,
      className: "text-slate-50",
    },
    {
      label: "Win Rate",
      value: `${winRate.toFixed(1)}%`,
      icon: <TrendingUp className="h-4 w-4" />,
      className: "text-emerald-400",
    },
    {
      label: "P&L Total",
      value: totalPnl.toFixed(4),
      icon: totalPnl >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />,
      className: totalPnl >= 0 ? "text-emerald-400" : "text-red-400",
    },
  ];

  const handleSaveNew = async (data: CreateTradePayload) => {
    const created = await createTrade(data);
    setTrades((prev) => [created, ...prev]);
    setModalOpen(false);
    setPendingSignal(null);
  };

  const handleEditSave = async (data: CreateTradePayload) => {
    if (!editingTrade) return;
    const updated = await updateTrade(editingTrade.id, data);
    setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setModalOpen(false);
    setEditingTrade(null);
  };

  const handleToggleStatus = async (trade: Trade) => {
    try {
      const updated = await updateTrade(trade.id, { status: "closed" });
      setTrades((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cerrar la operación.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteTrade(deleteTarget.id);
      setTrades((prev) => prev.filter((t) => t.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo eliminar la operación.");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Trade Journal
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Registro histórico de operaciones con análisis de ejecución
          </p>
        </div>
        <button
          onClick={() => {
            setEditingTrade(null);
            setPendingSignal(null);
            setModalOpen(true);
          }}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          Registrar Operación
        </button>
      </header>

      <section className="mb-8 grid grid-cols-3 gap-4">
        {summaryCards.map((card) => (
          <div
            key={card.label}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-4"
          >
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
              {card.icon}
              {card.label}
            </p>
            <p className={cn("mt-2 text-2xl font-bold", card.className)}>
              {loading ? "…" : card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="mb-6 flex flex-wrap items-center gap-2">
        <ArrowUpDown className="h-4 w-4 text-slate-400" />
        <div className="flex gap-1">
          {TYPE_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setTypeFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                typeFilter === f.value
                  ? "bg-emerald-600 text-slate-950"
                  : "border border-slate-700 text-slate-400 hover:bg-slate-800"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
        <span className="mx-1 h-4 w-px bg-slate-700" />
        <div className="flex gap-1">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-medium transition",
                statusFilter === f.value
                  ? "bg-emerald-600 text-slate-950"
                  : "border border-slate-700 text-slate-400 hover:bg-slate-800"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        {error && (
          <div className="border-b border-slate-800 px-5 py-3 text-sm text-red-400" role="alert">
            {error}
          </div>
        )}

        {loading && trades.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando operaciones…
          </div>
        ) : trades.length === 0 ? (
          <p className="px-6 py-16 text-center text-sm text-slate-400">
            No hay operaciones registradas aún. Pulsa &quot;Registrar Operación&quot; para empezar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-4 py-3 font-medium">Fecha</th>
                  <th className="px-4 py-3 font-medium">Tipo</th>
                  <th className="px-4 py-3 font-medium">Símbolo</th>
                  <th className="px-4 py-3 font-medium">Dir.</th>
                  <th className="px-4 py-3 font-medium">Entrada</th>
                  <th className="px-4 py-3 font-medium">Salida</th>
                  <th className="px-4 py-3 font-medium">P&L</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-center font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((trade) => (
                  <TradeRow
                    key={trade.id}
                    trade={trade}
                    onEdit={(t) => {
                      setEditingTrade(t);
                      setPendingSignal(null);
                      setModalOpen(true);
                    }}
                    onToggleStatus={handleToggleStatus}
                    onDelete={setDeleteTarget}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalOpen && (
        <TradeModal
          trade={editingTrade}
          signal={pendingSignal}
          onClose={() => {
            setModalOpen(false);
            setEditingTrade(null);
            setPendingSignal(null);
          }}
          onSave={editingTrade ? handleEditSave : handleSaveNew}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-50">Eliminar operación</h2>
            <p className="mt-2 text-sm text-slate-400">
              ¿Seguro que quieres eliminar la operación de{" "}
              <span className="font-semibold text-slate-200">{deleteTarget.symbol}</span>?
              Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-slate-50 transition hover:bg-red-500 disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function JournalPage() {
  return (
    <Suspense
      fallback={
        <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
          <div className="flex items-center justify-center gap-2 py-24 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando…
          </div>
        </main>
      }
    >
      <JournalContent />
    </Suspense>
  );
}
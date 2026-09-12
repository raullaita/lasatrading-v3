"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import BacktestDetailView from "@/components/backtest/BacktestDetailView";
import BacktestForm from "@/components/backtest/BacktestForm";
import BacktestHistoryTable from "@/components/backtest/BacktestHistoryTable";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  deleteBacktest,
  getBacktestDetail,
  getBacktestHistory,
  getBacktestResults,
  runBacktest,
} from "@/lib/api";
import type {
  BacktestDetail,
  BacktestRequest,
  BacktestRun,
} from "@/types/backtest";

type View = "history" | "form" | "detail";

export default function BacktestPage() {
  const [view, setView] = useState<View>("history");

  const [runs, setRuns] = useState<BacktestRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [selectedDetail, setSelectedDetail] = useState<BacktestDetail | null>(
    null
  );
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<BacktestRequest | null>(
    null
  );
  const [formKey, setFormKey] = useState(0);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  const [itemToDelete, setItemToDelete] = useState<BacktestRun | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollInFlight = useRef(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setRuns(await getBacktestHistory({ limit: 100 }));
      setHistoryError(null);
    } catch (err) {
      setHistoryError(
        err instanceof Error ? err.message : "Error al cargar el historial."
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void loadHistory(), 0);
    return () => clearTimeout(timer);
  }, [loadHistory]);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const handleRun = useCallback(
    async (payload: BacktestRequest) => {
      stopPolling();
      setRunning(true);
      setRunError(null);

      let taskId: string;
      try {
        const queued = await runBacktest(payload);
        taskId = queued.task_id;
      } catch (err) {
        setRunError(
          err instanceof Error ? err.message : "Error al lanzar el backtest."
        );
        setRunning(false);
        return;
      }

      const poll = async () => {
        if (pollInFlight.current) return;
        pollInFlight.current = true;
        try {
          const status = await getBacktestResults(taskId);
          if (status.status === "completed" && status.metrics) {
            setSelectedDetail({
              id: taskId,
              symbol: payload.symbol,
              timeframe: payload.timeframe,
              strategy_name: payload.strategy_name,
              created_at: new Date().toISOString(),
              params: payload.strategy_params,
              exit_rules: payload.exit_rules,
              metrics: status.metrics,
              equity_curve: status.equity_curve ?? [],
              trades: status.trades ?? [],
            });
            setRunning(false);
            setView("detail");
            void loadHistory();
            return;
          }
          if (status.status === "error") {
            setRunError(status.detail ?? "El backtest terminó con un error.");
            setRunning(false);
            return;
          }
        } catch (err) {
          setRunError(
            err instanceof Error ? err.message : "Error al consultar resultados."
          );
          setRunning(false);
          return;
        } finally {
          pollInFlight.current = false;
        }
        pollTimer.current = setTimeout(() => void poll(), 2000);
      };

      void poll();
    },
    [loadHistory, stopPolling]
  );

  const handleNew = () => {
    stopPolling();
    setSelectedDetail(null);
    setPendingRequest(null);
    setRunError(null);
    setFormKey((key) => key + 1);
    setView("form");
  };

  const handleView = async (run: BacktestRun) => {
    setDetailLoading(true);
    setRunError(null);
    try {
      setSelectedDetail(await getBacktestDetail(run.id));
      setView("detail");
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Error al cargar el detalle."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRerun = async (run: BacktestRun) => {
    setRunError(null);
    try {
      const detail = await getBacktestDetail(run.id);
      setPendingRequest({
        symbol: detail.symbol,
        timeframe: detail.timeframe,
        strategy_name: detail.strategy_name,
        strategy_params: detail.params,
        exit_rules: detail.exit_rules,
        initial_capital: 10000,
        commission_pct: 0.001,
        slippage_pct: 0.1,
      });
      setSelectedDetail(null);
      setFormKey((key) => key + 1);
      setView("form");
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Error al preparar la re-ejecución."
      );
    }
  };

  const handleBack = () => {
    stopPolling();
    setRunning(false);
    setPendingRequest(null);
    setSelectedDetail(null);
    setRunError(null);
    setView("history");
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteBacktest(itemToDelete.id);
      setItemToDelete(null);
      void loadHistory();
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Error al eliminar el backtest."
      );
      setItemToDelete(null);
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Backtest
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Ejecuta estrategias sobre datos históricos y analiza los resultados
          </p>
        </div>
        {view === "history" && (
          <button
            onClick={handleNew}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Nuevo Backtest
          </button>
        )}
      </header>

      {runError && view !== "history" && (
        <div
          className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
          role="alert"
        >
          {runError}
        </div>
      )}

      {view === "history" ? (
        historyError ? (
          <div
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-10 text-center text-sm text-red-400"
            role="alert"
          >
            {historyError}
          </div>
        ) : (
          <BacktestHistoryTable
            runs={runs}
            loading={historyLoading}
            onView={(run) => void handleView(run)}
            onRerun={(run) => void handleRerun(run)}
            onDelete={setItemToDelete}
          />
        )
      ) : (
        <>
          <button
            onClick={handleBack}
            className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Historial
          </button>

          {view === "form" ? (
            running ? (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
                <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
                <p className="text-sm text-slate-300">
                  Ejecutando backtest en segundo plano…
                </p>
                <p className="text-xs text-slate-500">
                  Consultando resultados cada 2 segundos
                </p>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl">
                <BacktestForm
                  key={formKey}
                  running={running}
                  onRun={(request) => void handleRun(request)}
                  initial={pendingRequest ?? undefined}
                />
              </div>
            )
          ) : detailLoading || !selectedDetail ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando detalle…
            </div>
          ) : (
            <BacktestDetailView detail={selectedDetail} />
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title="Eliminar backtest"
        message={
          itemToDelete
            ? `¿Seguro que deseas eliminar el backtest de ${itemToDelete.symbol} ${itemToDelete.timeframe} con ${itemToDelete.strategy_name}? Esta acción no se puede deshacer.`
            : ""
        }
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setItemToDelete(null)}
        isLoading={deleteLoading}
      />
    </main>
  );
}
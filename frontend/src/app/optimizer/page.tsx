"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, Loader2, Plus } from "lucide-react";

import OptimizationDetailView from "@/components/optimizer/OptimizationDetailView";
import OptimizationForm from "@/components/optimizer/OptimizationForm";
import OptimizationHistoryTable from "@/components/optimizer/OptimizationHistoryTable";
import OptimizationProgress from "@/components/optimizer/OptimizationProgress";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import {
  deleteOptimization,
  getOptimizationDetail,
  getOptimizationHistory,
  getOptimizationResults,
  runOptimization,
} from "@/lib/api";
import type {
  OptimizationDetail,
  OptimizationRequest,
  OptimizationRun,
} from "@/types/optimizer";

type View = "history" | "form" | "progress" | "detail";

export default function OptimizerPage() {
  const [view, setView] = useState<View>("history");

  const [runs, setRuns] = useState<OptimizationRun[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const [selectedDetail, setSelectedDetail] =
    useState<OptimizationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [pendingRequest, setPendingRequest] =
    useState<Partial<OptimizationRequest> | null>(null);
  const [formKey, setFormKey] = useState(0);

  const [running, setRunning] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const [itemToDelete, setItemToDelete] = useState<OptimizationRun | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setRuns(await getOptimizationHistory({ limit: 100 }));
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

  const handleRun = useCallback(async (payload: OptimizationRequest) => {
    setRunError(null);
    setSelectedDetail(null);
    try {
      const queued = await runOptimization(payload);
      setTaskId(queued.task_id);
      setPendingRequest(payload);
      setRunning(true);
      setView("progress");
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Error al lanzar la optimización."
      );
    }
  }, []);

  const handleProgressComplete = useCallback(
    async (id: string) => {
      if (!pendingRequest) return;
      setRunError(null);
      try {
        const results = await getOptimizationResults(id);
        setSelectedDetail({
          id,
          symbol: pendingRequest.symbol ?? "",
          timeframe: pendingRequest.timeframe ?? "",
          strategy_name: pendingRequest.strategy_name ?? "",
          created_at: new Date().toISOString(),
          param_ranges: pendingRequest.param_ranges ?? {},
          exit_rules:
            pendingRequest.exit_rules ?? {
              stop_loss_type: "atr_multiplier",
              stop_loss_value: 1.5,
              take_profit_type: "risk_reward_ratio",
              take_profit_value: 2.0,
            },
          oos_config:
            pendingRequest.oos_config ?? {
              enabled: true,
              split_ratio: 0.7,
              min_pf: 1.3,
              max_degradation: 0.3,
              min_trades: 10,
            },
          initial_capital: pendingRequest.initial_capital ?? 10000,
          commission_pct: pendingRequest.commission_pct ?? 0.001,
          slippage_pct: pendingRequest.slippage_pct ?? 0.1,
          candidates: results.candidates,
          total_combinations: results.total_combinations,
          completed_combinations: results.completed_combinations,
        });
        setView("detail");
        void loadHistory();
      } catch (err) {
        setRunError(
          err instanceof Error
            ? err.message
            : "Error al consultar los resultados de la optimización."
        );
      }
    },
    [pendingRequest, loadHistory]
  );

  const handleProgressDone = useCallback(() => {
    setRunning(false);
  }, []);

  const handleNew = () => {
    setSelectedDetail(null);
    setPendingRequest(null);
    setRunError(null);
    setFormKey((key) => key + 1);
    setView("form");
  };

  const handleView = async (run: OptimizationRun) => {
    setDetailLoading(true);
    setRunError(null);
    try {
      setSelectedDetail(await getOptimizationDetail(run.id));
      setView("detail");
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Error al cargar el detalle."
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const handleRerun = async (run: OptimizationRun) => {
    setRunError(null);
    try {
      const detail = await getOptimizationDetail(run.id);
      setPendingRequest({
        symbol: detail.symbol,
        timeframe: detail.timeframe,
        strategy_name: detail.strategy_name,
        param_ranges: detail.param_ranges,
        oos_config: detail.oos_config,
        exit_rules: detail.exit_rules,
        initial_capital: detail.initial_capital,
        commission_pct: detail.commission_pct,
        slippage_pct: detail.slippage_pct,
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
    setRunning(false);
    setTaskId(null);
    setPendingRequest(null);
    setSelectedDetail(null);
    setRunError(null);
    setView("history");
  };

  const handleDeleteConfirm = async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteOptimization(itemToDelete.id);
      setItemToDelete(null);
      void loadHistory();
    } catch (err) {
      setRunError(
        err instanceof Error ? err.message : "Error al eliminar la optimización."
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
            {view === "history"
              ? "Historial de Optimizaciones"
              : "Optimizador"}
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            {view === "history"
              ? "Gestiona, consulta y re-ejecuta tus optimizaciones de parámetros"
              : "Grid search con validación Out-of-Sample para detectar overfitting y seleccionar configuraciones robustas"}
          </p>
        </div>
        {view === "history" && (
          <button
            onClick={handleNew}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Nueva Optimización
          </button>
        )}
      </header>

      {runError && (view === "form" || view === "detail") && (
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
          <OptimizationHistoryTable
            runs={runs}
            loading={historyLoading}
            onView={(run) => void handleView(run)}
            onRerun={(run) => void handleRerun(run)}
            onDelete={setItemToDelete}
          />
        )
      ) : view === "progress" ? (
        <>
          <button
            onClick={handleBack}
            className="mb-6 inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver al Historial
          </button>
          {runError ? (
            <div
              className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-10 text-center text-sm text-red-400"
              role="alert"
            >
              {runError}
            </div>
          ) : taskId ? (
            <OptimizationProgress
              taskId={taskId}
              onComplete={() => void handleProgressComplete(taskId)}
              onDone={handleProgressDone}
            />
          ) : (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Lanzando optimización…
            </div>
          )}
        </>
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
            <div className="mx-auto max-w-3xl">
              <OptimizationForm
                key={formKey}
                running={running}
                onRun={(request) => void handleRun(request)}
                initial={pendingRequest ?? undefined}
              />
            </div>
          ) : detailLoading || !selectedDetail ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando detalle…
            </div>
          ) : (
            <OptimizationDetailView detail={selectedDetail} />
          )}
        </>
      )}

      <ConfirmDialog
        isOpen={itemToDelete !== null}
        title="Eliminar optimización"
        message={
          itemToDelete
            ? `¿Seguro que deseas eliminar la optimización de ${itemToDelete.symbol} ${itemToDelete.timeframe} con ${itemToDelete.strategy_name}? Esta acción no se puede deshacer.`
            : ""
        }
        onConfirm={() => void handleDeleteConfirm()}
        onCancel={() => setItemToDelete(null)}
        isLoading={deleteLoading}
      />
    </main>
  );
}
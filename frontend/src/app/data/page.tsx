"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";

import ImportModal from "@/components/data/ImportModal";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import FreshnessBadge from "@/components/data/FreshnessBadge";
import { getDataStatus, deleteDataFile, refreshDataFile } from "@/lib/api";
import type { MarketDataFile } from "@/types/data";

function formatSize(mb: number): string {
  if (mb >= 0.1) return `${mb.toFixed(2)} MB`;
  return `${(mb * 1024).toFixed(0)} KB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

export default function DataPage() {
  const [files, setFiles] = useState<MarketDataFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<string | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const data = await getDataStatus();
      setFiles(data);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al obtener los datos."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const handleDelete = useCallback((fileId: string) => {
    setItemToDelete(fileId);
    setDeleteDialogOpen(true);
  }, []);

  const handleCancelDelete = useCallback(() => {
    if (deleteLoading) return;
    setDeleteDialogOpen(false);
    setItemToDelete(null);
  }, [deleteLoading]);

  const executeDelete = useCallback(async () => {
    if (!itemToDelete) return;
    setDeleteLoading(true);
    try {
      await deleteDataFile(itemToDelete);
      await loadData();
      toast.success("Archivo eliminado correctamente.");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al eliminar el archivo."
      );
    } finally {
      setDeleteLoading(false);
      setDeleteDialogOpen(false);
      setItemToDelete(null);
    }
  }, [itemToDelete, loadData]);

  const handleRefresh = useCallback(
    async (fileId: string) => {
      if (refreshingId) return;
      setRefreshingId(fileId);
      try {
        const result = await refreshDataFile(fileId);
        await loadData();
        toast.success(`Añadidas ${result.new_candles} velas nuevas.`);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Error al actualizar los datos."
        );
      } finally {
        setRefreshingId(null);
      }
    },
    [refreshingId, loadData]
  );

  useEffect(() => {
    const initial = setTimeout(() => void loadData(), 0);
    const interval = setInterval(() => void loadData(), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [loadData]);

  const totalSymbols = files.length;
  const freshCount = files.filter((f) => f.freshness_status === "fresh").length;
  const staleCount = files.filter((f) => f.freshness_status === "stale").length;

  const stats = [
    {
      label: "Total Símbolos",
      value: totalSymbols,
      className: "text-slate-50",
    },
    {
      label: "Actualizados",
      value: freshCount,
      className: "text-emerald-400",
    },
    {
      label: "Desactualizados",
      value: staleCount,
      className: "text-red-400",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Gestión de Datos
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Estado de los archivos Parquet e importación de datos históricos
          </p>
        </div>
        <button
          onClick={() => setModalOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500"
        >
          <Download className="h-4 w-4" />
          Importar / Actualizar Datos
        </button>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {stats.map((stat) => (
          <div
            key={stat.label}
            className="rounded-2xl border border-slate-800 bg-slate-900 p-5"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-slate-400">
              {stat.label}
            </p>
            <p className={`mt-2 text-3xl font-bold ${stat.className}`}>
              {loading ? "…" : stat.value}
            </p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-50">
            Archivos de datos
          </h2>
          <span className="text-xs text-slate-500">
            Polling cada 30 segundos
          </span>
        </div>

        {error ? (
          <p className="px-5 py-8 text-center text-sm text-red-400" role="alert">
            {error}
          </p>
        ) : loading && files.length === 0 ? (
          <div className="flex items-center justify-center gap-2 px-5 py-12 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando datos…
          </div>
        ) : files.length === 0 ? (
          <p className="px-5 py-12 text-center text-sm text-slate-400">
            No hay archivos importados todavía. Usa «Importar / Actualizar
            Datos» para empezar.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Símbolo</th>
                  <th className="px-5 py-3 font-medium">Timeframe</th>
                  <th className="px-5 py-3 font-medium">Nº Velas</th>
                  <th className="px-5 py-3 font-medium">Última Vela</th>
                  <th className="px-5 py-3 font-medium">Tamaño</th>
                  <th className="px-5 py-3 font-medium">Estado</th>
                  <th className="px-5 py-3 text-right font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {files.map((file) => (
                  <tr
                    key={file.id}
                    className="border-b border-slate-800/60 last:border-b-0 hover:bg-slate-800/40"
                  >
                    <td className="px-5 py-3 font-medium text-slate-50">
                      {file.symbol}
                    </td>
                    <td className="px-5 py-3 text-slate-300">
                      {file.timeframe}
                    </td>
                    <td className="px-5 py-3 text-slate-300">
                      {file.row_count.toLocaleString("es-ES")}
                    </td>
                    <td className="px-5 py-3 text-slate-400">
                      {formatDate(file.last_candle_at)}
                    </td>
                    <td className="px-5 py-3 text-slate-400">
                      {formatSize(file.file_size_mb)}
                    </td>
                    <td className="px-5 py-3">
                      <FreshnessBadge status={file.freshness_status} />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleRefresh(file.id)}
                          disabled={refreshingId === file.id}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-emerald-500/40 hover:text-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                          aria-label={`Actualizar ${file.symbol} ${file.timeframe}`}
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${refreshingId === file.id ? "animate-spin" : ""}`}
                          />
                          Actualizar
                        </button>
                        <button
                          onClick={() => handleDelete(file.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 py-1.5 text-xs text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
                          aria-label={`Eliminar ${file.symbol} ${file.timeframe}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ImportModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onImported={loadData}
      />

      <ConfirmDialog
        isOpen={deleteDialogOpen}
        title="¿Eliminar archivo de datos?"
        message="Esta acción no se puede deshacer y borrará el histórico de este símbolo/timeframe."
        onConfirm={executeDelete}
        onCancel={handleCancelDelete}
        isLoading={deleteLoading}
      />
    </main>
  );
}
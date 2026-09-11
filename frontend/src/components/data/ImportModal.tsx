"use client";

import { useCallback, useState } from "react";
import { Loader2, Plus, X } from "lucide-react";

import { cn } from "@/lib/utils";
import { importData } from "@/lib/api";
import SymbolSelector from "@/components/ui/SymbolSelector";

const TIMEFRAMES = ["1m", "3m", "5m", "15m", "1h", "4h", "1d", "1W", "1M"];

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

export default function ImportModal({
  open,
  onClose,
  onImported,
}: ImportModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedSymbol, setSelectedSymbol] = useState("");
  const [selectedSymbols, setSelectedSymbols] = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>(["15m", "1h"]);
  const [startDate, setStartDate] = useState("");
  const [taskId, setTaskId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = useCallback(() => {
    if (loading) return;
    setStep(1);
    setError(null);
    setSelectedSymbol("");
    setSelectedSymbols([]);
    onClose();
  }, [loading, onClose]);

  if (!open) return null;

  const toggleTimeframe = (tf: string) => {
    setTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  };

  const handleAddSymbol = () => {
    const sym = selectedSymbol.trim().toUpperCase();
    if (sym && !selectedSymbols.includes(sym)) {
      setSelectedSymbols((prev) => [...prev, sym]);
    }
    setSelectedSymbol("");
  };

  const handleRemoveSymbol = (symbol: string) => {
    setSelectedSymbols((prev) => prev.filter((s) => s !== symbol));
  };

  const handleSubmit = async () => {
    if (selectedSymbols.length === 0) {
      setError("Añade al menos un símbolo a la lista.");
      return;
    }
    if (timeframes.length === 0) {
      setError("Selecciona al menos un timeframe.");
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await importData({
        symbols: selectedSymbols,
        timeframes,
        start_date: startDate,
      });
      setTaskId(result.task_id);
      setStep(2);
      onImported();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al iniciar la importación."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-50">
            {step === 1 ? "Importar / Actualizar Datos" : "Importación en curso"}
          </h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === 1 ? (
          <div className="space-y-5 px-5 py-5">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Símbolos
              </label>
              <div className="flex gap-2">
                <SymbolSelector
                  value={selectedSymbol}
                  onChange={setSelectedSymbol}
                  placeholder="Buscar símbolo..."
                />
                <button
                  type="button"
                  onClick={handleAddSymbol}
                  disabled={!selectedSymbol.trim()}
                  className="shrink-0 rounded-lg bg-emerald-600 px-3 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Añadir símbolo"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
              {/* TODO: Este mismo componente SymbolSelector se usará en Backtest, Optimizer y Monitor */}
            </div>

            {selectedSymbols.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {selectedSymbols.map((sym) => (
                  <span
                    key={sym}
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-400"
                  >
                    {sym}
                    <button
                      type="button"
                      onClick={() => handleRemoveSymbol(sym)}
                      className="ml-0.5 rounded-full p-0.5 text-emerald-400/70 transition hover:bg-emerald-500/20 hover:text-emerald-400"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-300">
                Timeframes
              </span>
              <div className="flex flex-wrap gap-2">
                {TIMEFRAMES.map((tf) => {
                  const selected = timeframes.includes(tf);
                  return (
                    <button
                      key={tf}
                      type="button"
                      onClick={() => toggleTimeframe(tf)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                        selected
                          ? "border-emerald-500/50 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-700 bg-slate-950 text-slate-400 hover:border-slate-600"
                      )}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Fecha de inicio (opcional)
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
              />
              <p className="mt-1 text-xs text-slate-500">
                Vacío = últimos 12 meses.
              </p>
            </div>

            {error && (
              <p className="text-xs text-red-400" role="alert">
                {error}
              </p>
            )}

            <button
              onClick={handleSubmit}
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              Iniciar Importación
            </button>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            <div className="flex items-start gap-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
              <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-emerald-400" />
              <div className="space-y-1">
                <p className="text-sm text-slate-50">
                  Importación en curso en segundo plano. Puedes cerrar este
                  modal.
                </p>
                <p className="break-all font-mono text-xs text-emerald-400">
                  task_id: {taskId}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className="w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
            >
              Cerrar y ver en la tabla
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  Loader2,
  Play,
  Radar,
  Rocket,
  RotateCcw,
} from "lucide-react";

import RegimeTable from "@/components/sweep/RegimeTable";
import SweepHistoryTable from "@/components/sweep/SweepHistoryTable";
import SweepProgress from "@/components/sweep/SweepProgress";
import SweepResultsTables from "@/components/sweep/SweepResultsTables";
import {
  getMarketRegimes,
  getSweepHistory,
  getSweepResults,
  getSweepStatus,
  runMarketRegime,
  runSweep,
} from "@/lib/api";
import { cn } from "@/lib/utils";
import type {
  MarketRegime,
  SweepHistoryItem,
  SweepResultsResponse,
  SweepStatusResponse,
} from "@/types/sweep";

const DEFAULT_TIMEFRAMES = ["5m", "15m", "30m", "1h", "4h", "1d"];
const TIMEFRAME_OPTIONS = ["5m", "15m", "30m", "1h", "4h", "1d"];
const POLL_INTERVAL_MS = 3000;

export default function SweepPage() {
  const [reset, setReset] = useState(false);
  const [timeframes, setTimeframes] = useState<string[]>(DEFAULT_TIMEFRAMES);
  const [status, setStatus] = useState<SweepStatusResponse | null>(null);
  const [results, setResults] = useState<SweepResultsResponse | null>(null);
  const [regimes, setRegimes] = useState<MarketRegime[]>([]);
  const [history, setHistory] = useState<SweepHistoryItem[]>([]);

  const [starting, setStarting] = useState(false);
  const [regimeLoading, setRegimeLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(true);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isRunning = status?.status === "running";

  const loadStatus = useCallback(async () => {
    try {
      const s = await getSweepStatus();
      setStatus(s);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al consultar el estado."
      );
    } finally {
      setStatusLoading(false);
    }
  }, []);

  const loadResults = useCallback(async () => {
    try {
      setResults(await getSweepResults());
    } catch {
      // silencioso: los resultados pueden no existir todavía
    }
  }, []);

  const loadRegimes = useCallback(async () => {
    try {
      const res = await getMarketRegimes();
      setRegimes(res.regimes ?? []);
    } catch {
      // silencioso
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      setHistory(await getSweepHistory(20));
    } catch {
      // silencioso
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadStatus();
      void loadResults();
      void loadRegimes();
      void loadHistory();
    }, 0);
    return () => {
      clearTimeout(timer);
      stopPolling();
    };
  }, [loadStatus, loadResults, loadRegimes, loadHistory, stopPolling]);

  useEffect(() => {
    if (isRunning) {
      stopPolling();
      pollRef.current = setInterval(() => void loadStatus(), POLL_INTERVAL_MS);
    } else {
      stopPolling();
    }
  }, [isRunning, loadStatus, stopPolling]);

  useEffect(() => {
    if (status?.status === "completed") {
      const timer = setTimeout(() => {
        void loadResults();
        void loadRegimes();
        void loadHistory();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [status?.status, loadResults, loadRegimes, loadHistory]);

  const handleRun = async () => {
    setStarting(true);
    setError(null);
    try {
      await runSweep({ reset, timeframes, symbols: [] });
      await loadStatus();
      await loadHistory();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al lanzar el sweep."
      );
    } finally {
      setStarting(false);
    }
  };

  const handleRegime = async () => {
    setRegimeLoading(true);
    setError(null);
    try {
      const res = await runMarketRegime({ symbols: [], timeframes });
      setRegimes(res.regimes ?? []);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al lanzar el análisis de régimen."
      );
    } finally {
      setRegimeLoading(false);
    }
  };

  const toggleTimeframe = (tf: string) => {
    setTimeframes((prev) =>
      prev.includes(tf) ? prev.filter((t) => t !== tf) : [...prev, tf]
    );
  };

  const btnClass =
    "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition";

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Strategy Discovery
        </h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Barrido masivo (símbolo × timeframe × estrategia) con validación
          IS/OOS, confirmación full-window y validación hold-out para descubrir
          estrategias <em>robustas</em> y descartar las que <em>NO</em> usar.
        </p>
      </header>

      {error && (
        <div
          className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}

      {statusLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Consultando estado del motor…
        </div>
      ) : (
        <div className="space-y-8">
          <section className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-50">
                <Rocket className="h-4 w-4 text-emerald-400" />
                Lanzar sweep
              </h2>

              <div className="mb-4 space-y-2">
                <label className="text-xs font-medium uppercase tracking-wide text-slate-400">
                  Timeframes
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIMEFRAME_OPTIONS.map((tf) => (
                    <button
                      key={tf}
                      onClick={() => toggleTimeframe(tf)}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-xs font-semibold transition",
                        timeframes.includes(tf)
                          ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                          : "border-slate-700 bg-slate-950 text-slate-400 hover:text-slate-200"
                      )}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>

              <label className="mb-4 flex cursor-pointer items-center gap-3 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3">
                <button
                  role="switch"
                  aria-checked={reset}
                  onClick={() => setReset(!reset)}
                  className={cn(
                    "relative h-5 w-9 rounded-full transition",
                    reset ? "bg-emerald-500" : "bg-slate-700"
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all",
                      reset ? "left-[18px]" : "left-0.5"
                    )}
                  />
                </button>
                <span>
                  <span className="block text-sm font-medium text-slate-200">
                    Reset 6M
                  </span>
                  <span className="block text-xs text-slate-500">
                    Borrar todos los datos del universo e importar 6 meses desde
                    cero. Desactivado = resume (solo importa lo que falta).
                  </span>
                </span>
              </label>

              <button
                onClick={() => void handleRun()}
                disabled={starting || isRunning}
                className={cn(
                  btnClass,
                  "w-full",
                  starting || isRunning
                    ? "cursor-not-allowed bg-slate-800 text-slate-500"
                    : "bg-emerald-600 text-slate-950 hover:bg-emerald-500"
                )}
              >
                {starting || isRunning ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {isRunning ? "Sweep en curso…" : starting ? "Lanzando…" : "Iniciar sweep"}
              </button>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
              <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-slate-50">
                <Radar className="h-4 w-4 text-sky-400" />
                Análisis de régimen de mercado
              </h2>
              <p className="mb-4 text-xs leading-relaxed text-slate-400">
                Clasifica cada símbolo/timeframe en régimen (tendencia alcista,
                bajista, lateral o volátil) usando SMAs, volatilidad y volumen.
                Útil para cruzar con los resultados del sweep y decidir qué
                estrategia aplicar en cada régimen.
              </p>
              <button
                onClick={() => void handleRegime()}
                disabled={regimeLoading}
                className={cn(
                  btnClass,
                  "w-full",
                  regimeLoading
                    ? "cursor-not-allowed bg-slate-800 text-slate-500"
                    : "bg-sky-600 text-slate-950 hover:bg-sky-500"
                )}
              >
                {regimeLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Radar className="h-4 w-4" />
                )}
                {regimeLoading ? "Analizando…" : "Analizar regímenes"}
              </button>
            </div>
          </section>

          {isRunning && status && <SweepProgress status={status} />}

          {status?.status === "completed" && (
            <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3 text-sm text-emerald-400">
              <RotateCcw className="h-4 w-4" />
              Sweep completado. Resultados disponibles abajo.
            </div>
          )}

          <section className="space-y-4">
            <h2 className="flex items-center gap-2 text-lg font-bold text-slate-50">
              <FlaskConical className="h-5 w-5 text-emerald-400" />
              Resultados del sweep
            </h2>
            <SweepResultsTables
              data={
                results ?? { results: [], summary: [], no_go: [] as never[] }
              }
            />
          </section>

          {regimes.length > 0 && (
            <section className="space-y-4">
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-50">
                <Radar className="h-5 w-5 text-sky-400" />
                Régimen de mercado
              </h2>
              <RegimeTable regimes={regimes} />
            </section>
          )}

          {history.length > 0 && (
            <section className="space-y-4">
              <SweepHistoryTable items={history} />
            </section>
          )}
        </div>
      )}
    </main>
  );
}
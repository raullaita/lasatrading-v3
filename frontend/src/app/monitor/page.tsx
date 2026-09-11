"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Bell,
  BellOff,
  Loader2,
  Pause,
  Play,
  Plus,
  Radio,
  Signal,
  Trash2,
  TriangleAlert,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  createPriceAlert,
  deletePriceAlert,
  getMonitorJobs,
  getPriceAlerts,
  getSignals,
  getStrategies,
  testTelegram,
  toggleStrategy,
} from "@/lib/api";
import type { MonitorJob, SignalLog, PriceAlert } from "@/types/monitor";
import type { UserStrategy } from "@/types/portfolio";

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "Ninguna";
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

export default function MonitorPage() {
  const [jobs, setJobs] = useState<MonitorJob[]>([]);
  const [strategies, setStrategies] = useState<UserStrategy[]>([]);
  const [signals, setSignals] = useState<SignalLog[]>([]);
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [alertSymbol, setAlertSymbol] = useState("");
  const [alertCondition, setAlertCondition] = useState<">" | "<">(">");
  const [alertPrice, setAlertPrice] = useState("");
  const [creatingAlert, setCreatingAlert] = useState(false);

  const [telegramState, setTelegramState] = useState<
    "idle" | "testing" | "success" | "unconfigured" | "error"
  >("idle");

  const loadData = useCallback(async () => {
    try {
      const [activeStrategies, monitorJobs, signalList, alertList] =
        await Promise.all([
          getStrategies(true),
          getMonitorJobs(),
          getSignals(50),
          getPriceAlerts(),
        ]);
      setStrategies(activeStrategies);
      setJobs(monitorJobs);
      setSignals(signalList);
      setAlerts(alertList);
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los datos."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void loadData(), 0);
    const interval = setInterval(() => void loadData(), 30000);
    return () => {
      clearTimeout(initial);
      clearInterval(interval);
    };
  }, [loadData]);

  const jobByStrategy = useMemo(() => {
    const map = new Map<string, MonitorJob>();
    for (const job of jobs) map.set(job.user_strategy_id, job);
    return map;
  }, [jobs]);

  const activeJobs = useMemo(
    () => strategies.filter((s) => (jobByStrategy.get(s.id)?.status ?? "idle") !== "paused"),
    [strategies, jobByStrategy]
  );

  const handleToggle = async (strategy: UserStrategy) => {
    try {
      const updated = await toggleStrategy(strategy.id);
      setStrategies((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s))
      );
      const refreshedJobs = await getMonitorJobs();
      setJobs(refreshedJobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar el estado.");
    }
  };

  const handleCreateAlert = async () => {
    const price = parseFloat(alertPrice);
    if (!alertSymbol.trim() || Number.isNaN(price) || price <= 0) {
      setError("Introduce un símbolo y un precio válido.");
      return;
    }
    setCreatingAlert(true);
    setError(null);
    try {
      const created = await createPriceAlert({
        symbol: alertSymbol.trim().toUpperCase(),
        condition: alertCondition,
        target_price: price,
      });
      setAlerts((prev) => [created, ...prev]);
      setAlertSymbol("");
      setAlertPrice("");
      setAlertCondition(">");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo crear la alerta.");
    } finally {
      setCreatingAlert(false);
    }
  };

  const handleDeleteAlert = async (id: string) => {
    try {
      await deletePriceAlert(id);
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo borrar la alerta.");
    }
  };

  const handleTestTelegram = async () => {
    setTelegramState("testing");
    try {
      const result = await testTelegram();
      setTelegramState(result.sent ? "success" : "unconfigured");
      setError(null);
    } catch (err) {
      setTelegramState("error");
      setError(
        err instanceof Error ? err.message : "No se pudo enviar el mensaje de prueba."
      );
    }
  };

  const runningCount = activeJobs.length;
  const activeAlertCount = alerts.filter((a) => a.is_active).length;

  const summaryCards = [
    {
      label: "Jobs Activos",
      value: runningCount,
      icon: <Activity className="h-4 w-4" />,
      className: "text-emerald-400",
    },
    {
      label: "Señales",
      value: signals.length,
      icon: <Signal className="h-4 w-4" />,
      className: "text-slate-50",
    },
    {
      label: "Alertas Activas",
      value: activeAlertCount,
      icon: <Bell className="h-4 w-4" />,
      className: "text-amber-400",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Monitor y Alertas
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Vigilancia en vivo del mercado con notificaciones por Telegram
          </p>
        </div>
        <button
          onClick={() => void handleTestTelegram()}
          disabled={telegramState === "testing"}
          className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-400 transition hover:bg-sky-500/20 disabled:opacity-60"
        >
          {telegramState === "testing" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Radio className="h-4 w-4" />
          )}
          Probar Telegram
        </button>
      </header>

      {telegramState === "success" && (
        <div
          className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-400"
          role="status"
        >
          Telegram conectado correctamente. Mensaje de prueba enviado.
        </div>
      )}
      {telegramState === "unconfigured" && (
        <div
          className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-5 py-4 text-sm text-amber-400"
          role="status"
        >
          Telegram no configurado: define TELEGRAM_BOT_TOKEN y TELEGRAM_CHAT_ID en el .env.
        </div>
      )}

      {error && (
        <div
          className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
          role="alert"
        >
          {error}
        </div>
      )}

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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-50">
                Jobs Activos
              </h2>
              <span className="text-xs text-slate-500">Polling cada 30s</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : activeJobs.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-400">
                No hay jobs activos. Activa una estrategia en el Portafolio.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {activeJobs.map((strategy) => {
                  const job = jobByStrategy.get(strategy.id);
                  const status = job?.status ?? "idle";
                  return (
                    <li
                      key={strategy.id}
                      className="flex items-center justify-between gap-3 px-5 py-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-slate-50">
                          {strategy.name}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-400">
                          {strategy.symbol} · {strategy.timeframe} ·{" "}
                          {strategy.base_strategy_name}
                        </p>
                        <p className="mt-1 flex items-center gap-1.5 text-xs">
                          {status === "running" ? (
                            <span className="flex items-center gap-1 font-medium text-emerald-400">
                              <Activity className="h-3 w-3" /> Running
                            </span>
                          ) : status === "error" ? (
                            <span className="flex items-center gap-1 font-medium text-red-400">
                              <TriangleAlert className="h-3 w-3" /> Error
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 font-medium text-amber-400">
                              <span className="h-2 w-2 rounded-full bg-amber-400" />
                              {status}
                            </span>
                          )}
                          <span className="text-slate-500">
                            · Última señal: {formatDateTime(job?.last_signal_at)}
                          </span>
                        </p>
                      </div>
                      <button
                        onClick={() => void handleToggle(strategy)}
                        title={strategy.is_active ? "Pausar" : "Reanudar"}
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700 text-slate-300 transition hover:bg-slate-800"
                      >
                        {strategy.is_active ? (
                          <Pause className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section className="space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-50">
                Feed de Señales
              </h2>
              <span className="text-xs text-slate-500">Últimas 50</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 px-6 py-12 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" />
                Cargando…
              </div>
            ) : signals.length === 0 ? (
              <p className="px-6 py-12 text-center text-sm text-slate-400">
                Aún no hay señales registradas.
              </p>
            ) : (
              <ul className="divide-y divide-slate-800">
                {signals.map((signal) => (
                  <li
                    key={signal.id}
                    className="flex items-start justify-between gap-3 px-5 py-3"
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "mt-1 h-2.5 w-2.5 shrink-0 rounded-full",
                          signal.signal_type === "buy"
                            ? "bg-emerald-400"
                            : "bg-red-400"
                        )}
                      />
                      <div>
                        <p className="text-sm text-slate-200">
                          <span
                            className={cn(
                              "font-semibold uppercase",
                              signal.signal_type === "buy"
                                ? "text-emerald-400"
                                : "text-red-400"
                            )}
                          >
                            {signal.signal_type === "buy" ? "Buy" : "Sell"}
                          </span>
                          <span className="mx-1.5">·</span>
                          <span className="font-semibold text-slate-50">
                            {signal.symbol}
                          </span>
                          <span className="text-slate-400">
                            {" "}
                            {signal.signal_type === "buy" ? "▲" : "▼"} {signal.price.toFixed(4)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {signal.strategy_name} · {signal.timeframe}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-xs text-slate-400">
                        {formatTime(signal.timestamp)}
                      </p>
                      {signal.telegram_sent ? (
                        <p className="mt-0.5 text-[10px] text-emerald-400">
                          Telegram enviado
                        </p>
                      ) : null}
                      <button
                        onClick={() => console.log("Registrar en Journal", signal.id)}
                        className="mt-1 rounded-md border border-slate-700 px-2 py-1 text-[10px] font-medium text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
                      >
                        Registrar en Journal
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900">
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-50">
            Alertas de Precio
          </h2>
          <span className="text-xs text-slate-500">
            {activeAlertCount} activa{alerts.length === 1 ? "" : "s"}
          </span>
        </div>

        <div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Símbolo
            </label>
            <input
              value={alertSymbol}
              onChange={(e) => setAlertSymbol(e.target.value)}
              placeholder="BTCUSDT"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <div className="w-28">
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Condición
            </label>
            <select
              value={alertCondition}
              onChange={(e) => setAlertCondition(e.target.value as ">" | "<")}
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500 focus:outline-none"
            >
              <option value=">">Superior a (&gt;)</option>
              <option value="<">Inferior a (&lt;)</option>
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1 block text-xs font-medium text-slate-400">
              Precio objetivo
            </label>
            <input
              value={alertPrice}
              onChange={(e) => setAlertPrice(e.target.value)}
              placeholder="0.00"
              inputMode="decimal"
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>
          <button
            onClick={() => void handleCreateAlert()}
            disabled={creatingAlert}
            className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {creatingAlert ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Crear Alerta
          </button>
        </div>

        {alerts.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-slate-400">
            No hay alertas de precio configuradas.
          </p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className="flex items-center justify-between gap-3 px-5 py-3"
              >
                <div className="flex items-center gap-3">
                  {alert.is_active ? (
                    <Bell className="h-4 w-4 text-amber-400" />
                  ) : (
                    <BellOff className="h-4 w-4 text-slate-600" />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-slate-50">
                      {alert.symbol}
                      <span className="ml-2 font-normal text-slate-300">
                        {alert.condition} {alert.target_price.toLocaleString("es-ES")}
                      </span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Última activación: {formatDateTime(alert.last_triggered_at)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => void handleDeleteAlert(alert.id)}
                  className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-700 text-slate-400 transition hover:border-red-500/40 hover:text-red-400"
                  aria-label={`Eliminar alerta de ${alert.symbol}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
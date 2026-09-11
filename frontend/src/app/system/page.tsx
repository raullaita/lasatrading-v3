"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2,
  Database,
  HardDrive,
  Loader2,
  Radio,
  Save,
  ScrollText,
  Server,
  Settings2,
  TriangleAlert,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  getSystemConfig,
  getSystemHealth,
  getSystemLogs,
  testSystemTelegram,
  updateSystemConfig,
} from "@/lib/api";
import type {
  LogLevel,
  ServiceStatus,
  SystemConfig,
  SystemHealth,
  SystemLogEntry,
} from "@/types/system";

type ActiveTab = "config" | "health" | "logs";

const LOG_LEVELS: LogLevel[] = ["INFO", "WARNING", "ERROR"];

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("es-ES", {
    dateStyle: "short",
    timeStyle: "medium",
  });
}

function LevelBadge({ level }: { level: LogLevel }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        level === "INFO" && "bg-emerald-500/10 text-emerald-400",
        level === "WARNING" && "bg-amber-500/10 text-amber-400",
        level === "ERROR" && "bg-red-500/10 text-red-400"
      )}
    >
      {level}
    </span>
  );
}

function HealthCard({
  title,
  icon,
  status,
}: {
  title: string;
  icon: React.ReactNode;
  status?: ServiceStatus;
}) {
  const ok = status?.status === "ok";
  const warning = status?.status === "warning";

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="text-slate-400">{icon}</span>
          <h3 className="text-sm font-semibold text-slate-50">{title}</h3>
        </div>
        {status ? (
          ok ? (
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          ) : warning ? (
            <TriangleAlert className="h-5 w-5 text-amber-400" />
          ) : (
            <XCircle className="h-5 w-5 text-red-400" />
          )
        ) : (
          <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
        )}
      </div>
      <p
        className={cn(
          "mt-3 text-sm",
          ok ? "text-slate-300" : warning ? "text-amber-300" : "text-red-300"
        )}
      >
        {title === "Base de Datos" && ok && status?.latency_ms !== undefined
          ? `Conectado · Latencia: ${status.latency_ms}ms`
          : title === "Redis" && ok
            ? "Conectado"
            : title === "Disco" && (ok || warning)
              ? `Libre: ${status?.free_gb} GB · Usado: ${status?.percent_used}%`
              : title === "Binance API" && ok
                ? "API disponible"
                : title === "Telegram" && ok
                  ? "Configurado"
                  : status?.error ?? "No disponible"}
      </p>
    </div>
  );
}

export default function SystemPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>("config");

  const [config, setConfig] = useState<SystemConfig | null>(null);
  const [initialCapital, setInitialCapital] = useState("");
  const [riskPercent, setRiskPercent] = useState("");
  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChatId, setTelegramChatId] = useState("");
  const [maskedToken, setMaskedToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [testingTelegram, setTestingTelegram] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [configMessage, setConfigMessage] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(true);

  const [health, setHealth] = useState<SystemHealth | null>(null);

  const [levelFilter, setLevelFilter] = useState<"" | LogLevel>("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [logs, setLogs] = useState<SystemLogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [logsError, setLogsError] = useState<string | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const data = await getSystemConfig();
      setConfig(data);
      setInitialCapital(String(data.trading.initial_capital ?? ""));
      setRiskPercent(String(data.trading.risk_percent ?? ""));
      setTelegramToken(data.notifications.telegram_token ?? "");
      setTelegramChatId(data.notifications.telegram_chat_id ?? "");
      setMaskedToken(data.notifications.telegram_token ?? "");
      setConfigError(null);
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : "No se pudo cargar la configuración."
      );
    } finally {
      setConfigLoading(false);
    }
  }, []);

  const loadHealth = useCallback(async () => {
    try {
      const data = await getSystemHealth();
      setHealth(data);
    } catch {
      setHealth(null);
    }
  }, []);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const data = await getSystemLogs({
        level: levelFilter || undefined,
        module: moduleFilter || undefined,
        limit: 50,
      });
      setLogs(data);
      setLogsError(null);
    } catch (err) {
      setLogsError(
        err instanceof Error ? err.message : "No se pudieron cargar los logs."
      );
    } finally {
      setLogsLoading(false);
    }
  }, [levelFilter, moduleFilter]);

  useEffect(() => {
    const t1 = setTimeout(() => void loadConfig(), 0);
    const t2 = setTimeout(() => void loadHealth(), 0);
    const healthInterval = setInterval(() => void loadHealth(), 30000);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearInterval(healthInterval);
    };
  }, [loadConfig, loadHealth]);

  useEffect(() => {
    const initial = setTimeout(() => void loadLogs(), 0);
    return () => clearTimeout(initial);
  }, [loadLogs]);

  const modules = Array.from(new Set(logs.map((log) => log.module))).sort();

  const handleSave = async () => {
    const capital = Number(initialCapital);
    const risk = Number(riskPercent);
    setConfigError(null);
    setConfigMessage(null);

    if (Number.isNaN(capital) || capital < 0) {
      setConfigError("El capital inicial debe ser un número válido.");
      return;
    }
    if (Number.isNaN(risk) || risk < 0 || risk > 100) {
      setConfigError("El riesgo debe estar entre 0 y 100.");
      return;
    }

    setSaving(true);
    try {
      const updates: Record<string, string | number> = {
        "trading.initial_capital": capital,
        "trading.risk_percent": risk,
        "notifications.telegram_chat_id": telegramChatId.trim(),
      };
      if (telegramToken !== maskedToken) {
        updates["notifications.telegram_token"] = telegramToken.trim();
        if (!updates["notifications.telegram_token"]) {
          setConfigError("El token de Telegram no puede quedar vacío.");
          setSaving(false);
          return;
        }
      }
      const updated = await updateSystemConfig(updates);
      const newMaskedToken = updated.notifications.telegram_token ?? "";
      setConfig(updated);
      setMaskedToken(newMaskedToken);
      setTelegramToken(newMaskedToken);
      setTelegramChatId(String(updated.notifications.telegram_chat_id ?? ""));
      setConfigMessage("Configuración guardada correctamente.");
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : "No se pudieron guardar los cambios."
      );
    } finally {
      setSaving(false);
    }
  };

  const handleTestTelegram = async () => {
    setConfigError(null);
    setConfigMessage(null);
    setTestingTelegram(true);
    try {
      const result = await testSystemTelegram();
      if (result.sent) {
        setConfigMessage(result.message);
      } else {
        setConfigError(result.message);
      }
    } catch (err) {
      setConfigError(
        err instanceof Error ? err.message : "No se pudo enviar el mensaje de prueba."
      );
    } finally {
      setTestingTelegram(false);
    }
  };

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: "config", label: "Configuración", icon: <Settings2 className="h-4 w-4" /> },
    { id: "health", label: "Estado del Sistema", icon: <Server className="h-4 w-4" /> },
    { id: "logs", label: "Logs", icon: <ScrollText className="h-4 w-4" /> },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Configuración y Sistema
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Credenciales, salud del sistema y registro de eventos
        </p>
      </header>

      <div className="mb-8 flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition",
              activeTab === tab.id
                ? "bg-slate-800 text-slate-50"
                : "text-slate-400 hover:text-slate-200"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "config" && (
        <>
          {configMessage && (
            <div
              className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm text-emerald-400"
              role="status"
            >
              {configMessage}
            </div>
          )}
          {configError && (
            <div
              className="mb-6 rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
              role="alert"
            >
              {configError}
            </div>
          )}

          {configLoading ? (
            <div className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando configuración…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <section className="rounded-2xl border border-slate-800 bg-slate-900">
                <div className="border-b border-slate-800 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-50">Trading</h2>
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Capital Inicial (USDT)
                    </label>
                    <input
                      value={initialCapital}
                      onChange={(e) => setInitialCapital(e.target.value)}
                      inputMode="decimal"
                      placeholder="10000"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Riesgo % por operación
                    </label>
                    <input
                      value={riskPercent}
                      onChange={(e) => setRiskPercent(e.target.value)}
                      inputMode="decimal"
                      placeholder="1.0"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-800 bg-slate-900">
                <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
                  <h2 className="text-sm font-semibold text-slate-50">
                    Notificaciones
                  </h2>
                  {config?.notifications.telegram_is_configured ? (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> Configurado
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[10px] font-medium text-amber-400">
                      <TriangleAlert className="h-3 w-3" /> Sin configurar
                    </span>
                  )}
                </div>
                <div className="space-y-4 p-5">
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Bot Token
                    </label>
                    <input
                      value={telegramToken}
                      onChange={(e) => setTelegramToken(e.target.value)}
                      type="password"
                      placeholder="123456:ABC…"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                    <p className="mt-1 text-[10px] text-slate-500">
                      El token se muestra enmascarado por seguridad.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-400">
                      Chat ID
                    </label>
                    <input
                      value={telegramChatId}
                      onChange={(e) => setTelegramChatId(e.target.value)}
                      placeholder="-100123456789"
                      className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-500 focus:border-emerald-500 focus:outline-none"
                    />
                  </div>
                  <button
                    onClick={() => void handleTestTelegram()}
                    disabled={testingTelegram}
                    className="flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2.5 text-sm font-semibold text-sky-400 transition hover:bg-sky-500/20 disabled:opacity-60"
                  >
                    {testingTelegram ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Radio className="h-4 w-4" />
                    )}
                    Probar Telegram
                  </button>
                </div>
              </section>
            </div>
          )}

          {!configLoading && (
            <div className="mt-6 flex justify-end">
              <button
                onClick={() => void handleSave()}
                disabled={saving}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar Cambios
              </button>
            </div>
          )}
        </>
      )}

      {activeTab === "health" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <HealthCard title="Base de Datos" icon={<Database className="h-4 w-4" />} status={health?.database} />
          <HealthCard title="Redis" icon={<Server className="h-4 w-4" />} status={health?.redis} />
          <HealthCard title="Disco" icon={<HardDrive className="h-4 w-4" />} status={health?.disk_space} />
          <HealthCard title="Binance API" icon={<Radio className="h-4 w-4" />} status={health?.binance_api} />
          <HealthCard title="Telegram" icon={<ScrollText className="h-4 w-4" />} status={health?.telegram} />
        </div>
      )}

      {activeTab === "logs" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900">
          <div className="flex flex-col gap-3 border-b border-slate-800 p-5 sm:flex-row sm:items-end">
            <div className="sm:w-48">
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Nivel
              </label>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as "" | LogLevel)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Todos</option>
                {LOG_LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {level}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:w-48">
              <label className="mb-1 block text-xs font-medium text-slate-400">
                Módulo
              </label>
              <select
                value={moduleFilter}
                onChange={(e) => setModuleFilter(e.target.value)}
                className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500 focus:outline-none"
              >
                <option value="">Todos</option>
                {modules.map((module) => (
                  <option key={module} value={module}>
                    {module}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {logsLoading ? (
            <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              Cargando logs…
            </div>
          ) : logsError ? (
            <p className="px-6 py-16 text-center text-sm text-red-400" role="alert">
              {logsError}
            </p>
          ) : logs.length === 0 ? (
            <p className="px-6 py-16 text-center text-sm text-slate-400">
              No hay logs registrados en este periodo
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-5 py-3 font-medium">Timestamp</th>
                    <th className="px-5 py-3 font-medium">Nivel</th>
                    <th className="px-5 py-3 font-medium">Módulo</th>
                    <th className="px-5 py-3 font-medium">Mensaje</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40">
                      <td className="whitespace-nowrap px-5 py-3 text-xs text-slate-400">
                        {formatDateTime(log.timestamp)}
                      </td>
                      <td className="px-5 py-3">
                        <LevelBadge level={log.level} />
                      </td>
                      <td className="px-5 py-3 font-medium text-slate-300">
                        {log.module}
                      </td>
                      <td className="px-5 py-3 text-slate-300">{log.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
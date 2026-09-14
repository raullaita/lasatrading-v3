"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  Cpu,
  Loader2,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  X,
} from "lucide-react";

import { getDataStatus, getStrategiesCatalog } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ExitRules } from "@/types/backtest";
import type { CreateStrategyPayload } from "@/types/portfolio";
import type {
  ParameterSchema,
  StrategyCatalogItem,
} from "@/types/strategies";

const SL_TYPES = [
  { value: "atr_multiplier", label: "ATR (multiplicador)", step: 0.1 },
  { value: "fixed_percent", label: "% fijo", step: 0.01 },
];

const TP_TYPES = [
  { value: "risk_reward_ratio", label: "Ratio riesgo/recompensa", step: 0.1 },
  { value: "fixed_percent", label: "% fijo", step: 0.01 },
];

const RISK_TYPES = [
  { value: "percent_risk", label: "% del capital" },
  { value: "fixed_units", label: "Unidades fijas" },
];

interface StrategyModalProps {
  strategy: CreateStrategyPayload & { id?: string } | null;
  onClose: () => void;
  onSave: (data: Omit<CreateStrategyPayload, "is_active">) => Promise<void>;
}

function SectionTitle({
  number,
  title,
  icon,
  description,
}: {
  number: number;
  title: string;
  icon: ReactNode;
  description?: string;
}) {
  return (
    <div className="mb-3">
      <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] text-emerald-400">
          {number}
        </span>
        {icon}
        {title}
      </h2>
      {description && (
        <p className="mt-1 pl-7 text-[11px] text-slate-500">{description}</p>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  helper,
  step,
}: {
  label: string;
  value: number | string;
  onChange: (value: number) => void;
  helper?: string;
  step?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-300">
        {label}
      </label>
      <input
        type="number"
        value={value}
        step={step ?? "any"}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
      />
      {helper && <p className="mt-1 text-[11px] text-slate-500">{helper}</p>}
    </div>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div>
      {label && (
        <label className="mb-1.5 block text-xs font-medium text-slate-300">
          {label}
        </label>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 disabled:opacity-50 focus:border-emerald-500/50 focus:outline-none"
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function defaultParams(
  schema: Record<string, ParameterSchema>,
): Record<string, number> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, s]) => [
      key,
      typeof s.default === "number" ? s.default : 0,
    ]),
  );
}

export default function StrategyModal({
  strategy,
  onClose,
  onSave,
}: StrategyModalProps) {
  const [catalog, setCatalog] = useState<StrategyCatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [name, setName] = useState(strategy?.name ?? "");
  const [baseStrategyName, setBaseStrategyName] = useState(
    strategy?.base_strategy_name ?? "",
  );
  const [symbol, setSymbol] = useState(strategy?.symbol ?? "");
  const [timeframe, setTimeframe] = useState(strategy?.timeframe ?? "");
  const [patternParams, setPatternParams] = useState<Record<string, number>>(
    strategy?.pattern_params ?? {},
  );
  const [exitRules, setExitRules] = useState<ExitRules>(
    strategy?.exit_rules ?? {
      stop_loss_type: "atr_multiplier",
      stop_loss_value: 1.5,
      take_profit_type: "risk_reward_ratio",
      take_profit_value: 2.0,
    },
  );
  const [riskType, setRiskType] = useState(
    strategy?.risk_management?.type ?? "percent_risk",
  );
  const [riskValue, setRiskValue] = useState(
    strategy?.risk_management?.value ?? 2.0,
  );

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedStrategy = catalog.find((s) => s.name === baseStrategyName);

  useEffect(() => {
    let cancelled = false;
    getStrategiesCatalog()
      .then((items) => {
        if (cancelled) return;
        setCatalog(items);
        if (!strategy && baseStrategyName === "" && items.length > 0) {
          const first = items[0];
          setBaseStrategyName(first.name);
          setPatternParams(defaultParams(first.parameters_schema));
        }
      })
      .catch(() => {
        if (!cancelled)
          setCatalogError("No se pudo cargar el catálogo de estrategias.");
      })
      .finally(() => {
        if (!cancelled) setCatalogLoading(false);
      });

    getDataStatus()
      .then((data) => {
        if (cancelled) return;
        const nextSymbols = [...new Set(data.map((d) => d.symbol))];
        const nextTimeframes = [...new Set(data.map((d) => d.timeframe))];
        setSymbols(nextSymbols);
        setTimeframes(nextTimeframes);
        if (symbol === "" && nextSymbols.length > 0) setSymbol(nextSymbols[0]);
        if (timeframe === "" && nextTimeframes.length > 0)
          setTimeframe(nextTimeframes[0]);
      })
      .catch(() => {
        if (!cancelled)
          setDataError("No se pudieron cargar los datos importados.");
      })
      .finally(() => {
        if (!cancelled) setSymbolsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStrategyChange = (newName: string) => {
    const item = catalog.find((s) => s.name === newName);
    setBaseStrategyName(newName);
    if (item) {
      setPatternParams(defaultParams(item.parameters_schema));
    } else {
      setPatternParams({});
    }
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!selectedStrategy) {
      setError("Selecciona una estrategia base.");
      return;
    }
    if (!symbol.trim()) {
      setError("Selecciona un símbolo.");
      return;
    }
    if (!timeframe.trim()) {
      setError("Selecciona un timeframe.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        base_strategy_name: baseStrategyName,
        symbol: symbol.toUpperCase(),
        timeframe,
        pattern_params: patternParams,
        exit_rules: exitRules,
        risk_management: { type: riskType, value: riskValue },
      });
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al guardar la estrategia.",
      );
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
            {strategy ? "Editar Estrategia" : "Añadir Estrategia"}
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-6 px-6 py-5">
          {catalogLoading ? (
            <div className="flex items-center justify-center gap-2 py-10">
              <Loader2 className="h-5 w-5 animate-spin text-emerald-400" />
              <p className="text-sm text-slate-400">Cargando catálogo…</p>
            </div>
          ) : catalogError ? (
            <p className="text-sm text-red-400" role="alert">
              {catalogError}
            </p>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-300">
                  Nombre
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: BTC 15m RSI - Rank 1"
                  className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-slate-500">
                  Nombre descriptivo para identificar esta configuración
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {dataError && (
                  <p className="col-span-2 text-xs text-red-400" role="alert">
                    {dataError}
                  </p>
                )}
                {!dataError && !symbolsLoading && symbols.length === 0 && (
                  <p className="col-span-2 text-xs text-yellow-400">
                    No hay datos importados. Ve al Módulo de Datos para importar.
                  </p>
                )}
                <SelectField
                  label="Símbolo"
                  value={symbol}
                  onChange={setSymbol}
                  disabled={symbolsLoading || symbols.length === 0}
                  options={symbols.map((s) => ({ value: s, label: s }))}
                />
                <SelectField
                  label="Timeframe"
                  value={timeframe}
                  onChange={setTimeframe}
                  disabled={symbolsLoading || timeframes.length === 0}
                  options={timeframes.map((t) => ({ value: t, label: t }))}
                />
              </div>

              <div>
                <SectionTitle
                  number={1}
                  title="Estrategia base"
                  icon={<Cpu className="h-3.5 w-3.5 text-emerald-400" />}
                  description="Selecciona el algoritmo de análisis técnico. Los parámetros se actualizarán según la estrategia elegida."
                />
                <SelectField
                  label="Estrategia"
                  value={baseStrategyName}
                  onChange={handleStrategyChange}
                  options={catalog.map((s) => ({
                    value: s.name,
                    label: s.display_name,
                  }))}
                />
                {selectedStrategy && (
                  <p className="mt-1.5 text-[11px] text-slate-500">
                    {selectedStrategy.description}
                  </p>
                )}
              </div>

              {selectedStrategy &&
                Object.keys(selectedStrategy.parameters_schema).length > 0 && (
                  <div>
                    <SectionTitle
                      number={2}
                      title="Parámetros del patrón"
                      icon={
                        <SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />
                      }
                      description="Ajusta los valores óptimos que definieron el rendimiento de la optimización."
                    />
                    <div className="grid grid-cols-2 gap-3">
                      {Object.entries(selectedStrategy.parameters_schema).map(
                        ([key, schema]) => (
                          <NumberField
                            key={key}
                            label={key}
                            value={patternParams[key] ?? schema.default ?? 0}
                            helper={schema.description}
                            onChange={(value) =>
                              setPatternParams((prev) => ({
                                ...prev,
                                [key]: value,
                              }))
                            }
                          />
                        ),
                      )}
                    </div>
                  </div>
                )}

              <div>
                <SectionTitle
                  number={
                    selectedStrategy &&
                    Object.keys(selectedStrategy.parameters_schema).length > 0
                      ? 3
                      : 2
                  }
                  title="Reglas de salida"
                  icon={
                    <TrendingDown className="h-3.5 w-3.5 text-emerald-400" />
                  }
                  description="Define cuándo cerrar una posición. SL limita pérdidas, TP fija el objetivo de ganancia."
                />
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label="Stop Loss"
                    value={exitRules.stop_loss_type}
                    onChange={(value) =>
                      setExitRules((prev) => ({
                        ...prev,
                        stop_loss_type: value,
                      }))
                    }
                    options={SL_TYPES}
                  />
                  <NumberField
                    label="Valor SL"
                    value={exitRules.stop_loss_value}
                    step={
                      exitRules.stop_loss_type === "atr_multiplier"
                        ? "0.1"
                        : "0.01"
                    }
                    onChange={(value) =>
                      setExitRules((prev) => ({
                        ...prev,
                        stop_loss_value: value,
                      }))
                    }
                    helper={
                      exitRules.stop_loss_type === "atr_multiplier"
                        ? "Multiplicador del ATR"
                        : "Porcentaje de pérdida máxima"
                    }
                  />
                  <SelectField
                    label="Take Profit"
                    value={exitRules.take_profit_type}
                    onChange={(value) =>
                      setExitRules((prev) => ({
                        ...prev,
                        take_profit_type: value,
                      }))
                    }
                    options={TP_TYPES}
                  />
                  <NumberField
                    label="Valor TP"
                    value={exitRules.take_profit_value}
                    step={
                      exitRules.take_profit_type === "risk_reward_ratio"
                        ? "0.1"
                        : "0.01"
                    }
                    onChange={(value) =>
                      setExitRules((prev) => ({
                        ...prev,
                        take_profit_value: value,
                      }))
                    }
                    helper={
                      exitRules.take_profit_type === "risk_reward_ratio"
                        ? "Ratio objetivo sobre el riesgo asumido"
                        : "Porcentaje de ganancia objetivo"
                    }
                  />
                </div>
              </div>

              <div>
                <SectionTitle
                  number={
                    selectedStrategy &&
                    Object.keys(selectedStrategy.parameters_schema).length > 0
                      ? 4
                      : 3
                  }
                  title="Gestión de riesgo"
                  icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />}
                  description="Controla cuánto capital arriesgar en cada operación."
                />
                <div className="grid grid-cols-2 gap-3">
                  <SelectField
                    label="Tipo"
                    value={riskType}
                    onChange={setRiskType}
                    options={RISK_TYPES}
                  />
                  <NumberField
                    label="Valor"
                    value={riskValue}
                    onChange={setRiskValue}
                    helper={
                      riskType === "percent_risk"
                        ? "Porcentaje del capital arriesgado por operación"
                        : "Unidades fijas por operación"
                    }
                  />
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="text-xs text-slate-400">Resumen</p>
                <p className="mt-1 font-mono text-xs text-slate-300">
                  {selectedStrategy
                    ? selectedStrategy.display_name
                    : baseStrategyName}
                  {" · "}
                  {symbol.toUpperCase()} {timeframe}
                  {" · "}
                  riesgo {riskValue.toFixed(1)}%
                </p>
              </div>
            </>
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
              disabled={catalogLoading || saving}
              className={cn(
                "flex flex-1 items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                "bg-emerald-600 text-slate-950 hover:bg-emerald-500",
              )}
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

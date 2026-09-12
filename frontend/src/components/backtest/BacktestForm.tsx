"use client";

import { useEffect, useState } from "react";
import { Loader2, Play } from "lucide-react";

import { getDataStatus, getStrategiesCatalog } from "@/lib/api";
import type { BacktestRequest, ExitRules } from "@/types/backtest";
import type { StrategyCatalogItem } from "@/types/strategies";

const SL_TYPES = [
  { value: "atr_multiplier", label: "ATR (multiplicador)", step: 0.1 },
  { value: "fixed_percent", label: "% fijo", step: 0.01 },
];

const TP_TYPES = [
  { value: "risk_reward_ratio", label: "Ratio riesgo/recompensa", step: 0.1 },
  { value: "fixed_percent", label: "% fijo", step: 0.01 },
];

const DEFAULT_EXIT_RULES: ExitRules = {
  stop_loss_type: "atr_multiplier",
  stop_loss_value: 1.5,
  take_profit_type: "risk_reward_ratio",
  take_profit_value: 2.0,
};

interface BacktestFormProps {
  running: boolean;
  onRun: (request: BacktestRequest) => void;
  initial?: Partial<BacktestRequest>;
}

function SectionTitle({ title }: { title: string }) {
  return (
    <h2 className="text-sm font-semibold text-slate-100">
      <span className="mr-2">{title}</span>
    </h2>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  helper,
}: {
  label: string;
  value: number | string;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  helper?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-medium text-slate-300">
        {label}
      </label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
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
      <label className="mb-1.5 block text-xs font-medium text-slate-300">
        {label}
      </label>
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

function defaultsFor(strategy: StrategyCatalogItem): Record<string, number> {
  return Object.fromEntries(
    Object.entries(strategy.parameters_schema).map(([key, schema]) => [
      key,
      (schema.default as number) ?? 0,
    ])
  );
}

export default function BacktestForm({
  running,
  onRun,
  initial,
}: BacktestFormProps) {
  const [catalog, setCatalog] = useState<StrategyCatalogItem[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [symbols, setSymbols] = useState<string[]>([]);
  const [timeframes, setTimeframes] = useState<string[]>([]);
  const [symbolsLoading, setSymbolsLoading] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(initial?.symbol ?? "");
  const [timeframe, setTimeframe] = useState(initial?.timeframe ?? "");

  const [strategyName, setStrategyName] = useState(initial?.strategy_name ?? "");
  const [strategyParams, setStrategyParams] = useState<Record<string, number>>(
    initial?.strategy_params ?? {}
  );

  const [exitRules, setExitRules] = useState<ExitRules>(
    initial?.exit_rules ?? DEFAULT_EXIT_RULES
  );

  const [initialCapital, setInitialCapital] = useState(
    initial?.initial_capital ?? 10000
  );
  const [commissionPct, setCommissionPct] = useState(
    initial?.commission_pct ?? 0.001
  );
  const [slippagePct, setSlippagePct] = useState(initial?.slippage_pct ?? 0.1);

  const hasPrefill =
    Boolean(initial?.strategy_name) && Object.keys(initial?.strategy_params ?? {}).length > 0;

  useEffect(() => {
    const timer = setTimeout(() => {
      void getStrategiesCatalog()
        .then((items) => {
          setCatalog(items);
          if (items.length > 0 && !hasPrefill) {
            setStrategyName(items[0].name);
            setStrategyParams(defaultsFor(items[0]));
          }
        })
        .catch(() => {
          setCatalogError("No se pudo cargar el catálogo de estrategias.");
        })
        .finally(() => setStrategiesLoading(false));
      void getDataStatus()
        .then((data) => {
          const nextSymbols = [...new Set(data.map((d) => d.symbol))];
          const nextTimeframes = [...new Set(data.map((d) => d.timeframe))];
          setSymbols(nextSymbols);
          setTimeframes(nextTimeframes);
          if (symbol === "" && nextSymbols.length > 0) setSymbol(nextSymbols[0]);
          if (timeframe === "" && nextTimeframes.length > 0)
            setTimeframe(nextTimeframes[0]);
        })
        .catch(() => {
          setDataError("No se pudieron cargar los datos importados.");
        })
        .finally(() => setSymbolsLoading(false));
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedStrategy = catalog.find((s) => s.name === strategyName);

  const handleStrategyChange = (name: string) => {
    const strategy = catalog.find((s) => s.name === name);
    if (!strategy) return;
    setStrategyName(name);
    setStrategyParams(defaultsFor(strategy));
  };

  const handleSubmit = () => {
    if (!strategyName || !selectedStrategy || !symbol || !timeframe) return;
    onRun({
      symbol: symbol.toUpperCase(),
      timeframe,
      strategy_name: strategyName,
      strategy_params: strategyParams,
      exit_rules: exitRules,
      initial_capital: initialCapital,
      commission_pct: commissionPct,
      slippage_pct: slippagePct,
    });
  };

  return (
    <div className="space-y-4 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <SectionTitle title="📊 Datos" />
        {dataError && (
          <p className="text-xs text-red-400" role="alert">
            {dataError}
          </p>
        )}
        {!dataError && !symbolsLoading && symbols.length === 0 && (
          <p className="text-xs text-yellow-400">
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
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <SectionTitle title="🧠 Estrategia" />
        {catalogError && (
          <p className="text-xs text-red-400" role="alert">
            {catalogError}
          </p>
        )}
        <SelectField
          label="Estrategia"
          value={strategyName}
          onChange={handleStrategyChange}
          disabled={strategiesLoading}
          options={catalog.map((s) => ({ value: s.name, label: s.display_name }))}
        />
        {selectedStrategy &&
          Object.entries(selectedStrategy.parameters_schema).map(([key, schema]) => (
            <NumberField
              key={key}
              label={key}
              value={strategyParams[key] ?? schema.default}
              min={schema.min}
              max={schema.max}
              step={schema.step ?? (schema.type === "float" ? 0.1 : 1)}
              helper={schema.description}
              onChange={(value) =>
                setStrategyParams((prev) => ({ ...prev, [key]: value }))
              }
            />
          ))}
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <SectionTitle title="🎯 Reglas de Salida" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <SelectField
            label="Stop Loss"
            value={exitRules.stop_loss_type}
            onChange={(value) =>
              setExitRules((prev) => ({ ...prev, stop_loss_type: value }))
            }
            options={SL_TYPES}
          />
          <NumberField
            label="Valor SL"
            value={exitRules.stop_loss_value}
            onChange={(value) =>
              setExitRules((prev) => ({ ...prev, stop_loss_value: value }))
            }
            helper="Multiplicador de ATR o porcentaje fijo de salida."
          />
          <SelectField
            label="Take Profit"
            value={exitRules.take_profit_type}
            onChange={(value) =>
              setExitRules((prev) => ({ ...prev, take_profit_type: value }))
            }
            options={TP_TYPES}
          />
          <NumberField
            label="Valor TP"
            value={exitRules.take_profit_value}
            onChange={(value) =>
              setExitRules((prev) => ({ ...prev, take_profit_value: value }))
            }
            helper="Ratio riesgo/recompensa o porcentaje fijo de beneficio."
          />
        </div>
      </section>

      <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4">
        <SectionTitle title="💰 Configuración Financiera" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumberField
            label="Capital inicial ($)"
            value={initialCapital}
            onChange={setInitialCapital}
            min={1}
            helper="Dinero disponible para operar en la simulación."
          />
          <NumberField
            label="Comisión (%)"
            value={commissionPct}
            onChange={setCommissionPct}
            min={0}
            step={0.0001}
            helper="Comisión por operación sobre el volumen, en %."
          />
          <NumberField
            label="Slippage (%)"
            value={slippagePct}
            onChange={setSlippagePct}
            min={0}
            step={0.01}
            helper="Deslizamiento estimado entre el precio teórico y el de ejecución."
          />
        </div>
      </section>

      <button
        onClick={handleSubmit}
        disabled={running || !strategyName || !symbol || !timeframe}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Play className="h-4 w-4" />
        )}
        {running ? "Ejecutando…" : "Ejecutar Backtest"}
      </button>
    </div>
  );
}
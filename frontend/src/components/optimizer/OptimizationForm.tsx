"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Cpu,
  Loader2,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  TrendingDown,
  Wallet,
} from "lucide-react";

import { getStrategiesCatalog } from "@/lib/api";
import type { ExitRules } from "@/types/backtest";
import type {
  OptimizationRequest,
  ParamRangeSpec,
} from "@/types/optimizer";
import type {
  ParameterSchema,
  StrategyCatalogItem,
} from "@/types/strategies";

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "XRPUSDT"];
const TIMEFRAMES = ["15m", "1h", "4h"];
const MAX_COMBINATIONS = 10000;

const SL_TYPES = [
  { value: "atr_multiplier", label: "ATR (multiplicador)", step: 0.1 },
  { value: "fixed_percent", label: "% fijo", step: 0.01 },
];

const TP_TYPES = [
  { value: "risk_reward_ratio", label: "Ratio riesgo/recompensa", step: 0.1 },
  { value: "fixed_percent", label: "% fijo", step: 0.01 },
];

interface OptimizationFormProps {
  running: boolean;
  onRun: (request: OptimizationRequest) => void;
}

function SectionTitle({
  number,
  title,
  icon,
}: {
  number: number;
  title: string;
  icon: ReactNode;
}) {
  return (
    <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-slate-800 text-[10px] text-emerald-400">
        {number}
      </span>
      {icon}
      {title}
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

function defaultRange(
  paramName: string,
  schema: ParameterSchema
): ParamRangeSpec {
  const def = typeof schema.default === "number" ? schema.default : 10;
  const min = schema.min ?? Math.max(2, Math.floor(def / 2));
  const max = schema.max ?? def * 2;
  const step = schema.step ?? (def > 20 ? 10 : 5);
  return { type: "int", min, max, step };
}

export default function OptimizationForm({ running, onRun }: OptimizationFormProps) {
  const [catalog, setCatalog] = useState<StrategyCatalogItem[]>([]);
  const [strategiesLoading, setStrategiesLoading] = useState(true);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [symbol, setSymbol] = useState(SYMBOLS[0]);
  const [timeframe, setTimeframe] = useState(TIMEFRAMES[0]);

  const [strategyName, setStrategyName] = useState("");
  const [paramRanges, setParamRanges] = useState<Record<string, ParamRangeSpec>>({});

  const [oosEnabled, setOosEnabled] = useState(true);
  const [splitRatio, setSplitRatio] = useState(0.7);
  const [oosMinPf, setOosMinPf] = useState(1.3);
  const [oosMaxDegradation, setOosMaxDegradation] = useState(0.3);
  const [minTrades, setMinTrades] = useState(10);

  const [exitRules, setExitRules] = useState<ExitRules>({
    stop_loss_type: "atr_multiplier",
    stop_loss_value: 1.5,
    take_profit_type: "risk_reward_ratio",
    take_profit_value: 2.0,
  });

  const [initialCapital, setInitialCapital] = useState(10000);
  const [commissionPct, setCommissionPct] = useState(0.001);
  const [slippagePct, setSlippagePct] = useState(0.1);

  useEffect(() => {
    const initial = setTimeout(() => {
      void getStrategiesCatalog()
        .then((items) => {
          setCatalog(items);
          if (items.length > 0) {
            setStrategyName(items[0].name);
            setParamRanges(
              Object.fromEntries(
                Object.entries(items[0].parameters_schema).map(([key, schema]) => [
                  key,
                  defaultRange(key, schema),
                ])
              )
            );
          }
        })
        .catch(() => {
          setCatalogError("No se pudo cargar el catálogo de estrategias.");
        })
        .finally(() => setStrategiesLoading(false));
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  const selectedStrategy = catalog.find((s) => s.name === strategyName);

  const totalCombinations = useMemo(() => {
    let total = 1;
    for (const spec of Object.values(paramRanges)) {
      if (spec.step <= 0) return Infinity;
      const n = Math.floor((spec.max - spec.min) / spec.step) + 1;
      total *= Math.max(n, 1);
    }
    return total;
  }, [paramRanges]);

  const exceedsLimit = totalCombinations > MAX_COMBINATIONS;

  const handleStrategyChange = (name: string) => {
    const strategy = catalog.find((s) => s.name === name);
    if (!strategy) return;
    setStrategyName(name);
    setParamRanges(
      Object.fromEntries(
        Object.entries(strategy.parameters_schema).map(([key, schema]) => [
          key,
          defaultRange(key, schema),
        ])
      )
    );
  };

  const updateRange = (key: string, field: keyof ParamRangeSpec, value: number) => {
    setParamRanges((prev) => {
      const current = prev[key] ?? { type: "int", min: 0, max: 1, step: 1 };
      return { ...prev, [key]: { ...current, [field]: value } };
    });
  };

  const handleSubmit = () => {
    if (!strategyName || !selectedStrategy) return;
    onRun({
      symbol: symbol.toUpperCase(),
      timeframe,
      strategy_name: strategyName,
      param_ranges: paramRanges,
      exit_rules: exitRules,
      oos_config: {
        enabled: oosEnabled,
        split_ratio: splitRatio,
        min_pf: oosMinPf,
        max_degradation: oosMaxDegradation,
        min_trades: minTrades,
      },
      initial_capital: initialCapital,
      commission_pct: commissionPct,
      slippage_pct: slippagePct,
    });
  };

  return (
    <div className="space-y-6 rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <SectionTitle number={1} title="Datos" icon={<Settings2 className="h-3.5 w-3.5 text-emerald-400" />} />
      <div className="space-y-3">
        <SelectField
          label="Símbolo"
          value={symbol}
          onChange={setSymbol}
          options={SYMBOLS.map((s) => ({ value: s, label: s }))}
        />
        <SelectField
          label="Timeframe"
          value={timeframe}
          onChange={setTimeframe}
          options={TIMEFRAMES.map((t) => ({ value: t, label: t }))}
        />
      </div>

      <SectionTitle number={2} title="Estrategia" icon={<Cpu className="h-3.5 w-3.5 text-emerald-400" />} />
      {catalogError && (
        <p className="mb-2 text-xs text-red-400" role="alert">
          {catalogError}
        </p>
      )}
      <div className="space-y-3">
        <SelectField
          label="Estrategia"
          value={strategyName}
          onChange={handleStrategyChange}
          disabled={strategiesLoading}
          options={catalog.map((s) => ({ value: s.name, label: s.display_name }))}
        />
      </div>

      <SectionTitle number={3} title="Rangos de Parámetros" icon={<SlidersHorizontal className="h-3.5 w-3.5 text-emerald-400" />} />
      <div className="space-y-4">
        {selectedStrategy &&
          Object.entries(selectedStrategy.parameters_schema).map(([key, schema]) => {
            const range = paramRanges[key] ?? defaultRange(key, schema);
            return (
              <div key={key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <p className="mb-2 text-xs font-medium text-slate-200">{key}</p>
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="Min"
                    value={range.min}
                    onChange={(v) => updateRange(key, "min", v)}
                  />
                  <NumberField
                    label="Max"
                    value={range.max}
                    onChange={(v) => updateRange(key, "max", v)}
                  />
                  <NumberField
                    label="Step"
                    value={range.step}
                    min={0.01}
                    onChange={(v) => updateRange(key, "step", v)}
                  />
                </div>
              </div>
            );
          })}
        <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
          <p className="text-xs font-medium text-slate-300">Total de combinaciones</p>
          <p className={exceedsLimit ? "mt-1 text-lg font-bold text-red-400" : "mt-1 text-lg font-bold text-emerald-400"}>
            {Number.isFinite(totalCombinations)
              ? totalCombinations.toLocaleString("es-ES")
              : "∞"}
          </p>
          {exceedsLimit && (
            <p className="mt-1 text-[11px] text-red-400">
              Supera el máximo de {MAX_COMBINATIONS.toLocaleString("es-ES")}. Reduce los rangos.
            </p>
          )}
        </div>
      </div>

      <SectionTitle number={4} title="Validación Out-of-Sample" icon={<ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />} />
      <div className="space-y-3">
        <label className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
          <span className="text-xs font-medium text-slate-300">Activar Validación OOS</span>
          <button
            role="switch"
            aria-checked={oosEnabled}
            onClick={(e) => {
              e.preventDefault();
              setOosEnabled((v) => !v);
            }}
            className={`relative h-5 w-9 rounded-full transition ${
              oosEnabled ? "bg-emerald-600" : "bg-slate-700"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                oosEnabled ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>
        </label>

        {oosEnabled && (
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label className="text-xs font-medium text-slate-300">
                  Split ratio IS/OOS
                </label>
                <span className="text-xs font-bold text-emerald-400">
                  {Math.round(splitRatio * 100)} / {Math.round((1 - splitRatio) * 100)}
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={0.9}
                step={0.05}
                value={splitRatio}
                onChange={(e) => setSplitRatio(Number(e.target.value))}
                className="w-full accent-emerald-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <NumberField
                label="PF mínimo OOS"
                value={oosMinPf}
                min={1}
                step={0.05}
                helper="Profit Factor mínimo en OOS para ser Robusto"
                onChange={setOosMinPf}
              />
              <NumberField
                label="Degradación máx. (%)"
                value={oosMaxDegradation}
                min={0}
                max={1}
                step={0.05}
                onChange={setOosMaxDegradation}
              />
              <NumberField
                label="Trades mínimos IS"
                value={minTrades}
                min={1}
                helper="Operaciones mínimas en el tramo IS"
                onChange={setMinTrades}
              />
            </div>
          </div>
        )}
      </div>

      <SectionTitle number={5} title="Reglas de Salida" icon={<TrendingDown className="h-3.5 w-3.5 text-emerald-400" />} />
      <div className="grid grid-cols-2 gap-3">
        <SelectField
          label="Stop Loss"
          value={exitRules.stop_loss_type}
          onChange={(value) => setExitRules((prev) => ({ ...prev, stop_loss_type: value }))}
          options={SL_TYPES}
        />
        <NumberField
          label="Valor SL"
          value={exitRules.stop_loss_value}
          onChange={(value) => setExitRules((prev) => ({ ...prev, stop_loss_value: value }))}
        />
        <SelectField
          label="Take Profit"
          value={exitRules.take_profit_type}
          onChange={(value) => setExitRules((prev) => ({ ...prev, take_profit_type: value }))}
          options={TP_TYPES}
        />
        <NumberField
          label="Valor TP"
          value={exitRules.take_profit_value}
          onChange={(value) => setExitRules((prev) => ({ ...prev, take_profit_value: value }))}
        />
      </div>

      <SectionTitle number={6} title="Configuración Financiera" icon={<Wallet className="h-3.5 w-3.5 text-emerald-400" />} />
      <div className="grid grid-cols-2 gap-3">
        <NumberField
          label="Capital inicial ($)"
          value={initialCapital}
          onChange={setInitialCapital}
          min={1}
        />
        <NumberField
          label="Comisión (%)"
          value={commissionPct}
          onChange={setCommissionPct}
          min={0}
          step={0.0001}
        />
        <NumberField
          label="Slippage (%)"
          value={slippagePct}
          onChange={setSlippagePct}
          min={0}
          step={0.01}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={running || !strategyName || exceedsLimit}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {running ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <SlidersHorizontal className="h-4 w-4" />
        )}
        {running ? "Optimizando…" : "Iniciar Optimización"}
      </button>
    </div>
  );
}
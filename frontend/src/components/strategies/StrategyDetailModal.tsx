"use client";

import { BarChart3, Info, X } from "lucide-react";

import MockStrategyChart from "@/components/strategies/MockStrategyChart";
import type {
  ParameterSchema,
  StrategyCatalogItem,
} from "@/types/strategies";

interface StrategyDetailModalProps {
  strategy: StrategyCatalogItem | null;
  onClose: () => void;
}

function formatRange(schema: ParameterSchema): string {
  if (schema.min === undefined && schema.max === undefined) return "—";
  if (schema.min !== undefined && schema.max !== undefined) {
    return `${schema.min} – ${schema.max}`;
  }
  return schema.min !== undefined ? `≥ ${schema.min}` : `≤ ${schema.max}`;
}

function formatDefault(schema: ParameterSchema): string {
  if (schema.default === undefined) return "—";
  return typeof schema.default === "boolean"
    ? schema.default
      ? "true"
      : "false"
    : String(schema.default);
}

export default function StrategyDetailModal({
  strategy,
  onClose,
}: StrategyDetailModalProps) {
  if (!strategy) return null;

  const parameters = Object.entries(strategy.parameters_schema);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 px-6 py-5">
          <div className="space-y-2">
            <h2 className="text-lg font-semibold text-slate-50">
              {strategy.display_name}
            </h2>
            <span className="inline-flex w-fit items-center rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-400">
              {strategy.category}
            </span>
            <p className="text-sm leading-relaxed text-slate-400">
              {strategy.description}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <BarChart3 className="h-3.5 w-3.5 text-emerald-400" />
            Ejemplo Visual
          </h3>
          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <MockStrategyChart strategyName={strategy.name} />
            <p className="mt-3 text-[11px] text-slate-500">
              Datos simulados para ilustrar el comportamiento de la estrategia: la
              línea muestra el precio y las flechas {"\u2191"}{" "}
              <span className="text-emerald-400">entradas</span> /{" "}
              {"\u2193"}{" "}
              <span className="text-red-400">salidas</span>.
            </p>
          </div>
        </div>

        <div className="px-6 py-5">
          <h3 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-300">
            <Info className="h-3.5 w-3.5 text-emerald-400" />
            Parámetros
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-3 py-2 font-medium">Nombre</th>
                  <th className="px-3 py-2 font-medium">Tipo</th>
                  <th className="px-3 py-2 font-medium">Rango</th>
                  <th className="px-3 py-2 font-medium">Valor por defecto</th>
                  <th className="px-3 py-2 font-medium">Descripción</th>
                </tr>
              </thead>
              <tbody>
                {parameters.map(([name, schema]) => (
                  <tr
                    key={name}
                    className="border-b border-slate-800/60 last:border-b-0"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-emerald-400">
                      {name}
                    </td>
                    <td className="px-3 py-2.5 text-slate-300">
                      {schema.type}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {formatRange(schema)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-100">
                      {formatDefault(schema)}
                    </td>
                    <td className="px-3 py-2.5 text-slate-400">
                      {schema.description ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border-t border-slate-800 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
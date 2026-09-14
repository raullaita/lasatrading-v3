"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Save, X } from "lucide-react";
import { toast } from "sonner";

import { createStrategy } from "@/lib/api";
import type {
  OptimizationCandidate,
  OptimizationRequest,
} from "@/types/optimizer";

function formatStrategyName(strategyName: string): string {
  return strategyName
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function suggestedName(
  candidate: OptimizationCandidate,
  request: OptimizationRequest | null,
): string {
  if (!request) return `Estrategia Rank ${candidate.rank}`;
  return `${request.symbol} ${request.timeframe} ${formatStrategyName(request.strategy_name)} - Rank ${candidate.rank}`;
}

export default function SendToPortfolioModal({
  candidate,
  request,
  onClose,
}: {
  candidate: OptimizationCandidate | null;
  request: OptimizationRequest | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [name, setName] = useState(() =>
    candidate ? suggestedName(candidate, request) : "",
  );
  const [riskPct, setRiskPct] = useState(2.0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!candidate) return null;

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createStrategy({
        name: name.trim(),
        is_active: false,
        base_strategy_name: request?.strategy_name ?? "",
        symbol: request?.symbol ?? "BTCUSDT",
        timeframe: request?.timeframe ?? "15m",
        pattern_params: candidate.params,
        exit_rules: request?.exit_rules ?? {
          stop_loss_type: "atr_multiplier",
          stop_loss_value: 1.5,
          take_profit_type: "risk_reward_ratio",
          take_profit_value: 2.0,
        },
        risk_management: { type: "percent_risk", value: riskPct },
      });
      toast.success("Estrategia guardada en el Portafolio");
      onClose();
      router.push("/portfolio");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo guardar la estrategia.",
      );
      setSaving(false);
    }
  };

  const exitRules = request?.exit_rules;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-50">
            Enviar al Portafolio
          </h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-800 hover:text-slate-50"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Nombre de la estrategia
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Símbolo
              </label>
              <input
                type="text"
                value={request?.symbol ?? "BTCUSDT"}
                readOnly
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-medium text-slate-300">
                Timeframe
              </label>
              <input
                type="text"
                value={request?.timeframe ?? "15m"}
                readOnly
                className="w-full rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-2 text-sm text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
            <p className="text-[11px] uppercase tracking-wide text-slate-500">
              Parámetros optimizados
            </p>
            <p className="mt-1 font-mono text-xs text-slate-300">
              {Object.entries(candidate.params)
                .map(([k, v]) => `${k}=${v}`)
                .join(", ")}
            </p>
          </div>

          {exitRules && (
            <div className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">
                Reglas de salida
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <span className="text-slate-500">SL: </span>
                  <span className="font-mono text-slate-300">
                    {exitRules.stop_loss_type === "atr_multiplier"
                      ? `ATR × ${exitRules.stop_loss_value}`
                      : `${exitRules.stop_loss_value}%`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500">TP: </span>
                  <span className="font-mono text-slate-300">
                    {exitRules.take_profit_type === "risk_reward_ratio"
                      ? `R:R ${exitRules.take_profit_value}`
                      : `${exitRules.take_profit_value}%`}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-300">
              Riesgo por operación (%)
            </label>
            <input
              type="number"
              value={riskPct}
              min={0.1}
              max={50}
              step={0.5}
              onChange={(e) => setRiskPct(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-50 focus:border-emerald-500/50 focus:outline-none"
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Porcentaje del capital arriesgado por operación
            </p>
          </div>

          {error && (
            <p className="text-xs text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <div className="border-t border-slate-800 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={saving}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {saving ? "Guardando…" : "Guardar en Portafolio"}
          </button>
        </div>
      </div>
    </div>
  );
}

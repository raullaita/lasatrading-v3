"use client";

import { Activity, ChevronRight, LineChart, TrendingUp } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { StrategyCatalogItem } from "@/types/strategies";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Tendencia: TrendingUp,
  "Reversión a la media": Activity,
};

interface StrategyCardProps {
  strategy: StrategyCatalogItem;
  onSelect: (strategy: StrategyCatalogItem) => void;
}

export default function StrategyCard({
  strategy,
  onSelect,
}: StrategyCardProps) {
  const Icon = CATEGORY_ICONS[strategy.category] ?? LineChart;

  return (
    <button
      onClick={() => onSelect(strategy)}
      className="group flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900 p-5 text-left transition hover:border-emerald-500/40 hover:bg-slate-800/60"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-xl border border-slate-700 bg-slate-950 p-2.5">
            <Icon className="h-5 w-5 text-emerald-400" />
          </div>
          <h3 className="text-sm font-semibold text-slate-50">
            {strategy.display_name}
          </h3>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-600 transition group-hover:text-emerald-400" />
      </div>

      <span className="w-fit rounded-full border border-slate-700 bg-slate-950 px-2.5 py-0.5 text-xs text-slate-300">
        {strategy.category}
      </span>

      <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
        {strategy.description}
      </p>
    </button>
  );
}
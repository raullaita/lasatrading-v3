"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Layers, Loader2, Search } from "lucide-react";

import StrategyCard from "@/components/strategies/StrategyCard";
import StrategyDetailModal from "@/components/strategies/StrategyDetailModal";
import { getStrategiesCatalog } from "@/lib/api";
import type { StrategyCatalogItem } from "@/types/strategies";

export default function StrategiesPage() {
  const [strategies, setStrategies] = useState<StrategyCatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<StrategyCatalogItem | null>(null);

  const load = useCallback(async () => {
    try {
      setStrategies(await getStrategiesCatalog());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al cargar el catálogo."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => clearTimeout(initial);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return strategies;
    return strategies.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.display_name.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
    );
  }, [strategies, query]);

  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Catálogo de Estrategias
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Estrategias disponibles para backtesting y trading
          </p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o categoría…"
            className="w-full rounded-lg border border-slate-800 bg-slate-900 py-2 pl-9 pr-3 text-sm text-slate-50 placeholder:text-slate-600 focus:border-emerald-500/50 focus:outline-none sm:w-72"
          />
        </div>
      </header>

      {error ? (
        <p className="py-16 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      ) : loading ? (
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          Cargando catálogo…
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-sm text-slate-400">
          <Layers className="h-8 w-8 text-slate-600" />
          {strategies.length === 0
            ? "No hay estrategias registradas."
            : "Ninguna estrategia coincide con la búsqueda."}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((strategy) => (
            <StrategyCard
              key={strategy.name}
              strategy={strategy}
              onSelect={setSelected}
            />
          ))}
        </div>
      )}

      <StrategyDetailModal
        strategy={selected}
        onClose={() => setSelected(null)}
      />
    </main>
  );
}
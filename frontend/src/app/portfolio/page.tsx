"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Layers,
  Loader2,
  PauseCircle,
  Plus,
  Trash2,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

import StrategyModal from "@/components/portfolio/StrategyModal";
import StrategyRow from "@/components/portfolio/StrategyRow";
import {
  createStrategy,
  deleteStrategy,
  getStrategies,
  toggleStrategy,
  updateStrategy,
} from "@/lib/api";
import type { CreateStrategyPayload, UserStrategy } from "@/types/portfolio";

export default function PortfolioPage() {
  const [strategies, setStrategies] = useState<UserStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingStrategy, setEditingStrategy] = useState<
    (CreateStrategyPayload & { id?: string }) | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<UserStrategy | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const initial = setTimeout(() => {
      void getStrategies()
        .then((items) => {
          setStrategies(items);
          setError(null);
        })
        .catch((err) => {
          setError(
            err instanceof Error
              ? err.message
              : "No se pudieron cargar las estrategias.",
          );
        })
        .finally(() => setLoading(false));
    }, 0);
    return () => clearTimeout(initial);
  }, []);

  const activeCount = strategies.filter((s) => s.is_active).length;
  const pausedCount = strategies.length - activeCount;

  const handleAdd = () => {
    setEditingStrategy(null);
    setModalOpen(true);
  };

  const handleEdit = (strategy: UserStrategy) => {
    setEditingStrategy(strategy);
    setModalOpen(true);
  };

  const handleSave = async (data: Omit<CreateStrategyPayload, "is_active">) => {
    if (editingStrategy?.id) {
      const updated = await updateStrategy(editingStrategy.id, data);
      setStrategies((prev) =>
        prev.map((s) => (s.id === updated.id ? updated : s)),
      );
    } else {
      const created = await createStrategy({ ...data, is_active: false });
      setStrategies((prev) => [created, ...prev]);
    }
    setModalOpen(false);
    setEditingStrategy(null);
  };

  const handleToggle = async (strategy: UserStrategy) => {
    const previousStrategies = strategies;
    const newActive = !strategy.is_active;

    setStrategies((prev) =>
      prev.map((s) =>
        s.id === strategy.id ? { ...s, is_active: newActive } : s,
      ),
    );
    toast.info(
      newActive
        ? `Estrategia "${strategy.name}" activada`
        : `Estrategia "${strategy.name}" pausada`,
    );

    try {
      await toggleStrategy(strategy.id);
    } catch {
      setStrategies(previousStrategies);
      toast.error("No se pudo cambiar el estado de la estrategia.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteStrategy(deleteTarget.id);
      setStrategies((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      toast.success("Estrategia eliminada");
      setDeleteTarget(null);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudo eliminar la estrategia.",
      );
    } finally {
      setDeleting(false);
    }
  };

  const summaryCards = [
    {
      label: "Total",
      value: strategies.length,
      icon: <Layers className="h-4 w-4" />,
      className: "text-slate-50",
    },
    {
      label: "Activas",
      value: activeCount,
      icon: <Activity className="h-4 w-4" />,
      className: "text-emerald-400",
    },
    {
      label: "Pausadas",
      value: pausedCount,
      icon: <PauseCircle className="h-4 w-4" />,
      className: "text-slate-400",
    },
  ];

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-50">
            Mi Portafolio
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Estrategias validadas, listas para operar en producción
          </p>
        </div>
        <button
          onClick={handleAdd}
          className="flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-emerald-500"
        >
          <Plus className="h-4 w-4" />
          Añadir Estrategia
        </button>
      </header>

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
            <p className={`mt-2 text-2xl font-bold ${card.className}`}>
              {card.value}
            </p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        {error && (
          <div
            className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-400"
            role="alert"
          >
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900 px-6 py-16 text-center">
            <Loader2 className="h-6 w-6 animate-spin text-emerald-400" />
            <p className="text-sm text-slate-400">Cargando estrategias…</p>
          </div>
        ) : strategies.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-slate-800 px-6 py-16 text-center">
            <Wallet className="h-8 w-8 text-slate-600" />
            <p className="text-sm text-slate-400">
              Aún no tienes estrategias. Ve al Optimizador o Backtest para
              guardar tus primeras configuraciones.
            </p>
            <button
              onClick={handleAdd}
              className="mt-2 flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-xs font-semibold text-emerald-400 transition hover:bg-emerald-500/20"
            >
              <Plus className="h-3.5 w-3.5" />
              Añadir estrategia manualmente
            </button>
          </div>
        ) : (
          strategies.map((strategy) => (
            <StrategyRow
              key={strategy.id}
              strategy={strategy}
              onEdit={handleEdit}
              onDelete={setDeleteTarget}
              onToggle={handleToggle}
            />
          ))
        )}
      </section>

      {modalOpen && (
        <StrategyModal
          strategy={editingStrategy}
          onClose={() => {
            setModalOpen(false);
            setEditingStrategy(null);
          }}
          onSave={handleSave}
        />
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold text-slate-50">
              Eliminar estrategia
            </h2>
            <p className="mt-2 text-sm text-slate-400">
              ¿Seguro que quieres eliminar{" "}
              <span className="font-semibold text-slate-200">
                {deleteTarget.name}
              </span>
              ? Esta acción no se puede deshacer.
            </p>
            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="flex-1 rounded-lg border border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800 disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-semibold text-slate-50 transition hover:bg-red-500 disabled:opacity-60"
              >
                {deleting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
                {deleting ? "Eliminando…" : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

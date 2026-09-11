import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  Briefcase,
  Database,
  Radio,
  Server,
  Settings,
} from "lucide-react";

const MODULES = [
  {
    href: "/data",
    title: "Datos",
    description: "Importa y gestiona datos de mercado",
    icon: Database,
  },
  {
    href: "/strategies",
    title: "Estrategias",
    description: "Explora el catálogo de estrategias disponibles",
    icon: Brain,
  },
  {
    href: "/backtest",
    title: "Backtest",
    description: "Valida estrategias con datos históricos",
    icon: Settings,
  },
  {
    href: "/optimizer",
    title: "Optimizador",
    description: "Optimiza parámetros con validación OOS",
    icon: Activity,
  },
  {
    href: "/portfolio",
    title: "Portafolio",
    description: "Gestiona tus estrategias activas",
    icon: Briefcase,
  },
  {
    href: "/monitor",
    title: "Monitor",
    description: "Vigilancia en vivo con alertas por Telegram",
    icon: Radio,
  },
  {
    href: "/journal",
    title: "Journal",
    description: "Registra y analiza tus operaciones",
    icon: BookOpen,
  },
  {
    href: "/performance",
    title: "Rendimiento",
    description: "Curva de equity y métricas por estrategia",
    icon: BarChart3,
  },
  {
    href: "/system",
    title: "Sistema",
    description: "Configuración, health checks y logs",
    icon: Server,
  },
];

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-slate-50">
          Bienvenido a LasaTrading v3.0
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Selecciona un módulo en la barra lateral para comenzar.
        </p>
      </header>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {MODULES.map((module) => (
          <Link
            key={module.href}
            href={module.href}
            className="group rounded-2xl border border-slate-800 bg-slate-900 p-5 transition hover:border-emerald-500/40 hover:bg-slate-800/60"
          >
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-800 text-emerald-400">
                <module.icon className="h-5 w-5" />
              </span>
              <ArrowRight className="h-4 w-4 text-slate-600 transition group-hover:translate-x-1 group-hover:text-emerald-400" />
            </div>
            <h2 className="mt-4 text-sm font-semibold text-slate-50">
              {module.title}
            </h2>
            <p className="mt-1 text-xs text-slate-400">{module.description}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
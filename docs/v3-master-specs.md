# LasaTrading v3.0 - Documento Maestro de Especificaciones

## 1. Visión y Filosofía

LasaTrading v3.0 es una plataforma de trading algorítmico de uso **personal y local**.

### Objetivo
Automatizar la detección de oportunidades de trading en criptomonedas, desde la importación de datos hasta la ejecución y análisis de operaciones.

### Principios de Diseño
- **Data-First:** Los datos históricos y en tiempo real son la base de todo.
- **KISS (Keep It Simple, Stupid):** Al ser para uso personal, evitaremos complejidades innecesarias (sin autenticación, sin roles, sin multi-tenancy).
- **Fail-Fast:** Los errores deben ser claros, visibles y registrados inmediatamente.
- **UI Reactiva:** La interfaz debe actualizarse en tiempo real sin recargas de página.

### Alcance de Ejecución (v3.0)
El pipeline de la v3.0 termina en la **Alerta (Telegram) y el Registro Manual/Paper**. La ejecución 100% automática contra el exchange (Auto-Trading con API de Binance/Quantfury) queda **fuera del alcance de la v3.0** por seguridad y control de riesgo. Se evaluará para la v3.1 una vez validada la rentabilidad en Paper Trading con al menos 50 operaciones reales registradas.

---

## 2. Stack Tecnológico

Basado en las lecciones aprendidas de la v2.0:

### Backend
- **Lenguaje:** Python 3.12+ (Indiscutible para trading por su ecosistema: `pandas`, `numpy`, `ta-lib`).
- **Framework Web:** FastAPI (Rápido, asíncrono y con documentación OpenAPI automática).
- **Tareas en Segundo Plano:** ARQ (o Celery) + Redis. *Lección v2: Las tareas pesadas (optimizador, data updater) no pueden bloquear el hilo principal ni depender de memoria volátil.*
- **Tiempo Real:** WebSockets (vía `fastapi-websockets` o `Socket.io`) para actualizaciones en tiempo real (progreso de tareas, precios, señales). REST para fetching de datos históricos y acciones.

### Frontend
- **Framework:** Next.js 14 (App Router) + TypeScript. *TypeScript es obligatorio para evitar errores de tipos en tiempo de ejecución.*
- **Estilos:** Tailwind CSS.
- **Componentes UI:** Shadcn/UI. *Proporciona una base visual profesional, accesible y fácil de personalizar desde el día 1.*
- **Gráficos:** Lightweight Charts (de TradingView) para las velas y la Equity Curve.

### Base de Datos y Almacenamiento
- **Base de Datos Relacional:** PostgreSQL 16. *Lección v2: SQLite falla con escrituras concurrentes. Postgres es robusto y estándar.*
- **Datos Históricos (Time-Series):** Archivos Parquet en disco. *Los datos de velas (OHLCV) son masivos y secuenciales; Parquet es mucho más eficiente para lectura/escritura que una base de datos relacional.*
- **Caché:** Redis (para datos en tiempo real y sesiones de tareas).

---

## 3. Arquitectura General

Se seguirá un enfoque de **Arquitectura Limpia (Clean Architecture)** simplificada:

1. **Core/Dominio:** Lógica de negocio pura (cálculo de indicadores, motor de backtest, reglas de riesgo). No depende de FastAPI ni de la base de datos.
2. **Infraestructura:** Adaptadores para la base de datos (Postgres/Parquet), APIs externas (Binance, Telegram) y sistema de archivos.
3. **Aplicación:** Casos de uso y orquestación (ej. "Ejecutar Backtest", "Actualizar Datos").
4. **Interfaz (API & UI):** Endpoints de FastAPI y componentes de Next.js.

### 3.1 Flujo de Datos End-to-End
```
Binance API -> Data Updater -> Parquet Files (Histórico) -> Backtest / Optimizer -> Portafolio (user_strategies) -> Monitor (fetch en vivo de Binance) -> Telegram Alert + signals_log -> Trade Journal -> Performance Dashboard
```

### 3.2 Estructura de Carpetas del Repositorio
```
lasatrading-v3/
├── backend/
│   ├── app/
│   │   ├── core/           # Lógica pura (strategies/, backtest_engine.py, indicators.py)
│   │   ├── api/            # Endpoints FastAPI (routers: data.py, backtest.py, etc.)
│   │   ├── infra/          # Adaptadores (db/, redis/, binance_client.py, telegram_client.py)
│   │   ├── services/       # Casos de uso (data_updater.py, task_manager.py)
│   │   └── main.py         # Entry point FastAPI
│   ├── tests/              # Tests unitarios e integración
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── app/            # Next.js App Router (rutas: /data, /backtest, etc.)
│   │   ├── components/     # UI components reutilizables (Shadcn/UI)
│   │   ├── lib/            # API clients, utils, constants
│   │   ├── stores/         # Estado global (Zustand)
│   │   └── types/          # Tipos TypeScript compartidos
│   └── package.json
├── docker-compose.yml      # Orquestación: Postgres + Redis + Backend + Frontend
├── .env.example            # Variables de entorno de ejemplo
└── docs/                   # Esta documentación (v3-master-specs.md, v3-modulo-*.md)
```

---

## 4. Diseño y Sistema Visual (UI/UX)

- **Tema:** Dark Mode por defecto (estándar en plataformas de trading para reducir fatiga visual), con opción a Light Mode.
- **Layout:**
  - **Sidebar Lateral Izquierdo:** Navegación principal entre módulos. Colapsable.
  - **Topbar:** Indicadores de estado del sistema (conexión a API, estado de Redis/DB) y acciones globales.
  - **Área Principal:** Contenido del módulo activo.
- **Paleta de Colores:** Fondos oscuros (Slate/Zinc de Tailwind). Acentos en Verde (profit/éxito), Rojo (loss/error) y Azul (información/acciones).

---

## 5. Módulos del Sistema (Flujo Lógico)

### Módulo 1: Datos
- **Función:** Gestión de la materia prima.
- **Capacidades:** Importación histórica (Binance/CSV), actualización automática en vivo (Data Updater), visualización del estado de los archivos Parquet, limpieza y eliminación.

### Módulo 2: Estrategias (Catálogo)
- **Función:** Biblioteca teórica de patrones.
- **Capacidades:** Listado de patrones disponibles (RSI, MACD, Bollinger, etc.), documentación de cómo funcionan, ejemplos gráficos y parámetros configurables.

### Módulo 3: Backtest
- **Función:** Laboratorio de pruebas históricas.
- **Capacidades:** Configuración de simulaciones (Símbolo, Timeframe, Estrategia, Parámetros, SL/TP). Ejecución y visualización de resultados (Equity Curve, métricas, lista de trades).

### Módulo 4: Optimizador
- **Función:** Búsqueda automatizada de parámetros.
- **Capacidades:** Ejecución masiva de backtests, validación Out-of-Sample (OOS) para evitar overfitting, ranking y filtrado de candidatos.

### Módulo 5: Portafolio (Mis Estrategias)
- **Función:** Selección operativa.
- **Capacidades:** Guardar configuraciones ganadoras del Backtest/Optimizador. Activar o pausar estrategias. Asignación de riesgo por estrategia.

### Módulo 6: Monitor y Alertas
- **Función:** Vigilancia en tiempo real.
- **Capacidades:** Gestión de Jobs (tareas en vivo), evaluación de patrones del Portafolio, envío de alertas a Telegram, alertas de precio personalizadas.

### Módulo 7: Trade Journal
- **Función:** Registro de la realidad.
- **Capacidades:** Registro manual o semiautomático de operaciones (Backtest/Paper/Real). Cálculo de Slippage y Latencia.

### Módulo 8: Rendimiento (Dashboard)
- **Función:** Análisis global.
- **Capacidades:** Métricas agregadas del portafolio, curva de equidad real, comparativa Backtest vs. Real.

### Módulo 9: Configuración y Sistema
- **Función:** Ajustes y salud de la plataforma.
- **Capacidades:** Configuración global (Capital, Riesgo, API Keys), Logs del sistema, Backups automáticos, Health Checks.

---

## 6. Infraestructura y Despliegue

- **Contenedores:** Todo el sistema correrá en **Docker**.
- **Orquestación:** `docker-compose.yml` levantando: Frontend (Next.js), Backend (FastAPI), Base de Datos (Postgres) y Caché/Colas (Redis).
- **Despliegue:** Local (en el ordenador del usuario) o en un VPS privado.

### Nota de Seguridad para VPS
La aplicación **no incluye autenticación de usuarios** por diseño (uso personal local). Si se despliega en un VPS accesible desde internet, es **OBLIGATORIO** protegerla con al menos una de estas opciones:
- Autenticación Básica a nivel de Nginx/Apache (usuario/contraseña).
- VPN (WireGuard/Tailscale) para acceder solo desde redes privadas.
- Restricción por IP (allowlist de IPs de confianza).

Nunca exponer la aplicación directamente a internet sin protección.

---

## 7. Proceso de Desarrollo

- **Documentación Primero:** Cada módulo tendrá su propio documento de especificaciones (`v3-modulo-X.md`) antes de escribir código.
- **Git Flow:** Ramas por funcionalidad (`feature/modulo-datos`), commits atómicos y mensajes claros.
- **Testing:** Tests unitarios obligatorios para el Core (motor de backtest, indicadores). Tests de integración para la API.

---

## 8. Roadmap v3.0

### Fase 1: Core (Módulos 1-3)
- Módulo 1: Datos (importación, actualización, Parquet)
- Módulo 2: Estrategias (catálogo de patrones)
- Módulo 3: Backtest (motor de simulación)

### Fase 2: Optimización y Selección (Módulos 4-5)
- Módulo 4: Optimizador (búsqueda de parámetros + OOS)
- Módulo 5: Portafolio (gestión de estrategias activas)

### Fase 3: Operación en Vivo (Módulos 6-7)
- Módulo 6: Monitor y Alertas (jobs en tiempo real)
- Módulo 7: Trade Journal (registro de operaciones)

### Fase 4: Análisis y Mantenimiento (Módulos 8-9)
- Módulo 8: Rendimiento (dashboard global)
- Módulo 9: Configuración y Sistema (logs, backups, health)

---

**Versión:** 1.0  
**Fecha:** 2026-09-10  
**Estado:** Aprobado para desarrollo
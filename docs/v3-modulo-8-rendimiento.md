# LasaTrading v3.0 - Módulo 8: Rendimiento / Dashboard (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-5-portafolio.md`, `v3-modulo-7-trade-journal.md`

---

## 1. Objetivos del Módulo
Este módulo proporciona una visión global y agregada del rendimiento del portafolio de trading.
1.  **Métricas Agregadas:** Calcular y mostrar estadísticas clave (Capital, P&L, Win Rate, Profit Factor, Max Drawdown) de forma consolidada.
2.  **Curva de Equidad:** Visualizar la evolución del capital a lo largo del tiempo.
3.  **Análisis por Estrategia:** Desglosar el rendimiento para identificar qué estrategias aportan valor y cuáles lo destruyen.
4.  **Comparativa Backtest vs. Real:** Contrastar las métricas esperadas (del backtest) con las obtenidas en la realidad (Paper/Real) para detectar desviaciones (slippage, overfitting).

---

## 2. Arquitectura del Backend

### 2.1. Lógica de Cálculo (Performance Engine)
*   **Fuentes de datos:** Consulta la tabla `trades` (Módulo 7) filtrando por `trade_type` ('paper' o 'real') y rango de fechas.
*   **Métricas calculadas:**
    *   *Net Profit:* Suma de `pnl_net`.
    *   *Win Rate:* (Trades ganadores / Total trades cerrados) * 100.
    *   *Profit Factor:* Suma de ganancias brutas / Suma de pérdidas brutas.
    *   *Max Drawdown:* Caída máxima porcentual desde un pico de capital hasta un valle.
    *   *Sharpe/Sortino Ratio:* (Opcional, si se incluye tasa libre de riesgo).
*   **Agrupación:** Capacidad de agrupar métricas por `strategy_id`, `symbol` o `timeframe`.

**Modelo de Trading:** La v3.0 está diseñada exclusivamente para **Mercado Spot** (sin apalancamiento, sin liquidaciones, sin tasas de financiación). Esto simplifica el cálculo de P&L y elimina el riesgo de liquidación forzosa.

**Cálculo de Capital Actual:**
`Capital_Actual = Capital_Inicial (de system_config) + Σ(pnl_net de todas las operaciones cerradas con trade_type='paper' o 'real')`

El Capital Inicial se configura en el Módulo 9 (Sistema) y sirve como línea base para la Curva de Equidad.

### 2.2. Endpoints REST
*   `GET /api/v1/performance/summary`: Devuelve las métricas agregadas globales para un rango de fechas y tipo de trade.
*   `GET /api/v1/performance/equity-curve`: Devuelve un array de puntos `{timestamp, balance, drawdown}` para graficar la curva de capital. Optimizado para no devolver cada trade, sino puntos muestreados si el periodo es muy largo.
*   `GET /api/v1/performance/by-strategy`: Devuelve el desglose de rendimiento por cada estrategia activa, incluyendo la comparación con sus métricas de backtest guardadas.
*   `GET /api/v1/performance/monthly-heatmap`: (Opcional) Matriz de rendimientos por mes/año para identificar estacionalidad.

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Dashboard de Rendimiento (Vista Principal)
**Ubicación:** Ruta `/performance`
**Layout:**

1.  **Barra de Filtros Globales (Top):**
    *   Selector de Tipo de Operación: "Paper Trading" | "Trading Real" | "Ambos".
    *   Selector de Rango de Tiempo: "7D", "30D", "90D", "YTD", "Todo", "Personalizado".
2.  **Tarjetas de Métricas Clave (KPIs):**
    *   Diseño de 4-5 tarjetas grandes con indicador de tendencia (ej. flecha verde/roja respecto al periodo anterior).
    *   *KPIs:* Capital Actual, P&L Total ($ y %), Win Rate, Profit Factor, Max Drawdown.
3.  **Gráfico Principal: Curva de Equidad (Centro):**
    *   Gráfico de líneas interactivo (Lightweight Charts).
    *   Muestra la línea de "Balance" y una línea de "Drawdown" sombreada en rojo debajo.
    *   Tooltip al pasar el ratón mostrando fecha, balance y P&L del día.
4.  **Sección Inferior: Desglose por Estrategia (Tabla):**
    *   Tabla que lista cada estrategia del portafolio con su rendimiento en el periodo seleccionado.
    *   *Columnas:* Estrategia, Símbolo, Trades, Win Rate, Profit Factor, P&L, **PF Backtest** (para comparar).
    *   *Visual:* Barra de progreso o color de fondo en la columna "PF Backtest vs Real" para destacar desviaciones grandes (ej. si el PF real es < 50% del PF backtest, se marca en rojo).

---

## 4. Flujo de Ejecución (User Journey)

1.  El usuario entra en **Rendimiento** después de 2 semanas de Paper Trading.
2.  Selecciona el filtro "Últimos 30 días" y "Paper Trading".
3.  Ve que el Capital ha crecido un 4%, con un Win Rate del 68% y un Profit Factor de 1.9.
4.  Observa la Curva de Equidad: es ascendente, con un drawdown máximo del 2.5% (dentro de lo esperado).
5.  Baja a la tabla de estrategias y nota que "BTC 1h Bollinger" tiene un PF real de 2.2 (muy cercano a su PF backtest de 2.5), pero "XRP 15m RSI" tiene un PF real de 0.9 (mientras que en backtest era 4.0).
6.  El usuario identifica que la estrategia de XRP está sufriendo un slippage excesivo o que las condiciones de mercado han cambiado, y decide ir al **Módulo 5 (Portafolio)** para pausarla temporalmente.

---

## 5. Integración con Otros Módulos

*   **Módulo 5 (Portafolio):** Necesita los metadatos de las estrategias (nombre, símbolo, PF backtest esperado) para mostrar la comparativa en la tabla.
*   **Módulo 7 (Trade Journal):** Es la única fuente de la verdad para los datos de ejecución real/paper. El Dashboard es solo una capa de visualización y agregación de estos datos.
*   **Módulo 9 (Sistema):** Si el dashboard detecta que no hay datos nuevos en X tiempo, podría mostrar un aviso de "Datos desactualizados".

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Estado Vacío (Empty State):** Si el usuario no tiene operaciones registradas aún, el dashboard no debe mostrar ceros o gráficos rotos. Debe mostrar un estado amigable: "Aún no hay operaciones registradas. Ve al Monitor para empezar a recibir señales".
*   **División por Cero:** Al calcular Win Rate o Profit Factor con 0 trades o 0 pérdidas, el backend debe devolver `null` o `0` de forma segura, evitando errores 500.
*   **Zona Horaria:** Todos los cálculos de agrupación por "día" o "mes" deben hacerse en la zona horaria configurada por el usuario (Módulo 9), no en UTC crudo, para que coincida con su percepción del día de trading.
*   **Rendimiento del Frontend:** La curva de equidad con años de datos puede tener miles de puntos. El backend debe aplicar un algoritmo de "muestreo" (downsampling) como LTTB (Largest Triangle Three Buckets) para enviar solo ~500 puntos al frontend sin perder la forma visual de la curva.

---

## 7. Logging y Trazabilidad

*   **INFO:** "Cálculo de rendimiento ejecutado para periodo 30D, tipo 'paper'. 45 trades procesados en 120ms".
*   **WARNING:** "Estrategia ID 12 muestra desviación crítica: PF Backtest 3.5, PF Real 0.8".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] El endpoint de resumen devuelve métricas agregadas correctas y maneja el caso de 0 trades sin errores.
- [ ] El endpoint de equity curve aplica downsampling si hay más de 500 puntos de datos.
- [ ] La UI muestra los KPIs principales con formato de moneda y porcentajes claros.
- [ ] El gráfico de curva de equidad es interactivo y muestra drawdown.
- [ ] La tabla de estrategias compara claramente el rendimiento real vs el backtest esperado.
- [ ] Los filtros de tiempo y tipo de operación actualizan toda la vista de forma reactiva.
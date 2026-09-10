# LasaTrading v3.0 - Módulo 3: Backtest (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-1-datos.md`, `v3-modulo-2-estrategias.md`

---

## 1. Objetivos del Módulo
Este módulo es el laboratorio de pruebas del trader. Permite simular cómo habría funcionado una configuración específica de una estrategia sobre datos históricos reales.
1.  **Simulación precisa:** Ejecutar estrategias sobre datos OHLCV aplicando reglas estrictas de entrada y salida.
2.  **Análisis visual:** Mostrar gráficamente dónde se compró, dónde se vendió y cómo evolucionó el capital.
3.  **Métricas cuantitativas:** Calcular estadísticas clave (Win Rate, Profit Factor, Drawdown) para evaluar la viabilidad de la estrategia.
4.  **Exportación:** Permitir al usuario descargar los resultados para análisis externos.

---

## 2. Arquitectura del Backend (Motor de Backtest)

El motor debe ser **rápido y determinista**. Se utilizará `pandas` y `numpy` para cálculos vectorizados, evitando bucles `for` lentos en Python siempre que sea posible.

### 2.1. Componentes del Motor
1.  **Data Loader:** Lee el archivo Parquet correspondiente (Módulo 1) y lo prepara (ordena por tiempo, maneja NaNs).
2.  **Signal Generator:** Llama al método `calculate()` de la estrategia seleccionada (Módulo 2) para marcar las velas donde hay señal de compra/venta.
3.  **Trade Simulator:** Recorre las señales y simula las entradas y salidas basándose en las reglas de gestión de riesgo (SL/TP).
    *   *Lógica de Salida:* Si entra en una vela, la salida se evalúa en las velas siguientes. Si el precio toca el Stop Loss o el Take Profit en el mismo timeframe, se cierra la operación.
4.  **Metrics Calculator:** Calcula las estadísticas finales a partir de la lista de trades simulados.

### 2.2. Endpoints REST
*   `POST /api/v1/backtest/run`: Ejecuta la simulación.
    *   *Body:* 
        ```json
        {
          "symbol": "BTCUSDT",
          "timeframe": "15m",
          "strategy_name": "rsi_divergence",
          "strategy_params": { "RSI_PERIOD": 14, "PIVOT_WINDOW": 30 },
          "exit_rules": {
            "stop_loss_type": "atr_multiplier",
            "stop_loss_value": 1.5,
            "take_profit_type": "risk_reward_ratio",
            "take_profit_value": 2.0
          },
          "initial_capital": 10000.0,
          "commission_pct": 0.001,
          "slippage_pct": 0.1
        }
        ```
        *Nota:* `slippage_pct` es opcional para simular slippage en la ejecución. Si no se proporciona, se asume 0% (ejecución perfecta). Valores típicos: 0.05% - 0.2% para cripto en timeframes bajos.
    *   *Respuesta:* `{ "task_id": "uuid", "status": "queued" }`. Aunque la simulación suele ser síncrona y rápida, el sistema devuelve siempre un `task_id` para mantener consistencia con el patrón de tareas del resto de módulos (Módulo 4).
*   `GET /api/v1/backtest/results/{task_id}`: Obtiene los resultados de una tarea finalizada: `metrics`, `equity_curve` (array de puntos) y `trades` (array de operaciones).

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Laboratorio de Backtest (Vista Principal)
**Ubicación:** Ruta `/backtest`
**Layout:** Pantalla dividida (Split View) o Panel Lateral + Área Principal.

#### A. Panel de Configuración (Izquierda / Superior)
*   **Selector de Datos:** Dropdown de Símbolo y Timeframe (cargados desde el Módulo 1).
*   **Selector de Estrategia:** Dropdown de Patrones (cargados desde el Módulo 2).
*   **Configurador Dinámico de Parámetros:** 
    *   Se genera automáticamente según el `parameters_schema` de la estrategia elegida.
    *   Ejemplo: Si la estrategia pide `RSI_PERIOD` (int), muestra un input numérico con un slider.
*   **Reglas de Salida (Exit Rules):**
    *   Dropdown para tipo de Stop Loss (ej. "Multiplicador ATR", "Fijo %"). Input para el valor.
    *   Dropdown para tipo de Take Profit (ej. "Ratio Riesgo:Beneficio", "Fijo %"). Input para el valor.
*   **Configuración Financiera:** Capital Inicial (input numérico), Comisión % (input numérico).
*   **Botón de Acción:** Grande y destacado "▶ Ejecutar Backtest".

#### B. Área de Resultados (Derecha / Inferior - Oculta hasta ejecutar)
Se divide en 3 pestañas o secciones apiladas:

1.  **Pestaña 1: Resumen y Gráficos (Dashboard)**
    *   **Tarjetas de Métricas Clave (Top):** 
        *   Profit Net (con color verde/rojo).
        *   Win Rate (%).
        *   Profit Factor.
        *   Max Drawdown (%).
        *   Total de Operaciones.
    *   **Gráfico de Equity Curve:** Línea temporal mostrando la evolución del capital (usando Lightweight Charts).
    *   **Gráfico de Precios con Trades:** Gráfico de velas del símbolo donde se superponen marcadores (flechas/triángulos) en las velas donde se abrió y cerró cada operación.

2.  **Pestaña 2: Lista de Operaciones (Trades)**
    *   Tabla detallada de cada trade simulado.
    *   *Columnas:* #, Fecha Entrada, Precio Entrada, Fecha Salida, Precio Salida, Tipo (Long/Short), P&L ($), P&L (%), Duración.
    *   *Funcionalidad:* Ordenable por columnas, exportable a CSV.

3.  **Pestaña 3: Análisis de Distribución**
    *   Histograma de distribución de P&L por operación.
    *   Gráfico de barras de Win Rate por día de la semana o por hora del día (para detectar sesgos temporales).

---

## 4. Flujo de Ejecución (User Journey)

1.  El usuario entra en **Backtest**.
2.  Selecciona `BTCUSDT`, `1h` y la estrategia `Bollinger Bounce`.
3.  El panel de parámetros se actualiza mostrando `PERIOD` (20) y `NUM_STD` (2.0). El usuario cambia `PERIOD` a 50.
4.  Configura el Stop Loss en `1.5 ATR` y el Take Profit en `2.0 Riesgo:Beneficio`.
5.  Pulsa **▶ Ejecutar Backtest**.
6.  El botón muestra un estado de "Cargando..." (spinner).
7.  En 1-2 segundos, el área de resultados se despliega/actualiza.
8.  El usuario ve que el Win Rate es del 65% y el Profit Factor de 1.8.
9.  Cambia a la pestaña de **Gráfico de Precios** para ver visualmente dónde entró y salió el bot.
10. Satisfecho, decide guardar esta configuración para probarla en el Optimizador (Módulo 4) o guardarla en su Portafolio (Módulo 5).

---

## 5. Integración con Otros Módulos

*   **Módulo 1 (Datos):** Consume los archivos Parquet. Si el archivo no existe o está corrupto, el backtest debe fallar con un error claro ("Datos no disponibles para BTCUSDT 1h").
*   **Módulo 2 (Estrategias):** Consume el catálogo para obtener la lógica de cálculo y el schema de parámetros.
*   **Módulo 4 (Optimizador):** El optimizador es esencialmente un bucle que llama a este motor de backtest múltiples veces con diferentes parámetros. El motor debe estar optimizado para ser llamado repetidamente.
*   **Módulo 5 (Portafolio):** Permite "Enviar al Portafolio" directamente desde los resultados del backtest si el usuario está satisfecho.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Lookahead Bias (Sesgo de mirada futura):** El motor debe ser extremadamente cuidadoso. Las señales se calculan con el cierre de la vela `N`, pero la entrada se ejecuta al precio de apertura de la vela `N+1`. Nunca usar el precio de cierre de `N` para entrar en `N`.
*   **Datos insuficientes:** Si el usuario pide un backtest sobre un rango de fechas donde hay menos de 50 velas, el sistema debe advertir: "Datos insuficientes para calcular indicadores de forma fiable".
*   **Rendimiento:** Para timeframes bajos (1m, 5m) con años de datos, el dataframe puede tener millones de filas. El motor debe filtrar los datos por el rango de fechas *antes* de calcular los indicadores pesados para ahorrar memoria y CPU.

---

## 7. Logging y Trazabilidad

*   **INFO:** "Backtest iniciado: BTCUSDT 1h - Bollinger Bounce (Period: 50)".
*   **INFO:** "Backtest finalizado en 1.2s. 145 operaciones simuladas. Profit Factor: 1.8".
*   **ERROR:** "Error en el motor de simulación: División por cero al calcular el Sharpe Ratio (volatilidad nula)".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] El motor de backtest ejecuta simulaciones vectorizadas sin bucles `for` explícitos en la lógica crítica.
- [ ] La ejecución respeta la regla de "Entrada en la apertura de la siguiente vela" (No Lookahead Bias).
- [ ] El endpoint `/backtest/run` devuelve métricas, curva de equity y lista de trades en formato JSON.
- [ ] La UI muestra un formulario dinámico que se adapta a los parámetros de la estrategia elegida.
- [ ] La UI renderiza la Equity Curve y superpone los trades sobre el gráfico de velas.
- [ ] La tabla de trades muestra el P&L y la duración de cada operación.
- [ ] Se manejan correctamente los errores de datos faltantes o parámetros inválidos.
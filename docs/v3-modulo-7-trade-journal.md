# LasaTrading v3.0 - Módulo 7: Trade Journal (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-6-monitor-alertas.md`

---

## 1. Objetivos del Módulo
Este módulo es el registro histórico de todas las operaciones, sean simuladas o reales.
1.  **Registro Unificado:** Almacenar operaciones de Backtest (importadas), Paper Trading y Trading Real en una sola tabla, diferenciadas por un campo `trade_type`.
2.  **Vinculación con Señales:** Permitir vincular una operación real/paper con la señal original del Monitor (Módulo 6) para auditar el proceso completo.
3.  **Análisis de Ejecución:** Calcular automáticamente el Slippage (diferencia entre precio de señal y precio de ejecución) y la Latencia (tiempo entre alerta y ejecución).
4.  **Gestión de Ciclo de Vida:** Soportar operaciones abiertas (en curso) y cerradas (con P&L finalizado).

---

## 2. Arquitectura del Backend

### 2.1. Base de Datos (PostgreSQL)
**Tabla: `trades`**
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único. |
| `trade_type` | ENUM | 'backtest', 'paper', 'real'. |
| `strategy_id` | UUID (FK) | Referencia a la estrategia del Portafolio (Módulo 5). |
| `signal_id` | UUID (FK, Nullable) | Referencia a la señal del Monitor (Módulo 6). |
| `symbol` | VARCHAR(20) | Ej. 'BTCUSDT'. |
| `direction` | ENUM | 'long', 'short'. |
| `entry_price_expected` | FLOAT | Precio de la señal/alerta. |
| `entry_price_actual` | FLOAT | Precio real de ejecución. |
| `entry_timestamp` | TIMESTAMPTZ | Cuándo se ejecutó la entrada. |
| `exit_price_expected` | FLOAT (Nullable) | TP/SL teórico. |
| `exit_price_actual` | FLOAT (Nullable) | Precio real de salida. |
| `exit_timestamp` | TIMESTAMPTZ (Nullable) | Cuándo se cerró. |
| `quantity` | FLOAT | Cantidad de activo. |
| `commission` | FLOAT | Comisiones pagadas. |
| `pnl_net` | FLOAT (Nullable) | Beneficio/Pérdida neto (calculado al cerrar). |
| `status` | ENUM | 'open', 'closed', 'cancelled'. |
| `notes` | TEXT | Observaciones del usuario. |

### 2.2. Endpoints REST
*   `GET /api/v1/journal/trades`: Lista paginada con filtros (tipo, símbolo, estado, fechas).
*   `POST /api/v1/journal/trades`: Crea una operación (manual o desde señal).
*   `PUT /api/v1/journal/trades/{id}`: Actualiza (ej. cerrar una operación abierta).
*   `DELETE /api/v1/journal/trades/{id}`: Elimina.
*   `POST /api/v1/journal/analyze-execution`: Calcula slippage y latencia.
    *   *Body:* `{ "signal_timestamp": "...", "execution_timestamp": "...", "expected_price": X, "actual_price": Y }`
    *   *Respuesta:* `{ "slippage_pct": 0.12, "latency_seconds": 45, "impact_pnl": -5.40 }`

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Dashboard del Journal (Vista Principal)
**Ubicación:** Ruta `/journal`
**Layout:**

1.  **Tarjetas de Resumen (Top):**
    *   Operaciones Totales (desglosadas por tipo: Backtest/Paper/Real).
    *   Win Rate Global (%).
    *   Profit Factor Global.
    *   Slippage Promedio (clave para evaluar la calidad de ejecución).
2.  **Filtros Rápidos:**
    *   Pestañas o botones: "Todas", "Abiertas", "Cerradas", "Paper", "Real".
    *   Selector de rango de fechas.
3.  **Tabla de Operaciones (Centro):**
    *   *Columnas:* Fecha, Tipo (Badge de color: 🟡 Paper, 🟢 Real, ⚪ Backtest), Símbolo, Dirección (Long/Short), Entrada, Salida, P&L, Estado.
    *   *Interacción:* Click en una fila expande los detalles (notas, vinculación con señal, análisis de slippage).

### Pantalla 2: Modal de Registro Rápido (Desde Señal)
**Activación:** Botón "Registrar en Journal" en el Feed de Señales del Módulo 6.
**Diseño (Formulario pre-rellenado):**
*   Los campos `symbol`, `strategy`, `direction`, `entry_price_expected` y `signal_timestamp` vienen **ya rellenos** desde la señal.
*   El usuario solo debe:
    1.  Confirmar o ajustar el `entry_price_actual` (precio al que realmente entró en el broker).
    2.  Seleccionar `trade_type` (por defecto 'paper' en fase de pruebas).
    3.  Introducir la `quantity`.
    4.  Pulsar "Guardar".

### Pantalla 3: Panel de Análisis de Ejecución (Sección en la tabla o modal)
**Activación:** Al expandir una operación cerrada o desde un botón "Analizar Slippage".
**Diseño:**
*   Muestra visualmente:
    *   Precio de Señal vs Precio de Entrada (con la diferencia en % destacada).
    *   Tiempo transcurrido entre Alerta y Ejecución.
    *   Impacto estimado en el P&L debido al slippage.

---

## 4. Flujos de Ejecución (User Journeys)

### Flujo A: Registro desde Señal del Monitor (El ideal)
1.  Llega una alerta de Telegram: "🚨 COMPRA BTCUSDT a 65000".
2.  El usuario entra en la plataforma, va al **Monitor** y ve la señal en el Feed.
3.  Pulsa **"Registrar en Journal"**.
4.  Se abre el Modal de Registro Rápido con los datos pre-rellenados.
5.  El usuario ejecuta la orden en su broker (Quantfury/Binance), mira el precio real de ejecución (ej. 65050) y lo anota en el campo `entry_price_actual`.
6.  Guarda. La operación queda registrada como 'paper' y vinculada a la señal original.

### Flujo B: Cierre de Operación
1.  El usuario ve en su tabla del Journal una operación en estado "Abierta" (🟡).
2.  Ha decidido cerrarla en su broker.
3.  Pulsa "Cerrar Operación" en la tabla.
4.  Introduce el `exit_price_actual` y las comisiones.
5.  El sistema calcula automáticamente el `pnl_net` y cambia el estado a "Cerrada" (🟢/).

---

## 5. Integración con Otros Módulos

*   **Módulo 6 (Monitor):** Es la fuente de las señales. El botón "Registrar en Journal" debe pasar el `signal_id` para crear el vínculo en la BD.
*   **Módulo 8 (Rendimiento):** Consume los datos de esta tabla (filtrando por `trade_type = 'real'` o `'paper'`) para calcular las métricas globales del portafolio y dibujar la Equity Curve real.
*   **Módulo 5 (Portafolio):** Vincula cada trade con la estrategia que lo generó para poder analizar el rendimiento por estrategia.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Operaciones Abiertas sin Cerrar:** El sistema debe permitir tener operaciones en estado 'open' indefinidamente. El P&L se mostrará como "Flotante" hasta que se cierren.
*   **Cálculo de P&L:** Debe tener en cuenta la dirección (Long/Short). 
    *   *Long:* `PnL = (exit - entry) * quantity - commission`
    *   *Short:* `PnL = (entry - exit) * quantity - commission`
*   **Slippage Negativo vs Positivo:** A veces el slippage es favorable (entraste mejor de lo esperado). El análisis debe mostrarlo en verde si es positivo y en rojo si es negativo.
*   **Importación de Backtests:** Debe existir un endpoint `POST /api/v1/journal/import-backtest` que permita subir un CSV con resultados de un backtest externo para tenerlos en el mismo sitio.

---

## 7. Logging y Trazabilidad

*   **INFO:** "Trade #123 registrado: BTCUSDT Long (Paper) a 65050".
*   **INFO:** "Trade #123 cerrado. PnL: +150$. Slippage entrada: 0.07%".
*   **WARNING:** "Slippage alto detectado en Trade #124: 1.2% (Umbral: 0.5%)".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] La tabla `trades` soporta los campos de slippage, latencia y tipo de operación.
- [ ] El Modal de Registro Rápido pre-rellena los datos desde una señal del Módulo 6.
- [ ] La tabla muestra claramente el estado (Abierta/Cerrada) y el tipo (Paper/Real/Backtest).
- [ ] El cierre de una operación calcula automáticamente el P&L neto.
- [ ] El panel de análisis de ejecución muestra el slippage y la latencia de forma visual.
- [ ] Es posible filtrar la tabla por tipo de operación y estado.
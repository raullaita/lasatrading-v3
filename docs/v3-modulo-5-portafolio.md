# LasaTrading v3.0 - Módulo 5: Portafolio / Mis Estrategias (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-2-estrategias.md`, `v3-modulo-3-backtest.md`, `v3-modulo-4-optimizador.md`

---

## 1. Objetivos del Módulo
Este módulo actúa como el "panel de control" de las estrategias que el usuario ha validado y aprobado para su uso.
1.  **Almacenamiento de Configuraciones:** Guardar de forma persistente las combinaciones exactas de (Estrategia + Símbolo + Timeframe + Parámetros + Reglas de Salida).
2.  **Gestión de Estado:** Permitir activar o pausar estrategias individualmente sin borrarlas.
3.  **Asignación de Riesgo:** Definir cuánto capital o qué porcentaje de riesgo asignar a cada estrategia.
4.  **Fuente de la Verdad:** Servir como la única fuente de datos para el Módulo 6 (Monitor) sobre qué debe vigilar en el mercado.

*Nota: No confundir con el Módulo 2 (Catálogo). El Catálogo son las "herramientas disponibles" (teoría). El Portafolio son "tus herramientas configuradas" (práctica).*

---

## 2. Arquitectura del Backend

### 2.1. Base de Datos (PostgreSQL)
Necesitamos una tabla flexible para almacenar las configuraciones personalizadas.

**Tabla: `user_strategies`**
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único. |
| `name` | VARCHAR(100) | Nombre personalizado (ej. "BTC 1h Bollinger Agresivo"). |
| `is_active` | BOOLEAN | Estado (True = operativa, False = pausada). |
| `base_strategy_name` | VARCHAR(50) | Referencia al Módulo 2 (ej. "bollinger_bounce"). |
| `symbol` | VARCHAR(20) | Símbolo (ej. "BTCUSDT"). |
| `timeframe` | VARCHAR(10) | Timeframe (ej. "1h"). |
| `pattern_params` | JSONB | Parámetros específicos (ej. `{"PERIOD": 50, "NUM_STD": 2.5}`). |
| `exit_rules` | JSONB | Reglas de salida (ej. `{"sl_type": "atr", "sl_value": 1.5}`). |
| `risk_management` | JSONB | Gestión de riesgo (ej. `{"type": "percent", "value": 2.0}`). |
| `created_at` | TIMESTAMPTZ | Fecha de creación. |
| `updated_at` | TIMESTAMPTZ | Última modificación. |

### 2.2. Endpoints REST
*   `GET /api/v1/portfolio/strategies`: Lista todas las estrategias del usuario (con filtros por `is_active`).
*   `POST /api/v1/portfolio/strategies`: Crea una nueva estrategia.
*   `GET /api/v1/portfolio/strategies/{id}`: Obtiene el detalle de una.
*   `PUT /api/v1/portfolio/strategies/{id}`: Actualiza parámetros, reglas o estado (activar/pausar).
*   `DELETE /api/v1/portfolio/strategies/{id}`: Elimina la estrategia.
*   `POST /api/v1/portfolio/strategies/{id}/toggle`: Cambia rápidamente el estado `is_active` (atajo útil para la UI).

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Dashboard del Portafolio (Vista Principal)
**Ubicación:** Ruta `/portfolio`
**Layout:**

1.  **Header:** Título "Mi Portafolio" + Botón "+ Añadir Estrategia Manualmente".
2.  **Tarjetas de Resumen (Top):**
    *   Estrategias Totales.
    *   Estrategias Activas (🟢).
    *   Estrategias Pausadas (⏸️).
    *   Riesgo Total Asignado (suma de los % de riesgo de las activas).
3.  **Tabla / Lista de Estrategias (Centro):**
    *   *Diseño:* Tarjetas horizontales o tabla expandida.
    *   *Columnas/Elementos:*
        *   **Estado:** Switch/Toggle (Activo/Pausado).
        *   **Nombre:** Nombre personalizado.
        *   **Identificador:** Badge con Símbolo + Timeframe (ej. `BTCUSDT 1h`).
        *   **Patrón:** Nombre de la estrategia base (ej. `Bollinger Bounce`).
        *   **Riesgo:** Badge con el % asignado (ej. `2%`).
        *   **Acciones:** Editar, Duplicar, Eliminar.
    *   *Interacción:* Al hacer click en "Editar" o en el cuerpo de la tarjeta, se abre la **Pantalla 2**.

### Pantalla 2: Editor de Estrategia (Modal o Ruta dedicada)
**Activación:** Click en "Editar" o "+ Añadir Estrategia Manualmente".
**Diseño (Formulario estructurado):**

*   **Sección 1: Identidad y Datos**
    *   Input: Nombre de la estrategia.
    *   Selectores: Símbolo y Timeframe.
    *   Selector: Estrategia Base (del Catálogo).
*   **Sección 2: Parámetros del Patrón**
    *   Formulario dinámico (igual que en Backtest) basado en el `parameters_schema` de la estrategia base seleccionada.
*   **Sección 3: Reglas de Salida (Exit Rules)**
    *   Selectores e inputs para Stop Loss y Take Profit.
*   **Sección 4: Gestión de Riesgo**
    *   Selector de tipo (ej. "% de Capital por operación", "Cantidad fija").
    *   Input del valor.
*   **Acciones:** Botones "Guardar Cambios", "Cancelar" y "Eliminar" (si está editando).

---

## 4. Flujos de Ejecución (User Journeys)

### Flujo A: Creación Manual
1.  El usuario va a **Portafolio** y pulsa **"+ Añadir Estrategia Manualmente"**.
2.  Rellena el formulario de la Pantalla 2 desde cero.
3.  Guarda. La estrategia aparece en la lista principal como "Pausada" por defecto.
4.  El usuario activa el switch para ponerla en estado "Activo".

### Flujo B: Importación desde Backtest/Optimizador (El más importante)
1.  El usuario está en el **Módulo 3 (Backtest)** o **Módulo 4 (Optimizador)** y encuentra una configuración ganadora.
2.  Pulsa el botón **"➕ Enviar al Portafolio"**.
3.  Se abre un modal pequeño de confirmación: "¿Guardar esta configuración en tu Portafolio?".
4.  El usuario le da un nombre (ej. "BTC 15m RSI Ganador") y pulsa "Guardar".
5.  El sistema crea la entrada en la BD y, opcionalmente, redirige al usuario al Módulo 5 para que la active.

---

## 5. Integración con Otros Módulos

*   **Módulo 2 (Catálogo):** Consume el catálogo para poblar el selector de "Estrategia Base" y obtener el schema de parámetros para el formulario dinámico.
*   **Módulo 3 y 4 (Backtest/Optimizador):** Son los "padres" de la mayoría de las estrategias. Deben tener un botón claro para exportar sus resultados a este módulo.
*   **Módulo 6 (Monitor):** Es el principal consumidor. El Monitor lee la tabla `user_strategies` filtrando por `is_active = True` para saber qué Jobs debe crear y vigilar. Si el usuario pausa una estrategia aquí, el Monitor debe detener su Job automáticamente.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Validación de Parámetros:** Al guardar, el backend debe validar que los `pattern_params` enviados coinciden con el `parameters_schema` de la estrategia base. No se pueden guardar estrategias con parámetros inválidos.
*   **Integridad Referencial:** Si se elimina una estrategia del Portafolio que está siendo usada por un Job en el Monitor (Módulo 6), el sistema debe advertir al usuario: "Esta estrategia está siendo vigilada. ¿Desea eliminarla y detener el Job asociado?".
*   **Duplicados:** Permitir duplicar estrategias es muy útil para hacer "A/B Testing" en vivo (ej. tener la misma estrategia con un SL de 1.5 y otra con 2.0).

---

## 7. Logging y Trazabilidad

*   **INFO:** "Estrategia 'BTC 1h Bollinger' creada por el usuario (ID: 123)".
*   **INFO:** "Estrategia ID 123 activada. Notificando al Monitor".
*   **WARNING:** "Intento de guardar estrategia con parámetros inválidos para 'rsi_divergence'".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] La tabla `user_strategies` se crea con soporte JSONB para parámetros flexibles.
- [ ] El CRUD de estrategias funciona correctamente (Crear, Leer, Actualizar, Borrar).
- [ ] La UI muestra la lista de estrategias con su estado (Activo/Pausado) claramente diferenciado.
- [ ] El formulario de edición es dinámico y se adapta a la estrategia base seleccionada.
- [ ] Existe un flujo claro para importar estrategias desde el Backtest y el Optimizador.
- [ ] Al pausar/activar una estrategia, el cambio de estado se refleja inmediatamente en la UI.
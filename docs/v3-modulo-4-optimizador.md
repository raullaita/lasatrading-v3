# LasaTrading v3.0 - Módulo 4: Optimizador (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-1-datos.md`, `v3-modulo-2-estrategias.md`, `v3-modulo-3-backtest.md`

---

## 1. Objetivos del Módulo
Este módulo automatiza la búsqueda de los mejores parámetros para una estrategia, eliminando el sesgo humano y el "curve fitting".
1.  **Búsqueda Masiva:** Ejecutar miles de backtests variando parámetros dentro de rangos definidos.
2.  **Validación Out-of-Sample (OOS):** Dividir los datos en "Entrenamiento" (In-Sample) y "Validación" (Out-of-Sample) para detectar estrategias que solo funcionan en el pasado (overfitting).
3.  **Gestión de Tareas Pesadas:** Ejecutar el proceso en segundo plano sin bloquear la interfaz ni el servidor.
4.  **Ranking y Filtrado:** Presentar los resultados ordenados por robustez, no solo por rentabilidad bruta.

---

## 2. Arquitectura del Backend

### 2.1. Motor de Optimización y Cola de Tareas
*   **Orquestador:** ARQ (o Celery) + Redis. Las optimizaciones **nunca** corren en el hilo principal de FastAPI.
*   **Lógica de Búsqueda:** 
    *   *Grid Search:* Prueba todas las combinaciones discretas (ej. RSI [7, 14, 21]).
    *   *Random Search (Opcional v3.1):* Muestreo aleatorio para espacios de parámetros muy grandes.
*   **Motor de Validación OOS:**
    1.  Divide el DataFrame histórico (ej. 70% IS, 30% OOS).
    2.  Ejecuta el Backtest (Módulo 3) sobre el tramo IS.
    3.  Si las métricas IS superan los umbrales mínimos (ej. PF > 1.2), ejecuta el Backtest sobre el tramo OOS con los mismos parámetros.
    4.  Calcula la **Degradación**: `(Metrica_IS - Metrica_OOS) / Metrica_IS`.

### 2.2. Base de Datos (PostgreSQL)
Necesitamos persistir el estado de las tareas y los resultados.
*   **Tabla `optimization_tasks`:** `id`, `status` (queued, running, completed, failed, cancelled), `progress_pct`, `total_combinations`, `created_at`, `config_json`.
*   **Tabla `optimization_results`:** `id`, `task_id`, `rank`, `strategy_name`, `params_json`, `in_sample_metrics_json` (IS), `oos_metrics_json` (OOS), `verdict` ('robust', 'overfit', 'failed').

### 2.3. Endpoints REST
*   `POST /api/v1/optimizer/run`: Inicia la tarea.
    *   *Body:* Estrategia, rangos de parámetros (min, max, step), configuración OOS (split ratio, umbrales), métrica objetivo (ej. maximizar Profit Factor).
*   `GET /api/v1/optimizer/tasks/{task_id}/status`: Devuelve progreso en tiempo real y top candidatos parciales.
*   `POST /api/v1/optimizer/tasks/{task_id}/cancel`: Detiene la tarea (usando flags de cancelación en memoria/Redis).
*   `GET /api/v1/optimizer/tasks/{task_id}/results`: Devuelve la tabla final de candidatos ordenada.
*   `GET /api/v1/optimizer/history`: Lista de optimizaciones pasadas.

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Dashboard del Optimizador
**Ubicación:** Ruta `/optimizer`
**Layout:**

1.  **Sección Superior: Optimizaciones en Curso**
    *   Tarjetas de progreso para tareas activas.
    *   Barra de progreso animada, % completado, combinaciones probadas, tiempo estimado.
    *   Lista de "Top 3 candidatos parciales" que se actualiza en tiempo real.
    *   Botón "Cancelar" visible en cada tarjeta.
2.  **Sección Inferior: Historial y Resultados**
    *   Tabla de optimizaciones finalizadas.
    *   Al hacer click en una fila finalizada, se expande o navega a la **Pantalla 3 (Resultados)**.

### Pantalla 2: Modal de Configuración (Nueva Optimización)
**Activación:** Botón "+ Nueva Optimización".
**Diseño (Wizard o Panel Lateral):**

*   **Paso 1: Selección de Estrategia y Datos**
    *   Selector de Estrategia (Módulo 2).
    *   Selector de Símbolo y Timeframe (Módulo 1).
    *   Selector de Rango de Fechas (para el backtest).
*   **Paso 2: Definición de Rangos (Dinámico)**
    *   Basado en el `parameters_schema` de la estrategia.
    *   Para cada parámetro (ej. `RSI_PERIOD`), el usuario define: `Min`, `Max`, `Step`.
    *   *Calculadora de combinaciones:* Muestra en tiempo real "Total de combinaciones a probar: 1,250". Si supera 10,000, muestra advertencia de tiempo.
*   **Paso 3: Configuración OOS y Filtros**
    *   Toggle "Activar Validación OOS".
    *   Slider "Ratio de división" (ej. 70% IS / 30% OOS).
    *   Umbrales mínimos para aceptar un candidato (ej. PF OOS > 1.0, Max DD < 15%).
*   **Paso 4: Lanzamiento**
    *   Resumen de la configuración.
    *   Botón "Iniciar Optimización".

### Pantalla 3: Tabla de Resultados y Veredicto
**Activación:** Al completar una tarea o desde el historial.
**Diseño:**
*   **Tabla de Candidatos:**
    *   *Columnas:* Rank, Parámetros, Win Rate IS, PF IS, Win Rate OOS, PF OOS, Degradación (%), **Veredicto**.
    *   *El Veredicto (Clave):* 
        *   🟢 **Robusto:** Pasa todos los filtros OOS y degradación < 30%.
        *   🟡 **Posible Overfitting:** Rentable en OOS pero degradación alta (>30%).
        *   🔴 **Descartado:** Pierde dinero en OOS (PF < 1.0).
*   **Acciones:** Botón "➕ Enviar al Portafolio" en las filas 🟢 y 🟡.

---

## 4. Flujo de Ejecución (User Journey)

1.  El usuario entra en **Optimizador** y pulsa **"+ Nueva Optimización"**.
2.  Elige `Bollinger Bounce` para `ETHUSDT 1h`.
3.  Define el rango para `PERIOD`: Min 20, Max 50, Step 5. Y para `NUM_STD`: Min 1.5, Max 2.5, Step 0.5.
4.  El sistema calcula: "60 combinaciones".
5.  Activa OOS (70/30) y exige PF OOS > 1.2.
6.  Lanza la tarea. El modal se minimiza.
7.  El usuario ve la tarjeta de progreso en el Dashboard. A los 30 segundos, termina.
8.  Abre los resultados. Ve que de 60 combinaciones, solo 5 pasaron el filtro OOS.
9.  La mejor tiene un PF IS de 2.5 y un PF OOS de 2.1 (Degradación 16% -> 🟢 Robusto).
10. Pulsa "Enviar al Portafolio".

---

## 5. Integración con Otros Módulos

*   **Módulo 3 (Backtest):** El optimizador es un bucle que instancia el motor de backtest. Debe reutilizar la lógica de `Trade Simulator` para ser eficiente.
*   **Módulo 5 (Portafolio):** El botón "Enviar al Portafolio" crea una entrada en la tabla de estrategias del usuario con los parámetros exactos del candidato seleccionado.
*   **Módulo 6 (Monitor):** Solo las estrategias que vienen de aquí (o del Backtest manual) y están en el Portafolio pueden ser monitorizadas.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Explosión Combinatoria:** Si el usuario define rangos muy amplios (ej. 1 millón de combinaciones), el sistema debe advertir: "Esta tarea podría tardar más de 2 horas. ¿Desea continuar?".
*   **Cancelación Limpia:** El usuario debe poder cancelar una tarea a mitad de camino. El motor debe comprobar una flag `is_cancelled` en cada iteración del bucle para detenerse limpiamente y guardar los resultados parciales.
*   **Recursos (RAM/CPU):** Las optimizaciones paralelas consumen mucha RAM. El sistema debe limitar el `max_workers` (ej. 4 procesos paralelos) para no tumbar el servidor.
*   **Lookahead Bias en OOS:** La división de datos debe ser estrictamente temporal. Nunca mezclar velas aleatoriamente. El corte debe ser en una fecha específica.

---

## 7. Logging y Trazabilidad

*   **INFO:** "Optimización #45 iniciada: 1250 combinaciones. OOS: 70/30".
*   **INFO:** "Optimización #45: 50% completado. 3 candidatos robustos encontrados".
*   **WARNING:** "Optimización #45: Degradación alta detectada en candidato Rank 1 (IS PF: 4.0, OOS PF: 1.1)".
*   **INFO:** "Optimización #45 finalizada. 12 candidatos robustos, 45 overfitting".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] El sistema lanza tareas en segundo plano (Redis/ARQ) sin bloquear la UI.
- [ ] La división In-Sample / Out-of-Sample es estrictamente temporal.
- [ ] El usuario puede definir rangos (Min/Max/Step) para los parámetros de cualquier estrategia.
- [ ] La UI muestra el progreso en tiempo real y permite cancelar la tarea.
- [ ] Los resultados clasifican a los candidatos en Robusto/Overfitting/Descartado basándose en la degradación OOS.
- [ ] Es posible enviar un candidato ganador directamente al Módulo 5 (Portafolio).
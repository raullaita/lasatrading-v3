# LasaTrading v3.0 - Módulo 6: Monitor y Alertas (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-1-datos.md`, `v3-modulo-2-estrategias.md`, `v3-modulo-5-portafolio.md`

---

## 1. Objetivos del Módulo
Este módulo es el "vigilante" del sistema. Se encarga de evaluar el mercado en tiempo real basándose en las estrategias activas del Portafolio y notificar al usuario cuando se detecta una oportunidad.
1.  **Ejecución de Jobs (Tareas en Vivo):** Ejecutar periódicamente las estrategias activas sobre los datos más recientes.
2.  **Detección de Señales:** Identificar cuándo un patrón se cumple en la vela recién cerrada.
3.  **Sistema de Alertas:** Enviar notificaciones inmediatas (Telegram) cuando se detecta una señal.
4.  **Alertas de Precio Personalizadas:** Permitir al usuario crear alertas simples (ej. "BTC > 70000") independientes de las estrategias.

---

## 2. Arquitectura del Backend

### 2.1. Motor de Monitorización (Task Manager)
*   **Programador (Scheduler):** Un proceso en segundo plano (ARQ/Celery beat o un loop asíncrono en FastAPI) que se despierta cada vez que cierra una vela (ej. cada 15 min para estrategias de 15m).
*   **Lógica de Evaluación:**
    1.  Consulta la tabla `user_strategies` (Módulo 5) filtrando por `is_active = True`.
    2.  Agrupa las estrategias por Símbolo y Timeframe para optimizar llamadas a la API de datos.
    3.  Obtiene las últimas velas (asegurando que el Módulo 1 las tenga actualizadas).
    4.  Ejecuta el método `calculate()` de cada estrategia (Módulo 2).
    5.  Si se detecta una señal (ej. cruce de RSI), genera un objeto `Signal`.
*   **Gestión de Estado:** Cada Job debe tener un estado: `idle`, `running`, `paused`, `stopped`, `error`. `paused` = pausado manualmente por el usuario; `stopped` = detenido automáticamente tras 3 fallos consecutivos; `error` = fallo puntual no fatal. Si un Job falla 3 veces seguidas, pasa a `stopped` automáticamente y alerta al usuario.

### 2.2. Sistema de Notificaciones (Alert Dispatcher)
*   **Integración:** Cliente de Telegram (usando `python-telegram-bot` o similar).
*   **Formato del Mensaje:** Estandarizado y claro.
    *   *Ejemplo:* `🚨 SEÑAL DE COMPRA\nSímbolo: BTCUSDT\nEstrategia: RSI Divergence\nPrecio: 65000\nTimeframe: 15m\nHora: 14:30`
*   **Manejo de Errores:** Si Telegram está caído, debe reintentar con *backoff* y guardar la alerta en una cola de "pendientes" para enviarla cuando se restablezca.

### 2.3. Base de Datos (PostgreSQL)
*   **Tabla `monitor_jobs`:** `id`, `strategy_id` (FK a Módulo 5), `status`, `last_run_at`, `error_message`, `created_at`.
*   **Tabla `price_alerts`:** `id`, `symbol`, `condition` (>, <, crosses), `target_price`, `is_active`, `last_triggered_at`.
*   **Tabla `signals_log`:** Histórico de todas las señales detectadas (para auditoría y para el Módulo 7).

### 2.4. Endpoints REST
*   `GET /api/v1/monitor/jobs`: Lista todos los jobs con su estado.
*   `POST /api/v1/monitor/jobs/{id}/start`: Inicia un job.
*   `POST /api/v1/monitor/jobs/{id}/stop`: Detiene un job.
*   `GET /api/v1/monitor/signals`: Histórico de señales detectadas (paginado).
*   `GET /api/v1/monitor/price-alerts`: Lista alertas de precio.
*   `POST /api/v1/monitor/price-alerts`: Crea una alerta de precio.
*   `DELETE /api/v1/monitor/price-alerts/{id}`: Elimina alerta.

### 2.5. Sincronización de Datos en Vivo (CRÍTICO)
El Monitor NO debe esperar al Data Updater (Módulo 1) para evaluar la última vela, ya que eso introduciría latencia inaceptable en timeframes bajos.

**Flujo correcto:**
1. Para evaluar la señal en tiempo real, el Monitor consultará **directamente la API REST de Binance** (`/api/v3/klines?limit=2`) para obtener la última vela cerrada.
2. El Data Updater (Módulo 1) seguirá actualizando los Parquet en segundo plano (cada 1-5 min según timeframe) para mantener el histórico intacto para Backtest/Optimizador.
3. El Monitor debe verificar que el `timestamp` de la vela obtenida de Binance sea posterior al último evaluado, para evitar señales duplicadas.

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Dashboard de Monitor (Vista Principal)
**Ubicación:** Ruta `/monitor`
**Layout:**

1.  **Sección Superior: Estado del Sistema**
    *   Indicadores globales: "Monitor Activo", "Última evaluación: hace 2 min", "Conexión Telegram: OK".
2.  **Sección Central: Jobs Activos (Tarjetas)**
    *   Cada estrategia activa del Portafolio (Módulo 5) tiene su propia tarjeta.
    *   *Contenido:* Nombre de la estrategia, Símbolo/TF, Estado (🟢 Evaluando (running) / 🟡 Pausado (paused) / ⏸️ Detenido (stopped) / 🔴 Error (error)), Última señal detectada.
    *   *Controles:* Botón de Play/Pause rápido en cada tarjeta.
3.  **Sección Inferior: Feed de Señales en Tiempo Real**
    *   Lista cronológica de las últimas señales detectadas por los jobs.
    *   *Diseño:* Tipo "timeline" o lista de tarjetas pequeñas.
    *   *Acción:* Botón "Registrar en Journal" que lleva al Módulo 7 pre-rellenando los datos.

### Pantalla 2: Alertas de Precio (Pestaña o Ruta secundaria)
**Ubicación:** Ruta `/monitor/alerts`
**Diseño:**
*   **Formulario de Creación:**
    *   Selector de Símbolo.
    *   Condición (Mayor que, Menor que, Cruce al alza, Cruce a la baja).
    *   Precio objetivo (Input numérico).
    *   Opción "Repetir alerta" (boolean).
*   **Tabla de Alertas Activas:**
    *   Lista de alertas configuradas con su estado (Activa, Disparada, Pausada).
    *   Botones para Editar/Eliminar.

---

## 4. Flujo de Ejecución (User Journey)

1.  El usuario activa 3 estrategias en el **Módulo 5 (Portafolio)**.
2.  El **Monitor** detecta el cambio y crea/actualiza los 3 Jobs en segundo plano.
3.  Cada 15 minutos (para estrategias de 15m), el Task Manager se despierta.
4.  Pide al Módulo 1 las últimas velas de BTC, ETH y XRP.
5.  Ejecuta la lógica de las 3 estrategias.
6.  La estrategia de BTC detecta un cruce de MACD.
7.  El sistema guarda la señal en `signals_log` y envía un mensaje a Telegram: "🚨 SEÑAL COMPRA BTC...".
8.  El usuario recibe el mensaje en su móvil.
9.  Entra en la plataforma, ve la señal en el **Feed de Señales** y pulsa "Registrar en Journal" para anotar que la ha ejecutado en su broker.

---

## 5. Integración con Otros Módulos

*   **Módulo 1 (Datos):** El Monitor no depende del Data Updater para evaluar la última vela (ver sección 2.5), pero debe verificar que el `timestamp` de la vela obtenida de Binance sea posterior al último evaluado para evitar señales duplicadas.
*   **Módulo 2 (Estrategias):** Consume la lógica `calculate()` de los patrones.
*   **Módulo 5 (Portafolio):** Lee la configuración de qué estrategias vigilar. Si el usuario pausa una estrategia en el Portafolio, el Monitor debe detener su Job inmediatamente.
*   **Módulo 7 (Trade Journal):** El Monitor *genera* la señal, el Journal *registra* la ejecución humana. El botón "Registrar en Journal" debe pasar el `signal_id` para vincularlos.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Falsa Señal por Datos Incompletos:** Si el Data Updater falla y el Monitor evalúa una vela vieja, puede generar una señal duplicada o errónea. *Solución:* El Monitor debe verificar el `timestamp` de la última vela y rechazar evaluar si es anterior a la hora actual menos el timeframe.
*   **Rate Limits de Telegram:** Si hay muchas señales a la vez, Telegram puede bloquear el bot. *Solución:* Cola de mensajes con rate limiting (ej. máx 1 mensaje cada 2 segundos).
*   **Reinicio del Servidor:** Los Jobs deben ser persistentes. Si el servidor se reinicia, el Task Manager debe leer la BD y reanudar los Jobs que estaban en estado `running` o `idle` (no `stopped` por el usuario).

---

## 7. Logging y Trazabilidad

*   **INFO:** "Job BTC-15m-RSI iniciado. Evaluando vela 14:30".
*   **INFO:** "Señal detectada: COMPRA BTCUSDT a 65000. Enviando a Telegram".
*   **WARNING:** "Fallo al enviar Telegram (Timeout). Reintentando en 10s".
*   **ERROR:** "Job ETH-1h-MACD falló: Datos insuficientes para calcular indicador".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] El Task Manager ejecuta las estrategias activas automáticamente según su timeframe.
- [ ] Las señales detectadas se guardan en la BD y se envían a Telegram correctamente.
- [ ] La UI muestra el estado de los Jobs en tiempo real (sin necesidad de recargar la página, idealmente vía WebSockets).
- [ ] El usuario puede crear y gestionar Alertas de Precio personalizadas.
- [ ] Si el servidor se reinicia, los Jobs se reanudan automáticamente (persistencia de estado).
- [ ] Existe un flujo claro para pasar una señal detectada al Módulo 7 (Trade Journal).
# LasaTrading v3.0 - Módulo 1: Datos (Especificaciones Detalladas)

**Versión:** 1.1
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`

---

## 1. Objetivos del Módulo
Este módulo es la base de la plataforma. Se encarga de:
1. Descargar datos históricos (OHLCV) desde Binance o archivos CSV.
2. Almacenar los datos de forma optimizada (Parquet) y registrar sus metadatos (PostgreSQL).
3. Mantener los datos actualizados en tiempo real mediante un proceso en segundo plano (Data Updater).
4. Proporcionar al usuario una interfaz clara para visualizar el estado, importar nuevos datos y gestionar los existentes.

---

## 2. Arquitectura de Datos

### 2.1. Almacenamiento en Disco (Parquet)
Los datos de velas (OHLCV) se guardarán en archivos Parquet para maximizar la velocidad de lectura/escritura en series temporales.
*   **Ruta:** `data_storage/{SYMBOL}_{TIMEFRAME}.parquet`
*   **Columnas obligatorias:** 
    *   `timestamp` (datetime64[ns, UTC] - Indexado)
    *   `open` (float64)
    *   `high` (float64)
    *   `low` (float64)
    *   `close` (float64)
    *   `volume` (float64)
*   **Regla de oro:** Los archivos Parquet nunca deben tener filas duplicadas. Al hacer *append*, se debe filtrar estrictamente por `timestamp > último_timestamp_existente`.

### 2.2. Base de Datos Relacional (PostgreSQL)
Se usará para guardar los metadatos y el estado de los archivos, evitando tener que leer los Parquet para saber qué datos tenemos.

**Tabla: `market_data_files`**
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `id` | UUID (PK) | Identificador único. |
| `symbol` | VARCHAR(20) | Ej: 'BTCUSDT'. |
| `timeframe` | VARCHAR(10) | Ej: '15m', '1h', '4h'. |
| `file_path` | TEXT | Ruta absoluta al archivo Parquet. |
| `row_count` | INTEGER | Número total de velas en el archivo. |
| `first_candle_at` | TIMESTAMPTZ | Fecha de la primera vela. |
| `last_candle_at` | TIMESTAMPTZ | Fecha de la última vela (clave para el Data Updater). |
| `file_size_mb` | FLOAT | Tamaño del archivo en disco. |
| `updated_at` | TIMESTAMPTZ | Última vez que se modificó el archivo. |

### 2.3. Watchlist / Favoritos (PostgreSQL)
Se usará para gestionar los símbolos favoritos del usuario, permitiendo filtrar importaciones y destacar símbolos en la UI.

**Tabla: `watchlist`**
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `symbol` | VARCHAR(20) (PK) | Ej: 'BTCUSDT'. |
| `is_favorite` | BOOLEAN | Si aparece destacado en el Dashboard. |
| `notes` | TEXT | Notas personales del usuario. |
| `added_at` | TIMESTAMPTZ | Fecha de adición. |

**Endpoints adicionales:**
- `GET /api/v1/watchlist`: Lista todos los símbolos de la watchlist.
- `POST /api/v1/watchlist`: Añade un símbolo (body: `{ "symbol": "BTCUSDT", "notes": "..." }`).
- `DELETE /api/v1/watchlist/{symbol}`: Elimina un símbolo.
- `PUT /api/v1/watchlist/{symbol}/favorite`: Toggle del estado favorito.

---

## 3. Procesos del Backend (API y Lógica)

### 3.1. Endpoints REST
*   `GET /api/v1/data/status`: Devuelve la lista de todos los archivos con sus metadatos y un campo calculado `freshness_status` ('fresh', 'stale', 'missing').
*   `POST /api/v1/data/import`: Inicia una tarea de descarga histórica.
    *   *Body:* `{ "symbols": ["BTCUSDT"], "timeframes": ["15m"], "start_date": "2023-01-01", "source": "binance" }`
    *   *Respuesta:* `{ "task_id": "uuid", "status": "queued" }`
*   `GET /api/v1/data/import/{task_id}`: Consulta el progreso de una descarga histórica.
*   `DELETE /api/v1/data/{file_id}`: Elimina el registro de la BD y el archivo físico del disco.
*   `POST /api/v1/data/refresh`: Fuerza la actualización inmediata de todos los archivos marcados como 'stale'.

### 3.2. Tarea en Segundo Plano: Data Updater
*   **Motor:** ARQ (o Celery) ejecutando una tarea recurrente **cada 1 minuto si hay timeframes de 1m/3m en la watchlist, o cada 5 minutos para timeframes superiores**.
*   **Lógica:**
    1. Consulta la tabla `market_data_files`.
    2. Para cada archivo, calcula si `last_candle_at` es anterior a la hora actual menos el timeframe (ej. si es 15m y han pasado >15 min).
    3. Si está desactualizado, llama a la API de Binance (`/api/v3/klines`) pidiendo las últimas 10 velas.
    4. Filtra las velas nuevas, hace *append* al Parquet y actualiza la fila en PostgreSQL.
    5. Registra el éxito/error en los logs del sistema.

---

## 4. Pantallas del Frontend (UI/UX)

### Pantalla 1: Dashboard de Datos (Vista Principal)
**Ubicación:** Ruta `/data`
**Layout:**
1.  **Header:** Título "Gestión de Datos" + Botón grande "+ Importar / Actualizar Datos".
2.  **Tarjetas de Resumen (Top):**
    *   Total de Símbolos monitorizados.
    *   Archivos actualizados (🟢) vs Desactualizados (🔴).
    *   Espacio en disco utilizado.
3.  **Sección "Tareas en curso" (Condicional):**
    *   Solo visible si hay descargas en segundo plano. Muestra tarjetas resumen. Al hacer click, reabre el modal de progreso.
4.  **Tabla de Archivos (Centro):**
    *   *Columnas:* Símbolo (con icono de favorito), Timeframe (badge), Tamaño, Nº Velas, Primera Vela, Última Vela, Estado (Badge de color), Acciones (Ver gráfico, Eliminar).
    *   *Filtros:* Buscador por símbolo, Filtro por Timeframe, Toggle "Solo desactualizados".
    *   *Interacción:* Click en una fila expande un panel inferior con un mini-gráfico (sparkline) de las últimas 50 velas y un área de "Últimos eventos" (últimos 3 logs de ese archivo).

### Pantalla 2: Modal de Importación / Actualización
**Activación:** Al hacer click en "+ Importar / Actualizar Datos".
**Diseño (Wizard de 2 pasos):**

*   **Paso 1: Selección:**
    *   **Selector de Timeframes:** Botones rápidos para los más usados (**15m, 1h, 4h**), más un campo de texto con autocompletado/desplegable para seleccionar **cualquier timeframe válido de Binance** (1m, 3m, 5m, 30m, 2h, 6h, 8h, 12h, 1d, 1W, 1M). *El sistema debe validar el timeframe antes de lanzar.*
    *   Selector múltiple de Símbolos (con búsqueda y opción "Seleccionar todos los de la Watchlist").
    *   Selector de Rango de Fechas (Inicio / Fin). Si se deja vacío, se asume "desde el inicio disponible hasta ahora".

*   **Paso 2: Progreso y Gestión de Tareas:**
    *   Barra de progreso general.
    *   Lista de tareas individuales con su estado (Pendiente, En curso, Completada, Fallida).
    *   Log en tiempo real de la descarga (vía WebSockets).
    *   **Botón "Minimizar / Cerrar":** Al pulsarlo, el modal se cierra pero la tarea sigue en segundo plano.
    *   **Cómo volver a verlo:**
        1.  En la **Topbar** aparecerá un pequeño indicador (ej. icono de descarga con un número) si hay tareas activas.
        2.  En la **Pantalla Principal**, en la sección "Tareas en curso", al hacer click en la tarjeta de la tarea.
        3.  El botón principal cambiará temporalmente a "Ver progreso de importación" mientras haya tareas activas.

---

## 5. Flujo de Ejecución (User Journey)

1.  El usuario entra en la pestaña **Datos**.
2.  Ve que tiene 10 archivos, pero 3 están en rojo (🔴 Desactualizados).
3.  Hace click en **"+ Importar / Actualizar Datos"**.
4.  Selecciona los 3 símbolos desactualizados, elige "15m" y pone la fecha de inicio de hace 2 días.
5.  El frontend llama a `POST /api/v1/data/import`.
6.  El modal cambia a la vista de **Progreso**. El usuario ve cómo se descargan las velas en tiempo real.
7.  El usuario cierra el modal para seguir trabajando. La tarea sigue en segundo plano.
8.  Al terminar, la tabla principal se refresca automáticamente y los 3 archivos pasan a estado verde (🟢 Actualizado).
9.  En segundo plano, el **Data Updater** tomará el relevo cada 5 minutos para mantenerlos frescos sin intervención del usuario.

---

## 6. Casos Borde y Manejo de Errores

*   **API de Binance caída / Rate Limit:** El backend debe implementar *Exponential Backoff* (reintentos con espera creciente). Si falla definitivamente, marca la tarea como 'failed' y notifica en la UI con un mensaje claro ("Error de conexión con Binance, reintente en 5 min").
*   **Disco lleno:** Antes de hacer *append* a un Parquet, el sistema debe verificar que hay al menos un 10% de espacio libre. Si no, aborta y lanza una alerta crítica en el Módulo 9 (Sistema).
*   **Datos corruptos en Parquet:** Si al leer un archivo se detecta un error de formato, el sistema debe moverlo a una carpeta `data_storage/corrupted/` y notificar al usuario para que lo reimporte.

---

## 7. Logging y Trazabilidad

Aunque la visualización centralizada de logs corresponde al Módulo 9, el Módulo 1 debe generar y almacenar logs estructurados desde el primer día.

### 7.1. Tipos de Logs del Módulo 1
*   **INFO:** 
    *   "Iniciando descarga histórica: BTCUSDT 15m desde 2023-01-01"
    *   "Data Updater: Actualizando 3 archivos desactualizados"
    *   "Descarga completada: 1500 velas añadidas a BTCUSDT_15m.parquet"
*   **WARNING:** 
    *   "Rate limit de Binance alcanzado, reintentando en 60s"
    *   "Archivo BTCUSDT_15m.parquet desactualizado desde hace 2 horas"
*   **ERROR:** 
    *   "Fallo en descarga de ETHUSDT 1h: Timeout de conexión"
    *   "Error de escritura en disco: Espacio insuficiente"

### 7.2. Formato de Logs
*   **Estructura:** JSON estructurado (para facilitar el parsing futuro).
    ```json
    {
      "timestamp": "2026-09-10T14:30:00Z",
      "level": "INFO",
      "module": "data_updater",
      "action": "append_candles",
      "symbol": "BTCUSDT",
      "timeframe": "15m",
      "message": "Añadidas 10 velas nuevas",
      "details": {
        "candles_added": 10,
        "last_candle": "2026-09-10T14:15:00Z"
      }
    }
    ```

### 7.3. Almacenamiento
*   **Archivos:** Logs rotativos diarios en `logs/data_module_YYYY-MM-DD.log`.
*   **Base de Datos:** Los logs de nivel `ERROR` y `WARNING` deben insertarse también en una tabla `system_logs` en PostgreSQL para su posterior visualización en el Módulo 9.

### 7.4. Visualización en el Módulo 1 (Mínima)
En la **Pantalla 1 (Dashboard de Datos)**, en la sección expandida de cada archivo o en el **Modal de Progreso**, debe haber un pequeño área de "Últimos eventos" que muestre los últimos 3 logs relacionados con ese archivo (ej. "Actualizado hace 5 min", "Error de descarga hace 2 horas").

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] La tabla `market_data_files` se crea y se pobla correctamente.
- [ ] La descarga histórica desde Binance genera archivos Parquet válidos y sin duplicados.
- [ ] El Data Updater actualiza automáticamente los archivos desactualizados cada 5 minutos.
- [ ] La UI muestra el estado de frescura (🟢/🔴) correctamente.
- [ ] El modal de importación permite timeframes personalizados y muestra el progreso en tiempo real.
- [ ] Las tareas en segundo plano pueden minimizarse y reabrirse desde la Topbar o la pantalla principal.
- [ ] Se generan logs JSON estructurados y se almacenan los errores en la tabla `system_logs`.
- [ ] Se pueden eliminar archivos desde la UI (borrando BD y disco).
# LasaTrading v3.0 - Módulo 9: Configuración y Sistema (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`

---

## 1. Objetivos del Módulo
Este módulo actúa como el panel de control global y el centro de mantenimiento de la plataforma.
1.  **Configuración Centralizada:** Gestionar parámetros globales (Capital, Riesgo, API Keys, Telegram) desde un único lugar.
2.  **Monitorización de Salud (Health Check):** Verificar en tiempo real que todos los componentes del sistema (DB, Redis, APIs externas, Disco) funcionan correctamente.
3.  **Gestión de Backups:** Permitir crear, descargar y restaurar copias de seguridad de la base de datos y archivos críticos.
4.  **Visor de Logs:** Centralizar la visualización de los logs estructurados generados por todos los módulos para facilitar el debugging.

---

## 2. Arquitectura del Backend

### 2.1. Base de Datos (PostgreSQL)
**Tabla: `system_config`**
| Columna | Tipo | Descripción |
| :--- | :--- | :--- |
| `key` | VARCHAR(100) (PK) | Identificador único (ej. 'trading.initial_capital'). |
| `value` | TEXT | Valor de la configuración (se parsea según el tipo). |
| `category` | VARCHAR(50) | Categoría para agrupar en la UI (ej. 'trading', 'notifications', 'system'). |
| `updated_at` | TIMESTAMPTZ | Última modificación. |

### 2.2. Componentes del Sistema
*   **Health Checker:** Un servicio que consulta el estado de:
    *   Conexión a PostgreSQL.
    *   Conexión a Redis.
    *   Espacio en disco disponible (alerta si < 10%).
    *   Conectividad con API de Binance (ping simple).
    *   Validez del Token de Telegram (usando `getMe` de la API de Telegram, **sin enviar mensajes**).
*   **Backup Manager:** Script que ejecuta `pg_dump` para la BD y comprime los archivos de configuración y Parquet críticos en un `.zip` o `.tar.gz`.

### 2.3. Endpoints REST
*   `GET /api/v1/system/config`: Devuelve toda la configuración agrupada por categorías.
*   `PUT /api/v1/system/config`: Actualiza uno o varios valores de configuración.
*   `POST /api/v1/system/config/test-telegram`: Envía **un único mensaje de prueba** al chat configurado. *Nota: Este endpoint solo debe llamarse explícitamente desde el botón "Probar Conexión" en la UI, nunca automáticamente al guardar.*
*   `GET /api/v1/system/health`: Devuelve el estado de todos los componentes (OK, Warning, Error).
*   `POST /api/v1/system/backup`: Inicia la creación de un backup manual.
*   `GET /api/v1/system/backups`: Lista los backups disponibles con fecha y tamaño.
*   `GET /api/v1/system/logs`: Devuelve logs paginados y filtrables (por nivel, módulo, fecha).

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Panel de Sistema (Vista Principal con Pestañas)
**Ubicación:** Ruta `/system`
**Layout:** Navegación interna por pestañas (Tabs) para mantener todo organizado.

#### Pestaña 1: Configuración Global
*   **Sección Trading:**
    *   Input: Capital Inicial Total (ej. 10000 USDT).
    *   Input: Riesgo máximo por operación (%).
    *   Input: Comisión por defecto (%).
*   **Sección Notificaciones (Telegram):**
    *   Input: Bot Token.
    *   Input: Chat ID.
    *   Botón: "📡 Probar Conexión" (Muestra un toast de éxito/error tras llamar al endpoint de prueba).
*   **Sección General:**
    *   Selector: Zona Horaria.
    *   Selector: Formato de Fecha/Hora.
    *   Toggle: Tema (Dark/Light).

#### Pestaña 2: Estado del Sistema (Health Check)
*   **Diseño:** Lista de tarjetas o filas con semáforos.
*   **Elementos:**
    *   🟢 Base de Datos: Conectada (Latencia: 12ms).
    *   🟢 Redis: Conectado.
    *    Espacio en Disco: 85% usado (Advertencia).
    *   🔴 API Binance: Timeout (Error).
*   **Actualización:** Polling cada 30 segundos o vía WebSockets.

#### Pestaña 3: Backups
*   **Header:** Botón grande "🛡️ Crear Backup Ahora".
*   **Tabla de Backups Existentes:**
    *   *Columnas:* Fecha/Hora, Tamaño, Tipo (Automático/Manual), Acciones (⬇️ Descargar, 🗑️ Eliminar).
*   **Configuración de Backups Automáticos:**
    *   Toggle: Activar/Desactivar.
    *   Selector: Frecuencia (Diario, Semanal).
    *   Input: Retención (ej. mantener últimos 7 backups).

#### Pestaña 4: Logs del Sistema
*   **Filtros (Top):**
    *   Nivel: INFO, WARNING, ERROR.
    *   Módulo: Data, Monitor, Optimizer, System, All.
    *   Buscador de texto.
*   **Tabla de Logs:**
    *   *Columnas:* Timestamp, Nivel (Badge de color), Módulo, Mensaje.
    *   *Interacción:* Click en una fila expande para ver el JSON completo del log (útil para ver el campo `details`).
    *   *Auto-scroll:* Toggle para mantenerse al final de la lista si hay muchos logs en tiempo real.

---

## 4. Flujo de Ejecución (User Journey)

1.  El usuario entra en **Sistema** por primera vez.
2.  En la pestaña **Configuración**, introduce su Capital (10000), Riesgo (2%) y las credenciales de Telegram.
3.  Pulsa "Probar Conexión" y recibe un mensaje en su móvil. Guarda los cambios.
4.  Va a la pestaña **Estado del Sistema** y ve que todo está en verde 🟢.
5.  Antes de hacer un cambio importante, va a **Backups** y pulsa "Crear Backup Ahora". En 10 segundos, aparece en la lista.
6.  Días después, el Monitor falla. El usuario va a **Logs**, filtra por "ERROR" y "Monitor", y ve rápidamente: "Job ETH-1h-MACD falló: Datos insuficientes".

---

## 5. Integración con Otros Módulos

*   **Módulo 6 (Monitor):** Consume la configuración de Telegram para enviar alertas. Si el token es inválido, el Monitor debe reportar el error en su propio log y actualizar el Health Check.
*   **Módulo 1 (Datos):** El Health Check monitorea el espacio en disco, crucial para la descarga de Parquets.
*   **Todos los Módulos:** Todos escriben logs que este módulo centraliza y visualiza.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Seguridad de Credenciales:** El `Bot Token` de Telegram nunca debe devolverse completo en el `GET /config`. El backend debe devolverlo enmascarado (ej. `123456:ABC...XYZ`) o no devolverlo en absoluto, para que la UI muestre "Configurado" sin exponer la clave.
*   **Backups en Disco Lleno:** Si el disco está al 95%, el Backup Manager debe abortar la operación y lanzar una alerta crítica en el Health Check.
*   **Logs Masivos:** La tabla de logs puede crecer infinitamente. El backend debe implementar paginación estricta y, idealmente, una tarea de limpieza que archive o borre logs de nivel INFO con más de 30 días de antigüedad.
*   **Prueba de Telegram:** Como aprendimos en la v2, el endpoint de prueba **nunca** debe ejecutarse en segundo plano ni al guardar. Solo bajo demanda explícita del usuario.

---

## 7. Logging y Trazabilidad

*   **INFO:** "Configuración 'trading.initial_capital' actualizada a 15000".
*   **INFO:** "Backup manual iniciado. Tamaño estimado: 45MB".
*   **WARNING:** "Espacio en disco bajo: 12% libre".
*   **ERROR:** "Fallo al conectar con Telegram: Token inválido".

---

## 8. Criterios de Aceptación (Definition of Done)
- [ ] La tabla `system_config` permite guardar y recuperar configuraciones agrupadas.
- [ ] La UI de Configuración guarda los cambios y enmascara las credenciales sensibles.
- [ ] El botón "Probar Conexión" de Telegram envía exactamente un mensaje y muestra el resultado.
- [ ] El Health Check muestra el estado real de DB, Redis, Disco y APIs externas.
- [ ] El sistema permite crear y listar backups manualmente.
- [ ] El visor de Logs permite filtrar por nivel y módulo, y muestra el detalle JSON.
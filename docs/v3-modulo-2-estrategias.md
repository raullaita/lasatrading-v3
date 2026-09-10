# LasaTrading v3.0 - Módulo 2: Estrategias / Catálogo (Especificaciones Detalladas)

**Versión:** 1.0
**Fecha:** 2026-09-10
**Dependencia:** `v3-master-specs.md`, `v3-modulo-1-datos.md`

---

## 1. Objetivos del Módulo
Este módulo actúa como la biblioteca central de conocimiento y lógica de la plataforma.
1.  **Centralizar la lógica:** Definir una interfaz estándar para que cualquier patrón de trading pueda ser calculado por el motor de backtest.
2.  **Documentar:** Explicar al usuario qué hace cada patrón, cómo detecta las señales y qué parámetros puede ajustar.
3.  **Visualizar:** Proporcionar ejemplos gráficos claros de cómo se ve una señal de compra/venta para cada patrón.
4.  **Servir de base:** Actuar como el "menú desplegable" que consumen los módulos de Backtest (Módulo 3) y Portafolio (Módulo 5).

---

## 2. Arquitectura del Backend (Core de Estrategias)

Para mantener la **Arquitectura Limpia**, los patrones no deben estar "hardcodeados" en la API, sino en el **Core/Dominio**.

### 2.1. Interfaz de Estrategia (Strategy Interface)
Todo patrón debe implementar una interfaz común en Python (ej. `BaseStrategy`):
*   `name: str` (ej. "rsi_divergence")
*   `display_name: str` (ej. "RSI Divergence")
*   `description: str` (Texto explicativo para la UI).
*   `parameters_schema: dict` (Define los parámetros, sus tipos, rangos y valores por defecto).

**Estructura exacta del `parameters_schema` (JSON Schema):**
```json
{
  "RSI_PERIOD": {
    "type": "integer",
    "default": 14,
    "min": 2,
    "max": 100,
    "step": 1,
    "description": "Número de velas para calcular el RSI."
  },
  "NUM_STD": {
    "type": "float",
    "default": 2.0,
    "min": 1.0,
    "max": 4.0,
    "step": 0.1,
    "description": "Desviaciones estándar para las bandas."
  }
}
```

**Reglas de renderizado en Frontend:**
- Si `type` es "integer" → input numérico entero con slider.
- Si `type` es "float" → input decimal con slider.
- Usar `min`, `max` y `step` para validación y límites del slider.
- El `default` se usa para pre-rellenar el formulario.

*   `calculate(dataframe: pd.DataFrame, params: dict) -> pd.DataFrame` (La lógica pura. Recibe velas, devuelve el dataframe con columnas de señales añadidas).

### 2.2. Registro de Estrategias (Strategy Registry)
Un gestor central (`StrategyRegistry`) que:
1.  Escanea el directorio `app/core/strategies/` al iniciar.
2.  Carga todas las clases que heredan de `BaseStrategy`.
3.  Expone un método `get_all_strategies()` que devuelve la lista de metadatos (sin la lógica pesada) para la UI.

### 2.3. Endpoints REST
*   `GET /api/v1/strategies/catalog`: Devuelve la lista de todos los patrones disponibles (nombre, descripción corta, parámetros).
*   `GET /api/v1/strategies/catalog/{strategy_name}`: Devuelve el detalle completo de un patrón (descripción larga, schema de parámetros, y opcionalmente una URL a una imagen de ejemplo o datos mock para el gráfico).

---

## 3. Pantallas del Frontend (UI/UX)

### Pantalla 1: Biblioteca de Estrategias (Vista Principal)
**Ubicación:** Ruta `/strategies`
**Layout:**
1.  **Header:** Título "Catálogo de Estrategias" + Buscador en tiempo real (ej. "Buscar RSI...").
2.  **Grid de Tarjetas (Cards):**
    *   Cada tarjeta representa un patrón (RSI, MACD, Bollinger, etc.).
    *   **Contenido de la tarjeta:**
        *   Icono representativo (ej. una onda para RSI, dos líneas cruzándose para Golden Cross).
        *   Nombre del patrón.
        *   Categoría (ej. "Reversión a la media", "Tendencia", "Volatilidad").
        *   Descripción breve (2 líneas).
    *   **Interacción:** Al hacer click en una tarjeta, se abre la **Pantalla 2 (Detalle)**.

### Pantalla 2: Detalle de Estrategia (Modal o Ruta dedicada)
**Activación:** Click en una tarjeta de la biblioteca.
**Diseño (Layout de 2 columnas o secciones apiladas):**

*   **Sección Superior: Teoría y Ejemplo Visual**
    *   **Título y Descripción completa:** Explicación clara de cómo funciona el patrón.
    *   **Gráfico de Ejemplo (Clave):** Un gráfico de velas (usando Lightweight Charts) que muestre un ejemplo *histórico real* o *mock* donde el patrón haya generado una señal clara.
        *   *Marcadores:* Flechas verdes (Compra) y rojas (Venta) sobre las velas.
        *   *Indicadores:* Si es RSI, mostrar el panel inferior con el RSI. Si es MACD, mostrar el histograma.
    *   **Lógica de Entrada/Salida:** Texto explicando: "Se genera señal de compra cuando X cruza por debajo de Y".

*   **Sección Inferior: Parámetros Configurables**
    *   Tabla o lista de los parámetros que acepta este patrón.
    *   *Columnas:* Nombre del parámetro (ej. `RSI_PERIOD`), Tipo (Integer/Float), Rango recomendado (ej. 2-50), Valor por defecto, Descripción.
    *   *Nota:* Esta información es vital para que el usuario sepa qué puede tocar en el Módulo 3 (Backtest).

---

## 4. Flujo de Ejecución (User Journey)

1.  El usuario quiere probar una nueva idea. Va al módulo **Estrategias**.
2.  Ve una cuadrícula con 10 patrones disponibles.
3.  Busca "Bollinger" y hace click en la tarjeta **Bollinger Bounce**.
4.  Se abre el detalle. Lee que el patrón busca precios que tocan la banda inferior y rebotan.
5.  Ve el gráfico de ejemplo con una flecha verde donde el precio tocó la banda y subió.
6.  Revisa la tabla de parámetros y ve que puede ajustar `PERIOD` (recomendado 20) y `NUM_STD` (recomendado 2.0).
7.  Satisfecho, cierra el detalle y va al **Módulo 3 (Backtest)** para probar este patrón con sus propios datos.

---

## 5. Integración con Otros Módulos

*   **Módulo 3 (Backtest):** El dropdown "Seleccionar Estrategia" se pobla llamando a `GET /api/v1/strategies/catalog`. Al seleccionar una, el frontend pide el `parameters_schema` para generar dinámicamente los inputs (ej. si el schema dice que `RSI_PERIOD` es un integer, muestra un input numérico, no un texto).
*   **Módulo 4 (Optimizador):** El optimizador usa el `parameters_schema` y los rangos recomendados para generar automáticamente las combinaciones de parámetros a probar.
*   **Módulo 6 (Monitor):** Al crear un Job, el monitor necesita saber qué función de Python (`calculate`) ejecutar para el patrón seleccionado. Lo resuelve a través del `StrategyRegistry`.

---

## 6. Casos Borde y Consideraciones Técnicas

*   **Añadir un nuevo patrón:** Para añadir una estrategia nueva en el futuro, el desarrollador solo debe crear un archivo `my_new_strategy.py` en `app/core/strategies/` que herede de `BaseStrategy`. El sistema la detectará automáticamente al reiniciar (gracias al Registry). No hay que tocar la UI ni la API.
*   **Gráficos de ejemplo:** Para no depender de imágenes estáticas que se desactualicen, el backend puede tener un endpoint `GET /api/v1/strategies/{name}/example-chart` que devuelva un pequeño JSON con 100 velas y las señales calculadas, para que el frontend las pinte dinámicamente con Lightweight Charts.
*   **Rendimiento:** El catálogo es estático. El frontend debe cachear la respuesta de `GET /catalog` en el estado global (Zustand/Redux) o en `localStorage` para no llamar a la API cada vez que se entra en la página.

---

## 7. Criterios de Aceptación (Definition of Done)
- [ ] Existe una interfaz `BaseStrategy` y un `StrategyRegistry` funcional.
- [ ] Hay al menos 3 patrones implementados de ejemplo (ej. RSI, Golden Cross, Bollinger) que cumplan la interfaz.
- [ ] El endpoint `/catalog` devuelve la lista correcta de patrones.
- [ ] La UI muestra la cuadrícula de tarjetas con iconos y descripciones.
- [ ] Al hacer click en un patrón, se muestra el detalle con descripción, gráfico de ejemplo (con señales pintadas) y tabla de parámetros.
- [ ] Los parámetros mostrados coinciden exactamente con los que el backend espera recibir.
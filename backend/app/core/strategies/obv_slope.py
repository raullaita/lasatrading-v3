import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class ObvSlopeStrategy(BaseStrategy):
    name = "obv_slope"
    display_name = "OBV Slope"
    description = (
        "Pendiente del On-Balance Volume: compra cuando la pendiente del OBV (en "
        "una ventana) pasa de negativa a positiva (presión compradora) y vende "
        "cuando pasa a negativa."
    )
    category = "Volumen"
    parameters_schema = {
        "WINDOW": {
            "type": "int",
            "default": 20,
            "min": 5,
            "max": 100,
            "description": "Ventana para estimar la pendiente del OBV",
        },
        "MIN_VOLUME": {
            "type": "float",
            "default": 0.0,
            "min": 0.0,
            "max": 100.0,
            "description": "Volumen mínimo para aceptar la señal (0 = sin filtro)",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        window = int(params.get("WINDOW", 20))
        min_volume = float(params.get("MIN_VOLUME", 0.0))
        out = df.copy()

        direction = np.sign(out["close"].diff().fillna(0))
        out["obv"] = (direction * out["volume"]).cumsum()

        x = np.arange(window, dtype=float)
        x -= x.mean()
        denom = (x ** 2).sum()

        def _slope(y: np.ndarray) -> float:
            if len(y) < window:
                return np.nan
            yy = np.asarray(y, dtype=float)
            return float(np.dot(yy, x) / denom)

        out["obv_slope"] = out["obv"].rolling(window).apply(
            _slope, raw=True
        )

        prev_slope = out["obv_slope"].shift(1)
        buy = (out["obv_slope"] > 0) & (prev_slope <= 0) & (out["volume"] >= min_volume)
        sell = (out["obv_slope"] < 0) & (prev_slope >= 0) & (out["volume"] >= min_volume)

        out["signal"] = (
            buy.astype("int64") - sell.astype("int64")
        ).astype("float64")
        return out
import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class StochasticStrategy(BaseStrategy):
    name = "stochastic"
    display_name = "Stochastic Oscillator"
    description = (
        "Reversión basada en el oscilador estocástico: compra cuando %K cruza "
        "al alza %D dentro de zona de sobreventa (<20) y vende cuando lo cruza "
        "a la baja dentro de zona de sobrecompra (>80)."
    )
    category = "Momentum/Reversión"
    parameters_schema = {
        "K_PERIOD": {
            "type": "int",
            "default": 14,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo de %K",
        },
        "D_PERIOD": {
            "type": "int",
            "default": 3,
            "min": 2,
            "max": 20,
            "description": "Período de la media de %D",
        },
        "OVERSOLD": {
            "type": "float",
            "default": 20.0,
            "min": 0,
            "max": 50,
            "description": "Umbral de sobreventa",
        },
        "OVERBOUGHT": {
            "type": "float",
            "default": 80.0,
            "min": 50,
            "max": 100,
            "description": "Umbral de sobrecompra",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        k_period = int(params.get("K_PERIOD", 14))
        d_period = int(params.get("D_PERIOD", 3))
        oversold = float(params.get("OVERSOLD", 20.0))
        overbought = float(params.get("OVERBOUGHT", 80.0))
        out = df.copy()

        low_min = out["low"].rolling(k_period).min()
        high_max = out["high"].rolling(k_period).max()
        rng = (high_max - low_min).replace(0, np.nan)
        out["k"] = 100 * (out["close"] - low_min) / rng
        out["d"] = out["k"].rolling(d_period).mean()

        prev_k = out["k"].shift(1)
        prev_d = out["d"].shift(1)
        cross_up = (
            (out["k"] > out["d"]) & (prev_k <= prev_d) & (prev_k < oversold)
        )
        cross_down = (
            (out["k"] < out["d"]) & (prev_k >= prev_d) & (prev_k > overbought)
        )

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
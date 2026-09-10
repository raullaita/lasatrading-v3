import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class RsiDivergenceStrategy(BaseStrategy):
    name = "rsi_divergence"
    display_name = "RSI Divergence"
    description = (
        "Detecta zonas de sobreventa mediante el RSI para anticipar "
        "reversiones a la media. Emite señal cuando el RSI baja de 30."
    )
    category = "Reversión a la media"
    parameters_schema = {
        "RSI_PERIOD": {
            "type": "int",
            "default": 14,
            "min": 2,
            "max": 100,
            "description": "Período de cálculo del RSI",
        },
        "PIVOT_WINDOW": {
            "type": "int",
            "default": 30,
            "min": 10,
            "max": 100,
            "description": "Ventana de velas para identificar pivotes de divergencia",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("RSI_PERIOD", 14))
        out = df.copy()

        delta = out["close"].diff()
        gain = delta.clip(lower=0).rolling(period).mean()
        loss = (-delta.clip(upper=0)).rolling(period).mean()
        rs = gain / loss.replace(0, np.nan)
        out["rsi"] = 100 - (100 / (1 + rs))

        out["signal"] = (out["rsi"] < 30).astype("int64")
        return out
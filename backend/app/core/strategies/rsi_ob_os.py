import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class RsiObOsStrategy(BaseStrategy):
    name = "rsi_ob_os"
    display_name = "RSI Overbought/Oversold"
    description = (
        "Reversión a la media basada en el RSI: compra cuando el RSI cruza al "
        "alza el umbral de sobreventa (saliendo de oversold) y vende cuando "
        "cruza a la baja el umbral de sobrecompra (saliendo de overbought)."
    )
    category = "Reversión a la media"
    parameters_schema = {
        "RSI_PERIOD": {
            "type": "int",
            "default": 14,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo del RSI",
        },
        "OVERSOLD": {
            "type": "float",
            "default": 30.0,
            "min": 5,
            "max": 50,
            "description": "Umbral de sobreventa",
        },
        "OVERBOUGHT": {
            "type": "float",
            "default": 70.0,
            "min": 50,
            "max": 95,
            "description": "Umbral de sobrecompra",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("RSI_PERIOD", 14))
        oversold = float(params.get("OVERSOLD", 30.0))
        overbought = float(params.get("OVERBOUGHT", 70.0))
        out = df.copy()

        delta = out["close"].diff()
        gain = delta.clip(lower=0).rolling(period).mean()
        loss = (-delta.clip(upper=0)).rolling(period).mean()
        rs = gain / loss.replace(0, np.nan)
        out["rsi"] = 100 - (100 / (1 + rs))

        cross_up = (out["rsi"] > oversold) & (out["rsi"].shift(1) <= oversold)
        cross_down = (out["rsi"] < overbought) & (
            out["rsi"].shift(1) >= overbought
        )

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
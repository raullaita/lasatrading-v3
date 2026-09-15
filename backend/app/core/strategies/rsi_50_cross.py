import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class Rsi50CrossStrategy(BaseStrategy):
    name = "rsi_50_cross"
    display_name = "RSI 50 Cross"
    description = (
        "Momentum basado en el RSI: compra cuando el RSI cruza al alza el nivel 50 "
        "(impulso alcista) y vende cuando lo cruza a la baja."
    )
    category = "Momentum"
    parameters_schema = {
        "RSI_PERIOD": {
            "type": "int",
            "default": 14,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo del RSI",
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

        cross_up = (out["rsi"] > 50) & (out["rsi"].shift(1) <= 50)
        cross_down = (out["rsi"] < 50) & (out["rsi"].shift(1) >= 50)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
import pandas as pd

from app.core.strategies.base import BaseStrategy


class EmaCrossoverStrategy(BaseStrategy):
    name = "ema_crossover"
    display_name = "EMA Crossover"
    description = (
        "Estrategia de tendencia que compra cuando la EMA rápida cruza al alza "
        "la EMA lenta y vende cuando la cruza a la baja."
    )
    category = "Tendencia"
    parameters_schema = {
        "FAST_EMA": {
            "type": "int",
            "default": 9,
            "min": 5,
            "max": 50,
            "description": "Período de la EMA rápida",
        },
        "SLOW_EMA": {
            "type": "int",
            "default": 21,
            "min": 10,
            "max": 200,
            "description": "Período de la EMA lenta",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        fast = int(params.get("FAST_EMA", 9))
        slow = int(params.get("SLOW_EMA", 21))
        out = df.copy()

        out["ema_fast"] = out["close"].ewm(span=fast, adjust=False).mean()
        out["ema_slow"] = out["close"].ewm(span=slow, adjust=False).mean()

        prev_fast = out["ema_fast"].shift(1)
        prev_slow = out["ema_slow"].shift(1)
        cross_up = (out["ema_fast"] > out["ema_slow"]) & (prev_fast <= prev_slow)
        cross_down = (out["ema_fast"] < out["ema_slow"]) & (prev_fast >= prev_slow)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
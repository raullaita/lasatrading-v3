import pandas as pd

from app.core.strategies.base import BaseStrategy


class SmaCrossoverStrategy(BaseStrategy):
    name = "sma_crossover"
    display_name = "SMA Crossover"
    description = (
        "Estrategia de tendencia basada en medias móviles simples: compra cuando "
        "la SMA rápida cruza al alza la SMA lenta y vende cuando la cruza a la baja."
    )
    category = "Tendencia"
    parameters_schema = {
        "FAST_SMA": {
            "type": "int",
            "default": 9,
            "min": 5,
            "max": 50,
            "description": "Período de la SMA rápida",
        },
        "SLOW_SMA": {
            "type": "int",
            "default": 21,
            "min": 10,
            "max": 200,
            "description": "Período de la SMA lenta",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        fast = int(params.get("FAST_SMA", 9))
        slow = int(params.get("SLOW_SMA", 21))
        out = df.copy()

        out["sma_fast"] = out["close"].rolling(fast).mean()
        out["sma_slow"] = out["close"].rolling(slow).mean()

        prev_fast = out["sma_fast"].shift(1)
        prev_slow = out["sma_slow"].shift(1)
        cross_up = (out["sma_fast"] > out["sma_slow"]) & (prev_fast <= prev_slow)
        cross_down = (out["sma_fast"] < out["sma_slow"]) & (prev_fast >= prev_slow)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
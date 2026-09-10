import pandas as pd

from app.core.strategies.base import BaseStrategy


class GoldenCrossStrategy(BaseStrategy):
    name = "golden_cross"
    display_name = "Golden Cross"
    description = (
        "Estrategia de tendencia que compra cuando la media rápida cruza "
        "al alza la media lenta (golden cross) y mantiene posición mientras "
        "se mantenga por encima."
    )
    category = "Tendencia"
    parameters_schema = {
        "EMA_FAST": {
            "type": "int",
            "default": 12,
            "description": "Período de la EMA rápida",
        },
        "EMA_SLOW": {
            "type": "int",
            "default": 26,
            "description": "Período de la EMA lenta",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        fast = int(params.get("EMA_FAST", 12))
        slow = int(params.get("EMA_SLOW", 26))
        out = df.copy()

        out["ema_fast"] = out["close"].ewm(span=fast, adjust=False).mean()
        out["ema_slow"] = out["close"].ewm(span=slow, adjust=False).mean()

        out["signal"] = (out["ema_fast"] > out["ema_slow"]).astype("int64")
        return out
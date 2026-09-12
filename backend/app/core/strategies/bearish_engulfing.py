import pandas as pd

from app.core.strategies.base import BaseStrategy


class BearishEngulfingStrategy(BaseStrategy):
    name = "bearish_engulfing"
    display_name = "Bearish Engulfing"
    description = (
        "Detecta el patrón de vela envolvente bajista: una vela alcista seguida "
        "de una vela bajista que envuelve completamente el cuerpo de la anterior. "
        "Indica posible cambio de tendencia bajista."
    )
    category = "Price Action/Reversión"
    parameters_schema = {
        "LOOKBACK": {
            "type": "int",
            "default": 2,
            "min": 2,
            "max": 10,
            "description": (
                "Velas anteriores para confirmar la tendencia previa (filtro "
                "opcional de zonas de resistencia)"
            ),
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        lookback = max(int(params.get("LOOKBACK", 2)), 2)
        out = df.copy()

        prev_bullish = (out["close"] > out["open"]).shift(1)
        bearish = out["close"] < out["open"]
        engulfs = (out["open"] >= out["close"].shift(1)) & (
            out["close"] <= out["open"].shift(1)
        )
        uptrend = out["close"].shift(1) > out["close"].shift(lookback + 1)

        pattern = prev_bullish & bearish & engulfs & uptrend
        out["signal"] = pattern.shift(1).fillna(False).astype("float64")
        out["signal"] = -out["signal"]
        return out
import pandas as pd

from app.core.strategies.base import BaseStrategy


class BullishEngulfingStrategy(BaseStrategy):
    name = "bullish_engulfing"
    display_name = "Bullish Engulfing"
    description = (
        "Detecta el patrón de vela envolvente alcista: una vela bajista seguida "
        "de una vela alcista que envuelve completamente el cuerpo de la anterior. "
        "Indica posible cambio de tendencia alcista."
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
                "opcional de zonas de soporte)"
            ),
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        lookback = max(int(params.get("LOOKBACK", 2)), 2)
        out = df.copy()

        prev_bearish = (out["close"] < out["open"]).shift(1)
        bullish = out["close"] > out["open"]
        engulfs = (out["open"] <= out["close"].shift(1)) & (
            out["close"] >= out["open"].shift(1)
        )
        downtrend = out["close"].shift(1) < out["close"].shift(lookback + 1)

        pattern = prev_bearish & bullish & engulfs & downtrend
        out["signal"] = pattern.shift(1).fillna(False).astype("float64")
        return out
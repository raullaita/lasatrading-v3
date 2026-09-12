import pandas as pd

from app.core.strategies.base import BaseStrategy


class AtrBreakoutStrategy(BaseStrategy):
    name = "atr_breakout"
    display_name = "ATR Breakout"
    description = (
        "Rompe los niveles definidos por el ATR: compra cuando el precio cierra "
        "por encima de (cierre anterior + ATR * multiplicador) y vende cuando "
        "cierra por debajo de (cierre anterior - ATR * multiplicador)."
    )
    category = "Volatilidad"
    parameters_schema = {
        "ATR_PERIOD": {
            "type": "int",
            "default": 14,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo del ATR",
        },
        "ATR_MULTIPLIER": {
            "type": "float",
            "default": 2.0,
            "min": 1.0,
            "max": 5.0,
            "description": "Multiplicador del ATR para el canal de ruptura",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("ATR_PERIOD", 14))
        multiplier = float(params.get("ATR_MULTIPLIER", 2.0))
        out = df.copy()

        prev_close = out["close"].shift(1)
        tr = pd.concat(
            [
                out["high"] - out["low"],
                (out["high"] - prev_close).abs(),
                (out["low"] - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        out["atr"] = tr.rolling(period).mean()

        atr_prev = out["atr"].shift(1)
        close_prev = out["close"].shift(1)
        buy = out["close"] > close_prev + atr_prev * multiplier
        sell = out["close"] < close_prev - atr_prev * multiplier

        out["signal"] = (
            buy.astype("int64") - sell.astype("int64")
        ).astype("float64")
        return out
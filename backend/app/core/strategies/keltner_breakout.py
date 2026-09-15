import pandas as pd

from app.core.strategies.base import BaseStrategy


class KeltnerBreakoutStrategy(BaseStrategy):
    name = "keltner_breakout"
    display_name = "Keltner Channel Breakout"
    description = (
        "Ruptura del canal de Keltner: compra cuando el precio cruza al alza la "
        "banda superior (EMA + multiplicador del ATR) y vende cuando cruza a la "
        "baja la banda inferior."
    )
    category = "Volatilidad"
    parameters_schema = {
        "EMA_PERIOD": {
            "type": "int",
            "default": 20,
            "min": 10,
            "max": 50,
            "description": "Período de la EMA central",
        },
        "ATR_PERIOD": {
            "type": "int",
            "default": 14,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo del ATR",
        },
        "MULTIPLIER": {
            "type": "float",
            "default": 2.0,
            "min": 1.0,
            "max": 5.0,
            "description": "Multiplicador del ATR para las bandas",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        ema_period = int(params.get("EMA_PERIOD", 20))
        atr_period = int(params.get("ATR_PERIOD", 14))
        multiplier = float(params.get("MULTIPLIER", 2.0))
        out = df.copy()

        out["kelt_center"] = out["close"].ewm(span=ema_period, adjust=False).mean()
        prev_close = out["close"].shift(1)
        tr = pd.concat(
            [
                out["high"] - out["low"],
                (out["high"] - prev_close).abs(),
                (out["low"] - prev_close).abs(),
            ],
            axis=1,
        ).max(axis=1)
        atr = tr.rolling(atr_period).mean()

        out["kelt_upper"] = out["kelt_center"] + multiplier * atr
        out["kelt_lower"] = out["kelt_center"] - multiplier * atr

        prev_upper = out["kelt_upper"].shift(1)
        prev_lower = out["kelt_lower"].shift(1)
        buy = (out["close"] > out["kelt_upper"]) & (out["close"].shift(1) <= prev_upper)
        sell = (out["close"] < out["kelt_lower"]) & (out["close"].shift(1) >= prev_lower)

        out["signal"] = (
            buy.astype("int64") - sell.astype("int64")
        ).astype("float64")
        return out
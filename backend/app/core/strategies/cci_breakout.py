import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class CciBreakoutStrategy(BaseStrategy):
    name = "cci_breakout"
    display_name = "CCI Breakout"
    description = (
        "Ruptura por Commodity Channel Index: compra cuando el CCI cruza al alza "
        "el umbral positivo (entrando en zona de fuerza) y vende cuando cruza a "
        "la baja el umbral negativo."
    )
    category = "Momentum"
    parameters_schema = {
        "CCI_PERIOD": {
            "type": "int",
            "default": 20,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo del CCI",
        },
        "UP_LEVEL": {
            "type": "float",
            "default": 100.0,
            "min": 50.0,
            "max": 200.0,
            "description": "Umbral positivo de entrada larga",
        },
        "DOWN_LEVEL": {
            "type": "float",
            "default": -100.0,
            "min": -200.0,
            "max": -50.0,
            "description": "Umbral negativo de entrada corta",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("CCI_PERIOD", 20))
        up = float(params.get("UP_LEVEL", 100.0))
        down = float(params.get("DOWN_LEVEL", -100.0))
        out = df.copy()

        tp = (out["high"] + out["low"] + out["close"]) / 3
        tp_sma = tp.rolling(period).mean()
        mean_dev = (tp - tp_sma).abs().rolling(period).mean()
        out["cci"] = (tp - tp_sma) / (0.015 * mean_dev.replace(0, np.nan))

        prev = out["cci"].shift(1)
        cross_up = (out["cci"] > up) & (prev <= up)
        cross_down = (out["cci"] < down) & (prev >= down)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
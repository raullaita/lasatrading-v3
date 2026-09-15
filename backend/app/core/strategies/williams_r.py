import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class WilliamsRStrategy(BaseStrategy):
    name = "williams_r"
    display_name = "Williams %R"
    description = (
        "Oscilador Williams %R: compra cuando %R cruza al alza desde la zona de "
        "sobreventa (saliendo de condiciones extremas bajistas) y vende cuando "
        "cruza a la baja desde la zona de sobrecompra."
    )
    category = "Reversión a la media"
    parameters_schema = {
        "LOOKBACK": {
            "type": "int",
            "default": 14,
            "min": 5,
            "max": 50,
            "description": "Período de cálculo de %R",
        },
        "OVERSOLD": {
            "type": "float",
            "default": -80.0,
            "min": -90.0,
            "max": -50.0,
            "description": "Umbral de sobreventa",
        },
        "OVERBOUGHT": {
            "type": "float",
            "default": -20.0,
            "min": -50.0,
            "max": -10.0,
            "description": "Umbral de sobrecompra",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        lookback = int(params.get("LOOKBACK", 14))
        oversold = float(params.get("OVERSOLD", -80.0))
        overbought = float(params.get("OVERBOUGHT", -20.0))
        out = df.copy()

        hh = out["high"].rolling(lookback).max()
        ll = out["low"].rolling(lookback).min()
        rng = (hh - ll).replace(0, np.nan)
        out["wr"] = -100 * (hh - out["close"]) / rng

        prev = out["wr"].shift(1)
        cross_up = (out["wr"] > oversold) & (prev <= oversold)
        cross_down = (out["wr"] < overbought) & (prev >= overbought)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
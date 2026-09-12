import pandas as pd

from app.core.strategies.base import BaseStrategy


class PriceChannelStrategy(BaseStrategy):
    name = "price_channel"
    display_name = "Price Channel Breakout"
    description = (
        "Ruptura de canal de precios: compra cuando el precio cierra por encima "
        "del máximo de los últimos LOOKBACK periodos y vende cuando cierra por "
        "debajo del mínimo del período."
    )
    category = "Tendencia/Ruptura"
    parameters_schema = {
        "LOOKBACK": {
            "type": "int",
            "default": 20,
            "min": 10,
            "max": 100,
            "description": "Periodos de mirada atrás para el canal",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        lookback = int(params.get("LOOKBACK", 20))
        out = df.copy()

        prev_high = out["high"].rolling(lookback).max().shift(1)
        prev_low = out["low"].rolling(lookback).min().shift(1)

        buy = out["close"] > prev_high
        sell = out["close"] < prev_low

        out["signal"] = (
            buy.astype("int64") - sell.astype("int64")
        ).astype("float64")
        return out
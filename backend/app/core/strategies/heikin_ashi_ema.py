import pandas as pd

from app.core.strategies.base import BaseStrategy


class HeikinAshiEmaStrategy(BaseStrategy):
    name = "heikin_ashi_ema"
    display_name = "Heikin-Ashi + EMA"
    description = (
        "Tendencia con velas Heikin-Ashi filtrada por EMA: compra cuando una vela "
        "HA alcista cierra por encima de la EMA y vende cuando una vela HA bajista "
        "cierra por debajo de la EMA."
    )
    category = "Tendencia"
    parameters_schema = {
        "EMA_PERIOD": {
            "type": "int",
            "default": 20,
            "min": 5,
            "max": 100,
            "description": "Período de la EMA filtro",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        ema_period = int(params.get("EMA_PERIOD", 20))
        out = df.copy()

        ha_close = (out["open"] + out["high"] + out["low"] + out["close"]) / 4
        ha_open = ha_close.copy()
        for i in range(1, len(out)):
            ha_open.iloc[i] = (ha_open.iloc[i - 1] + ha_close.iloc[i - 1]) / 2
        out["ha_close"] = ha_close
        out["ha_open"] = ha_open

        out["ema"] = out["close"].ewm(span=ema_period, adjust=False).mean()

        bullish = ha_close > ha_open
        bearish = ha_close < ha_open
        prev_bullish = bullish.shift(1)
        prev_bearish = bearish.shift(1)
        prev_close = out["close"].shift(1)
        prev_ema = out["ema"].shift(1)

        flip_up = bullish & ~prev_bullish.fillna(False) & (out["close"] > out["ema"])
        flip_down = (
            bearish & ~prev_bearish.fillna(False) & (out["close"] < out["ema"])
        )
        crossover_up = (
            (out["close"] > out["ema"]) & (prev_close <= prev_ema)
        ) & bullish
        crossover_down = (
            (out["close"] < out["ema"]) & (prev_close >= prev_ema)
        ) & bearish

        buy = flip_up | crossover_up
        sell = flip_down | crossover_down

        out["signal"] = (
            buy.astype("int64") - sell.astype("int64")
        ).astype("float64")
        return out
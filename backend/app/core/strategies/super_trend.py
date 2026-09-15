import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy


class SuperTrendStrategy(BaseStrategy):
    name = "super_trend"
    display_name = "Supertrend"
    description = (
        "Supertrend basado en ATR: compra cuando la tendencia cambia de bajista a "
        "alcista (flip del indicador) y vende cuando cambia a bajista."
    )
    category = "Tendencia/Volatilidad"
    parameters_schema = {
        "ATR_PERIOD": {
            "type": "int",
            "default": 10,
            "min": 5,
            "max": 30,
            "description": "Período del ATR (Wilder)",
        },
        "MULTIPLIER": {
            "type": "float",
            "default": 3.0,
            "min": 1.0,
            "max": 6.0,
            "description": "Multiplicador del ATR para las bandas",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("ATR_PERIOD", 10))
        multiplier = float(params.get("MULTIPLIER", 3.0))
        out = df.copy()

        high = out["high"].to_numpy(dtype=float)
        low = out["low"].to_numpy(dtype=float)
        close = out["close"].to_numpy(dtype=float)
        n = len(out)

        prev_close = np.roll(close, 1)
        prev_close[0] = np.nan
        tr = np.maximum(high - low, np.maximum(
            np.abs(high - prev_close), np.abs(low - prev_close)))
        df_tr = pd.Series(tr)
        atr = df_tr.ewm(alpha=1.0 / period, adjust=False).mean().to_numpy()

        hl2 = (high + low) / 2.0
        upper = hl2 + multiplier * atr
        lower = hl2 - multiplier * atr

        trend = np.ones(n, dtype=int)
        st = np.full(n, np.nan)
        trend_prev = 1
        for i in range(1, n):
            up = hl2[i] + multiplier * atr[i]
            lo = hl2[i] - multiplier * atr[i]
            upper[i] = (min(up, upper[i - 1]) if close[i - 1] <= upper[i - 1]
                        else up)
            lower[i] = (max(lo, lower[i - 1]) if close[i - 1] >= lower[i - 1]
                        else lo)

            if close[i] <= upper[i]:
                trend_prev = -1
            elif close[i] >= lower[i]:
                trend_prev = 1
            trend[i] = trend_prev
            st[i] = lower[i] if trend_prev == 1 else upper[i]

        out["supertrend"] = st
        out["st_trend"] = trend

        prev_trend = pd.Series(trend).shift(1)
        flip_up = (pd.Series(trend) > 0) & (prev_trend <= 0)
        flip_down = (pd.Series(trend) < 0) & (prev_trend >= 0)

        out["signal"] = (
            flip_up.astype("int64") - flip_down.astype("int64")
        ).astype("float64")
        return out
import pandas as pd

from app.core.strategies.base import BaseStrategy


class MacdCrossoverStrategy(BaseStrategy):
    name = "macd_crossover"
    display_name = "MACD Crossover"
    description = (
        "Estrategia de tendencia/momentum basada en el cruce del MACD sobre "
        "su línea de señal. Compra cuando el MACD cruza al alza la Signal Line "
        "y vende cuando la cruza a la baja."
    )
    category = "Tendencia/Momentum"
    parameters_schema = {
        "FAST_PERIOD": {
            "type": "int",
            "default": 12,
            "min": 5,
            "max": 50,
            "description": "Período de la EMA rápida",
        },
        "SLOW_PERIOD": {
            "type": "int",
            "default": 26,
            "min": 10,
            "max": 100,
            "description": "Período de la EMA lenta",
        },
        "SIGNAL_PERIOD": {
            "type": "int",
            "default": 9,
            "min": 5,
            "max": 50,
            "description": "Período de la línea de señal del MACD",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        fast = int(params.get("FAST_PERIOD", 12))
        slow = int(params.get("SLOW_PERIOD", 26))
        signal_period = int(params.get("SIGNAL_PERIOD", 9))
        out = df.copy()

        out["ema_fast"] = out["close"].ewm(span=fast, adjust=False).mean()
        out["ema_slow"] = out["close"].ewm(span=slow, adjust=False).mean()
        out["macd"] = out["ema_fast"] - out["ema_slow"]
        out["macd_signal"] = (
            out["macd"].ewm(span=signal_period, adjust=False).mean()
        )

        prev_macd = out["macd"].shift(1)
        prev_signal = out["macd_signal"].shift(1)
        cross_up = (out["macd"] > out["macd_signal"]) & (prev_macd <= prev_signal)
        cross_down = (out["macd"] < out["macd_signal"]) & (prev_macd >= prev_signal)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
import pandas as pd

from app.core.strategies.base import BaseStrategy


class VolumeSpikeStrategy(BaseStrategy):
    name = "volume_spike"
    display_name = "Volume Spike"
    description = (
        "Detecta picos de volumen: compra cuando el volumen supera la media "
        "móvil multiplicada y la vela cierra al alza, y vende cuando el volumen "
        "es alto y la vela cierra a la baja."
    )
    category = "Volumen"
    parameters_schema = {
        "VOLUME_MA_PERIOD": {
            "type": "int",
            "default": 20,
            "min": 10,
            "max": 100,
            "description": "Período de la media móvil del volumen",
        },
        "SPIKE_MULTIPLIER": {
            "type": "float",
            "default": 2.0,
            "min": 1.5,
            "max": 5.0,
            "description": "Múltiplo de la media para considerar un pico",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("VOLUME_MA_PERIOD", 20))
        multiplier = float(params.get("SPIKE_MULTIPLIER", 2.0))
        out = df.copy()

        volume_ma = out["volume"].rolling(period).mean().shift(1)
        spike = out["volume"] > volume_ma * multiplier

        buy = spike & (out["close"] > out["open"])
        sell = spike & (out["close"] < out["open"])

        out["signal"] = (
            buy.astype("int64") - sell.astype("int64")
        ).astype("float64")
        return out
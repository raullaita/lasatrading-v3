import pandas as pd

from app.core.strategies.base import BaseStrategy


class BollingerBounceStrategy(BaseStrategy):
    name = "bollinger_bounce"
    display_name = "Bollinger Bounce"
    description = (
        "Opera el rebote en bandas de Bollinger: compra cuando el precio "
        "cierra por debajo de la banda inferior esperando una regresión "
        "a la media."
    )
    category = "Reversión a la media"
    parameters_schema = {
        "PERIOD": {
            "type": "int",
            "default": 20,
            "description": "Período de la media móvil",
        },
        "NUM_STD": {
            "type": "float",
            "default": 2.0,
            "description": "Número de desviaciones estándar para las bandas",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("PERIOD", 20))
        num_std = float(params.get("NUM_STD", 2.0))
        out = df.copy()

        out["sma"] = out["close"].rolling(period).mean()
        out["std"] = out["close"].rolling(period).std()
        out["lower_band"] = out["sma"] - num_std * out["std"]
        out["upper_band"] = out["sma"] + num_std * out["std"]

        out["signal"] = (out["close"] < out["lower_band"]).astype("int64")
        return out
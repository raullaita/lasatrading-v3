import pandas as pd

from app.core.strategies.base import BaseStrategy


class RocMomentumStrategy(BaseStrategy):
    name = "roc_momentum"
    display_name = "ROC Momentum"
    description = (
        "Momentum por tasa de cambio (ROC): compra cuando el ROC cruza a cero al "
        "alza (precio acelerando) y vende cuando lo cruza a la baja."
    )
    category = "Momentum"
    parameters_schema = {
        "ROC_PERIOD": {
            "type": "int",
            "default": 10,
            "min": 3,
            "max": 50,
            "description": "Período de cálculo del ROC",
        },
    }

    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        period = int(params.get("ROC_PERIOD", 10))
        out = df.copy()

        out["roc"] = (out["close"] / out["close"].shift(period) - 1) * 100

        cross_up = (out["roc"] > 0) & (out["roc"].shift(1) <= 0)
        cross_down = (out["roc"] < 0) & (out["roc"].shift(1) >= 0)

        out["signal"] = (
            cross_up.astype("int64") - cross_down.astype("int64")
        ).astype("float64")
        return out
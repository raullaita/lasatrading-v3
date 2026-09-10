from abc import ABC, abstractmethod

import pandas as pd


class BaseStrategy(ABC):
    name: str = ""
    display_name: str = ""
    description: str = ""
    category: str = ""
    parameters_schema: dict = {}

    @abstractmethod
    def calculate(self, df: pd.DataFrame, params: dict) -> pd.DataFrame:
        """Calcula las señales de la estrategia sobre un DataFrame de velas.

        El DataFrame de entrada debe contener al menos los campos ``open``,
        ``high``, ``low``, ``close`` y ``volume``. Se espera que la salida
        añada columnas derivadas y una columna binaria ``signal``.
        """
        raise NotImplementedError
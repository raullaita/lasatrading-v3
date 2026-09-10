import importlib
import pkgutil
from typing import Type

from app.core.strategies.base import BaseStrategy


class StrategyRegistry:
    """Registro singleton de estrategias con detección automática.

    Al instanciarse (o al llamar a :meth:`scan`), importa todos los módulos
    del paquete ``app.core.strategies`` y registra cada subclase concreta de
    ``BaseStrategy``.
    """

    _instance: "StrategyRegistry | None" = None

    def __new__(cls) -> "StrategyRegistry":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._strategies: dict[str, BaseStrategy] = {}
            cls._instance.scan()
        return cls._instance

    def register(self, strategy_cls: Type[BaseStrategy]) -> None:
        instance = strategy_cls()
        self._strategies[instance.name] = instance

    def scan(self) -> None:
        package = importlib.import_module("app.core.strategies")
        for module_info in pkgutil.iter_modules(
            package.__path__, package.__name__ + "."
        ):
            importlib.import_module(module_info.name)
        for strategy_cls in BaseStrategy.__subclasses__():
            if not getattr(strategy_cls, "name", ""):
                continue
            self.register(strategy_cls)

    def get_all(self) -> list[dict]:
        return [
            {
                "name": strategy.name,
                "display_name": strategy.display_name,
                "description": strategy.description,
                "category": strategy.category,
                "parameters_schema": strategy.parameters_schema,
            }
            for strategy in self._strategies.values()
        ]

    def get_by_name(self, name: str) -> BaseStrategy | None:
        return self._strategies.get(name)


registry = StrategyRegistry()
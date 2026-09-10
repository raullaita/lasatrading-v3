from fastapi import APIRouter, HTTPException

from app.core.strategies.registry import registry

router = APIRouter(prefix="/api/v1/strategies", tags=["strategies"])


@router.get("/catalog")
def get_catalog() -> list[dict]:
    return registry.get_all()


@router.get("/catalog/{strategy_name}")
def get_strategy(strategy_name: str) -> dict:
    strategy = registry.get_by_name(strategy_name)
    if strategy is None:
        raise HTTPException(status_code=404, detail="Estrategia no encontrada")
    return {
        "name": strategy.name,
        "display_name": strategy.display_name,
        "description": strategy.description,
        "category": strategy.category,
        "parameters_schema": strategy.parameters_schema,
    }
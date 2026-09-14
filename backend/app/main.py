import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.api.routers import (
    backtest,
    data,
    journal,
    monitor,
    optimizer,
    performance,
    portfolio,
    strategies,
    system,
    watchlist,
)
from app.core.models import Base
from app.core.strategies.registry import registry
from app.infra.db import engine
from app.infra.db_log_handler import DatabaseLogHandler
from app.services.task_manager import start_task_manager, stop_task_manager


def _configure_logging() -> None:
    root = logging.getLogger()
    root.setLevel(logging.INFO)

    if not any(isinstance(h, DatabaseLogHandler) for h in root.handlers):
        db_handler = DatabaseLogHandler()
        db_handler.setLevel(logging.INFO)
        root.addHandler(db_handler)

    if not any(isinstance(h, logging.StreamHandler) for h in root.handlers):
        stream = logging.StreamHandler()
        stream.setLevel(logging.INFO)
        stream.setFormatter(
            logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
        )
        root.addHandler(stream)


def _migrate_optimizer_columns() -> None:
    try:
        with engine.begin() as conn:
            conn.execute(
                text(
                    "ALTER TABLE optimization_runs "
                    "ADD COLUMN IF NOT EXISTS exit_rules JSONB NOT NULL DEFAULT '{}'::jsonb"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE optimization_runs "
                    "ADD COLUMN IF NOT EXISTS initial_capital DOUBLE PRECISION NOT NULL DEFAULT 10000"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE optimization_runs "
                    "ADD COLUMN IF NOT EXISTS commission_pct DOUBLE PRECISION NOT NULL DEFAULT 0.001"
                )
            )
            conn.execute(
                text(
                    "ALTER TABLE optimization_runs "
                    "ADD COLUMN IF NOT EXISTS slippage_pct DOUBLE PRECISION NOT NULL DEFAULT 0.1"
                )
            )
    except Exception as exc:
        logging.getLogger(__name__).warning(
            "No se pudo aplicar la migración de optimization_runs: %s", exc
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    _configure_logging()
    Base.metadata.create_all(bind=engine)
    _migrate_optimizer_columns()
    root_logger = logging.getLogger("app")
    root_logger.info("Iniciando LasaTrading API v3.0")
    start_task_manager()
    yield
    stop_task_manager()


app = FastAPI(
    title="LasaTrading API",
    version="3.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(data.router)
app.include_router(watchlist.router)
app.include_router(strategies.router)
app.include_router(backtest.router)
app.include_router(optimizer.router)
app.include_router(portfolio.router)
app.include_router(monitor.router)
app.include_router(journal.router)
app.include_router(performance.router)
app.include_router(system.router)


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "version": "3.0.0"}
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routers import backtest, data, optimizer, strategies, watchlist
from app.core.models import Base
from app.core.strategies.registry import registry
from app.infra.db import engine


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


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


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "version": "3.0.0"}
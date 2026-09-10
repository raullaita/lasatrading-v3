import os
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[2]

DATA_STORAGE_DIR = os.getenv("DATA_STORAGE_DIR", str(BACKEND_DIR / "data_storage"))

VALID_TIMEFRAMES = {
    "1m", "3m", "5m", "15m", "30m", "1h", "2h", "4h", "6h", "8h", "12h", "1d", "3d", "1W", "1M",
}
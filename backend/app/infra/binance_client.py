import time
from datetime import datetime, timezone

import httpx

BINANCE_BASE_URL = "https://api.binance.com"
KLINES_ENDPOINT = "/api/v3/klines"
MAX_RETRIES = 3
TIMEOUT_SECONDS = 15

DEFAULT_TOP_LEVEL_HEADERS = {
    "Accept-Encoding": "gzip, deflate",
    "User-Agent": "lasatrading-v3/3.0.0",
}


def _row_to_candle(row: list) -> dict:
    return {
        "timestamp": datetime.fromtimestamp(row[0] / 1000, tz=timezone.utc),
        "open": float(row[1]),
        "high": float(row[2]),
        "low": float(row[3]),
        "close": float(row[4]),
        "volume": float(row[5]),
    }


def fetch_klines(
    symbol: str,
    timeframe: str,
    start_time: int | None = None,
    limit: int = 1000,
) -> list[dict]:
    params = {"symbol": symbol, "interval": timeframe, "limit": limit}
    if start_time is not None:
        params["startTime"] = int(start_time)

    for attempt in range(MAX_RETRIES):
        try:
            resp = httpx.get(
                f"{BINANCE_BASE_URL}{KLINES_ENDPOINT}",
                params=params,
                timeout=TIMEOUT_SECONDS,
                headers=DEFAULT_TOP_LEVEL_HEADERS,
            )
            if resp.status_code in (429, 418) or resp.status_code >= 500:
                retry_after = resp.headers.get("Retry-After")
                delay = float(retry_after) if retry_after else 2**attempt
                if attempt < MAX_RETRIES - 1:
                    time.sleep(delay)
                    continue
            resp.raise_for_status()
            return [_row_to_candle(row) for row in resp.json()]
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            if attempt == MAX_RETRIES - 1:
                raise RuntimeError(
                    f"Fallo de red al consultar klines de {symbol} {timeframe}: {exc}"
                ) from exc
            time.sleep(2**attempt)

    raise RuntimeError(f"No se pudo obtener klines de {symbol} {timeframe}")
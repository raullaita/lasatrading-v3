import math
from datetime import datetime, timezone
from typing import Iterable

from sqlalchemy.orm import Session

from app.core.models import Trade, UserStrategy

INITIAL_CAPITAL = 10000.0
MAX_EQUITY_POINTS = 500


def _pnl(trade: Trade) -> float:
    return trade.pnl_net if trade.pnl_net is not None else 0.0


def compute_summary(trades: Iterable[Trade]) -> dict:
    todos = list(trades)
    pnls = [_pnl(t) for t in todos]

    net_profit = sum(pnls)
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    total = len(todos)

    if total:
        win_rate = round(len(wins) / total * 100, 1)
    else:
        win_rate = 0.0

    if gross_loss > 0:
        profit_factor = round(gross_profit / gross_loss, 2)
    elif gross_profit > 0:
        profit_factor = None
    else:
        profit_factor = 0.0

    return {
        "net_profit": round(net_profit, 2),
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "max_drawdown": _compute_max_drawdown(pnls),
        "total_trades": total,
    }


def _compute_max_drawdown(pnls: list[float]) -> float:
    balance = INITIAL_CAPITAL
    peak = balance
    max_dd = 0.0
    for pnl in pnls:
        balance += pnl
        peak = max(peak, balance)
        if peak > 0:
            max_dd = max(max_dd, (peak - balance) / peak)
    return round(max_dd * 100, 2)


def compute_equity_curve(
    trades: Iterable[Trade], initial_capital: float = INITIAL_CAPITAL
) -> list[dict]:
    ordered = sorted(
        (t for t in trades if t.exit_timestamp is not None),
        key=lambda t: t.exit_timestamp,
    )
    balance = initial_capital
    points: list[dict] = []

    if ordered:
        ts = ordered[0].exit_timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        points.append({"timestamp": ts.isoformat(), "balance": round(balance, 2)})

    for trade in ordered:
        balance += _pnl(trade)
        ts = trade.exit_timestamp
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        points.append({"timestamp": ts.isoformat(), "balance": round(balance, 2)})

    if len(points) > MAX_EQUITY_POINTS:
        step = math.ceil(len(points) / MAX_EQUITY_POINTS)
        sampled = [points[i] for i in range(0, len(points), step)]
        if sampled[-1] != points[-1]:
            sampled.append(points[-1])
        return sampled

    return points


def _group_metrics(group: list[Trade]) -> dict:
    pnls = [_pnl(t) for t in group]
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    gross_profit = sum(wins)
    gross_loss = abs(sum(losses))
    total = len(group)

    if total:
        win_rate = round(len(wins) / total * 100, 1)
    else:
        win_rate = 0.0

    if gross_loss > 0:
        profit_factor = round(gross_profit / gross_loss, 2)
    elif gross_profit > 0:
        profit_factor = None
    else:
        profit_factor = 0.0

    return {
        "trades": total,
        "win_rate": win_rate,
        "profit_factor": profit_factor,
        "pnl": round(sum(pnls), 2),
    }


def compute_by_strategy(db: Session, trades: Iterable[Trade]) -> list[dict]:
    groups: dict[str | None, list[Trade]] = {}
    for trade in trades:
        groups.setdefault(trade.strategy_id, []).append(trade)

    strategies = {
        s.id: s for s in db.query(UserStrategy).all()
    }

    result: list[dict] = []
    for strategy_id, group in groups.items():
        symbol = group[0].symbol
        if strategy_id is not None and strategy_id in strategies:
            strat = strategies[strategy_id]
            name = strat.name
            symbol = strat.symbol or symbol
        else:
            name = "Sin estrategia"

        item = _group_metrics(group)
        result.append(
            {
                "strategy_id": str(strategy_id) if strategy_id else None,
                "name": name,
                "symbol": symbol,
                **item,
            }
        )

    result.sort(key=lambda item: item["pnl"], reverse=True)
    return result
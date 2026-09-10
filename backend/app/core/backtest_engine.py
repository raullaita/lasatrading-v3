import numpy as np
import pandas as pd

from app.core.strategies.base import BaseStrategy

SUPPORTED_SL_TYPES = ("fixed_percent", "atr_multiplier")
SUPPORTED_TP_TYPES = ("fixed_percent", "risk_reward_ratio")


def _to_iso(ts) -> str:
    return pd.Timestamp(ts).isoformat()


def _true_range_atr(high: pd.Series, low: pd.Series, close: pd.Series, period: int = 14) -> pd.Series:
    prev_close = close.shift(1)
    tr = pd.concat(
        [high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1
    ).max(axis=1)
    return tr.rolling(period).mean()


def _floating_pnl(position: dict | None, close: float) -> float:
    if position is None:
        return 0.0
    if position["direction"] > 0:
        return (close - position["entry_price"]) * position["qty"]
    return (position["entry_price"] - close) * position["qty"]


def run_backtest(
    df: pd.DataFrame,
    strategy: BaseStrategy,
    params: dict,
    exit_rules: dict,
    initial_capital: float = 10000.0,
    commission_pct: float = 0.001,
    slippage_pct: float = 0.0,
) -> dict:
    """Ejecuta un backtest sin lookahead bias.

    Las señales se calculan con el cierre de la vela ``N`` (``strategy.calculate``)
    y la entrada se ejecuta al precio de apertura de la vela ``N+1``.
    Nunca se usa el precio de cierre de la vela de señal para entrar.

    Exit rules (``exit_rules``):
    - ``stop_loss_type``: ``fixed_percent`` (valor en %) o ``atr_multiplier``.
    - ``stop_loss_value``: valor de la regla.
    - ``take_profit_type``: ``fixed_percent`` (valor en %) o ``risk_reward_ratio``.
    - ``take_profit_value``: valor de la regla.

    ``commission_pct`` es una fracción (ej. 0.001 = 0.1 %).
    ``slippage_pct`` se interpreta en % (ej. 0.1 = 0.1 % sobre el precio de entrada).
    """
    data = strategy.calculate(df, params).reset_index(drop=True)
    if "signal" not in data.columns:
        raise ValueError("La estrategia no devolvió la columna 'signal'")

    n = len(data)
    opens = data["open"].to_numpy(dtype=float)
    highs = data["high"].to_numpy(dtype=float)
    lows = data["low"].to_numpy(dtype=float)
    closes = data["close"].to_numpy(dtype=float)
    timestamps = data["timestamp"].to_numpy()
    signals = np.nan_to_num(data["signal"].to_numpy(dtype=float), nan=0.0).astype(int)
    atr = _true_range_atr(data["high"], data["low"], data["close"]).to_numpy(dtype=float)

    sl_type = exit_rules.get("stop_loss_type", "fixed_percent")
    sl_value = float(exit_rules.get("stop_loss_value", 0.0) or 0.0)
    tp_type = exit_rules.get("take_profit_type", "fixed_percent")
    tp_value = float(exit_rules.get("take_profit_value", 0.0) or 0.0)

    if sl_type not in SUPPORTED_SL_TYPES:
        raise ValueError(f"stop_loss_type no soportado: {sl_type}")
    if tp_type not in SUPPORTED_TP_TYPES:
        raise ValueError(f"take_profit_type no soportado: {tp_type}")

    slippage = slippage_pct / 100.0

    balance = float(initial_capital)
    trades: list[dict] = []
    equity_curve: list[dict] = []
    position: dict | None = None

    for i in range(n):
        ts = _to_iso(timestamps[i])

        if position is None:
            signal = signals[i]
            if signal != 0 and i + 1 < n:
                direction = 1 if signal > 0 else -1
                entry_price = opens[i + 1]
                entry_price *= 1 + slippage if direction > 0 else 1 - slippage

                atr_ref = None if np.isnan(atr[i]) else float(atr[i])

                if sl_type == "fixed_percent":
                    factor = 1 - sl_value / 100.0 if direction > 0 else 1 + sl_value / 100.0
                    sl_price = entry_price * factor
                else:
                    sl_price = None if atr_ref is None else entry_price - direction * sl_value * atr_ref

                if tp_type == "fixed_percent":
                    factor = 1 + tp_value / 100.0 if direction > 0 else 1 - tp_value / 100.0
                    tp_price = entry_price * factor
                else:
                    if sl_price is None:
                        tp_price = None
                    else:
                        sl_distance = (entry_price - sl_price) * direction
                        tp_price = entry_price + direction * sl_distance * tp_value

                position = {
                    "direction": direction,
                    "entry_price": entry_price,
                    "entry_idx": i + 1,
                    "entry_time": _to_iso(timestamps[i + 1]),
                    "qty": balance / entry_price,
                    "sl": sl_price,
                    "tp": tp_price,
                }
            equity_curve.append({"timestamp": ts, "balance": round(balance, 2)})
        else:
            d = position["direction"]
            exit_price = None
            exit_reason = None

            if d > 0:
                if position["sl"] is not None and lows[i] <= position["sl"]:
                    exit_price, exit_reason = position["sl"], "stop_loss"
                elif position["tp"] is not None and highs[i] >= position["tp"]:
                    exit_price, exit_reason = position["tp"], "take_profit"
            else:
                if position["sl"] is not None and highs[i] >= position["sl"]:
                    exit_price, exit_reason = position["sl"], "stop_loss"
                elif position["tp"] is not None and lows[i] <= position["tp"]:
                    exit_price, exit_reason = position["tp"], "take_profit"

            if exit_price is not None:
                entry = position["entry_price"]
                qty = position["qty"]
                if d > 0:
                    pnl = (exit_price - entry) * qty
                else:
                    pnl = (entry - exit_price) * qty
                fees = (qty * entry + qty * exit_price) * commission_pct
                net = pnl - fees
                balance += net

                trades.append(
                    {
                        "entry_time": position["entry_time"],
                        "entry_price": round(entry, 8),
                        "exit_time": ts,
                        "exit_price": round(exit_price, 8),
                        "pnl": round(net, 2),
                        "pnl_pct": round(net / (qty * entry) * 100, 2) if qty * entry > 0 else 0.0,
                        "duration": i - position["entry_idx"],
                        "exit_reason": exit_reason,
                    }
                )
                position = None

            equity_curve.append(
                {
                    "timestamp": ts,
                    "balance": round(balance + _floating_pnl(position, closes[i]), 2),
                }
            )

    if position is not None:
        idx = n - 1
        entry = position["entry_price"]
        qty = position["qty"]
        d = position["direction"]
        exit_price = closes[idx]
        if d > 0:
            pnl = (exit_price - entry) * qty
        else:
            pnl = (entry - exit_price) * qty
        fees = (qty * entry + qty * exit_price) * commission_pct
        net = pnl - fees
        balance += net
        trades.append(
            {
                "entry_time": position["entry_time"],
                "entry_price": round(entry, 8),
                "exit_time": _to_iso(timestamps[idx]),
                "exit_price": round(exit_price, 8),
                "pnl": round(net, 2),
                "pnl_pct": round(net / (qty * entry) * 100, 2) if qty * entry > 0 else 0.0,
                "duration": idx - position["entry_idx"],
                "exit_reason": "end_of_data",
            }
        )

    total_trades = len(trades)
    winners = [t for t in trades if t["pnl"] > 0]
    losers = [t for t in trades if t["pnl"] < 0]
    gross_profit = sum(t["pnl"] for t in winners)
    gross_loss = abs(sum(t["pnl"] for t in losers))

    balances = [p["balance"] for p in equity_curve] or [balance]
    peak = balances[0]
    max_dd = 0.0
    for value in balances:
        peak = max(peak, value)
        if peak > 0:
            max_dd = max(max_dd, (peak - value) / peak)

    if gross_loss > 0:
        profit_factor = round(gross_profit / gross_loss, 2)
    elif gross_profit > 0:
        profit_factor = None
    else:
        profit_factor = 0.0

    metrics = {
        "net_profit": round(balance - initial_capital, 2),
        "win_rate": round(len(winners) / total_trades * 100, 1) if total_trades else 0.0,
        "profit_factor": profit_factor,
        "max_drawdown": round(max_dd * 100, 2),
        "total_trades": total_trades,
    }

    return {
        "metrics": metrics,
        "equity_curve": equity_curve,
        "trades": trades,
    }
"""
Portfolio updater
-----------------
Reads data/holdings.yaml and data/transactions.yaml, fetches current + historical
prices from Yahoo Finance, and produces src/data/portfolio.json.

Calculations:
  - Current position values + unrealized gains (in EUR, with FX conversion)
  - Current loan balance from data/loan_schedule.csv
  - Realized gains: walks transaction history, applies average-cost method
    for each sell event, converts to EUR using the FX rate on the sell date.
  - FX decomposition: for each currently-held position, splits total EUR gain
    into "asset contribution" (what the underlying moved in its native currency)
    and "FX contribution" (what EUR/native-currency moved between buy date and now).

For UCITS ETFs that are EUR-denominated but track USD indices, the decomposition
uses benchmark indices (S&P 500 Total Return, MSCI World) with historical
USD prices, and historical EUR/USD rates.

Run locally: python scripts/update_portfolio.py
"""

from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml
import yfinance as yf

REPO_ROOT = Path(__file__).resolve().parent.parent
HOLDINGS_FILE = REPO_ROOT / "data" / "holdings.yaml"
TRANSACTIONS_FILE = REPO_ROOT / "data" / "transactions.yaml"
LOAN_FILE = REPO_ROOT / "data" / "loan_schedule.csv"
PORTFOLIO_OUT = REPO_ROOT / "src" / "data" / "portfolio.json"
HISTORY_OUT = REPO_ROOT / "src" / "data" / "history.json"

BASE_CURRENCY = "EUR"

# Benchmark map for FX decomposition.
# Each EUR-denominated UCITS ETF tracks a USD-denominated index. To decompose
# its returns into asset-performance vs FX-movement, we fetch the USD benchmark.
BENCHMARKS = {
    # EUR ETF ticker -> (USD benchmark ticker, display name)
    "CSPX.AS": ("^SP500TR", "S&P 500 Total Return"),
    "CW8.PA": ("URTH", "MSCI World (URTH proxy)"),
    "WPEA.PA": ("URTH", "MSCI World (URTH proxy)"),
}


# ============================================================================
# Price and FX fetchers
# ============================================================================

def get_latest_close(ticker: str) -> float:
    data = yf.Ticker(ticker).history(period="5d")
    if data.empty:
        raise RuntimeError(f"No price data for {ticker}")
    return float(data["Close"].iloc[-1])


def get_historical_close(ticker: str, date: pd.Timestamp) -> float:
    """Close price for `ticker` on `date` (falls back to nearest prior trading day)."""
    start = date - pd.Timedelta(days=10)
    end = date + pd.Timedelta(days=2)
    data = yf.Ticker(ticker).history(start=start, end=end)
    if data.empty:
        raise RuntimeError(f"No historical data for {ticker} around {date.date()}")
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)
    target = pd.Timestamp(date)
    if target.tz is not None:
        target = target.tz_convert(None).tz_localize(None)
    eligible = data[data.index <= target]
    if eligible.empty:
        return float(data["Close"].iloc[0])
    return float(eligible["Close"].iloc[-1])


def get_fx_rate(from_ccy: str, to_ccy: str, date: pd.Timestamp | None = None) -> float:
    if from_ccy == to_ccy:
        return 1.0
    pair = f"{from_ccy}{to_ccy}=X"
    if date is None:
        data = yf.Ticker(pair).history(period="5d")
    else:
        start = date - pd.Timedelta(days=10)
        end = date + pd.Timedelta(days=2)
        data = yf.Ticker(pair).history(start=start, end=end)
    if data.empty:
        raise RuntimeError(f"No FX data for {pair}")
    if date is None:
        return float(data["Close"].iloc[-1])
    if data.index.tz is not None:
        data.index = data.index.tz_localize(None)
    target = pd.Timestamp(date)
    if target.tz is not None:
        target = target.tz_convert(None).tz_localize(None)
    eligible = data[data.index <= target]
    if eligible.empty:
        return float(data["Close"].iloc[0])
    return float(eligible["Close"].iloc[-1])


# ============================================================================
# Data loaders
# ============================================================================

def load_holdings() -> list[dict]:
    with open(HOLDINGS_FILE) as f:
        return yaml.safe_load(f)["holdings"]


def load_transactions() -> list[dict]:
    if not TRANSACTIONS_FILE.exists():
        return []
    with open(TRANSACTIONS_FILE) as f:
        return yaml.safe_load(f).get("transactions", []) or []


def current_loan_balance() -> dict | None:
    if not LOAN_FILE.exists():
        return None
    df = pd.read_csv(LOAN_FILE, parse_dates=["date"])
    today = pd.Timestamp.now().normalize()
    past = df[df["date"] <= today]
    if past.empty:
        return None
    latest = past.iloc[-1]
    return {
        "as_of": latest["date"].strftime("%Y-%m-%d"),
        "remaining_eur": float(latest["remaining_balance"]),
    }


# ============================================================================
# Realized gains (average-cost method)
# ============================================================================

def compute_realized_gains(transactions: list[dict]) -> dict:
    """Walk transactions chronologically, maintain running avg cost per ticker,
    record realized P&L on each sell, converted to EUR at sale-date FX rate."""
    txs = sorted(transactions, key=lambda t: str(t["date"]))
    running: dict[str, dict] = {}
    events = []
    fx_cache: dict[tuple[str, str], float] = {}

    def fx_on(ccy: str, date: pd.Timestamp) -> float:
        if ccy == BASE_CURRENCY:
            return 1.0
        key = (ccy, date.strftime("%Y-%m-%d"))
        if key not in fx_cache:
            try:
                fx_cache[key] = get_fx_rate(ccy, BASE_CURRENCY, date)
            except Exception as e:
                print(f"WARN: FX lookup failed {ccy} on {date.date()}: {e}", file=sys.stderr)
                fx_cache[key] = 1.0
        return fx_cache[key]

    for tx in txs:
        ticker = tx["ticker"]
        action = tx["action"]
        shares = float(tx["shares"])
        price = float(tx["price"])
        ccy = tx.get("currency", "EUR")
        date = pd.Timestamp(str(tx["date"]))
        note = tx.get("note", "")

        if ticker not in running:
            running[ticker] = {"shares": 0.0, "total_cost": 0.0, "currency": ccy}
        pos = running[ticker]

        if action == "buy":
            pos["shares"] += shares
            pos["total_cost"] += shares * price
            pos["currency"] = ccy
        elif action == "sell":
            if pos["shares"] <= 0:
                continue
            avg_cost = pos["total_cost"] / pos["shares"]
            gain_native = (price - avg_cost) * shares
            fraction_sold = shares / pos["shares"]
            pos["total_cost"] -= pos["total_cost"] * fraction_sold
            pos["shares"] -= shares

            rate = fx_on(ccy, date)
            gain_eur = gain_native * rate

            events.append({
                "date": date.strftime("%Y-%m-%d"),
                "ticker": ticker,
                "shares": shares,
                "sell_price": round(price, 4),
                "avg_cost_at_sale": round(avg_cost, 4),
                "currency": ccy,
                "gain_native": round(gain_native, 2),
                "gain_eur": round(gain_eur, 2),
                "fx_rate_at_sale": round(rate, 4),
                "note": note,
            })

    total_eur = round(sum(e["gain_eur"] for e in events), 2)
    return {
        "total_eur": total_eur,
        "events": sorted(events, key=lambda e: e["date"], reverse=True),
    }


# ============================================================================
# FX decomposition
# ============================================================================

def compute_fx_decomposition(
    holdings: list[dict], transactions: list[dict], current_prices: dict
) -> list[dict]:
    results = []
    tx_by_ticker: dict[str, list[dict]] = {}
    for tx in transactions:
        tx_by_ticker.setdefault(tx["ticker"], []).append(tx)

    for h in holdings:
        ticker = h["ticker"]
        shares = float(h["shares"])
        bep = float(h["bep"])
        ccy = h["currency"]
        tx_list = tx_by_ticker.get(ticker, [])

        if not tx_list:
            continue

        buys = [t for t in tx_list if t["action"] == "buy"]
        if not buys:
            continue
        total_shares_bought = sum(float(t["shares"]) for t in buys)
        weighted_ordinal = sum(
            pd.Timestamp(str(t["date"])).toordinal() * float(t["shares"]) for t in buys
        ) / total_shares_bought
        avg_buy_date = pd.Timestamp.fromordinal(int(weighted_ordinal))

        current_price = current_prices.get(ticker)
        if current_price is None:
            continue

        value_today_native = shares * current_price
        cost_native = shares * bep

        result = {
            "ticker": ticker,
            "name": h.get("name", ticker),
            "currency": ccy,
            "avg_buy_date": avg_buy_date.strftime("%Y-%m-%d"),
            "shares": shares,
            "current_price": round(current_price, 4),
            "bep": round(bep, 4),
        }

        if ccy == "USD":
            # USD-denominated holding (e.g. GME) — FX is a direct effect of EUR/USD
            try:
                fx_at_buy = get_fx_rate("USD", "EUR", avg_buy_date)
                fx_today = get_fx_rate("USD", "EUR")
            except Exception as e:
                print(f"WARN: FX decomp skipped for {ticker}: {e}", file=sys.stderr)
                continue

            value_today_eur = value_today_native * fx_today
            cost_eur_at_buy = cost_native * fx_at_buy
            asset_only_today_eur = value_today_native * fx_at_buy

            total_gain_eur = value_today_eur - cost_eur_at_buy
            asset_gain_eur = asset_only_today_eur - cost_eur_at_buy
            fx_gain_eur = value_today_eur - asset_only_today_eur

            result.update({
                "fx_at_buy": round(fx_at_buy, 4),
                "fx_today": round(fx_today, 4),
                "fx_change_pct": round((fx_today - fx_at_buy) / fx_at_buy * 100, 2),
                "value_today_eur": round(value_today_eur, 2),
                "cost_eur_at_buy": round(cost_eur_at_buy, 2),
                "total_gain_eur": round(total_gain_eur, 2),
                "asset_gain_eur": round(asset_gain_eur, 2),
                "fx_gain_eur": round(fx_gain_eur, 2),
                "benchmark_note": "Direct USD holding — FX computed against EUR/USD",
            })
        elif ccy == "EUR" and ticker in BENCHMARKS:
            # EUR UCITS ETF tracking USD benchmark
            bench_ticker, bench_name = BENCHMARKS[ticker]
            try:
                bench_at_buy = get_historical_close(bench_ticker, avg_buy_date)
                bench_today = get_latest_close(bench_ticker)
                fx_at_buy = get_fx_rate("USD", "EUR", avg_buy_date)
                fx_today = get_fx_rate("USD", "EUR")
            except Exception as e:
                print(f"WARN: FX decomp skipped for {ticker}: {e}", file=sys.stderr)
                continue

            bench_return = (bench_today - bench_at_buy) / bench_at_buy
            cost_eur = cost_native
            value_today_eur = value_today_native
            total_gain_eur = value_today_eur - cost_eur

            fx_change_pct = (fx_today - fx_at_buy) / fx_at_buy
            asset_gain_eur = cost_eur * bench_return
            fx_gain_eur = total_gain_eur - asset_gain_eur

            result.update({
                "benchmark_ticker": bench_ticker,
                "benchmark_name": bench_name,
                "bench_at_buy": round(bench_at_buy, 2),
                "bench_today": round(bench_today, 2),
                "bench_return_pct": round(bench_return * 100, 2),
                "fx_at_buy": round(fx_at_buy, 4),
                "fx_today": round(fx_today, 4),
                "fx_change_pct": round(fx_change_pct * 100, 2),
                "value_today_eur": round(value_today_eur, 2),
                "cost_eur_at_buy": round(cost_eur, 2),
                "total_gain_eur": round(total_gain_eur, 2),
                "asset_gain_eur": round(asset_gain_eur, 2),
                "fx_gain_eur": round(fx_gain_eur, 2),
                "benchmark_note": f"Decomposition uses {bench_name} as USD benchmark.",
            })
        else:
            continue

        results.append(result)

    return results


# ============================================================================
# Main portfolio build
# ============================================================================

def build_portfolio() -> dict:
    holdings = load_holdings()
    transactions = load_transactions()
    positions = []
    total_value_base = 0.0
    total_cost_base = 0.0
    current_prices: dict[str, float] = {}
    fx_cache: dict[str, float] = {}

    def fx_today(from_ccy: str) -> float:
        if from_ccy not in fx_cache:
            fx_cache[from_ccy] = get_fx_rate(from_ccy, BASE_CURRENCY)
        return fx_cache[from_ccy]

    for h in holdings:
        ticker = h["ticker"]
        shares = float(h["shares"])
        bep = float(h["bep"])
        ccy = h["currency"]

        try:
            price = get_latest_close(ticker)
        except Exception as e:
            print(f"WARNING: failed to fetch {ticker}: {e}", file=sys.stderr)
            continue

        current_prices[ticker] = price
        rate = fx_today(ccy)
        value_native = price * shares
        cost_native = bep * shares
        value_base = value_native * rate
        cost_base = cost_native * rate

        total_value_base += value_base
        total_cost_base += cost_base

        bought = h.get("bought")
        if bought is not None and not isinstance(bought, str):
            bought = str(bought)

        positions.append({
            "ticker": ticker,
            "name": h.get("name", ticker),
            "shares": shares,
            "currency": ccy,
            "price": round(price, 4),
            "bep": round(bep, 4),
            "value_native": round(value_native, 2),
            "value_eur": round(value_base, 2),
            "cost_eur": round(cost_base, 2),
            "gain_eur": round(value_base - cost_base, 2),
            "gain_pct": round((value_base - cost_base) / cost_base * 100, 2) if cost_base else 0,
            "bought": bought,
        })

    for p in positions:
        p["allocation_pct"] = round(p["value_eur"] / total_value_base * 100, 2) if total_value_base else 0

    loan = current_loan_balance()
    loan_eur = round(loan["remaining_eur"], 2) if loan else None
    net_worth = total_value_base - (loan_eur or 0)

    print("Computing realized gains...", file=sys.stderr)
    realized = compute_realized_gains(transactions)

    print("Computing FX decomposition...", file=sys.stderr)
    fx_decomp = compute_fx_decomposition(holdings, transactions, current_prices)

    return {
        "last_updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "base_currency": BASE_CURRENCY,
        "positions": positions,
        "summary": {
            "market_value_eur": round(total_value_base, 2),
            "total_cost_eur": round(total_cost_base, 2),
            "total_gain_eur": round(total_value_base - total_cost_base, 2),
            "total_gain_pct": round((total_value_base - total_cost_base) / total_cost_base * 100, 2) if total_cost_base else 0,
            "loan_remaining_eur": loan_eur,
            "loan_as_of": loan["as_of"] if loan else None,
            "net_worth_eur": round(net_worth, 2),
            "realized_gain_eur": realized["total_eur"],
        },
        "realized": realized,
        "fx_decomposition": fx_decomp,
    }


def append_history(snapshot: dict) -> None:
    HISTORY_OUT.parent.mkdir(parents=True, exist_ok=True)
    history = []
    if HISTORY_OUT.exists():
        with open(HISTORY_OUT) as f:
            history = json.load(f)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    entry = {
        "date": today,
        "market_value_eur": snapshot["summary"]["market_value_eur"],
        "net_worth_eur": snapshot["summary"]["net_worth_eur"],
    }
    history = [h for h in history if h["date"] != today]
    history.append(entry)
    history.sort(key=lambda h: h["date"])
    with open(HISTORY_OUT, "w") as f:
        json.dump(history, f, indent=2)


def main() -> int:
    try:
        snapshot = build_portfolio()
    except Exception as e:
        print(f"ERROR building portfolio: {e}", file=sys.stderr)
        return 1

    PORTFOLIO_OUT.parent.mkdir(parents=True, exist_ok=True)
    with open(PORTFOLIO_OUT, "w") as f:
        json.dump(snapshot, f, indent=2, default=str)
    append_history(snapshot)

    s = snapshot["summary"]
    print(f"Market value:  {s['market_value_eur']:>12,.2f} EUR")
    print(f"Cost basis:    {s['total_cost_eur']:>12,.2f} EUR")
    print(f"Unrealized:    {s['total_gain_eur']:>12,.2f} EUR ({s['total_gain_pct']:+.2f}%)")
    print(f"Realized:      {s['realized_gain_eur']:>12,.2f} EUR (all-time)")
    if s["loan_remaining_eur"] is not None:
        print(f"Loan:          {s['loan_remaining_eur']:>12,.2f} EUR as of {s['loan_as_of']}")
    print(f"Net worth:     {s['net_worth_eur']:>12,.2f} EUR")
    print()
    print("FX decomposition:")
    for d in snapshot["fx_decomposition"]:
        print(f"  {d['ticker']:10} asset {d['asset_gain_eur']:>+10,.2f}  fx {d['fx_gain_eur']:>+10,.2f}  total {d['total_gain_eur']:>+10,.2f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

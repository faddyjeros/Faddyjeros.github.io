"""
Backfill history.json with monthly portfolio snapshots back to the first transaction.

Uses yfinance to fetch actual historical closing prices for every ticker.
Run once — the daily update_portfolio.py takes over from today onward.

Usage:
    python scripts/backfill_history.py
"""

from __future__ import annotations

import json
import math
import sys
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd
import yaml
import yfinance as yf

REPO_ROOT        = Path(__file__).resolve().parent.parent
TRANSACTIONS_FILE = REPO_ROOT / "data" / "transactions.yaml"
LOAN_FILE         = REPO_ROOT / "data" / "loan_schedule.csv"
HISTORY_OUT       = REPO_ROOT / "src" / "data" / "history.json"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def is_bad(x) -> bool:
    if x is None:
        return True
    try:
        return math.isnan(x) or math.isinf(x)
    except (TypeError, ValueError):
        return True


def load_transactions() -> list[dict]:
    with open(TRANSACTIONS_FILE) as f:
        return yaml.safe_load(f).get("transactions", [])


def load_existing_history() -> list[dict]:
    if not HISTORY_OUT.exists():
        return []
    with open(HISTORY_OUT) as f:
        return json.load(f)


def loan_balance_at(date_str: str) -> float:
    if not LOAN_FILE.exists():
        return 0.0
    df = pd.read_csv(LOAN_FILE, parse_dates=["date"])
    df["date_str"] = df["date"].dt.strftime("%Y-%m-%d")
    past = df[df["date_str"] <= date_str]
    if past.empty:
        return 0.0
    return float(past.iloc[-1]["remaining_balance"])


# ---------------------------------------------------------------------------
# Portfolio state reconstruction
# ---------------------------------------------------------------------------

def build_portfolio_at(transactions: list[dict], date_str: str) -> dict[str, dict]:
    """
    Returns {ticker: {shares, currency}} for all open positions at date_str.
    Respects the currency recorded in the YAML.
    """
    state: dict[str, dict] = {}
    for tx in sorted(transactions, key=lambda t: str(t["date"])):
        if str(tx["date"]) > date_str:
            break
        ticker = tx["ticker"]
        shares = float(tx["shares"])
        ccy    = tx.get("currency", "EUR")
        if ticker not in state:
            state[ticker] = {"shares": 0.0, "currency": ccy}
        if tx["action"] == "buy":
            state[ticker]["shares"] += shares
        elif tx["action"] == "sell":
            state[ticker]["shares"] -= shares

    return {t: s for t, s in state.items() if s["shares"] > 0.0001}


# ---------------------------------------------------------------------------
# Price fetching
# ---------------------------------------------------------------------------

def fetch_price_series(tickers: set[str], start: str) -> dict[str, pd.Series]:
    """
    Batch-download closing price history for all tickers.
    Returns {ticker: pd.Series(index=date, value=close_price)}.
    """
    results = {}
    for ticker in tickers:
        try:
            df = yf.Ticker(ticker).history(start=start, end=None)
            if df.empty:
                print(f"  WARN {ticker}: no data", file=sys.stderr)
                continue
            df.index = pd.to_datetime(df.index).tz_localize(None)
            results[ticker] = df["Close"]
            print(f"  {ticker}: {len(df)} rows ({df.index[0].date()} to {df.index[-1].date()})")
        except Exception as e:
            print(f"  WARN {ticker}: {e}", file=sys.stderr)
    return results


def fetch_usd_eur_series(start: str) -> pd.Series | None:
    """Returns USD→EUR rate series (i.e. how many EUR per 1 USD)."""
    try:
        df = yf.Ticker("EURUSD=X").history(start=start, end=None)
        if df.empty:
            return None
        df.index = pd.to_datetime(df.index).tz_localize(None)
        # EURUSD=X gives USD per EUR; invert to get EUR per USD
        return 1.0 / df["Close"]
    except Exception as e:
        print(f"  WARN EURUSD=X: {e}", file=sys.stderr)
        return None


def last_before(series: pd.Series, date_str: str) -> float | None:
    target = pd.Timestamp(date_str)
    eligible = series[series.index <= target]
    if eligible.empty:
        return None
    return float(eligible.iloc[-1])


# ---------------------------------------------------------------------------
# Date generation
# ---------------------------------------------------------------------------

def monthly_dates(start_str: str, end_str: str) -> list[str]:
    """First of each month from start to end, inclusive."""
    start = pd.Timestamp(start_str).replace(day=1)
    end   = pd.Timestamp(end_str)
    dates = []
    cur = start
    while cur <= end:
        dates.append(cur.strftime("%Y-%m-%d"))
        cur += pd.DateOffset(months=1)
    return dates


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    transactions = load_transactions()
    if not transactions:
        print("No transactions found.", file=sys.stderr)
        return 1

    sorted_txs = sorted(transactions, key=lambda t: str(t["date"]))
    first_date = str(sorted_txs[0]["date"])
    today_str  = datetime.now().strftime("%Y-%m-%d")

    print(f"Date range: {first_date} to {today_str}")

    # All unique dates we want snapshots for
    snap_dates = sorted(set(
        monthly_dates(first_date, today_str)
        + [str(t["date"]) for t in sorted_txs]   # transaction dates for precision
    ))

    # All tickers ever held
    all_tickers = {t["ticker"] for t in transactions}
    usd_tickers = {t["ticker"] for t in transactions if t.get("currency", "EUR") == "USD"}

    print(f"\nFetching price history for {len(all_tickers)} tickers...")
    prices = fetch_price_series(all_tickers, first_date)

    print("\nFetching EUR/USD history...")
    usd_eur = fetch_usd_eur_series(first_date)

    # Build snapshots
    print("\nBuilding snapshots...")
    snapshots: list[dict] = []

    for date_str in snap_dates:
        portfolio = build_portfolio_at(transactions, date_str)
        if not portfolio:
            continue

        market_value = 0.0
        skip = False

        for ticker, info in portfolio.items():
            series = prices.get(ticker)
            if series is None:
                skip = True
                break

            price = last_before(series, date_str)
            if price is None or is_bad(price):
                skip = True
                break

            shares = info["shares"]
            ccy    = info["currency"]

            if ccy == "USD":
                rate = last_before(usd_eur, date_str) if usd_eur is not None else 0.88
                if rate is None or is_bad(rate):
                    rate = 0.88   # rough fallback
                market_value += shares * price * rate
            else:
                # EUR-denominated (or recorded as EUR-equivalent)
                market_value += shares * price

        if skip or is_bad(market_value):
            continue

        loan      = loan_balance_at(date_str)
        net_worth = market_value - loan

        snapshots.append({
            "date":             date_str,
            "market_value_eur": round(market_value, 2),
            "net_worth_eur":    round(net_worth,    2),
        })

    # Merge with existing history, preferring existing entries (they're daily/accurate)
    existing     = load_existing_history()
    existing_map = {e["date"]: e for e in existing}

    merged_map: dict[str, dict] = {}
    for s in snapshots:
        merged_map[s["date"]] = s
    for e in existing:
        merged_map[e["date"]] = e   # existing wins

    merged = sorted(merged_map.values(), key=lambda x: x["date"])

    with open(HISTORY_OUT, "w") as f:
        json.dump(merged, f, indent=2)

    print(f"\nDone. Wrote {len(merged)} entries to {HISTORY_OUT}")
    if merged:
        print(f"  Range: {merged[0]['date']} to {merged[-1]['date']}")
        print(f"  First: {merged[0]['market_value_eur']:,.0f} EUR")
        print(f"  Latest: {merged[-1]['market_value_eur']:,.0f} EUR")

    return 0


if __name__ == "__main__":
    sys.exit(main())

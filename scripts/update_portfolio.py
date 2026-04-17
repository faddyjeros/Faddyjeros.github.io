"""
Portfolio updater
-----------------
Reads data/holdings.yaml, fetches current prices from Yahoo Finance,
calculates values and P&L, and writes src/data/portfolio.json.

Also reads data/loan_schedule.csv and determines the current remaining
loan balance based on today's date.

Appends a snapshot to src/data/history.json so the net worth chart
has time-series data.

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

# --- Paths (resolved relative to repo root) ---------------------------------
REPO_ROOT = Path(__file__).resolve().parent.parent
HOLDINGS_FILE = REPO_ROOT / "data" / "holdings.yaml"
LOAN_FILE = REPO_ROOT / "data" / "loan_schedule.csv"
PORTFOLIO_OUT = REPO_ROOT / "src" / "data" / "portfolio.json"
HISTORY_OUT = REPO_ROOT / "src" / "data" / "history.json"

# Base currency for the site's totals
BASE_CURRENCY = "EUR"


def get_price(ticker: str) -> float:
    """Fetch the most recent closing price for a ticker."""
    data = yf.Ticker(ticker).history(period="5d")
    if data.empty:
        raise RuntimeError(f"No price data returned for {ticker}")
    return float(data["Close"].iloc[-1])


def get_fx_rate(from_ccy: str, to_ccy: str) -> float:
    """Convert 1 unit of from_ccy to to_ccy. Returns 1.0 if same currency."""
    if from_ccy == to_ccy:
        return 1.0
    pair = f"{from_ccy}{to_ccy}=X"
    data = yf.Ticker(pair).history(period="5d")
    if data.empty:
        raise RuntimeError(f"No FX data for {pair}")
    return float(data["Close"].iloc[-1])


def load_holdings() -> list[dict]:
    with open(HOLDINGS_FILE) as f:
        return yaml.safe_load(f)["holdings"]


def current_loan_balance() -> dict | None:
    """Return the remaining loan balance as of the latest payment that has occurred."""
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


def build_portfolio() -> dict:
    holdings = load_holdings()
    positions = []
    total_value_base = 0.0
    total_cost_base = 0.0

    # Cache FX rates so we don't refetch per position
    fx_cache: dict[str, float] = {}

    def fx(from_ccy: str) -> float:
        if from_ccy not in fx_cache:
            fx_cache[from_ccy] = get_fx_rate(from_ccy, BASE_CURRENCY)
        return fx_cache[from_ccy]

    for h in holdings:
        ticker = h["ticker"]
        shares = float(h["shares"])
        bep = float(h["bep"])
        ccy = h["currency"]

        try:
            price = get_price(ticker)
        except Exception as e:
            print(f"WARNING: failed to fetch {ticker}: {e}", file=sys.stderr)
            continue

        rate = fx(ccy)
        value_native = price * shares
        cost_native = bep * shares
        value_base = value_native * rate
        cost_base = cost_native * rate

        total_value_base += value_base
        total_cost_base += cost_base

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
            "bought": h.get("bought"),
        })

    # Allocation percentages
    for p in positions:
        p["allocation_pct"] = round(p["value_eur"] / total_value_base * 100, 2) if total_value_base else 0

    loan = current_loan_balance()
    loan_eur = None
    if loan:
        loan_eur = round(loan["remaining_eur"], 2)

    net_worth = total_value_base - (loan_eur or 0)

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
        },
    }


def append_history(snapshot: dict) -> None:
    """Append today's net worth + market value to history.json (one entry per day, overwrite if same day)."""
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

    # Replace today's entry if it exists, otherwise append
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
    print(f"Gain:          {s['total_gain_eur']:>12,.2f} EUR ({s['total_gain_pct']:+.2f}%)")
    if s["loan_remaining_eur"] is not None:
        print(f"Loan:          {s['loan_remaining_eur']:>12,.2f} EUR as of {s['loan_as_of']}")
    print(f"Net worth:     {s['net_worth_eur']:>12,.2f} EUR")
    return 0


if __name__ == "__main__":
    sys.exit(main())

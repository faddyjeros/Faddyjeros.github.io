"""
Record a buy or sell, updating both transactions.yaml and holdings.yaml.

Usage:
    python scripts/add_transaction.py buy  CSPX.AS 1.5 660.50
    python scripts/add_transaction.py sell GME     10  22.00 --date 2026-05-20
    python scripts/add_transaction.py buy  NEW.PA  100 12.34 \\
        --currency EUR --name "New ETF"        # required for first-time tickers

What it does:
  - Appends a new entry to data/transactions.yaml (preserves file formatting)
  - Updates data/holdings.yaml:
      * existing ticker: bumps shares + recomputes weighted-average BEP
      * new ticker on buy: creates a new holding block
      * sell that empties a position: removes the holding block
  - Prints a summary; does NOT commit or push (review the diff yourself)
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import date as date_cls
from pathlib import Path

import yaml

REPO_ROOT = Path(__file__).resolve().parent.parent
TRANSACTIONS_FILE = REPO_ROOT / "data" / "transactions.yaml"
HOLDINGS_FILE = REPO_ROOT / "data" / "holdings.yaml"


# ---------------------------------------------------------------------------
# YAML readers (safe loads for math; the writes are text-based to preserve
# comments, blank lines, and the multi-line `note:` blocks)
# ---------------------------------------------------------------------------

def load_holdings_dict() -> dict[str, dict]:
    with open(HOLDINGS_FILE) as f:
        data = yaml.safe_load(f) or {}
    return {h["ticker"]: h for h in data.get("holdings", [])}


# ---------------------------------------------------------------------------
# Writers
# ---------------------------------------------------------------------------

def append_transaction(
    *,
    action: str,
    ticker: str,
    shares: float,
    price: float,
    currency: str,
    date: str,
    note: str | None,
) -> None:
    """Append a new entry at the end of transactions.yaml."""
    text = TRANSACTIONS_FILE.read_text(encoding="utf-8")
    # Strip trailing whitespace, then append a clean block
    text = text.rstrip() + "\n"

    block = (
        f"\n  - date: {date}\n"
        f"    action: {action}\n"
        f"    ticker: {ticker}\n"
        f"    shares: {_fmt_num(shares)}\n"
        f"    price: {_fmt_num(price)}\n"
        f"    currency: {currency}\n"
    )
    if note:
        # Quote the note safely (single-line)
        safe = note.replace('"', '\\"')
        block += f'    note: "{safe}"\n'

    TRANSACTIONS_FILE.write_text(text + block, encoding="utf-8")


def update_holding_block(
    *,
    ticker: str,
    new_shares: float,
    new_bep: float,
) -> None:
    """Edit the matching `- ticker: XXX` block in holdings.yaml in place."""
    text = HOLDINGS_FILE.read_text(encoding="utf-8")
    # Find the block: from `- ticker: XXX` to the next `- ticker:` or EOF
    pattern = re.compile(
        rf"(^  - ticker: {re.escape(ticker)}\s*\n.*?)(?=^  - ticker: |\Z)",
        re.DOTALL | re.MULTILINE,
    )
    m = pattern.search(text)
    if not m:
        raise RuntimeError(f"holdings.yaml has no block for ticker {ticker}")
    block = m.group(1)

    # Replace the shares: and bep: lines (the first occurrence within the block)
    new_block = re.sub(
        r"^(\s+shares:\s*).*$",
        rf"\g<1>{_fmt_num(new_shares)}",
        block,
        count=1,
        flags=re.MULTILINE,
    )
    new_block = re.sub(
        r"^(\s+bep:\s*).*$",
        rf"\g<1>{_fmt_num(new_bep)}",
        new_block,
        count=1,
        flags=re.MULTILINE,
    )

    HOLDINGS_FILE.write_text(text.replace(block, new_block, 1), encoding="utf-8")


def remove_holding_block(ticker: str) -> None:
    """Delete the `- ticker: XXX` block from holdings.yaml entirely."""
    text = HOLDINGS_FILE.read_text(encoding="utf-8")
    pattern = re.compile(
        rf"(^  - ticker: {re.escape(ticker)}\s*\n.*?)(?=^  - ticker: |\Z)",
        re.DOTALL | re.MULTILINE,
    )
    new_text, n = pattern.subn("", text)
    if n == 0:
        raise RuntimeError(f"holdings.yaml has no block for ticker {ticker}")
    # Tidy up any double blank lines we may have left behind
    new_text = re.sub(r"\n{3,}", "\n\n", new_text)
    HOLDINGS_FILE.write_text(new_text, encoding="utf-8")


def append_new_holding(
    *,
    ticker: str,
    shares: float,
    bep: float,
    currency: str,
    name: str,
    bought: str,
    note: str | None,
) -> None:
    """Append a new holding block at the end of holdings.yaml."""
    text = HOLDINGS_FILE.read_text(encoding="utf-8").rstrip() + "\n"
    block = (
        f"\n  - ticker: {ticker}\n"
        f"    shares: {_fmt_num(shares)}\n"
        f"    bep: {_fmt_num(bep)}\n"
        f"    currency: {currency}\n"
        f'    name: "{name}"\n'
        f"    bought: {bought}\n"
    )
    if note:
        safe = note.replace('"', '\\"')
        block += f'    note: "{safe}"\n'
    HOLDINGS_FILE.write_text(text + block, encoding="utf-8")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fmt_num(x: float) -> str:
    """Format a number without trailing zeros, but preserving precision."""
    # Whole numbers stay whole; otherwise up to 6 decimals, stripped
    if x == int(x):
        return str(int(x))
    return f"{x:.6f}".rstrip("0").rstrip(".")


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("action", choices=["buy", "sell"])
    p.add_argument("ticker", help="Yahoo Finance symbol (e.g. CSPX.AS)")
    p.add_argument("shares", type=float, help="Number of shares (positive)")
    p.add_argument("price", type=float, help="Price per share in ticker's quote currency")
    p.add_argument("--date", default=date_cls.today().isoformat(), help="YYYY-MM-DD (default: today)")
    p.add_argument("--note", default=None, help="Optional commentary")
    # Required only when adding a brand-new ticker
    p.add_argument("--currency", help="USD/EUR/etc. (required for first-time tickers)")
    p.add_argument("--name", help="Display name (required for first-time tickers)")
    return p.parse_args()


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> int:
    args = parse_args()

    if args.shares <= 0 or args.price <= 0:
        print("ERROR: shares and price must be positive", file=sys.stderr)
        return 1
    try:
        date_cls.fromisoformat(args.date)
    except ValueError:
        print(f"ERROR: --date must be YYYY-MM-DD, got {args.date!r}", file=sys.stderr)
        return 1

    holdings = load_holdings_dict()
    existing = holdings.get(args.ticker)

    # ------------------- update / create holding -------------------
    if args.action == "buy":
        if existing:
            old_shares = float(existing["shares"])
            old_bep = float(existing["bep"])
            new_shares = old_shares + args.shares
            # Weighted-average cost basis
            new_bep = (old_shares * old_bep + args.shares * args.price) / new_shares
            currency = existing["currency"]
            update_holding_block(
                ticker=args.ticker, new_shares=new_shares, new_bep=new_bep
            )
            print(f"Updated holding {args.ticker}: {_fmt_num(old_shares)} -> {_fmt_num(new_shares)} shares, "
                  f"BEP {_fmt_num(old_bep)} -> {_fmt_num(new_bep)} {currency}")
        else:
            if not args.currency or not args.name:
                print(
                    f"ERROR: {args.ticker} is new — pass --currency and --name on the first buy.",
                    file=sys.stderr,
                )
                return 1
            currency = args.currency
            append_new_holding(
                ticker=args.ticker,
                shares=args.shares,
                bep=args.price,
                currency=args.currency,
                name=args.name,
                bought=args.date,
                note=None,
            )
            print(f"Created new holding {args.ticker}: {_fmt_num(args.shares)} @ "
                  f"{_fmt_num(args.price)} {currency}")
    else:  # sell
        if not existing:
            print(f"ERROR: cannot sell {args.ticker} — no such holding", file=sys.stderr)
            return 1
        old_shares = float(existing["shares"])
        old_bep = float(existing["bep"])
        currency = existing["currency"]
        if args.shares > old_shares + 1e-9:
            print(
                f"ERROR: trying to sell {args.shares} shares but only {old_shares} held",
                file=sys.stderr,
            )
            return 1
        new_shares = old_shares - args.shares
        if new_shares < 1e-9:
            remove_holding_block(args.ticker)
            print(f"Closed position {args.ticker}: sold all {_fmt_num(old_shares)} shares "
                  f"@ {_fmt_num(args.price)} {currency}")
        else:
            # BEP doesn't change on a sell — remaining shares carry the same average cost
            update_holding_block(
                ticker=args.ticker, new_shares=new_shares, new_bep=old_bep
            )
            print(f"Reduced holding {args.ticker}: {_fmt_num(old_shares)} -> "
                  f"{_fmt_num(new_shares)} shares (BEP unchanged at {_fmt_num(old_bep)} {currency})")

    # ------------------- append transaction -------------------
    append_transaction(
        action=args.action,
        ticker=args.ticker,
        shares=args.shares,
        price=args.price,
        currency=currency,
        date=args.date,
        note=args.note,
    )
    print(f"Logged transaction in {TRANSACTIONS_FILE.relative_to(REPO_ROOT)}")
    print(f"\nReview the diff with `git diff data/`, then commit & push when ready.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

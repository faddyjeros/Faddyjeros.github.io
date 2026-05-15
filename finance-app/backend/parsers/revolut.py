import hashlib
import re
from io import StringIO

import pandas as pd

from parsers import categorize, is_cash_withdrawal


def _is_simple_format(content: bytes) -> bool:
    """Detect the simple flat CSV format (Type,Product,Started Date,...)"""
    first_line = content[:200].decode("utf-8-sig", errors="replace").splitlines()[0]
    return "Started Date" in first_line and "Type" in first_line


def parse_simple(content: bytes) -> tuple[list[dict], list[str]]:
    """Parse the simple per-transaction Revolut CSV export."""
    errors: list[str] = []
    text = content.decode("utf-8-sig", errors="replace")
    try:
        df = pd.read_csv(StringIO(text), dtype=str)
    except Exception as e:
        return [], [str(e)]

    transactions: list[dict] = []
    for _, row in df.iterrows():
        state = str(row.get("State", "") or "").upper()
        if state not in ("COMPLETED", "PENDING"):
            continue

        raw_date = str(row.get("Started Date", "") or "").strip()
        try:
            date = pd.to_datetime(raw_date).date()
        except Exception:
            errors.append(f"Bad date: {raw_date}")
            continue

        raw_amount = str(row.get("Amount", "") or "").strip().replace(",", ".")
        try:
            amount = float(raw_amount)
        except Exception:
            errors.append(f"Bad amount: {raw_amount}")
            continue

        desc = str(row.get("Description", "") or "").strip()
        currency = str(row.get("Currency", "EUR") or "EUR").strip()
        tx_type = str(row.get("Type", "") or "").strip()

        import_hash = hashlib.md5(
            f"REVOLUT|{currency}|{date}|{amount}|{desc}".encode()
        ).hexdigest()

        transactions.append({
            "date": date,
            "value_date": date,
            "bank": "REVOLUT",
            "account": f"Revolut {currency}",
            "currency": currency,
            "amount": amount,
            "description": desc,
            "category": categorize(desc),
            "original_category": tx_type or None,
            "notes": None,
            "transaction_ref": None,
            "import_hash": import_hash,
            "needs_annotation": is_cash_withdrawal(desc),
        })

    return transactions, errors


def _parse_amount(s: str) -> float | None:
    if not s or str(s) == "nan":
        return None
    s = str(s).strip()
    negative = s.startswith("-")
    s = re.sub(r"[€£$CHF\s]", "", s).replace(",", ".")
    s = s.lstrip("-")
    try:
        val = float(s)
        return -val if negative else val
    except Exception:
        return None


def parse(content: bytes) -> tuple[list[dict], list[str]]:
    if _is_simple_format(content):
        return parse_simple(content)
    return _parse_annual(content)


def _parse_annual(content: bytes) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    text = content.decode("utf-8", errors="replace")

    in_tx_section = False
    current_currency = "EUR"
    in_table = False
    table_lines: list[str] = []
    currency_for_table: list[tuple[str, list[str]]] = []

    for line in text.splitlines():
        stripped = line.strip()

        if "Current Accounts Transaction Statements" in stripped:
            in_tx_section = True
            continue

        if not in_tx_section:
            continue

        if "Personal Account (EUR)" in stripped:
            if in_table and table_lines:
                currency_for_table.append((current_currency, table_lines))
                table_lines = []
                in_table = False
            current_currency = "EUR"
            continue

        if "Personal Account (CHF)" in stripped:
            if in_table and table_lines:
                currency_for_table.append((current_currency, table_lines))
                table_lines = []
                in_table = False
            current_currency = "CHF"
            continue

        if "Date" in stripped and "Description" in stripped and "Money in/out" in stripped:
            in_table = True
            table_lines = [stripped]
            continue

        if in_table:
            if stripped.startswith("Total,") or stripped.startswith("---------"):
                currency_for_table.append((current_currency, table_lines))
                table_lines = []
                in_table = False
                continue
            if stripped:
                table_lines.append(stripped)

    if in_table and table_lines:
        currency_for_table.append((current_currency, table_lines))

    transactions: list[dict] = []
    for currency, lines in currency_for_table:
        if len(lines) < 2:
            continue
        try:
            df = pd.read_csv(StringIO("\n".join(lines)), dtype=str)
        except Exception as e:
            errors.append(f"Revolut {currency} parse error: {e}")
            continue

        for _, row in df.iterrows():
            raw_date = str(row.get("Date", "") or "").strip()
            if not raw_date or raw_date == "nan":
                continue
            try:
                date = pd.to_datetime(raw_date).date()
            except Exception:
                errors.append(f"Bad date: {raw_date}")
                continue

            amount = _parse_amount(row.get("Money in/out", ""))
            if amount is None:
                continue

            desc = str(row.get("Description", "") or "").strip()
            orig_cat = str(row.get("Category", "") or "").strip()
            if orig_cat == "nan":
                orig_cat = ""

            import_hash = hashlib.md5(
                f"REVOLUT|{currency}|{date}|{amount}|{desc}".encode()
            ).hexdigest()

            transactions.append(
                {
                    "date": date,
                    "value_date": date,
                    "bank": "REVOLUT",
                    "account": f"Revolut {currency}",
                    "currency": currency,
                    "amount": amount,
                    "description": desc,
                    "category": categorize(desc, orig_cat),
                    "original_category": orig_cat or None,
                    "notes": None,
                    "transaction_ref": None,
                    "import_hash": import_hash,
                    "needs_annotation": is_cash_withdrawal(desc),
                }
            )

    return transactions, errors

import hashlib
from io import StringIO

import pandas as pd

from parsers import categorize, is_cash_withdrawal


def parse(content: bytes) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    text = content.decode("utf-8", errors="replace")
    lines = text.splitlines()

    iban = None
    header_row_idx = None
    for i, line in enumerate(lines):
        if line.startswith("IBAN:"):
            parts = line.split(";")
            if len(parts) > 1:
                iban = parts[1].strip()
        if "Trade date" in line:
            header_row_idx = i
            break

    if header_row_idx is None:
        return [], ["Could not find transaction header row"]

    try:
        df = pd.read_csv(
            StringIO("\n".join(lines[header_row_idx:])),
            sep=";",
            on_bad_lines="skip",
            dtype=str,
        )
    except Exception as e:
        return [], [str(e)]

    transactions: list[dict] = []
    for _, row in df.iterrows():
        raw_date = str(row.get("Trade date", "") or "").strip()
        if not raw_date or raw_date == "nan":
            continue
        try:
            date = pd.to_datetime(raw_date).date()
        except Exception:
            errors.append(f"Bad date: {raw_date}")
            continue

        raw_value_date = str(row.get("Value date", "") or "").strip()
        try:
            value_date = pd.to_datetime(raw_value_date).date() if raw_value_date and raw_value_date != "nan" else date
        except Exception:
            value_date = date

        debit = str(row.get("Debit", "") or "").strip()
        credit = str(row.get("Credit", "") or "").strip()
        try:
            if debit and debit != "nan":
                amount = float(debit.replace(",", "."))
            elif credit and credit != "nan":
                amount = float(credit.replace(",", "."))
            else:
                continue
        except Exception:
            errors.append(f"Bad amount: debit={debit} credit={credit}")
            continue

        desc1 = str(row.get("Description1", "") or "").strip()
        desc2 = str(row.get("Description2", "") or "").strip()
        desc3 = str(row.get("Description3", "") or "").strip()
        description = "; ".join(p for p in [desc1, desc2, desc3] if p and p != "nan")

        ref = str(row.get("Transaction no.", "") or "").strip()
        if ref == "nan":
            ref = ""

        import_hash = hashlib.md5(f"UBS|{date}|{amount}|{ref}|{description}".encode()).hexdigest()

        transactions.append(
            {
                "date": date,
                "value_date": value_date,
                "bank": "UBS",
                "account": iban,
                "currency": str(row.get("Currency", "CHF")).strip(),
                "amount": amount,
                "description": description,
                "category": categorize(description),
                "original_category": None,
                "notes": None,
                "transaction_ref": ref or None,
                "import_hash": import_hash,
                "needs_annotation": is_cash_withdrawal(description),
            }
        )

    return transactions, errors

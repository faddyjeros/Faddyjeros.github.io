import hashlib
from io import BytesIO, StringIO

import pandas as pd

from parsers import categorize, is_cash_withdrawal


def _is_csv(content: bytes) -> bool:
    first = content[:200].decode("utf-8-sig", errors="replace").splitlines()[0]
    return "dateOp" in first and "label" in first


def parse_csv(content: bytes) -> tuple[list[dict], list[str]]:
    """Parse the semicolon-delimited Boursobank CSV export."""
    errors: list[str] = []
    text = content.decode("utf-8-sig", errors="replace")
    try:
        df = pd.read_csv(StringIO(text), sep=";", dtype=str)
    except Exception as e:
        return [], [str(e)]

    transactions: list[dict] = []
    for row_idx, (_, row) in enumerate(df.iterrows()):
        raw_date = str(row.get("dateOp", "") or "").strip()
        if not raw_date or raw_date == "nan":
            continue
        try:
            date = pd.to_datetime(raw_date).date()
        except Exception:
            errors.append(f"Bad date: {raw_date}")
            continue

        raw_value = str(row.get("dateVal", "") or "").strip()
        try:
            value_date = pd.to_datetime(raw_value).date() if raw_value and raw_value != "nan" else date
        except Exception:
            value_date = date

        raw_amount = str(row.get("amount", "") or "").strip()
        try:
            import re as _re
            amount = float(_re.sub(r"[^\d,.\-]", "", raw_amount).replace(",", "."))
        except Exception:
            errors.append(f"Bad amount: {raw_amount}")
            continue

        desc = str(row.get("label", "") or "").strip().strip('"')
        cat = str(row.get("category", "") or "").strip()
        parent_cat = str(row.get("categoryParent", "") or "").strip()
        if cat == "nan": cat = ""
        if parent_cat == "nan": parent_cat = ""
        orig_cat = f"{parent_cat} > {cat}" if parent_cat and cat else (cat or parent_cat)

        import_hash = hashlib.md5(
            f"BOURSOBANK|{date}|{amount}|{desc}|{row_idx}".encode()
        ).hexdigest()

        transactions.append({
            "date": date,
            "value_date": value_date,
            "bank": "BOURSOBANK",
            "account": "Boursobank EUR",
            "currency": "EUR",
            "amount": amount,
            "description": desc,
            "category": categorize(desc, cat),
            "original_category": orig_cat or None,
            "notes": None,
            "transaction_ref": None,
            "import_hash": import_hash,
            "needs_annotation": is_cash_withdrawal(desc),
        })

    return transactions, errors

# Positional column mapping (no headers in export)
# 0: date_op, 1: value_date, 2: description, 3: category, 4: subcategory,
# 5: merchant, 6: amount, 7: unknown, 8: account_id, 9: bank, 10: balance
COL_DATE = 0
COL_VALUE_DATE = 1
COL_DESCRIPTION = 2
COL_CATEGORY = 3
COL_SUBCATEGORY = 4
COL_AMOUNT = 6


def parse(content: bytes) -> tuple[list[dict], list[str]]:
    if _is_csv(content):
        return parse_csv(content)
    return _parse_xlsx(content)


def _parse_xlsx(content: bytes) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    try:
        df = pd.read_excel(
            BytesIO(content),
            header=None,
            engine="openpyxl",
            dtype=str,
        )
    except Exception as e:
        return [], [str(e)]

    transactions: list[dict] = []
    for row_idx, (_, row) in enumerate(df.iterrows()):
        raw_date = str(row.iloc[COL_DATE] if len(row) > COL_DATE else "").strip()
        if not raw_date or raw_date == "nan":
            continue
        try:
            date = pd.to_datetime(raw_date).date()
        except Exception:
            errors.append(f"Bad date: {raw_date}")
            continue

        raw_value_date = str(row.iloc[COL_VALUE_DATE] if len(row) > COL_VALUE_DATE else "").strip()
        try:
            value_date = pd.to_datetime(raw_value_date).date() if raw_value_date and raw_value_date != "nan" else date
        except Exception:
            value_date = date

        raw_amount = str(row.iloc[COL_AMOUNT] if len(row) > COL_AMOUNT else "").strip()
        raw_amount = raw_amount.replace(",", ".")
        try:
            amount = float(raw_amount)
        except Exception:
            errors.append(f"Bad amount: {raw_amount}")
            continue

        desc = str(row.iloc[COL_DESCRIPTION] if len(row) > COL_DESCRIPTION else "").strip()
        cat = str(row.iloc[COL_CATEGORY] if len(row) > COL_CATEGORY else "").strip()
        subcat = str(row.iloc[COL_SUBCATEGORY] if len(row) > COL_SUBCATEGORY else "").strip()
        if cat == "nan":
            cat = ""
        if subcat == "nan":
            subcat = ""

        orig_cat = f"{cat} > {subcat}" if cat and subcat else (cat or subcat)

        import_hash = hashlib.md5(
            f"BOURSOBANK|{date}|{amount}|{desc}|{row_idx}".encode()
        ).hexdigest()

        transactions.append(
            {
                "date": date,
                "value_date": value_date,
                "bank": "BOURSOBANK",
                "account": "Boursobank EUR",
                "currency": "EUR",
                "amount": amount,
                "description": desc,
                "category": categorize(desc, cat),
                "original_category": orig_cat or None,
                "notes": None,
                "transaction_ref": None,
                "import_hash": import_hash,
                "needs_annotation": is_cash_withdrawal(desc),
            }
        )

    return transactions, errors

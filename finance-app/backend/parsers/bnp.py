import hashlib
from io import BytesIO

import pandas as pd

from parsers import BNP_CAT_MAP, categorize, is_cash_withdrawal


def parse(content: bytes) -> tuple[list[dict], list[str]]:
    errors: list[str] = []
    for encoding in ("cp1252", "utf-8", "latin-1"):
        try:
            df = pd.read_excel(
                BytesIO(content),
                skiprows=2,
                header=0,
                engine="xlrd",
                dtype=str,
            )
            break
        except Exception as e:
            errors.append(f"xlrd {encoding}: {e}")
    else:
        return [], errors

    # Normalize column names (may contain encoding artifacts)
    col_map = {}
    for col in df.columns:
        lc = str(col).lower()
        if "date" in lc and "op" in lc:
            col_map[col] = "date"
        elif "libelle" in lc or "label" in lc:
            col_map[col] = "description"
        elif "montant" in lc or "amount" in lc:
            col_map[col] = "amount"
        elif "categorie" in lc and "sous" not in lc:
            col_map[col] = "category"
        elif "sous" in lc and "categorie" in lc:
            col_map[col] = "subcategory"
        elif "commentaire" in lc:
            col_map[col] = "notes"

    df = df.rename(columns=col_map)

    required = {"date", "description", "amount"}
    if not required.issubset(set(df.columns)):
        return [], [f"Missing expected columns. Got: {list(df.columns)}"]

    transactions: list[dict] = []
    for _, row in df.iterrows():
        raw_date = str(row.get("date", "") or "").strip()
        if not raw_date or raw_date == "nan":
            continue
        try:
            date = pd.to_datetime(raw_date, dayfirst=True).date()
        except Exception:
            errors.append(f"Bad date: {raw_date}")
            continue

        raw_amount = str(row.get("amount", "") or "").strip().replace(",", ".")
        try:
            amount = float(raw_amount)
        except Exception:
            errors.append(f"Bad amount: {raw_amount}")
            continue

        desc = str(row.get("description", "") or "").strip()
        orig_cat = str(row.get("category", "") or "").strip()
        notes = str(row.get("notes", "") or "").strip()
        if orig_cat == "nan":
            orig_cat = ""
        if notes == "nan":
            notes = ""

        import_hash = hashlib.md5(
            f"BNP|{date}|{amount}|{desc}".encode()
        ).hexdigest()

        transactions.append(
            {
                "date": date,
                "value_date": date,
                "bank": "BNP",
                "account": "BNP EUR",
                "currency": "EUR",
                "amount": amount,
                "description": desc,
                "category": categorize(desc, orig_cat),
                "original_category": orig_cat or None,
                "notes": notes or None,
                "transaction_ref": None,
                "import_hash": import_hash,
                "needs_annotation": is_cash_withdrawal(desc),
            }
        )

    return transactions, errors

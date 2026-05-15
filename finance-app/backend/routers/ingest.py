from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import Transaction, get_db
from models import IngestResult
from parsers import bnp, boursobank, revolut, ubs

router = APIRouter()


def detect_bank(filename: str, content: bytes) -> str:
    fname = filename.lower()

    # Explicit name hints take priority
    if "revolut" in fname:
        return "revolut"
    if "bourso" in fname:
        return "boursobank"
    if "bnp" in fname:
        return "bnp"

    if fname.endswith(".csv"):
        text = content[:500].decode("utf-8-sig", errors="replace")
        if "Trade date" in text or "IBAN:" in text or "Account number:" in text:
            return "ubs"
        if "Current Accounts" in text or "Personal Account" in text or "Started Date" in text:
            return "revolut"
        if "dateOp" in text and "label" in text:
            return "boursobank"

    if fname.endswith(".xlsx") or fname.endswith(".xls"):
        # Peek at first cell to distinguish BNP vs Boursobank
        try:
            import pandas as pd
            from io import BytesIO
            engine = "xlrd" if fname.endswith(".xls") else "openpyxl"
            df = pd.read_excel(BytesIO(content), header=None, nrows=3, engine=engine)
            first_cell = str(df.iloc[0, 0] if not df.empty else "").lower()
            # BNP starts with "compte de ch" (chèques)
            if "compte de ch" in first_cell or "date operation" in first_cell:
                return "bnp"
            # Boursobank rows start with a date (YYYY-MM-DD) or contain BoursoBank
            flat = " ".join(str(v).lower() for v in df.values.flatten() if str(v) != "nan")
            if "boursobank" in flat or "bourso" in flat:
                return "boursobank"
            # Boursobank first cell is a date string like "2025-12-31"
            import re
            if re.match(r"\d{4}-\d{2}-\d{2}", str(df.iloc[0, 0])):
                return "boursobank"
        except Exception:
            pass
        # Default: if it ends in .xls assume BNP, .xlsx assume Boursobank
        return "bnp" if fname.endswith(".xls") else "boursobank"

    raise ValueError(f"Cannot detect bank for file: {filename}. Expected .csv / .xls / .xlsx")


@router.post("", response_model=IngestResult)
async def ingest_file(file: UploadFile = File(...), db: Session = Depends(get_db)):
    content = await file.read()
    filename = file.filename or "unknown"

    try:
        bank_key = detect_bank(filename, content)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    parser_map = {
        "ubs": ubs.parse,
        "revolut": revolut.parse,
        "bnp": bnp.parse,
        "boursobank": boursobank.parse,
    }
    try:
        transactions_raw, errors = parser_map[bank_key](content)
    except Exception as e:
        import traceback
        raise HTTPException(status_code=400, detail=f"Parser error: {traceback.format_exc()}")

    new_count = 0
    dup_count = 0
    needs_count = 0

    for t in transactions_raw:
        existing = db.query(Transaction).filter_by(import_hash=t["import_hash"]).first()
        if existing:
            dup_count += 1
            continue
        tx = Transaction(**{k: v for k, v in t.items() if k != "import_hash"}, import_hash=t["import_hash"])
        db.add(tx)
        try:
            db.flush()
            new_count += 1
            if t.get("needs_annotation"):
                needs_count += 1
        except IntegrityError:
            db.rollback()
            dup_count += 1

    db.commit()

    return IngestResult(
        bank=bank_key.upper(),
        filename=filename,
        total_parsed=len(transactions_raw),
        new=new_count,
        duplicates=dup_count,
        needs_annotation=needs_count,
        errors=errors,
    )

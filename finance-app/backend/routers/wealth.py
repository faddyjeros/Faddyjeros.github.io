import math
import os
from datetime import date

import pandas as pd
from fastapi import APIRouter, HTTPException

router = APIRouter()

XLSX_PATH = os.environ.get(
    "ACCOUNTING_XLSX",
    r"C:\Users\Jerem\OneDrive\Documents\Money\2026_Personal Accounting.xlsx",
)

LOAN_INITIAL = 19000.0  # 12592.31 paid + 6407.69 remaining = 19000


def _sheet(name: str) -> pd.DataFrame:
    if not os.path.exists(XLSX_PATH):
        raise HTTPException(status_code=503, detail=f"Accounting file not found: {XLSX_PATH}")
    try:
        return pd.read_excel(XLSX_PATH, sheet_name=name, header=None)
    except Exception as e:
        xl = pd.ExcelFile(XLSX_PATH)
        raise HTTPException(
            status_code=500,
            detail=f"Sheet '{name}' not found or parse error. Available sheets: {xl.sheet_names}. Error: {e}"
        )


@router.get("/debug")
def debug():
    if not os.path.exists(XLSX_PATH):
        return {"error": f"File not found: {XLSX_PATH}"}
    xl = pd.ExcelFile(XLSX_PATH)
    return {"path": XLSX_PATH, "sheets": xl.sheet_names}


def _f(val, default=0.0):
    try:
        v = round(float(val), 2)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


# ── Net worth history ─────────────────────────────────────────────────────────

@router.get("/networth")
def get_networth():
    df = _sheet("Summary and tracking")
    rows = []
    for _, row in df.iloc[1:].iterrows():
        d = pd.to_datetime(row[0], errors="coerce")
        if pd.isna(d):
            continue
        v = _f(row[1])
        if v == 0:
            continue
        rows.append({
            "date": d.strftime("%Y-%m-%d"),
            "value": v,
            "comment": str(row[2]) if pd.notna(row[2]) else None,
        })
    return rows


# ── Investment portfolio ──────────────────────────────────────────────────────

@router.get("/portfolio")
def get_portfolio():
    df = _sheet("Investments")
    # Dynamic rows 1–4 (live-priced): ticker in col 7
    dynamic = []
    for _, row in df.iloc[1:5].iterrows():
        ticker = str(row[7]).strip() if pd.notna(row[7]) else None
        if not ticker or ticker == "nan":
            continue
        dynamic.append({
            "ticker": ticker,
            "type": str(row[1]) if pd.notna(row[1]) else None,
            "volume": _f(row[2]),
            "price": _f(row[3]),
            "value_eur": _f(row[5]),
        })
    # Flat rows 7–10 (manual): name in col 0
    flat = []
    for _, row in df.iloc[7:11].iterrows():
        name = str(row[0]).strip() if pd.notna(row[0]) else None
        if not name or name == "nan":
            continue
        flat.append({
            "name": name,
            "type": str(row[1]) if pd.notna(row[1]) else None,
            "value_eur": _f(row[5]),
        })
    total = (
        sum(h["value_eur"] for h in dynamic)
        + sum(h["value_eur"] for h in flat if h["value_eur"] > 0 and h.get("type") != "SCI")
    )
    return {"dynamic": dynamic, "flat": flat, "total_eur": round(total, 2)}


# ── Bank account balances ─────────────────────────────────────────────────────

@router.get("/accounts")
def get_accounts():
    df = _sheet("Bank accounts")
    accounts = []
    for _, row in df.iloc[1:].iterrows():
        name = str(row[0]).strip() if pd.notna(row[0]) else None
        if not name or name == "nan":
            continue
        accounts.append({
            "account": name,
            "amount_local": _f(row[1]),
            "amount_eur": _f(row[2]),
        })
    return accounts


# ── Salary history ────────────────────────────────────────────────────────────

@router.get("/salary")
def get_salary():
    df = _sheet("Salary tracker")
    rows = []
    for _, row in df.iloc[1:].iterrows():
        d = pd.to_datetime(row[0], dayfirst=True, errors="coerce")
        if pd.isna(d):
            continue
        rows.append({
            "date": d.strftime("%Y-%m-%d"),
            "company": str(row[1]).strip() if pd.notna(row[1]) else None,
            "jurisdiction": str(row[2]).strip() if pd.notna(row[2]) else None,
            "gross": _f(row[3]),
            "overtime": _f(row[4]),
            "extras": _f(row[5]),
            "bonus": _f(row[6]),
            "net": _f(row[7]),
            "comment": str(row[8]).strip() if pd.notna(row[8]) else None,
        })
    return rows


# ── Loan schedule ─────────────────────────────────────────────────────────────

@router.get("/loan")
def get_loan():
    df = _sheet("Loan")
    today = date.today()
    running = LOAN_INITIAL
    schedule = []

    # Skip row 0 (header) and row 1 (opening "-" row), start at index 2
    for _, row in df.iloc[2:].iterrows():
        d = pd.to_datetime(row[0], errors="coerce")
        if pd.isna(d):
            continue
        capital = _f(row[1])   # NaN / "-" → 0
        interest = _f(row[2])
        insurance = _f(row[3])
        running = max(running - capital, 0)
        is_past = d.date() <= today
        schedule.append({
            "date": d.strftime("%Y-%m-%d"),
            "capital": capital,
            "interest": interest,
            "insurance": insurance,
            "remaining": round(running, 2),
            "is_past": is_past,
        })

    return {
        "schedule": schedule,
        "initial_balance": LOAN_INITIAL,
        "summary": {
            "capital_paid": 12592.31,
            "interest_paid": 642.94,
            "capital_remaining": 6407.69,
            "interest_remaining": 41.43,
            "maturity_date": "2027-08-04",
        },
    }

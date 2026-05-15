import os
from datetime import date

import pandas as pd
from fastapi import APIRouter, HTTPException

from services.finance_data import (
    LOAN_INITIAL,
    XLSX_PATH,
    _f,
    get_accounts as _get_accounts,
    get_net_worth_history,
    get_portfolio_holdings,
    get_salary_history,
)

router = APIRouter()


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


@router.get("/networth")
def get_networth():
    data = get_net_worth_history()
    if not data:
        raise HTTPException(status_code=503, detail="Accounting file not available")
    return data


@router.get("/portfolio")
def get_portfolio():
    return get_portfolio_holdings()


@router.get("/accounts")
def get_accounts():
    return _get_accounts()


@router.get("/salary")
def get_salary():
    return get_salary_history()


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

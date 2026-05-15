"""Shared financial data queries used by both existing routers and analyst tool functions."""

import math
import os
from datetime import date, timedelta

import pandas as pd
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import MonthlyBudget, Transaction

XLSX_PATH = os.environ.get(
    "ACCOUNTING_XLSX",
    r"C:\Users\Jerem\OneDrive\Documents\Money\2026_Personal Accounting.xlsx",
)

LOAN_INITIAL = 19000.0

EXCLUDE_FROM_TOTALS = {"Internal Transfer", "Transfers"}


def _f(val, default=0.0):
    try:
        v = round(float(val), 2)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


def _read_sheet(name: str) -> pd.DataFrame | None:
    if not os.path.exists(XLSX_PATH):
        return None
    try:
        return pd.read_excel(XLSX_PATH, sheet_name=name, header=None)
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Transaction queries (from SQLite)
# ---------------------------------------------------------------------------

def get_transaction_summary(db: Session, category: str | None = None, months: int = 6) -> dict:
    cutoff = date.today() - timedelta(days=months * 30)
    q = db.query(Transaction).filter(Transaction.date >= cutoff)
    if category:
        q = q.filter(Transaction.category == category)
    rows = q.all()

    by_category: dict[str, float] = {}
    by_month: dict[str, dict[str, float]] = {}
    total_income = 0.0
    total_expenses = 0.0

    for t in rows:
        if t.category in EXCLUDE_FROM_TOTALS:
            continue
        cat = t.category or "Other"
        month_key = t.date.strftime("%Y-%m")

        if t.amount > 0:
            total_income += t.amount
        else:
            total_expenses += abs(t.amount)
            by_category[cat] = by_category.get(cat, 0.0) + abs(t.amount)

        if month_key not in by_month:
            by_month[month_key] = {"income": 0.0, "expenses": 0.0}
        if t.amount > 0:
            by_month[month_key]["income"] += t.amount
        else:
            by_month[month_key]["expenses"] += abs(t.amount)

    return {
        "period": f"last {months} months",
        "total_income": round(total_income, 2),
        "total_expenses": round(total_expenses, 2),
        "net": round(total_income - total_expenses, 2),
        "by_category": {k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
        "monthly": {k: {mk: round(mv, 2) for mk, mv in v.items()} for k, v in sorted(by_month.items())},
    }


def get_budget_status(db: Session) -> dict:
    today = date.today()
    year, month = today.year, today.month
    month_start = date(year, month, 1)

    budgets = db.query(MonthlyBudget).all()
    budget_map = {b.category: b.monthly_target for b in budgets}

    txs = (
        db.query(Transaction)
        .filter(Transaction.date >= month_start)
        .filter(Transaction.date <= today)
        .all()
    )

    actuals: dict[str, float] = {}
    for t in txs:
        if t.category in EXCLUDE_FROM_TOTALS:
            continue
        cat = t.category or "Other"
        if t.amount < 0:
            actuals[cat] = actuals.get(cat, 0.0) + abs(t.amount)
        elif t.amount > 0 and cat == "Income":
            actuals["Income"] = actuals.get("Income", 0.0) + t.amount

    categories = []
    for cat, target in budget_map.items():
        actual = actuals.get(cat, 0.0)
        if cat == "Income":
            categories.append({
                "category": cat,
                "target": target,
                "actual": round(actual, 2),
                "remaining": round(target - actual, 2),
                "status": "on_track" if actual >= target * 0.8 else "behind",
            })
        else:
            categories.append({
                "category": cat,
                "target": target,
                "actual": round(actual, 2),
                "remaining": round(target - actual, 2),
                "status": "over" if actual > target else "on_track",
            })

    total_budget = sum(v for k, v in budget_map.items() if k != "Income")
    total_spent = sum(v for k, v in actuals.items() if k != "Income")

    return {
        "month": today.strftime("%Y-%m"),
        "day_of_month": today.day,
        "categories": categories,
        "total_budget": round(total_budget, 2),
        "total_spent": round(total_spent, 2),
        "total_remaining": round(total_budget - total_spent, 2),
    }


# ---------------------------------------------------------------------------
# Wealth queries (from Excel)
# ---------------------------------------------------------------------------

def get_net_worth_history() -> list[dict]:
    df = _read_sheet("Summary and tracking")
    if df is None:
        return []
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


def get_portfolio_holdings() -> dict:
    df = _read_sheet("Investments")
    if df is None:
        return {"dynamic": [], "flat": [], "total_eur": 0}

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


def get_salary_history() -> list[dict]:
    df = _read_sheet("Salary tracker")
    if df is None:
        return []
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


def get_accounts() -> list[dict]:
    df = _read_sheet("Bank accounts")
    if df is None:
        return []
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


def calculate_investable_amount(db: Session) -> dict:
    budget = get_budget_status(db)
    salary = get_salary_history()
    latest_salary = salary[-1]["net"] if salary else 0

    total_spent = budget["total_spent"]
    total_budget = budget["total_budget"]
    remaining_budget = budget["total_remaining"]

    loan_df = _read_sheet("Loan")
    monthly_loan = 0.0
    if loan_df is not None:
        today = date.today()
        for _, row in loan_df.iloc[2:].iterrows():
            d = pd.to_datetime(row[0], errors="coerce")
            if pd.isna(d):
                continue
            if d.month == today.month and d.year == today.year:
                monthly_loan = _f(row[1]) + _f(row[2]) + _f(row[3])
                break

    investable = latest_salary - total_spent - monthly_loan
    projected = latest_salary - total_budget - monthly_loan

    return {
        "latest_net_salary": round(latest_salary, 2),
        "month_spent_so_far": round(total_spent, 2),
        "monthly_loan_payment": round(monthly_loan, 2),
        "investable_now": round(max(investable, 0), 2),
        "projected_monthly": round(max(projected, 0), 2),
        "budget_remaining": round(remaining_budget, 2),
        "day_of_month": budget["day_of_month"],
    }

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import Transaction, date_month, date_year, get_db
from models import DashboardSummary

router = APIRouter()


@router.get("/summary", response_model=DashboardSummary)
def summary(
    year: int = Query(default=2025),
    month: Optional[int] = None,
    db: Session = Depends(get_db),
):
    q = db.query(Transaction).filter(date_year(Transaction.date) == str(year))
    if month:
        q = q.filter(date_month(Transaction.date) == f"{month:02d}")
    rows = q.all()

    EXCLUDE_FROM_TOTALS = {"Internal Transfer", "Transfers"}

    total_income = sum(t.amount for t in rows if t.amount > 0 and t.category not in EXCLUDE_FROM_TOTALS)
    total_expenses = sum(t.amount for t in rows if t.amount < 0 and t.category not in EXCLUDE_FROM_TOTALS)
    total_transfers = sum(t.amount for t in rows if t.category in EXCLUDE_FROM_TOTALS)

    by_category: dict[str, float] = {}
    for t in rows:
        if t.amount < 0 and t.category not in EXCLUDE_FROM_TOTALS:
            cat = t.category or "Other"
            by_category[cat] = by_category.get(cat, 0.0) + abs(t.amount)

    by_bank: dict[str, float] = {}
    for t in rows:
        if t.amount < 0 and t.category not in EXCLUDE_FROM_TOTALS:
            by_bank[t.bank] = by_bank.get(t.bank, 0.0) + abs(t.amount)

    # Monthly trend with per-category breakdown
    monthly: dict[str, dict] = {}
    for t in rows:
        key = t.date.strftime("%Y-%m")
        if key not in monthly:
            monthly[key] = {"month": key, "income": 0.0, "expenses": 0.0}
        if t.amount > 0 and t.category not in EXCLUDE_FROM_TOTALS:
            monthly[key]["income"] += t.amount
        elif t.amount < 0 and t.category not in EXCLUDE_FROM_TOTALS:
            monthly[key]["expenses"] += abs(t.amount)
            cat = t.category or "Miscellaneous"
            monthly[key][cat] = monthly[key].get(cat, 0.0) + abs(t.amount)

    period = f"{year}" if not month else f"{year}-{month:02d}"

    return DashboardSummary(
        period=period,
        total_income=round(total_income, 2),
        total_expenses=round(abs(total_expenses), 2),
        total_transfers=round(total_transfers, 2),
        net=round(total_income + total_expenses, 2),
        by_category={k: round(v, 2) for k, v in sorted(by_category.items(), key=lambda x: -x[1])},
        by_bank={k: round(v, 2) for k, v in by_bank.items()},
        monthly_trend=sorted(monthly.values(), key=lambda x: x["month"]),
    )


@router.get("/years")
def available_years(db: Session = Depends(get_db)):
    rows = db.query(date_year(Transaction.date)).distinct().all()
    return sorted([r[0] for r in rows if r[0]], reverse=True)

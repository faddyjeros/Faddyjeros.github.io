"""Shared financial data queries — all reads from SQLite."""

import math
from datetime import date, timedelta

from sqlalchemy import func
from sqlalchemy.orm import Session

from database import (
    AppSetting,
    BankAccount,
    LoanPayment,
    MonthlyBudget,
    NetWorthSnapshot,
    PortfolioHolding,
    SalaryRecord,
    Transaction,
)

LOAN_INITIAL_DEFAULT = 19000.0

EXCLUDE_FROM_TOTALS = {"Internal Transfer", "Transfers"}


def _f(val, default=0.0):
    try:
        v = round(float(val), 2)
        return v if math.isfinite(v) else default
    except (TypeError, ValueError):
        return default


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
# Wealth queries (from SQLite — migrated from Excel)
# ---------------------------------------------------------------------------

def get_net_worth_history(db: Session) -> list[dict]:
    rows = db.query(NetWorthSnapshot).order_by(NetWorthSnapshot.date).all()
    return [
        {
            "date": r.date.isoformat(),
            "value": r.value,
            "comment": r.comment,
        }
        for r in rows
    ]


def get_portfolio_holdings(db: Session) -> dict:
    rows = db.query(PortfolioHolding).order_by(PortfolioHolding.sort_order).all()
    dynamic = []
    flat = []
    for r in rows:
        entry = {
            "name": r.name,
            "type": r.holding_type,
            "value_eur": r.value_eur,
        }
        if r.is_dynamic:
            entry["ticker"] = r.ticker
            entry["volume"] = r.volume
            entry["price"] = r.price
            dynamic.append(entry)
        else:
            flat.append(entry)

    total = (
        sum(h["value_eur"] for h in dynamic)
        + sum(h["value_eur"] for h in flat if h["value_eur"] > 0 and h.get("type") != "SCI")
    )
    return {"dynamic": dynamic, "flat": flat, "total_eur": round(total, 2)}


def get_salary_history(db: Session) -> list[dict]:
    rows = db.query(SalaryRecord).order_by(SalaryRecord.date).all()
    return [
        {
            "date": r.date.isoformat(),
            "company": r.company,
            "jurisdiction": r.jurisdiction,
            "gross": r.gross,
            "overtime": r.overtime,
            "extras": r.extras,
            "bonus": r.bonus,
            "net": r.net,
            "comment": r.comment,
        }
        for r in rows
    ]


def get_accounts(db: Session) -> list[dict]:
    rows = db.query(BankAccount).order_by(BankAccount.account_name).all()
    return [
        {
            "account": r.account_name,
            "amount_local": r.amount_local,
            "amount_eur": r.amount_eur,
        }
        for r in rows
    ]


def calculate_investable_amount(db: Session) -> dict:
    budget = get_budget_status(db)
    salary = get_salary_history(db)
    latest_salary = salary[-1]["net"] if salary else 0

    total_spent = budget["total_spent"]
    total_budget = budget["total_budget"]
    remaining_budget = budget["total_remaining"]

    # Get current month loan payment
    today = date.today()
    monthly_loan = 0.0
    loan_row = (
        db.query(LoanPayment)
        .filter(
            func.strftime("%Y-%m", LoanPayment.date) == today.strftime("%Y-%m")
        )
        .first()
    )
    if loan_row:
        monthly_loan = loan_row.capital + loan_row.interest + loan_row.insurance

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

"""Shared financial data queries used by both existing routers and analyst tool functions."""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from database import (
    AppSetting,
    BankAccount,
    LoanPayment,
    MonthlyBudget,
    NetWorthSnapshot,
    PortfolioHolding,
    SalaryRecord,
    SessionLocal,
    Transaction,
)

LOAN_INITIAL = 19000.0

EXCLUDE_FROM_TOTALS = {"Internal Transfer", "Transfers"}


# ---------------------------------------------------------------------------
# Transaction queries
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
# Wealth queries (from database)
# ---------------------------------------------------------------------------

def _get_loan_initial(db: Session) -> float:
    setting = db.query(AppSetting).filter(AppSetting.key == "loan_initial_balance").first()
    return float(setting.value) if setting else LOAN_INITIAL


def get_net_worth_history(db: Session | None = None) -> list[dict]:
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True
    try:
        rows = db.query(NetWorthSnapshot).order_by(NetWorthSnapshot.date).all()
        return [
            {
                "date": r.date.isoformat() if r.date else None,
                "value": round(r.value, 2),
                "comment": r.comment,
            }
            for r in rows
        ]
    finally:
        if close_after:
            db.close()


def get_portfolio_holdings(db: Session | None = None) -> dict:
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True
    try:
        rows = db.query(PortfolioHolding).order_by(PortfolioHolding.sort_order).all()
        dynamic = [
            {
                "ticker": r.ticker,
                "type": r.holding_type,
                "volume": r.volume,
                "price": r.price,
                "value_eur": round(r.value_eur, 2),
            }
            for r in rows if r.is_dynamic
        ]
        flat = [
            {
                "name": r.name,
                "type": r.holding_type,
                "value_eur": round(r.value_eur, 2),
            }
            for r in rows if not r.is_dynamic
        ]
        total = (
            sum(r.value_eur for r in rows if r.is_dynamic)
            + sum(r.value_eur for r in rows if not r.is_dynamic and r.value_eur > 0 and r.holding_type != "SCI")
        )
        return {"dynamic": dynamic, "flat": flat, "total_eur": round(total, 2)}
    finally:
        if close_after:
            db.close()


def get_salary_history(db: Session | None = None) -> list[dict]:
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True
    try:
        rows = db.query(SalaryRecord).order_by(SalaryRecord.date).all()
        return [
            {
                "date": r.date.isoformat() if r.date else None,
                "company": r.company,
                "jurisdiction": r.jurisdiction,
                "gross": round(r.gross, 2),
                "overtime": round(r.overtime, 2),
                "extras": round(r.extras, 2),
                "bonus": round(r.bonus, 2),
                "net": round(r.net, 2),
                "comment": r.comment,
            }
            for r in rows
        ]
    finally:
        if close_after:
            db.close()


def get_accounts(db: Session | None = None) -> list[dict]:
    close_after = False
    if db is None:
        db = SessionLocal()
        close_after = True
    try:
        rows = db.query(BankAccount).order_by(BankAccount.account_name).all()
        return [
            {
                "account": r.account_name,
                "amount_local": round(r.amount_local, 2),
                "amount_eur": round(r.amount_eur, 2),
            }
            for r in rows
        ]
    finally:
        if close_after:
            db.close()


def calculate_investable_amount(db: Session) -> dict:
    budget = get_budget_status(db)
    salary = get_salary_history(db)
    latest_salary = salary[-1]["net"] if salary else 0

    total_spent = budget["total_spent"]
    total_budget = budget["total_budget"]
    remaining_budget = budget["total_remaining"]

    today = date.today()
    monthly_loan = 0.0
    loan_row = (
        db.query(LoanPayment)
        .filter(
            LoanPayment.date >= date(today.year, today.month, 1),
            LoanPayment.date <= today,
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

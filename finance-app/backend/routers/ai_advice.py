import json
import os
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import MonthlyBudget, Transaction, date_month, date_year, get_db
from models import CATEGORIES

router = APIRouter()

BATCH_SIZE = 50


@router.post("/categorize-others")
def categorize_others(db: Session = Depends(get_db)):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed")

    rows = (
        db.query(Transaction)
        .filter(Transaction.category == "Miscellaneous")
        .order_by(Transaction.date.desc())
        .all()
    )

    if not rows:
        return {"updated": 0, "message": "No uncategorized transactions found."}

    client = anthropic.Anthropic(api_key=api_key)
    # Exclude Miscellaneous from options — force Claude to pick a real category or skip
    actionable = [c for c in CATEGORIES if c != "Miscellaneous"]
    categories_str = ", ".join(actionable)
    total_updated = 0
    errors = []

    # Process in batches
    for i in range(0, len(rows), BATCH_SIZE):
        batch = rows[i : i + BATCH_SIZE]

        lines = []
        for tx in batch:
            sign = "+" if tx.amount > 0 else ""
            lines.append(
                f'{tx.id}|{tx.bank}|{sign}{tx.amount:.2f} {tx.currency}|{tx.description}'
            )

        prompt = (
            f"These bank transactions are currently uncategorized. "
            f"For each one you can confidently assign to one of these categories, return it:\n"
            f"{categories_str}\n\n"
            f"Rules:\n"
            f"- Only return transactions you are confident about — skip anything ambiguous\n"
            f"- Use 'Internal Transfer' only for transfers between own bank accounts (Wise, top-up, etc.)\n"
            f"- Use 'Fixed Costs' for rent, insurance, phone, internet, healthcare, loan repayments\n"
            f"- Use 'Groceries & Dining' for supermarkets, restaurants, cafes, bakeries, food delivery\n"
            f"- Use 'Travel' for transport, hotels, flights, taxis, parking, bike hire\n"
            f"- Use 'Fun Money' for shopping, entertainment, streaming, non-essential subscriptions\n"
            f"- Use 'Income' for salary, reimbursements, tax refunds\n"
            f"- Skip payments to individuals (names), cash withdrawals, bank fees — leave those uncategorized\n\n"
            f"Transactions (format: id|bank|amount|description):\n"
            + "\n".join(lines)
            + "\n\n"
            f"Respond with a JSON array only, no other text. Omit transactions you are unsure about:\n"
            f'[{{"id":"<id>","category":"<category>"}}, ...]'
        )

        try:
            message = client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=2048,
                messages=[{"role": "user", "content": prompt}],
            )
            raw = message.content[0].text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            results = json.loads(raw)

            for item in results:
                tx_id = item.get("id")
                category = item.get("category")
                if not tx_id or category not in CATEGORIES:
                    continue
                tx = db.query(Transaction).filter_by(id=tx_id).first()
                if tx:
                    tx.category = category
                    total_updated += 1

            db.commit()

        except Exception as e:
            errors.append(f"Batch {i // BATCH_SIZE + 1}: {str(e)[:120]}")
            db.rollback()

    return {
        "updated": total_updated,
        "total_others": len(rows),
        "errors": errors,
        "message": f"Categorized {total_updated} of {len(rows)} transactions.",
    }


@router.get("/advice")
def get_advice(
    year: int = Query(default=date.today().year),
    month: int = Query(default=date.today().month),
    db: Session = Depends(get_db),
):
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed")

    rows = (
        db.query(Transaction)
        .filter(
            date_year(Transaction.date) == str(year),
            date_month(Transaction.date) == f"{month:02d}",
        )
        .all()
    )

    if not rows:
        return {"advice": "No transactions found for this period."}

    # Build a compact summary to send to Claude (no raw descriptions for privacy)
    by_category: dict[str, float] = {}
    total_income = 0.0
    total_expenses = 0.0
    for t in rows:
        if t.amount > 0:
            total_income += t.amount
        else:
            cat = t.category or "Other"
            by_category[cat] = by_category.get(cat, 0.0) + abs(t.amount)
            total_expenses += abs(t.amount)

    summary_lines = [
        f"Period: {year}-{month:02d}",
        f"Total income: {total_income:.2f}",
        f"Total expenses: {total_expenses:.2f}",
        f"Net: {total_income - total_expenses:.2f}",
        "",
        "Spending by category:",
    ]
    for cat, amt in sorted(by_category.items(), key=lambda x: -x[1]):
        summary_lines.append(f"  {cat}: {amt:.2f}")

    summary = "\n".join(summary_lines)

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=600,
        messages=[
            {
                "role": "user",
                "content": (
                    "You are a personal finance advisor. Here is my spending summary for the month:\n\n"
                    f"{summary}\n\n"
                    "Give me 3-5 concise, specific observations or actionable tips based on this data. "
                    "Be direct and practical. Format as a short bulleted list."
                ),
            }
        ],
    )
    return {"advice": message.content[0].text, "summary": summary}


@router.post("/monthly-conclusion")
def monthly_conclusion(
    year: int = Query(default=date.today().year),
    month: int = Query(default=date.today().month),
    db: Session = Depends(get_db),
):
    """Generate a one-liner monthly conclusion comparing actuals vs budget targets."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="ANTHROPIC_API_KEY not configured")

    try:
        import anthropic
    except ImportError:
        raise HTTPException(status_code=503, detail="anthropic package not installed")

    EXCLUDE = {"Internal Transfer", "Transfers"}

    rows = (
        db.query(Transaction)
        .filter(
            date_year(Transaction.date) == str(year),
            date_month(Transaction.date) == f"{month:02d}",
        )
        .all()
    )
    if not rows:
        return {"conclusion": "No transactions found for this period."}

    budgets = {b.category: b.monthly_target for b in db.query(MonthlyBudget).all()}
    income_target = budgets.get("Income", 7500)

    actual_income = sum(t.amount for t in rows if t.amount > 0 and t.category not in EXCLUDE)
    by_cat: dict[str, float] = {}
    for t in rows:
        if t.amount < 0 and t.category not in EXCLUDE:
            cat = t.category or "Other"
            by_cat[cat] = by_cat.get(cat, 0.0) + abs(t.amount)

    actual_expenses = sum(by_cat.values())
    expense_target = sum(v for k, v in budgets.items() if k != "Income")
    net = actual_income - actual_expenses
    net_target = income_target - expense_target

    # Build delta lines (biggest overruns first)
    deltas = []
    for cat, actual in by_cat.items():
        target = budgets.get(cat, 0)
        if target > 0:
            delta = actual - target
            deltas.append((cat, actual, target, delta))
    deltas.sort(key=lambda x: -x[3])  # biggest overrun first

    delta_lines = "\n".join(
        f"  {cat}: {actual:.0f} vs target {target:.0f} ({'+' if d > 0 else ''}{d:.0f})"
        for cat, actual, target, d in deltas[:6]
    )

    prompt = (
        f"Month: {year}-{month:02d}\n"
        f"Income: {actual_income:.0f} (target {income_target:.0f})\n"
        f"Total expenses: {actual_expenses:.0f} (target {expense_target:.0f})\n"
        f"Net: {net:.0f} (target {net_target:.0f})\n\n"
        f"Top category variances:\n{delta_lines}\n\n"
        "Write a single sentence (max 20 words) summarising this month's finances vs budget. "
        "Be specific — mention the biggest driver if there is one. "
        "Start with 'On track', 'Over budget', 'Under budget', or 'Good month' as appropriate."
    )

    client = anthropic.Anthropic(api_key=api_key)
    message = client.messages.create(
        model="claude-haiku-4-5-20251001",
        max_tokens=80,
        messages=[{"role": "user", "content": prompt}],
    )
    return {
        "conclusion": message.content[0].text.strip(),
        "actual_income": round(actual_income, 2),
        "actual_expenses": round(actual_expenses, 2),
        "income_target": income_target,
        "expense_target": expense_target,
        "net": round(net, 2),
        "net_target": round(net_target, 2),
    }

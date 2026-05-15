from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import MonthlyBudget, get_db
from models import MonthlyBudgetOut, MonthlyBudgetPatch

router = APIRouter()

# Conservative defaults based on Jeremie's actual spending profile
# Income target at 7,500 CHF/mo (conservative vs ~9,800 actual average)
DEFAULTS: dict[str, float] = {
    "Income": 7500,
    "Fixed Costs": 4300,    # Housing 3000 + Loan 450 + Healthcare 700 + Utilities+Phone ~150
    "Groceries & Dining": 850,
    "Travel": 900,          # Transport 300 + Travel/flights 600
    "Fun Money": 500,       # Shopping + subs + entertainment
    "Savings": 500,
    "Miscellaneous": 200,
}


@router.get("/", response_model=list[MonthlyBudgetOut])
def list_budgets(db: Session = Depends(get_db)):
    rows = db.query(MonthlyBudget).order_by(MonthlyBudget.category).all()
    return rows


@router.post("/seed")
def seed_defaults(db: Session = Depends(get_db)):
    """Insert default budget targets if not already present."""
    added = 0
    for category, target in DEFAULTS.items():
        existing = db.query(MonthlyBudget).filter_by(category=category).first()
        if not existing:
            db.add(MonthlyBudget(id=str(uuid4()), category=category, monthly_target=target))
            added += 1
    db.commit()
    return {"seeded": added, "message": f"Added {added} default budget targets."}


@router.patch("/{category}")
def update_budget(category: str, data: MonthlyBudgetPatch, db: Session = Depends(get_db)):
    row = db.query(MonthlyBudget).filter_by(category=category).first()
    if not row:
        # Create on first patch
        row = MonthlyBudget(id=str(uuid4()), category=category, monthly_target=data.monthly_target)
        db.add(row)
    else:
        row.monthly_target = data.monthly_target
    db.commit()
    db.refresh(row)
    return MonthlyBudgetOut.from_orm(row)


@router.delete("/{category}")
def delete_budget(category: str, db: Session = Depends(get_db)):
    row = db.query(MonthlyBudget).filter_by(category=category).first()
    if not row:
        raise HTTPException(status_code=404, detail="Budget not found")
    db.delete(row)
    db.commit()
    return {"deleted": category}

import json

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

from database import BudgetEnvelope, Transaction, get_db
from models import BudgetEnvelopeIn, BudgetEnvelopeOut

router = APIRouter()


@router.get("", response_model=list[BudgetEnvelopeOut])
def list_budgets(db: Session = Depends(get_db)):
    envelopes = db.query(BudgetEnvelope).order_by(BudgetEnvelope.start_date.desc()).all()
    result = []
    for env in envelopes:
        spent = _compute_spent(env, db)
        out = BudgetEnvelopeOut.model_validate(env)
        out.spent = spent
        result.append(out)
    return result


@router.post("", response_model=BudgetEnvelopeOut)
def create_budget(data: BudgetEnvelopeIn, db: Session = Depends(get_db)):
    env = BudgetEnvelope(**data.model_dump())
    db.add(env)
    db.commit()
    db.refresh(env)
    out = BudgetEnvelopeOut.model_validate(env)
    out.spent = 0.0
    return out


@router.delete("/{env_id}")
def delete_budget(env_id: str, db: Session = Depends(get_db)):
    env = db.query(BudgetEnvelope).filter_by(id=env_id).first()
    if not env:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(env)
    db.commit()
    return {"ok": True}


def _compute_spent(env: BudgetEnvelope, db: Session) -> float:
    q = db.query(func.sum(Transaction.amount)).filter(
        Transaction.date >= env.start_date,
        Transaction.amount < 0,
    )
    if env.end_date:
        q = q.filter(Transaction.date <= env.end_date)
    if env.category_filter:
        try:
            cats = json.loads(env.category_filter)
            q = q.filter(Transaction.category.in_(cats))
        except Exception:
            pass
    total = q.scalar() or 0.0
    return round(abs(total), 2)

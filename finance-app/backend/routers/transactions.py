from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import asc, desc
from sqlalchemy.orm import Session

from database import Transaction, get_db
from models import CATEGORIES, TransactionOut, TransactionPatch

router = APIRouter()


@router.get("", response_model=list[TransactionOut])
def list_transactions(
    bank: Optional[str] = None,
    category: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    needs_annotation: Optional[bool] = None,
    search: Optional[str] = None,
    limit: int = Query(default=200, le=2000),
    offset: int = 0,
    sort: str = "desc",
    db: Session = Depends(get_db),
):
    q = db.query(Transaction)
    if bank:
        q = q.filter(Transaction.bank == bank.upper())
    if category:
        q = q.filter(Transaction.category == category)
    if date_from:
        q = q.filter(Transaction.date >= date_from)
    if date_to:
        q = q.filter(Transaction.date <= date_to)
    if needs_annotation is not None:
        q = q.filter(Transaction.needs_annotation == needs_annotation)
    if search:
        q = q.filter(Transaction.description.ilike(f"%{search}%"))

    order = desc(Transaction.date) if sort == "desc" else asc(Transaction.date)
    return q.order_by(order).offset(offset).limit(limit).all()


@router.get("/meta/categories")
def get_categories():
    return CATEGORIES


@router.get("/meta/uncategorized-count")
def uncategorized_count(db: Session = Depends(get_db)):
    count = db.query(Transaction).filter(Transaction.category == "Miscellaneous").count()
    return {"count": count}


@router.get("/meta/banks")
def get_banks(db: Session = Depends(get_db)):
    rows = db.query(Transaction.bank).distinct().all()
    return [r[0] for r in rows]


@router.get("/meta/count-by-description")
def count_by_description(description: str, db: Session = Depends(get_db)):
    exact = db.query(Transaction).filter(Transaction.description == description).count()
    return {"count": exact}


@router.get("/meta/count-by-keyword")
def count_by_keyword(keyword: str, db: Session = Depends(get_db)):
    count = db.query(Transaction).filter(Transaction.description.ilike(f"%{keyword}%")).count()
    return {"count": count}


# Bulk routes must come before /{tx_id} to avoid wildcard capture
@router.patch("/remap-category")
def remap_category(from_category: str, to_category: str, db: Session = Depends(get_db)):
    rows = db.query(Transaction).filter(Transaction.category == from_category)
    count = rows.count()
    rows.update({"category": to_category}, synchronize_session=False)
    db.commit()
    return {"updated": count}


@router.patch("/bulk-by-description")
def bulk_update_by_description(description: str, patch: TransactionPatch, db: Session = Depends(get_db)):
    rows = db.query(Transaction).filter(Transaction.description == description)
    count = rows.count()
    rows.update(patch.model_dump(exclude_none=True), synchronize_session=False)
    db.commit()
    return {"updated": count}


@router.patch("/bulk-by-keyword")
def bulk_update_by_keyword(keyword: str, patch: TransactionPatch, db: Session = Depends(get_db)):
    rows = db.query(Transaction).filter(Transaction.description.ilike(f"%{keyword}%"))
    count = rows.count()
    rows.update(patch.model_dump(exclude_none=True), synchronize_session=False)
    db.commit()
    return {"updated": count}


@router.patch("/{tx_id}", response_model=TransactionOut)
def update_transaction(tx_id: str, patch: TransactionPatch, db: Session = Depends(get_db)):
    tx = db.query(Transaction).filter_by(id=tx_id).first()
    if not tx:
        raise HTTPException(status_code=404, detail="Transaction not found")
    for field, value in patch.model_dump(exclude_none=True).items():
        setattr(tx, field, value)
    db.commit()
    db.refresh(tx)
    return tx

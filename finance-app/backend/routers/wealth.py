"""Wealth, salary, accounts, portfolio, and loan CRUD endpoints."""

from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import (
    AppSetting,
    BankAccount,
    LoanPayment,
    NetWorthSnapshot,
    PortfolioHolding,
    SalaryRecord,
    get_db,
)

router = APIRouter()

LOAN_INITIAL_DEFAULT = 19000.0


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class NetWorthIn(BaseModel):
    date: date
    value: float
    comment: str | None = None

class PortfolioHoldingIn(BaseModel):
    name: str
    holding_type: str | None = None
    ticker: str | None = None
    volume: float | None = None
    price: float | None = None
    value_eur: float = 0.0
    is_dynamic: bool = False
    sort_order: float = 0

class BankAccountIn(BaseModel):
    account_name: str
    amount_local: float = 0.0
    amount_eur: float = 0.0

class SalaryRecordIn(BaseModel):
    date: date
    company: str | None = None
    jurisdiction: str | None = None
    gross: float = 0.0
    overtime: float = 0.0
    extras: float = 0.0
    bonus: float = 0.0
    net: float = 0.0
    comment: str | None = None

class LoanPaymentIn(BaseModel):
    date: date
    capital: float = 0.0
    interest: float = 0.0
    insurance: float = 0.0

class LoanSettingsIn(BaseModel):
    initial_balance: float


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_loan_initial(db: Session) -> float:
    setting = db.query(AppSetting).filter(AppSetting.key == "loan_initial_balance").first()
    return float(setting.value) if setting else LOAN_INITIAL_DEFAULT


def _row_to_dict(row) -> dict:
    d = {c.name: getattr(row, c.name) for c in row.__table__.columns}
    for k, v in d.items():
        if isinstance(v, (date, datetime)):
            d[k] = v.isoformat() if v else None
    return d


# ---------------------------------------------------------------------------
# Net Worth CRUD
# ---------------------------------------------------------------------------

@router.get("/networth")
def list_networth(db: Session = Depends(get_db)):
    rows = db.query(NetWorthSnapshot).order_by(NetWorthSnapshot.date).all()
    return [_row_to_dict(r) for r in rows]


@router.post("/networth", status_code=201)
def create_networth(data: NetWorthIn, db: Session = Depends(get_db)):
    row = NetWorthSnapshot(date=data.date, value=data.value, comment=data.comment)
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.put("/networth/{row_id}")
def update_networth(row_id: str, data: NetWorthIn, db: Session = Depends(get_db)):
    row = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    row.date = data.date
    row.value = data.value
    row.comment = data.comment
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.delete("/networth/{row_id}", status_code=204)
def delete_networth(row_id: str, db: Session = Depends(get_db)):
    row = db.query(NetWorthSnapshot).filter(NetWorthSnapshot.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Portfolio Holdings CRUD
# ---------------------------------------------------------------------------

@router.get("/portfolio")
def list_portfolio(db: Session = Depends(get_db)):
    rows = db.query(PortfolioHolding).order_by(PortfolioHolding.sort_order).all()
    dynamic = [_row_to_dict(r) for r in rows if r.is_dynamic]
    flat = [_row_to_dict(r) for r in rows if not r.is_dynamic]
    total = (
        sum(r.value_eur for r in rows if r.is_dynamic)
        + sum(r.value_eur for r in rows if not r.is_dynamic and r.value_eur > 0 and r.holding_type != "SCI")
    )
    return {"dynamic": dynamic, "flat": flat, "total_eur": round(total, 2)}


@router.post("/portfolio", status_code=201)
def create_portfolio_holding(data: PortfolioHoldingIn, db: Session = Depends(get_db)):
    row = PortfolioHolding(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.put("/portfolio/{row_id}")
def update_portfolio_holding(row_id: str, data: PortfolioHoldingIn, db: Session = Depends(get_db)):
    row = db.query(PortfolioHolding).filter(PortfolioHolding.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.delete("/portfolio/{row_id}", status_code=204)
def delete_portfolio_holding(row_id: str, db: Session = Depends(get_db)):
    row = db.query(PortfolioHolding).filter(PortfolioHolding.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Bank Accounts CRUD
# ---------------------------------------------------------------------------

@router.get("/accounts")
def list_accounts(db: Session = Depends(get_db)):
    rows = db.query(BankAccount).order_by(BankAccount.account_name).all()
    return [_row_to_dict(r) for r in rows]


@router.post("/accounts", status_code=201)
def create_account(data: BankAccountIn, db: Session = Depends(get_db)):
    row = BankAccount(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.put("/accounts/{row_id}")
def update_account(row_id: str, data: BankAccountIn, db: Session = Depends(get_db)):
    row = db.query(BankAccount).filter(BankAccount.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.delete("/accounts/{row_id}", status_code=204)
def delete_account(row_id: str, db: Session = Depends(get_db)):
    row = db.query(BankAccount).filter(BankAccount.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Salary Records CRUD
# ---------------------------------------------------------------------------

@router.get("/salary")
def list_salary(db: Session = Depends(get_db)):
    rows = db.query(SalaryRecord).order_by(SalaryRecord.date).all()
    return [_row_to_dict(r) for r in rows]


@router.post("/salary", status_code=201)
def create_salary(data: SalaryRecordIn, db: Session = Depends(get_db)):
    row = SalaryRecord(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.put("/salary/{row_id}")
def update_salary(row_id: str, data: SalaryRecordIn, db: Session = Depends(get_db)):
    row = db.query(SalaryRecord).filter(SalaryRecord.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.delete("/salary/{row_id}", status_code=204)
def delete_salary(row_id: str, db: Session = Depends(get_db)):
    row = db.query(SalaryRecord).filter(SalaryRecord.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------------------
# Loan CRUD + computed schedule
# ---------------------------------------------------------------------------

@router.get("/loan")
def get_loan(db: Session = Depends(get_db)):
    initial = _get_loan_initial(db)
    rows = db.query(LoanPayment).order_by(LoanPayment.date).all()
    today = date.today()
    running = initial
    schedule = []
    total_capital = 0.0
    total_interest = 0.0

    for r in rows:
        running = max(running - r.capital, 0)
        total_capital += r.capital
        total_interest += r.interest
        schedule.append({
            **_row_to_dict(r),
            "remaining": round(running, 2),
            "is_past": r.date <= today,
        })

    return {
        "schedule": schedule,
        "initial_balance": initial,
        "summary": {
            "capital_paid": round(total_capital, 2),
            "interest_paid": round(total_interest, 2),
            "capital_remaining": round(running, 2),
        },
    }


@router.post("/loan", status_code=201)
def create_loan_payment(data: LoanPaymentIn, db: Session = Depends(get_db)):
    row = LoanPayment(**data.model_dump())
    db.add(row)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.put("/loan/{row_id}")
def update_loan_payment(row_id: str, data: LoanPaymentIn, db: Session = Depends(get_db)):
    row = db.query(LoanPayment).filter(LoanPayment.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    for k, v in data.model_dump().items():
        setattr(row, k, v)
    db.commit()
    db.refresh(row)
    return _row_to_dict(row)


@router.delete("/loan/{row_id}", status_code=204)
def delete_loan_payment(row_id: str, db: Session = Depends(get_db)):
    row = db.query(LoanPayment).filter(LoanPayment.id == row_id).first()
    if not row:
        raise HTTPException(404, "Not found")
    db.delete(row)
    db.commit()


@router.get("/loan/settings")
def get_loan_settings(db: Session = Depends(get_db)):
    return {"initial_balance": _get_loan_initial(db)}


@router.put("/loan/settings")
def update_loan_settings(data: LoanSettingsIn, db: Session = Depends(get_db)):
    setting = db.query(AppSetting).filter(AppSetting.key == "loan_initial_balance").first()
    if setting:
        setting.value = str(data.initial_balance)
    else:
        db.add(AppSetting(key="loan_initial_balance", value=str(data.initial_balance)))
    db.commit()
    return {"initial_balance": data.initial_balance}


# ---------------------------------------------------------------------------
# One-time Excel migration
# ---------------------------------------------------------------------------

@router.post("/migrate-from-excel")
def migrate_from_excel(db: Session = Depends(get_db)):
    """Import data from accounting.xlsx into SQL tables. Skips if data exists."""
    import math
    import os
    import pandas as pd

    xlsx_path = os.environ.get(
        "ACCOUNTING_XLSX",
        r"C:\Users\Jerem\OneDrive\Documents\Money\2026_Personal Accounting.xlsx",
    )
    if not os.path.exists(xlsx_path):
        raise HTTPException(404, f"Excel file not found: {xlsx_path}")

    def _f(val, default=0.0):
        try:
            v = round(float(val), 2)
            return v if math.isfinite(v) else default
        except (TypeError, ValueError):
            return default

    counts = {}

    # Net Worth
    if db.query(NetWorthSnapshot).count() == 0:
        df = pd.read_excel(xlsx_path, sheet_name="Summary and tracking", header=None)
        n = 0
        for _, row in df.iloc[1:].iterrows():
            d = pd.to_datetime(row[0], errors="coerce")
            if pd.isna(d):
                continue
            v = _f(row[1])
            if v == 0:
                continue
            db.add(NetWorthSnapshot(
                date=d.date(),
                value=v,
                comment=str(row[2]) if pd.notna(row[2]) else None,
            ))
            n += 1
        counts["net_worth"] = n

    # Portfolio
    if db.query(PortfolioHolding).count() == 0:
        df = pd.read_excel(xlsx_path, sheet_name="Investments", header=None)
        n = 0
        for i, row in df.iloc[1:5].iterrows():
            ticker = str(row[7]).strip() if pd.notna(row[7]) else None
            if not ticker or ticker == "nan":
                continue
            db.add(PortfolioHolding(
                name=str(row[0]) if pd.notna(row[0]) else ticker,
                holding_type=str(row[1]) if pd.notna(row[1]) else None,
                ticker=ticker,
                volume=_f(row[2]) or None,
                price=_f(row[3]) or None,
                value_eur=_f(row[5]),
                is_dynamic=True,
                sort_order=i,
            ))
            n += 1
        for i, row in df.iloc[7:11].iterrows():
            name = str(row[0]).strip() if pd.notna(row[0]) else None
            if not name or name == "nan":
                continue
            db.add(PortfolioHolding(
                name=name,
                holding_type=str(row[1]) if pd.notna(row[1]) else None,
                value_eur=_f(row[5]),
                is_dynamic=False,
                sort_order=i + 100,
            ))
            n += 1
        counts["portfolio"] = n

    # Bank Accounts
    if db.query(BankAccount).count() == 0:
        df = pd.read_excel(xlsx_path, sheet_name="Bank accounts", header=None)
        n = 0
        for _, row in df.iloc[1:].iterrows():
            name = str(row[0]).strip() if pd.notna(row[0]) else None
            if not name or name == "nan":
                continue
            db.add(BankAccount(
                account_name=name,
                amount_local=_f(row[1]),
                amount_eur=_f(row[2]),
            ))
            n += 1
        counts["accounts"] = n

    # Salary
    if db.query(SalaryRecord).count() == 0:
        df = pd.read_excel(xlsx_path, sheet_name="Salary tracker", header=None)
        n = 0
        for _, row in df.iloc[1:].iterrows():
            d = pd.to_datetime(row[0], dayfirst=True, errors="coerce")
            if pd.isna(d):
                continue
            db.add(SalaryRecord(
                date=d.date(),
                company=str(row[1]).strip() if pd.notna(row[1]) else None,
                jurisdiction=str(row[2]).strip() if pd.notna(row[2]) else None,
                gross=_f(row[3]),
                overtime=_f(row[4]),
                extras=_f(row[5]),
                bonus=_f(row[6]),
                net=_f(row[7]),
                comment=str(row[8]).strip() if pd.notna(row[8]) else None,
            ))
            n += 1
        counts["salary"] = n

    # Loan
    if db.query(LoanPayment).count() == 0:
        df = pd.read_excel(xlsx_path, sheet_name="Loan", header=None)
        n = 0
        for _, row in df.iloc[2:].iterrows():
            d = pd.to_datetime(row[0], errors="coerce")
            if pd.isna(d):
                continue
            db.add(LoanPayment(
                date=d.date(),
                capital=_f(row[1]),
                interest=_f(row[2]),
                insurance=_f(row[3]),
            ))
            n += 1
        counts["loan"] = n
        # Store initial balance
        if not db.query(AppSetting).filter(AppSetting.key == "loan_initial_balance").first():
            db.add(AppSetting(key="loan_initial_balance", value=str(LOAN_INITIAL_DEFAULT)))

    db.commit()
    return {"migrated": counts, "status": "done"}

from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel

BANKS = ["UBS", "REVOLUT", "BNP", "BOURSOBANK"]

CATEGORIES = [
    "Income",
    "Fixed Costs",
    "Groceries & Dining",
    "Travel",
    "Fun Money",
    "Savings",
    "Miscellaneous",
    "Internal Transfer",
]


class TransactionOut(BaseModel):
    id: str
    date: date
    value_date: Optional[date]
    bank: str
    account: Optional[str]
    currency: str
    amount: float
    description: str
    category: Optional[str]
    original_category: Optional[str]
    notes: Optional[str]
    transaction_ref: Optional[str]
    needs_annotation: bool
    created_at: datetime

    class Config:
        from_attributes = True


class TransactionPatch(BaseModel):
    category: Optional[str] = None
    notes: Optional[str] = None
    needs_annotation: Optional[bool] = None


class BudgetEnvelopeIn(BaseModel):
    name: str
    budget_amount: float
    currency: str = "EUR"
    start_date: date
    end_date: Optional[date] = None
    category_filter: Optional[str] = None
    description: Optional[str] = None


class BudgetEnvelopeOut(BudgetEnvelopeIn):
    id: str
    created_at: datetime
    spent: float = 0.0

    class Config:
        from_attributes = True


class IngestResult(BaseModel):
    bank: str
    filename: str
    total_parsed: int
    new: int
    duplicates: int
    needs_annotation: int
    errors: list[str]


class DashboardSummary(BaseModel):
    period: str
    total_income: float
    total_expenses: float
    total_transfers: float
    net: float
    by_category: dict[str, float]
    by_bank: dict[str, float]
    monthly_trend: list[dict]


class MonthlyBudgetOut(BaseModel):
    id: str
    category: str
    monthly_target: float

    class Config:
        from_attributes = True


class MonthlyBudgetPatch(BaseModel):
    monthly_target: float


class AlertsOut(BaseModel):
    gaps: list[dict]
    pending_annotations: list[TransactionOut]

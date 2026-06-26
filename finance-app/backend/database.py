import os
from datetime import datetime
from uuid import uuid4

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    String,
    UniqueConstraint,
    cast,
    create_engine,
    extract,
    func,
    text,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DATABASE_URL = os.environ.get("DATABASE_URL", "")

if DATABASE_URL:
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
    engine = create_engine(DATABASE_URL, pool_pre_ping=True)
    _is_sqlite = False
else:
    DB_PATH = os.environ.get("DB_PATH", "./finance.db")
    engine = create_engine(
        f"sqlite:///{DB_PATH}",
        connect_args={"check_same_thread": False, "timeout": 30},
    )
    _is_sqlite = True

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def date_year(col):
    if _is_sqlite:
        return func.strftime("%Y", col)
    return cast(extract("year", col), String)


def date_month(col):
    if _is_sqlite:
        return func.strftime("%m", col)
    return func.lpad(cast(extract("month", col), String), 2, "0")


class Base(DeclarativeBase):
    pass


class Transaction(Base):
    __tablename__ = "transactions"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    date = Column(Date, nullable=False, index=True)
    value_date = Column(Date, nullable=True)
    bank = Column(String, nullable=False, index=True)
    account = Column(String, nullable=True)
    currency = Column(String, nullable=False, default="EUR")
    amount = Column(Float, nullable=False)
    description = Column(String, nullable=False)
    category = Column(String, nullable=True, index=True)
    original_category = Column(String, nullable=True)
    notes = Column(String, nullable=True)
    transaction_ref = Column(String, nullable=True)
    import_hash = Column(String, unique=True, nullable=False)
    needs_annotation = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class BudgetEnvelope(Base):
    __tablename__ = "budget_envelopes"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    budget_amount = Column(Float, nullable=False)
    currency = Column(String, default="EUR")
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=True)
    category_filter = Column(String, nullable=True)
    description = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class MonthlyBudget(Base):
    __tablename__ = "monthly_budgets"
    __table_args__ = (UniqueConstraint("category", name="uq_budget_category"),)

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    category = Column(String, nullable=False)      # "Income", "Housing", etc.
    monthly_target = Column(Float, nullable=False)  # CHF / month
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ---------------------------------------------------------------------------
# Wealth / Salary / Loan models (migrated from Excel)
# ---------------------------------------------------------------------------

class NetWorthSnapshot(Base):
    __tablename__ = "net_worth_snapshots"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    date = Column(Date, nullable=False, index=True)
    value = Column(Float, nullable=False)
    comment = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class PortfolioHolding(Base):
    __tablename__ = "portfolio_holdings"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String, nullable=False)
    holding_type = Column(String, nullable=True)        # "Index", "Stock", "Pension", "SCI"
    ticker = Column(String, nullable=True)               # e.g. "IWDA.AS"
    volume = Column(Float, nullable=True)
    price = Column(Float, nullable=True)
    value_eur = Column(Float, nullable=False, default=0.0)
    is_dynamic = Column(Boolean, default=False)          # ticker-based vs manual
    sort_order = Column(Float, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class BankAccount(Base):
    __tablename__ = "bank_accounts"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    account_name = Column(String, nullable=False)
    amount_local = Column(Float, nullable=False, default=0.0)
    amount_eur = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class SalaryRecord(Base):
    __tablename__ = "salary_records"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    date = Column(Date, nullable=False, index=True)
    company = Column(String, nullable=True)
    jurisdiction = Column(String, nullable=True)
    gross = Column(Float, nullable=False, default=0.0)
    overtime = Column(Float, nullable=False, default=0.0)
    extras = Column(Float, nullable=False, default=0.0)
    bonus = Column(Float, nullable=False, default=0.0)
    net = Column(Float, nullable=False, default=0.0)
    comment = Column(String, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class LoanPayment(Base):
    __tablename__ = "loan_payments"

    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    date = Column(Date, nullable=False, index=True)
    capital = Column(Float, nullable=False, default=0.0)
    interest = Column(Float, nullable=False, default=0.0)
    insurance = Column(Float, nullable=False, default=0.0)
    created_at = Column(DateTime, default=datetime.utcnow)


class AppSetting(Base):
    """Key-value store for app configuration (e.g. loan_initial_balance)."""
    __tablename__ = "app_settings"

    key = Column(String, primary_key=True)
    value = Column(String, nullable=False)


def create_tables():
    if _is_sqlite:
        with engine.connect() as conn:
            conn.execute(text("PRAGMA journal_mode=WAL"))
            conn.execute(text("PRAGMA busy_timeout=5000"))
            conn.commit()
    Base.metadata.create_all(bind=engine)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

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
    create_engine,
    event,
    text,
)
from sqlalchemy.orm import DeclarativeBase, sessionmaker

DB_PATH = os.environ.get("DB_PATH", "./finance.db")
engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False, "timeout": 30},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


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


def create_tables():
    # Enable WAL mode and busy_timeout for better concurrency
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

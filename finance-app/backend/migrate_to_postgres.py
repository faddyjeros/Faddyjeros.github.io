"""One-time migration: copy all data from local SQLite to PostgreSQL.

Usage:
    python migrate_to_postgres.py <NEON_DATABASE_URL>

Example:
    python migrate_to_postgres.py "postgresql://user:pass@ep-xxx.region.neon.tech/neondb?sslmode=require"
"""

import sys
from datetime import date, datetime

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

# Import all models so metadata is populated
sys.path.insert(0, ".")
from database import (
    AppSetting,
    BankAccount,
    Base,
    BudgetEnvelope,
    LoanPayment,
    MonthlyBudget,
    NetWorthSnapshot,
    PortfolioHolding,
    SalaryRecord,
    Transaction,
)

TABLES = [
    Transaction,
    BudgetEnvelope,
    MonthlyBudget,
    NetWorthSnapshot,
    PortfolioHolding,
    BankAccount,
    SalaryRecord,
    LoanPayment,
    AppSetting,
]


def migrate(sqlite_path: str, pg_url: str):
    if pg_url.startswith("postgres://"):
        pg_url = pg_url.replace("postgres://", "postgresql://", 1)

    sqlite_engine = create_engine(
        f"sqlite:///{sqlite_path}",
        connect_args={"check_same_thread": False},
    )
    pg_engine = create_engine(pg_url, pool_pre_ping=True)

    SqliteSession = sessionmaker(bind=sqlite_engine)
    PgSession = sessionmaker(bind=pg_engine)

    print("Creating tables in PostgreSQL...")
    Base.metadata.create_all(bind=pg_engine)

    sqlite_db = SqliteSession()
    pg_db = PgSession()

    try:
        for model in TABLES:
            name = model.__tablename__
            try:
                rows = sqlite_db.query(model).all()
            except Exception:
                print(f"  {name}: table not in SQLite (skip)")
                continue
            if not rows:
                print(f"  {name}: 0 rows (skip)")
                continue

            existing = pg_db.query(model).count()
            if existing > 0:
                print(f"  {name}: {existing} rows already exist in PG (skip)")
                continue

            cols = [c.name for c in model.__table__.columns]
            for row in rows:
                data = {}
                for col in cols:
                    val = getattr(row, col)
                    if isinstance(val, (date, datetime)):
                        data[col] = val
                    else:
                        data[col] = val
                pg_db.add(model(**data))

            pg_db.commit()
            print(f"  {name}: {len(rows)} rows migrated")

        print("\nMigration complete!")

        print("\nVerification:")
        for model in TABLES:
            name = model.__tablename__
            try:
                sqlite_count = sqlite_db.query(model).count()
            except Exception:
                sqlite_count = 0
            pg_count = pg_db.query(model).count()
            status = "OK" if sqlite_count == pg_count else ("NEW" if sqlite_count == 0 else "MISMATCH")
            print(f"  {name}: SQLite={sqlite_count} PG={pg_count} [{status}]")

    finally:
        sqlite_db.close()
        pg_db.close()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python migrate_to_postgres.py <NEON_DATABASE_URL>")
        print('  Optional: python migrate_to_postgres.py <URL> <SQLITE_PATH>')
        sys.exit(1)

    pg_url = sys.argv[1]
    sqlite_path = sys.argv[2] if len(sys.argv) > 2 else "./finance.db"
    print(f"Migrating from {sqlite_path} to PostgreSQL...")
    migrate(sqlite_path, pg_url)

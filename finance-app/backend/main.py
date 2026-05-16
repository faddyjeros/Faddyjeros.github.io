import asyncio
import os
import re
import shutil
from contextlib import asynccontextmanager

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import DB_PATH, MonthlyBudget, SessionLocal, Transaction, create_tables
from routers import alerts, ai_advice, analyst, budget_targets, budgets, dashboard, ingest, transactions, wealth
from services.market_data import start_background_refresh, stop_background_refresh

_sync_task = None


async def _periodic_db_sync():
    """Sync local DB back to Azure Files mount every 60 seconds."""
    mount_dir = os.environ.get("MOUNT_DIR", "/data")
    mount_db = os.path.join(mount_dir, "finance.db")
    while True:
        await asyncio.sleep(60)
        try:
            if os.path.isdir(mount_dir) and os.path.isfile(DB_PATH):
                shutil.copy2(DB_PATH, mount_db)
        except Exception as e:
            print(f"[sync] Failed to sync DB to mount: {e}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _sync_task
    create_tables()
    _migrate_categories()
    _seed_budget_targets()
    await start_background_refresh()
    # Start periodic sync if running with local copy strategy
    mount_dir = os.environ.get("MOUNT_DIR", "/data")
    if os.path.isdir(mount_dir) and "localdata" in DB_PATH:
        _sync_task = asyncio.create_task(_periodic_db_sync())
        print(f"[sync] Periodic DB sync to {mount_dir} enabled")
    yield
    # Shutdown: final sync + stop tasks
    if _sync_task:
        _sync_task.cancel()
        try:
            mount_db = os.path.join(mount_dir, "finance.db")
            if os.path.isfile(DB_PATH):
                shutil.copy2(DB_PATH, mount_db)
                print("[sync] Final DB sync completed")
        except Exception as e:
            print(f"[sync] Final sync failed: {e}")
    await stop_background_refresh()


app = FastAPI(title="Finance Tracker", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(ingest.router, prefix="/api/ingest", tags=["ingest"])
app.include_router(transactions.router, prefix="/api/transactions", tags=["transactions"])
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["dashboard"])
app.include_router(alerts.router, prefix="/api/alerts", tags=["alerts"])
app.include_router(budgets.router, prefix="/api/budgets", tags=["budgets"])
app.include_router(ai_advice.router, prefix="/api/ai", tags=["ai"])
app.include_router(budget_targets.router, prefix="/api/budget-targets", tags=["budget-targets"])
app.include_router(wealth.router, prefix="/api/wealth", tags=["wealth"])
app.include_router(analyst.router, prefix="/api/analyst", tags=["analyst"])


def _migrate_categories():
    """One-time migration: remap old granular categories to new simplified set."""
    REMAPS = {
        # Fixed Costs
        "Housing":        "Fixed Costs",
        "Student Loan":   "Fixed Costs",
        "Healthcare":     "Fixed Costs",
        "Utilities & Bills": "Fixed Costs",
        # Groceries & Dining
        "Groceries":      "Groceries & Dining",
        "Dining & Bars":  "Groceries & Dining",
        # Travel
        "Transport":      "Travel",
        # Fun Money
        "Shopping":       "Fun Money",
        "Entertainment":  "Fun Money",
        # Miscellaneous
        "Personal Payments": "Miscellaneous",
        "Cash Withdrawal":   "Miscellaneous",
        "Banking Fees":      "Miscellaneous",
        "Other":             "Miscellaneous",
        "Transfers":         "Internal Transfer",
    }
    PHONE_INTERNET = re.compile(
        r"free mobile|salt mobile|swisscom|sunrise|sfr|bouygues|orange mobile|sfr box|free (?:haut|fibre)",
        re.IGNORECASE,
    )

    db = SessionLocal()
    try:
        # Simple bulk remaps
        for old, new in REMAPS.items():
            db.query(Transaction).filter(Transaction.category == old).update(
                {"category": new}, synchronize_session=False
            )

        # Split old "Subscriptions": phone/internet → Fixed Costs, rest → Fun Money
        subs = db.query(Transaction).filter(Transaction.category == "Subscriptions").all()
        for tx in subs:
            tx.category = "Fixed Costs" if PHONE_INTERNET.search(tx.description) else "Fun Money"

        db.commit()
    finally:
        db.close()


def _seed_budget_targets():
    """Ensure budget targets match the current category set (wipes stale rows)."""
    from routers.budget_targets import DEFAULTS
    from uuid import uuid4

    db = SessionLocal()
    try:
        valid = set(DEFAULTS.keys())
        # Remove any rows for old categories no longer in use
        db.query(MonthlyBudget).filter(MonthlyBudget.category.notin_(valid)).delete(
            synchronize_session=False
        )
        # Upsert defaults (don't overwrite user-edited values)
        for category, target in DEFAULTS.items():
            existing = db.query(MonthlyBudget).filter_by(category=category).first()
            if not existing:
                db.add(MonthlyBudget(id=str(uuid4()), category=category, monthly_target=target))
        db.commit()
    finally:
        db.close()


@app.get("/api/health")
def health():
    return {"status": "ok"}

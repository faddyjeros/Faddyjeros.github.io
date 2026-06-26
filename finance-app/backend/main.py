import base64
import os
import re
import secrets
from contextlib import asynccontextmanager
from pathlib import Path

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware

from database import MonthlyBudget, SessionLocal, Transaction, create_tables
from routers import alerts, ai_advice, analyst, budget_targets, budgets, dashboard, ingest, transactions, wealth
from services.market_data import start_background_refresh, stop_background_refresh


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_tables()
    _migrate_categories()
    _seed_budget_targets()
    await start_background_refresh()
    yield
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


# --- Basic auth middleware (when AUTH_USER/AUTH_PASS are set) ---
_AUTH_USER = os.environ.get("AUTH_USER", "")
_AUTH_PASS = os.environ.get("AUTH_PASS", "")


_AUTH_EXEMPT = {"/api/health", "/api/ingest"}


@app.middleware("http")
async def basic_auth_middleware(request: Request, call_next):
    if not _AUTH_USER or not _AUTH_PASS:
        return await call_next(request)
    path = request.url.path
    if path in _AUTH_EXEMPT or not path.startswith("/api/"):
        return await call_next(request)
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Basic "):
        try:
            decoded = base64.b64decode(auth[6:]).decode()
            user, pwd = decoded.split(":", 1)
            if secrets.compare_digest(user, _AUTH_USER) and secrets.compare_digest(pwd, _AUTH_PASS):
                return await call_next(request)
        except Exception:
            pass
    return Response(
        status_code=401,
        headers={"WWW-Authenticate": 'Basic realm="Finance"'},
        content="Unauthorized",
    )


# --- Serve frontend static files (combined deploy on Render) ---
_STATIC_DIR = Path(__file__).parent / "static"
if _STATIC_DIR.is_dir():
    from fastapi.responses import FileResponse
    import mimetypes

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        if full_path.startswith("api/"):
            return Response(status_code=404, content="Not Found")
        file_path = _STATIC_DIR / full_path
        if full_path and file_path.is_file() and _STATIC_DIR in file_path.resolve().parents:
            content_type = mimetypes.guess_type(str(file_path))[0]
            return FileResponse(file_path, media_type=content_type)
        return FileResponse(_STATIC_DIR / "index.html")

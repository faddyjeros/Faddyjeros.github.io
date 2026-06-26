"""Export data to CSV or Excel."""

import io
from datetime import date, datetime

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import (
    BankAccount,
    LoanPayment,
    NetWorthSnapshot,
    PortfolioHolding,
    SalaryRecord,
    Transaction,
    get_db,
)

router = APIRouter()

ENTITY_CONFIG = {
    "networth": {
        "model": NetWorthSnapshot,
        "columns": ["date", "value", "comment"],
        "order": lambda m: m.date,
        "filename": "net_worth",
    },
    "portfolio": {
        "model": PortfolioHolding,
        "columns": ["name", "holding_type", "ticker", "volume", "price", "value_eur", "is_dynamic"],
        "order": lambda m: m.sort_order,
        "filename": "portfolio",
    },
    "accounts": {
        "model": BankAccount,
        "columns": ["account_name", "amount_local", "amount_eur"],
        "order": lambda m: m.account_name,
        "filename": "bank_accounts",
    },
    "salary": {
        "model": SalaryRecord,
        "columns": ["date", "company", "jurisdiction", "gross", "overtime", "extras", "bonus", "net", "comment"],
        "order": lambda m: m.date,
        "filename": "salary_history",
    },
    "loan": {
        "model": LoanPayment,
        "columns": ["date", "capital", "interest", "insurance"],
        "order": lambda m: m.date,
        "filename": "loan_payments",
    },
    "transactions": {
        "model": Transaction,
        "columns": ["date", "bank", "account", "currency", "amount", "description", "category", "notes"],
        "order": lambda m: m.date.desc(),
        "filename": "transactions",
    },
}


@router.get("/{entity}")
def export_data(
    entity: str,
    format: str = Query("csv", regex="^(csv|xlsx)$"),
    db: Session = Depends(get_db),
):
    cfg = ENTITY_CONFIG.get(entity)
    if not cfg:
        raise HTTPException(404, f"Unknown entity: {entity}. Options: {list(ENTITY_CONFIG.keys())}")

    rows = db.query(cfg["model"]).order_by(cfg["order"](cfg["model"])).all()

    data = []
    for r in rows:
        row_dict = {}
        for col in cfg["columns"]:
            val = getattr(r, col, None)
            if isinstance(val, (date, datetime)):
                val = val.isoformat()
            row_dict[col] = val
        data.append(row_dict)

    df = pd.DataFrame(data, columns=cfg["columns"])
    buf = io.BytesIO()

    if format == "xlsx":
        df.to_excel(buf, index=False, engine="openpyxl")
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f'attachment; filename="{cfg["filename"]}.xlsx"'},
        )
    else:
        df.to_csv(buf, index=False)
        buf.seek(0)
        return StreamingResponse(
            buf,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{cfg["filename"]}.csv"'},
        )

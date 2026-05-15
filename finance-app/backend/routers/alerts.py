from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from database import Transaction, get_db
from models import AlertsOut, TransactionOut

router = APIRouter()

GAP_THRESHOLD_DAYS = 4


@router.get("", response_model=AlertsOut)
def get_alerts(
    year: int = Query(default=date.today().year),
    db: Session = Depends(get_db),
):
    # Fetch all transaction dates for the year
    rows = (
        db.query(func.date(Transaction.date))
        .filter(func.strftime("%Y", Transaction.date) == str(year))
        .distinct()
        .all()
    )
    tx_dates = sorted({date.fromisoformat(r[0]) for r in rows if r[0]})

    gaps = []
    if tx_dates:
        year_start = date(year, 1, 1)
        year_end = min(date(year, 12, 31), date.today())
        all_dates = [year_start + timedelta(days=i) for i in range((year_end - year_start).days + 1)]

        i = 0
        while i < len(all_dates):
            d = all_dates[i]
            if d not in tx_dates:
                gap_start = d
                while i < len(all_dates) and all_dates[i] not in tx_dates:
                    i += 1
                gap_end = all_dates[i - 1]
                gap_len = (gap_end - gap_start).days + 1
                if gap_len >= GAP_THRESHOLD_DAYS:
                    gaps.append(
                        {
                            "start": gap_start.isoformat(),
                            "end": gap_end.isoformat(),
                            "days": gap_len,
                        }
                    )
            else:
                i += 1

    pending = (
        db.query(Transaction)
        .filter(Transaction.needs_annotation == True)
        .order_by(Transaction.date.desc())
        .limit(100)
        .all()
    )

    return AlertsOut(gaps=gaps, pending_annotations=pending)

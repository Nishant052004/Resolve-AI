"""Retention job: purge or anonymize expired cases (compliance checklist §1).

Usage:
    python scripts/purge_expired.py --older-than-days 365
    python scripts/purge_expired.py --anonymize-customer CUST-042
"""

from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

# Add project root to sys.path so script can be run directly: `python scripts/purge_expired.py`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from sqlalchemy import delete, select, update

from app.db import SessionLocal, init_db
from app.models import Case, CaseEvent, ToolCall, utcnow


def purge(older_than_days: int) -> int:
    cutoff = utcnow() - timedelta(days=older_than_days)
    with SessionLocal() as db:
        expired_ids = list(
            db.scalars(
                select(Case.id).where(
                    Case.resolved_at.isnot(None),
                    Case.resolved_at < cutoff,
                )
            ).all()
        )
        if not expired_ids:
            return 0
        db.execute(delete(ToolCall).where(ToolCall.case_id.in_(expired_ids)))
        db.execute(delete(CaseEvent).where(CaseEvent.case_id.in_(expired_ids)))
        deleted = db.query(Case).filter(Case.id.in_(expired_ids)).delete(synchronize_session=False)
        db.commit()
        return deleted


def anonymize(customer_id: str) -> int:
    """Right-to-erasure helper: strip the customer identity, keep the audit rows."""
    with SessionLocal() as db:
        updated = db.execute(
            update(Case)
            .where(Case.customer_id == customer_id)
            .values(customer_id="anonymized", customer_email="")
        ).rowcount
        db.commit()
        return updated


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--older-than-days", type=int)
    parser.add_argument("--anonymize-customer", type=str)
    args = parser.parse_args()

    init_db()
    if args.anonymize_customer:
        print(
            f"anonymized {anonymize(args.anonymize_customer)} case(s) for {args.anonymize_customer}"
        )
    elif args.older_than_days is not None:
        print(
            f"purged {purge(args.older_than_days)} case(s) resolved more than "
            f"{args.older_than_days} days ago"
        )
    else:
        parser.error("choose --older-than-days or --anonymize-customer")

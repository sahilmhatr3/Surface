"""
Shared utilities. Kept small — add only things that are reused across multiple modules.
"""
from sqlalchemy.orm import Session

from app.models import CycleEvent, User


def record_cycle_event(
    db: Session,
    cycle_id: int,
    event_type: str,
    actor: "User | None" = None,
    note: str | None = None,
) -> None:
    """
    Append a lifecycle event to a cycle's audit log.
    Does NOT commit — callers commit at their normal point.

    event_type values:
      created, closed_manual, closed_auto, reopened, end_date_extended,
      compiled, recompiled, published,
      raw_data_wiped_manual, raw_data_wiped_auto
    """
    db.add(CycleEvent(
        cycle_id=cycle_id,
        event_type=event_type,
        actor_id=actor.id if actor else None,
        actor_name=actor.name if actor else None,
        note=note,
    ))

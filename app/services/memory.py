import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Dict, List, Optional

from sqlalchemy.orm import Session

from app.models.database import ConsultationHistory

READABLE_SESSION_PREFIX = "MED-"
READABLE_SESSION_PATTERN = re.compile(r"^MED-(\d+)$")


@dataclass
class ChatMessage:
    role: str
    message: str
    timestamp: datetime


def _serialize_timestamp(value: datetime) -> str:
    return value.astimezone(timezone.utc).isoformat()


def _parse_timestamp(value: str) -> datetime:
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return datetime.now(timezone.utc)


def _load_chat(record: ConsultationHistory) -> List[Dict[str, str]]:
    if not record.full_chat:
        return []

    try:
        chat = json.loads(record.full_chat)
    except json.JSONDecodeError:
        return []

    return chat if isinstance(chat, list) else []


def _save_chat(record: ConsultationHistory, chat: List[Dict[str, str]]) -> None:
    record.full_chat = json.dumps(chat, ensure_ascii=False)


def normalize_dob(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None

    cleaned = value.strip()
    if not cleaned:
        return None

    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%m-%d-%Y", "%d/%m/%Y", "%m/%d/%Y"):
        try:
            return datetime.strptime(cleaned, fmt).date().isoformat()
        except ValueError:
            continue

    try:
        return datetime.fromisoformat(cleaned).date().isoformat()
    except ValueError:
        return None


def generate_readable_session_id(db: Session) -> str:
    latest_number = 0
    rows = (
        db.query(ConsultationHistory.session_id)
        .filter(ConsultationHistory.session_id.like(f"{READABLE_SESSION_PREFIX}%"))
        .all()
    )

    for (session_id,) in rows:
        match = READABLE_SESSION_PATTERN.fullmatch(session_id or "")
        if match:
            latest_number = max(latest_number, int(match.group(1)))

    return f"{READABLE_SESSION_PREFIX}{latest_number + 1:04d}"


def create_session(db: Session, session_id: str) -> ConsultationHistory:
    """
    Creates one consultation_history row for the whole session.
    """

    record = ConsultationHistory(
        session_id=session_id,
        patient_name=None,
        dob=None,
        age=None,
        sex=None,
        full_chat="[]",
        summary=None,
        date=datetime.now(timezone.utc),
    )

    db.add(record)
    db.commit()
    db.refresh(record)

    return record


def get_session(db: Session, session_id: str) -> Optional[ConsultationHistory]:
    return (
        db.query(ConsultationHistory)
        .filter(ConsultationHistory.session_id == session_id)
        .first()
    )


def validate_active_session(db: Session, session_id: str) -> ConsultationHistory:
    record = get_session(db, session_id)

    if record is None:
        raise ValueError("Invalid session_id. Please start a new session first.")

    if record.summary:
        raise ValueError("Session has already ended.")

    return record


def update_patient_basic_info(
    db: Session,
    session_id: str,
    name: Optional[str] = None,
    dob: Optional[str] = None,
    age: Optional[str] = None,
    sex: Optional[str] = None,
) -> ConsultationHistory:
    record = validate_active_session(db, session_id)

    if name:
        record.patient_name = name

    normalized_dob = normalize_dob(dob)
    if normalized_dob:
        record.dob = normalized_dob

    if age:
        record.age = age

    if sex:
        record.sex = sex

    db.commit()
    db.refresh(record)

    return record


def is_patient_info_complete(record: ConsultationHistory) -> bool:
    return all([record.patient_name, record.dob, record.age, record.sex])


def store_message(
    db: Session,
    session_id: str,
    role: str,
    message: str,
) -> ChatMessage:
    record = validate_active_session(db, session_id)
    timestamp = datetime.now(timezone.utc)
    chat = _load_chat(record)

    chat.append(
        {
            "role": role,
            "message": message,
            "timestamp": _serialize_timestamp(timestamp),
        }
    )

    _save_chat(record, chat)
    db.commit()
    db.refresh(record)

    return ChatMessage(role=role, message=message, timestamp=timestamp)


def get_recent_messages(
    db: Session,
    session_id: str,
    limit: int = 12,
) -> List[Dict[str, str]]:
    record = get_session(db, session_id)

    if record is None:
        return []

    chat = _load_chat(record)[-limit:]

    return [
        {
            "role": item.get("role", ""),
            "content": item.get("message", ""),
        }
        for item in chat
        if item.get("role") and item.get("message")
    ]


def get_all_messages(
    db: Session,
    session_id: str,
) -> List[ChatMessage]:
    record = get_session(db, session_id)

    if record is None:
        return []

    messages: List[ChatMessage] = []

    for item in _load_chat(record):
        role = item.get("role")
        message = item.get("message")
        timestamp = item.get("timestamp")

        if role and message and timestamp:
            messages.append(
                ChatMessage(
                    role=role,
                    message=message,
                    timestamp=_parse_timestamp(timestamp),
                )
            )

    return messages


def get_full_chat_text(db: Session, session_id: str) -> str:
    messages = get_all_messages(db, session_id)
    return "".join(f"{item.role.upper()}: {item.message}\n" for item in messages)


def save_summary(
    db: Session,
    session_id: str,
    summary_text: str,
) -> ConsultationHistory:
    record = get_session(db, session_id)

    if record is None:
        raise ValueError("Session not found.")

    record.summary = summary_text
    record.date = datetime.now(timezone.utc)
    db.commit()
    db.refresh(record)

    return record


def end_session(db: Session, session_id: str) -> None:
    record = get_session(db, session_id)

    if record is None:
        raise ValueError("Session not found.")

    if not record.summary:
        record.summary = "Session ended without generated summary."

    record.date = datetime.now(timezone.utc)
    db.commit()


def get_summary(
    db: Session,
    session_id: str,
) -> Optional[ConsultationHistory]:
    record = get_session(db, session_id)

    if record is None or not record.summary:
        return None

    return record

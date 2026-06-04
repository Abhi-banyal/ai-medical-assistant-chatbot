import os
import json
from datetime import datetime, timezone

from dotenv import load_dotenv
from sqlalchemy import Column, DateTime, String, Text, create_engine, inspect, text
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./doctor_chatbot.db")

engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {},
)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()


def utc_now():
    return datetime.now(timezone.utc)


class ConsultationHistory(Base):
    """
    Single-table consultation record.

    One row represents one consultation session. The row starts when a session
    is created, full_chat is appended during the conversation, and summary is
    filled when the session ends.
    """

    __tablename__ = "consultation_history"

    session_id = Column(String, primary_key=True, index=True)
    patient_name = Column(String, nullable=True)
    dob = Column(String, nullable=True)
    age = Column(String, nullable=True)
    sex = Column(String, nullable=True)
    full_chat = Column(Text, nullable=False, default="[]")
    summary = Column(Text, nullable=True)
    date = Column(DateTime(timezone=True), default=utc_now, nullable=False)


def _table_exists(table_name: str) -> bool:
    inspector = inspect(engine)
    return table_name in inspector.get_table_names()


def _column_exists(table_name: str, column_name: str) -> bool:
    inspector = inspect(engine)
    if not _table_exists(table_name):
        return False

    return column_name in {column["name"] for column in inspector.get_columns(table_name)}


def ensure_consultation_history_columns():
    if not _table_exists("consultation_history"):
        return

    if _column_exists("consultation_history", "dob"):
        return

    with engine.begin() as connection:
        connection.execute(text("ALTER TABLE consultation_history ADD COLUMN dob TEXT"))


def _parse_legacy_full_chat(full_chat: str):
    messages = []

    for line in (full_chat or "").splitlines():
        if ":" not in line:
            continue

        role, message = line.split(":", 1)
        role = role.strip().lower()
        message = message.strip()

        if role and message:
            messages.append(
                {
                    "role": "assistant" if role == "assistant" else "user",
                    "message": message,
                    "timestamp": utc_now().isoformat(),
                }
            )

    return messages


def migrate_legacy_tables_to_consultation_history():
    """
    Copies data from the earlier split-table design into consultation_history.

    Old tables are left untouched, but the application now reads and writes only
    consultation_history.
    """

    if not _table_exists("consultation_history"):
        return

    legacy_tables = {"patient_sessions", "conversations", "summaries", "consultations"}

    if not any(_table_exists(table) for table in legacy_tables):
        return

    with engine.begin() as connection:
        existing_session_ids = {
            row._mapping["session_id"]
            for row in connection.execute(text("SELECT session_id FROM consultation_history"))
        }

        legacy_session_ids = set()

        if _table_exists("patient_sessions"):
            legacy_session_ids.update(
                row._mapping["session_id"]
                for row in connection.execute(text("SELECT session_id FROM patient_sessions"))
            )

        if _table_exists("consultations"):
            legacy_session_ids.update(
                row._mapping["session_id"]
                for row in connection.execute(
                    text("SELECT DISTINCT session_id FROM consultations WHERE session_id IS NOT NULL")
                )
            )

        for session_id in legacy_session_ids - existing_session_ids:
            patient_name = None
            dob = None
            age = None
            sex = None
            date = utc_now()

            if _table_exists("patient_sessions"):
                session_row = connection.execute(
                    text(
                        """
                        SELECT name, age, sex, created_at
                        FROM patient_sessions
                        WHERE session_id = :session_id
                        """
                    ),
                    {"session_id": session_id},
                ).first()

                if session_row:
                    session_data = session_row._mapping
                    patient_name = session_data["name"]
                    age = session_data["age"]
                    sex = session_data["sex"]
                    date = session_data["created_at"] or date

            consultation_row = None

            if _table_exists("consultations"):
                consultation_row = connection.execute(
                    text(
                        """
                        SELECT name, age, sex, full_chat, created_at
                        FROM consultations
                        WHERE session_id = :session_id
                        ORDER BY created_at DESC
                        LIMIT 1
                        """
                    ),
                    {"session_id": session_id},
                ).first()

                if consultation_row:
                    consultation_data = consultation_row._mapping
                    patient_name = patient_name or consultation_data["name"]
                    age = age or consultation_data["age"]
                    sex = sex or consultation_data["sex"]
                    date = consultation_data["created_at"] or date

            chat_messages = []

            if _table_exists("conversations"):
                conversation_rows = connection.execute(
                    text(
                        """
                        SELECT role, message, timestamp
                        FROM conversations
                        WHERE session_id = :session_id
                        ORDER BY timestamp ASC
                        """
                    ),
                    {"session_id": session_id},
                ).all()

                chat_messages = [
                    {
                        "role": row._mapping["role"],
                        "message": row._mapping["message"],
                        "timestamp": (
                            row._mapping["timestamp"].isoformat()
                            if hasattr(row._mapping["timestamp"], "isoformat")
                            else str(row._mapping["timestamp"])
                        ),
                    }
                    for row in conversation_rows
                ]

            if not chat_messages and consultation_row:
                chat_messages = _parse_legacy_full_chat(consultation_row._mapping["full_chat"])

            summary = None

            if _table_exists("summaries"):
                summary_row = connection.execute(
                    text(
                        """
                        SELECT summary
                        FROM summaries
                        WHERE session_id = :session_id
                        """
                    ),
                    {"session_id": session_id},
                ).first()

                if summary_row:
                    summary = summary_row._mapping["summary"]

            connection.execute(
                text(
                    """
                    INSERT INTO consultation_history
                    (session_id, patient_name, dob, age, sex, full_chat, summary, date)
                    VALUES
                    (:session_id, :patient_name, :dob, :age, :sex, :full_chat, :summary, :date)
                    """
                ),
                {
                    "session_id": session_id,
                    "patient_name": patient_name,
                    "dob": dob,
                    "age": str(age) if age is not None else None,
                    "sex": sex,
                    "full_chat": json.dumps(chat_messages, ensure_ascii=False),
                    "summary": summary,
                    "date": date,
                },
            )


def init_db():
    Base.metadata.create_all(bind=engine)
    ensure_consultation_history_columns()
    migrate_legacy_tables_to_consultation_history()

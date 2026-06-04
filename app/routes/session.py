import json
from datetime import timezone

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.database import ConsultationHistory, SessionLocal
from app.models.schemas import (
    ConsultationHistoryResponse,
    EndSessionRequest,
    StartSessionResponse,
    SummaryResponse,
)
from app.services.memory import (
    create_session,
    end_session,
    generate_readable_session_id,
    get_all_messages,
    get_session,
    get_summary,
    normalize_dob,
    save_summary,
    update_patient_basic_info,
    validate_active_session,
)
from app.services.summarizer import generate_soap_summary

router = APIRouter(tags=["Session"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def stored_summary_value(session):
    return session.summary if session and session.summary else None


def serialize_history_record(record: ConsultationHistory) -> ConsultationHistoryResponse:
    try:
        full_chat = json.loads(record.full_chat or "[]")
    except json.JSONDecodeError:
        full_chat = []

    if not isinstance(full_chat, list):
        full_chat = []

    normalized_chat = [
        {
            "role": item.get("role", ""),
            "message": item.get("message", ""),
            "timestamp": item.get("timestamp"),
        }
        for item in full_chat
        if isinstance(item, dict) and item.get("role") and item.get("message")
    ]

    record_date = record.date
    if record_date is not None:
        if record_date.tzinfo is None:
            record_date = record_date.replace(tzinfo=timezone.utc)
        else:
            record_date = record_date.astimezone(timezone.utc)

    return ConsultationHistoryResponse(
        session_id=record.session_id,
        patient_name=record.patient_name,
        dob=record.dob,
        age=record.age,
        sex=record.sex,
        full_chat=normalized_chat,
        summary=record.summary,
        date=record_date,
    )


def create_unique_readable_session(db: Session) -> ConsultationHistory:
    for _ in range(5):
        session_id = generate_readable_session_id(db)
        try:
            return create_session(db=db, session_id=session_id)
        except IntegrityError:
            db.rollback()

    raise RuntimeError("Unable to allocate a unique session ID.")


@router.post("/session/start", response_model=StartSessionResponse)
async def start_session(db: Session = Depends(get_db)):
    """
    Creates one consultation_history row and returns its session_id.
    """

    try:
        session = create_unique_readable_session(db=db)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        )

    return StartSessionResponse(
        session_id=session.session_id,
        summary=stored_summary_value(session),
    )


@router.post("/session/end", response_model=SummaryResponse)
async def close_session(
    request: EndSessionRequest,
    db: Session = Depends(get_db),
):
    """
    Ends a session and stores the SOAP summary in consultation_history.
    """

    try:
        validate_active_session(db, request.session_id)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        )

    update_patient_basic_info(
        db=db,
        session_id=request.session_id,
        name=request.name,
        dob=request.dob,
        age=str(request.age),
        sex=request.sex,
    )

    messages = get_all_messages(db=db, session_id=request.session_id)

    if not messages and not request.soap_summary:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot generate summary because no conversation messages exist.",
        )

    if request.soap_summary:
        summary_text = json.dumps(
            request.soap_summary,
            ensure_ascii=False,
        )
    else:
        try:
            summary_text = await generate_soap_summary(messages)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=str(exc),
            )

    session = save_summary(
        db=db,
        session_id=request.session_id,
        summary_text=summary_text,
    )

    end_session(db=db, session_id=request.session_id)

    return SummaryResponse(
        session_id=request.session_id,
        summary=stored_summary_value(session),
    )


@router.get("/history/search", response_model=List[ConsultationHistoryResponse])
async def search_history(
    patient_name: str,
    dob: str,
    db: Session = Depends(get_db),
):
    patient_name_value = patient_name.strip()
    normalized_dob = normalize_dob(dob)

    if not patient_name_value or normalized_dob is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid search criteria.",
        )

    records = (
        db.query(ConsultationHistory)
        .filter(func.lower(func.trim(ConsultationHistory.patient_name)) == patient_name_value.lower())
        .filter(ConsultationHistory.dob == normalized_dob)
        .order_by(ConsultationHistory.date.desc(), ConsultationHistory.session_id.asc())
        .all()
    )

    if not records:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No consultation history found.",
        )

    return [serialize_history_record(record) for record in records]


@router.get("/summary/{session_id}", response_model=SummaryResponse)
async def read_summary(
    session_id: str,
    db: Session = Depends(get_db),
):
    """
    Returns the stored SOAP summary from consultation_history.
    """

    session = get_session(db=db, session_id=session_id)

    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    summary = get_summary(db=db, session_id=session_id)

    if summary is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Summary not found. End the session first.",
        )

    return SummaryResponse(
        session_id=session_id,
        summary=stored_summary_value(summary),
    )

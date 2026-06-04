from datetime import datetime
from typing import Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class PatientProfile(BaseModel):
    name: str
    age: int = Field(..., ge=0, le=130)
    sex: str = Field(..., min_length=1, max_length=50)
    dob: Optional[str] = Field(default="", max_length=20)
    allergies: Optional[str] = Field(default="", max_length=1000)
    medications: Optional[str] = Field(default="", max_length=1000)
    conditions: Optional[str] = Field(default="", max_length=1000)

    @field_validator("sex", "dob", "allergies", "medications", "conditions")
    @classmethod
    def strip_strings(cls, value: Optional[str]):
        return value.strip() if isinstance(value, str) else value


class StartSessionResponse(BaseModel):
    session_id: str
    summary: Optional[str] = None


class ChatRequest(BaseModel):
    session_id: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1, max_length=5000)
    patient_profile: Optional[PatientProfile] = None
    doctor_id: Optional[int] = None


class HistoryChatMessage(BaseModel):
    role: str
    message: str
    timestamp: Optional[str] = None


class ConsultationHistoryResponse(BaseModel):
    session_id: str
    patient_name: Optional[str] = None
    dob: Optional[str] = None
    age: Optional[str] = None
    sex: Optional[str] = None
    full_chat: List[HistoryChatMessage] = Field(default_factory=list)
    summary: Optional[str] = None
    date: datetime


class ChatResponse(BaseModel):
    reply: str
    flags: str
    session_id: str
    summary: Optional[str] = None
    conversation_completed: bool = False
    soap_summary: Optional[Dict[str, str]] = None
    problem_understood: bool = False
    diagnosis_given: bool = False
    safety_signals: Optional[Dict[str, str]] = None
    triage_status: Optional[str] = None
    risk_level: Optional[str] = None


class EndSessionRequest(BaseModel):
    session_id: str
    name: str
    age: int
    sex: str
    dob: Optional[str] = Field(default="", max_length=20)
    soap_summary: Optional[Dict[str, str]] = None


class SummaryResponse(BaseModel):
    session_id: str
    summary: Optional[str] = None

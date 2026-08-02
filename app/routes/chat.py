from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.services.retriever import retrieve_case
from app.models.database import SessionLocal
from app.models.schemas import ChatRequest, ChatResponse
from app.services.llm_client import get_doctor_persona_prompt, generate_reply
from app.services.doctor_data import get_doctor_by_id
from app.services.memory import (
    update_patient_basic_info,
    validate_active_session,
    get_session,
    store_message,
    get_recent_messages,
    get_all_messages,
)
from app.services.summarizer import (
    build_soap_summary_object,
    is_intake_complete,
    missing_intake_details,
    intake_status,
)
from app.services.triage import classify_urgency, URGENT_RESPONSE

router = APIRouter(tags=["Chat"])


# -------------------------------
# DB SESSION
# -------------------------------
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# -------------------------------
# CHAT API
# -------------------------------
@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, db: Session = Depends(get_db)):

    # -------------------------------
    # VALIDATE SESSION
    # -------------------------------
    try:
        validate_active_session(db, request.session_id)
    except ValueError as exc:
        error_text = str(exc)
        if error_text == "Session has already ended.":
            raise HTTPException(
                status_code=status.HTTP_410_GONE,
                detail="Session has already ended. Please start a new session.",
            )
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error_text,
        )

    session = get_session(db, request.session_id)

  
    # -------------------------------
    # ✅ USE PATIENT PROFILE FROM REQUEST
    # -------------------------------
    if request.patient_profile:
        update_patient_basic_info(
            db=db,
            session_id=request.session_id,
            name=request.patient_profile.name,
            dob=request.patient_profile.dob,
            age=str(request.patient_profile.age),
            sex=request.patient_profile.sex,
        )

    # -------------------------------
    # STORE USER MESSAGE
    # -------------------------------
    store_message(
        db=db,
        session_id=request.session_id,
        role="user",
        message=request.message,
    )
    all_messages = get_all_messages(db=db, session_id=request.session_id)

    # -------------------------------
    # 🚨 TRIAGE (EMERGENCY CHECK)
    # -------------------------------
    urgency = classify_urgency(request.message)

    if urgency == "urgent":
        store_message(
            db=db,
            session_id=request.session_id,
            role="assistant",
            message=URGENT_RESPONSE,
        )
        soap_summary = build_soap_summary_object(
            messages=all_messages,
            patient_profile=request.patient_profile,
            urgency="urgent",
        )
        
        safety_signals = {
            "status": "urgent",
            "message": "Red flag symptoms may be present; urgent medical evaluation is recommended."
        }

        return ChatResponse(
            reply=URGENT_RESPONSE,
            flags="urgent",
            session_id=request.session_id,
            summary=session.summary,
            conversation_completed=True,
            soap_summary=soap_summary,
            problem_understood=True,
            diagnosis_given=True,
            safety_signals=safety_signals,
            triage_status=urgency,
            risk_level=urgency,
        )

    # -------------------------------
    # 🧠 GET CHAT HISTORY
    # -------------------------------
    recent_messages = get_recent_messages(
        db=db,
        session_id=request.session_id,
        limit=10,
    )

    # Remove last assistant message (avoid repetition loop)
    if recent_messages and recent_messages[-1]["role"] == "assistant":
        recent_messages = recent_messages[:-1]

    # -------------------------------
    # 🔍 RAG (RETRIEVE CASE)
    # -------------------------------
    case = retrieve_case(request.message)

    retrieval_context = None
    if case:
        retrieval_context = {
            "role": "system",
            "content": (
                "Medical reference:\n"
                f"Symptoms: {case['symptoms']}\n"
                f"Causes: {', '.join(case['possible_causes'])}\n"
                f"Advice: {case['advice']}\n"
                f"Red flag: {case['red_flag']}"
            ),
        }

    # -------------------------------
    # 🧠 SYMPTOM DETECTION
    # -------------------------------
    msg = request.message.lower()

    if any(x in msg for x in ["fever", "temperature", "chills"]):
        symptom_type = "fever"

    elif any(x in msg for x in ["headache", "migraine"]):
        symptom_type = "headache"

    elif any(x in msg for x in ["stomach", "abdomen", "gas"]):
        symptom_type = "stomach pain"

    elif any(x in msg for x in ["cold", "cough", "runny nose"]):
        symptom_type = "cold"

    elif any(x in msg for x in ["chest pain"]):
        symptom_type = "chest pain"

    else:
        symptom_type = "general"

       

    # Summarize patient history
    symptom_summary = ""
    for msg in recent_messages:
        if msg["role"] == "user":
            symptom_summary += f"- {msg['content']}\n"
    missing_details = missing_intake_details(
        messages=all_messages,
        patient_profile=request.patient_profile,
    )
    missing_details_text = ", ".join(missing_details) if missing_details else "None"

    combined_context = {
        "role": "system",
        "content": f"""
    You are a highly intelligent and experienced doctor.

    Patient Details:
    Name: {session.patient_name}
    Age: {session.age}
    Sex: {session.sex}

    Current Symptom: {symptom_type}

    Patient has already told:
    {symptom_summary}

    Medical Reference:
    {retrieval_context['content'] if retrieval_context else "None"}

    CRITICAL RULES:

    1. DO NOT repeat questions already asked
    2. Ask ONLY missing information
    3. Ask ONLY 1–2 questions at a time
    4. Be natural and conversational (like a real doctor)
    5. Avoid generic templates
    6. Intake is not complete until main symptom, duration, severity,
       associated/red flag symptoms, and patient profile are known.
    7. If these missing details remain, ask one focused follow-up question:
       {missing_details_text}

    SYMPTOM GUIDANCE:

    Fever:
    - temperature?
    - chills/body ache?
    - infection exposure?

    Headache:
    - location?
    - light sensitivity?
    - stress/sleep?

    Stomach pain:
    - after food?
    - acidity?
    - vomiting?

    Cold:
    - cough?
    - sore throat?
    - runny nose?

    IMPORTANT:
    - If patient already gave severity → DO NOT ask again
    - If enough info → start giving advice
     """
    }

    # -------------------------------
    # 📦 FINAL LLM INPUT
    # -------------------------------

    llm_messages = [combined_context]

    # Add chat history
    llm_messages.extend(recent_messages)

    # -------------------------------
    # 🤖 CALL LLM
    # -------------------------------
    doctor_info = None
    if request.doctor_id:
        doctor_info = get_doctor_by_id(request.doctor_id)
    
    doctor_prompt = get_doctor_persona_prompt(doctor_info)
    
    try:
        assistant_reply = await generate_reply(
            messages=llm_messages,
            system_prompt=doctor_prompt,
        )
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        )

    # -------------------------------
    # STORE RESPONSE
    # -------------------------------
    store_message(
        db=db,
        session_id=request.session_id,
        role="assistant",
        message=assistant_reply,
    )
    completed_messages = get_all_messages(db=db, session_id=request.session_id)
    conversation_completed = is_intake_complete(
        messages=completed_messages,
        patient_profile=request.patient_profile,
    )
    
    # Detect if problem is understood
    intake_state = intake_status(completed_messages, request.patient_profile)
    problem_understood = (
        intake_state["main_symptom"]
        and intake_state["duration"]
        and intake_state["severity"]
        and (intake_state["associated_symptoms"] or intake_state["red_flags"])
    )
    
    # Detect if diagnosis/assessment is given
    diagnosis_given = intake_state["assistant_gave_plan"]
    
    # Build safety signals if problem is understood
    safety_signals = None
    if problem_understood:
        red_flag_text = (
            "Red flag symptoms may be present; urgent medical evaluation is recommended."
            if urgency == "urgent"
            else "No red flag symptoms identified from the provided information."
        )
        safety_signals = {
            "status": urgency,
            "message": red_flag_text
        }
    
    soap_summary = (
        build_soap_summary_object(
            messages=completed_messages,
            patient_profile=request.patient_profile,
            urgency=urgency,
        )
        if conversation_completed or diagnosis_given
        else None
    )

    return ChatResponse(
        reply=assistant_reply,
        flags="non-urgent",
        session_id=request.session_id,
        summary=session.summary,
        conversation_completed=conversation_completed,
        soap_summary=soap_summary,
        problem_understood=problem_understood,
        diagnosis_given=diagnosis_given,
        safety_signals=safety_signals,
        triage_status=urgency,
        risk_level=urgency,
    )

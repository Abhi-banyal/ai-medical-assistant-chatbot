import re
from typing import Dict, List, Optional

from app.services.llm_client import generate_reply
from app.services.memory import ChatMessage


SOAP_SUMMARY_PROMPT = """
You convert a doctor-patient chatbot conversation into a structured SOAP summary.

Guidelines:
- Convert user input into formal clinical language
- Remove informal or conversational wording
- Extract symptoms, duration, severity, triggers, and associated symptoms
- Do NOT invent vitals, examination findings, or test results
- Use only information explicitly provided in the conversation

Output format:

S (Subjective):
- Patient-reported symptoms in clinical language
- Include duration, severity (if mentioned), triggers, and associated symptoms
- If missing, write: "No associated symptoms reported"

O (Objective):
- Only include observable or explicitly stated facts
- Include patient profile details (age, sex, conditions) if available
- Do NOT add new clinical findings

A (Assessment):
- Use safe, non-diagnostic language
- Start with: "Possible causes may include..."
- Do NOT provide a confirmed diagnosis
- Mention risk level if applicable (e.g., mild, moderate concern)

P (Plan):
- Suggest safe next steps (e.g., monitor symptoms, hydration, rest)
- Recommend consulting a licensed clinician when appropriate
- Mention emergency care if red flag symptoms appear
- Do NOT prescribe medications or give dosage instructions

Safety Rules:
- If no serious symptoms: include "No red flag symptoms identified"
- If insufficient data: say "Limited information available"

Always include:
"I am not a doctor. This is for informational purposes only."
"""


def format_conversation_for_summary(messages: List[ChatMessage]) -> str:
    if not messages:
        return "No conversation messages were recorded."

    return "\n".join(
        f"{message.timestamp.isoformat()} | {message.role}: {message.message}"
        for message in messages
    )


async def generate_soap_summary(messages: List[ChatMessage]) -> str:
    conversation_text = format_conversation_for_summary(messages)

    return await generate_reply(
        messages=[
            {
                "role": "user",
                "content": conversation_text,
            }
        ],
        system_prompt=SOAP_SUMMARY_PROMPT,
    )


SYMPTOM_KEYWORDS = [
    "fever",
    "temperature",
    "cough",
    "cold",
    "headache",
    "migraine",
    "pain",
    "ache",
    "rash",
    "swelling",
    "vomiting",
    "nausea",
    "diarrhea",
    "dizzy",
    "dizziness",
    "breath",
    "chest",
    "throat",
    "stomach",
    "abdomen",
    "infection",
]

DURATION_PATTERN = re.compile(
    r"\b(\d+\s*(day|days|hour|hours|week|weeks|month|months)|today|yesterday|since|started|last night|morning|evening)\b",
    re.IGNORECASE,
)
SEVERITY_PATTERN = re.compile(
    r"\b(mild|moderate|severe|worse|worsening|intense|unbearable|high|low|\d+\s*/\s*10|102|103|104)\b",
    re.IGNORECASE,
)
ASSOCIATED_PATTERN = re.compile(
    r"\b(chills|body ache|fatigue|weakness|sore throat|runny nose|vomit|vomiting|nausea|rash|swelling|light sensitivity|acidity|diarrhea)\b",
    re.IGNORECASE,
)
RED_FLAG_PATTERN = re.compile(
    r"\b(chest pain|shortness of breath|difficulty breathing|can't breathe|cannot breathe|unconscious|fainting|seizure|stroke|severe bleeding|blue lips|blood vomiting)\b",
    re.IGNORECASE,
)
NEGATIVE_CONTEXT_PATTERN = re.compile(
    r"\b(no|none|not|without|don't have|do not have|didn't have|did not have)\b",
    re.IGNORECASE,
)


def _user_messages(messages: List[ChatMessage]) -> List[str]:
    return [
        message.message.strip()
        for message in messages
        if message.role == "user" and message.message.strip()
    ]


def _has_medical_history(patient_profile) -> bool:
    if patient_profile is None:
        return False

    history_fields = [
        getattr(patient_profile, "allergies", ""),
        getattr(patient_profile, "medications", ""),
        getattr(patient_profile, "conditions", ""),
    ]

    return any(field and field.strip() for field in history_fields)


def intake_status(messages: List[ChatMessage], patient_profile=None) -> Dict[str, bool]:
    user_messages = _user_messages(messages)
    combined = " ".join(user_messages).lower()
    assistant_text = " ".join(
        message.message.strip().lower()
        for message in messages
        if message.role == "assistant" and message.message.strip()
    )
    last_user_message = user_messages[-1].lower() if user_messages else ""
    assistant_asked_associated_details = any(
        word in assistant_text
        for word in [
            "associated",
            "rash",
            "nausea",
            "fatigue",
            "vomiting",
            "breathing",
            "red flag",
            "unusual symptoms",
            "other symptoms",
        ]
    )
    user_declined_associated_details = (
        bool(re.fullmatch(r"(no|nope|none|nothing|nothing else|not really|no other symptoms)[.! ]*", last_user_message))
        and assistant_asked_associated_details
    )
    user_is_closing = bool(
        re.search(r"\b(thanks|thank you|bye|goodbye|ok|okay)\b", last_user_message)
    )
    assistant_gave_plan = any(
        phrase in assistant_text
        for phrase in [
            "recommend",
            "stay hydrated",
            "rest",
            "see a doctor",
            "consult",
            "emergency",
            "if the fever persists",
            "if symptoms worsen",
        ]
    )

    has_associated_context = (
        bool(ASSOCIATED_PATTERN.search(combined))
        or "associated symptom" in combined
        or "nothing else" in combined
        or user_declined_associated_details
        or (user_is_closing and assistant_gave_plan)
        or (
            bool(NEGATIVE_CONTEXT_PATTERN.search(combined))
            and any(
                word in combined
                for word in ["chills", "cough", "rash", "vomiting", "headache", "breathing", "other symptoms"]
            )
        )
    )

    return {
        "minimum_messages": len(user_messages) >= 2,
        "main_symptom": any(keyword in combined for keyword in SYMPTOM_KEYWORDS),
        "duration": bool(DURATION_PATTERN.search(combined)),
        "severity": bool(SEVERITY_PATTERN.search(combined)),
        "associated_symptoms": has_associated_context,
        "red_flags": bool(RED_FLAG_PATTERN.search(combined)) or "red flag" in combined,
        "profile": patient_profile is not None,
        "medical_history": _has_medical_history(patient_profile),
        "assistant_gave_plan": assistant_gave_plan,
        "user_is_closing": user_is_closing,
    }


def missing_intake_details(messages: List[ChatMessage], patient_profile=None) -> List[str]:
    status = intake_status(messages, patient_profile)
    missing = []

    if not status["main_symptom"]:
        missing.append("main symptom")
    if not status["duration"]:
        missing.append("duration")
    if not status["severity"]:
        missing.append("severity")
    if not status["associated_symptoms"] and not status["red_flags"]:
        missing.append("associated or red flag symptoms")
    if not status["profile"]:
        missing.append("patient profile")

    return missing


def is_intake_complete(messages: List[ChatMessage], patient_profile=None) -> bool:
    status = intake_status(messages, patient_profile)
    detail_count = sum(
        [
            status["main_symptom"],
            status["duration"],
            status["severity"],
            status["associated_symptoms"] or status["red_flags"],
            status["profile"],
        ]
    )

    completed_by_details = status["minimum_messages"] and detail_count >= 5
    completed_by_closure = (
        status["minimum_messages"]
        and status["main_symptom"]
        and status["profile"]
        and status["assistant_gave_plan"]
        and status["user_is_closing"]
        and detail_count >= 3
    )

    return completed_by_details or completed_by_closure


def build_soap_summary_object(
    messages: List[ChatMessage],
    patient_profile=None,
    urgency: str = "non-urgent",
) -> Dict[str, str]:
    user_messages = _user_messages(messages)
    patient_text = " ".join(user_messages).strip() or "No patient symptom details recorded."

    if patient_profile:
        profile_parts = [
            f"Name: {patient_profile.name}",
            f"Age: {patient_profile.age}",
            f"Sex: {patient_profile.sex}",
        ]
        if patient_profile.allergies:
            profile_parts.append(f"Allergies: {patient_profile.allergies}")
        if patient_profile.medications:
            profile_parts.append(f"Medications: {patient_profile.medications}")
        if patient_profile.conditions:
            profile_parts.append(f"Known conditions: {patient_profile.conditions}")
        objective = ". ".join(profile_parts) + "."
    else:
        objective = "Patient profile not provided."

    red_flag_text = (
        "Red flag symptoms may be present; urgent medical evaluation is recommended."
        if urgency == "urgent" or RED_FLAG_PATTERN.search(patient_text)
        else "No red flag symptoms identified from the provided information."
    )

    return {
        "Subjective": patient_text,
        "Objective": objective,
        "Assessment": (
            "Possible causes may include common acute illness or symptom-specific conditions. "
            f"{red_flag_text} This is not a confirmed diagnosis."
        ),
        "Plan": (
            "Monitor symptoms, maintain hydration and rest, and consult a licensed clinician "
            "if symptoms persist, worsen, or new concerning symptoms appear. Seek emergency care "
            "for breathing difficulty, chest pain, fainting, severe bleeding, or other red flags."
        ),
    }

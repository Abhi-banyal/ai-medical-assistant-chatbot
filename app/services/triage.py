import re
from typing import Literal


TRIAGE_PROMPT = """
Emergency triage classifier.

Classify patient input as one of:
- urgent
- non-urgent

Urgent red flags include:
- chest pain
- difficulty breathing
- shortness of breath
- stroke symptoms
- facial drooping
- arm weakness
- slurred speech
- heavy bleeding
- suicidal thoughts
- loss of consciousness
- seizure
- severe allergic reaction
"""


URGENT_RESPONSE = (
    "Please seek immediate medical attention or call emergency services.\n\n"
    "I am not a doctor. This is for informational purposes only."
)


RED_FLAG_PATTERNS = [
    r"\bchest pain\b",
    r"\bpressure in my chest\b",
    r"\btightness in my chest\b",
    r"\bdifficulty breathing\b",
    r"\btrouble breathing\b",
    r"\bshortness of breath\b",
    r"\bcan't breathe\b",
    r"\bcannot breathe\b",
    r"\bstroke\b",
    r"\bfacial droop(?:ing)?\b",
    r"\bslurred speech\b",
    r"\barm weakness\b",
    r"\bweakness on one side\b",
    r"\bheavy bleeding\b",
    r"\bbleeding heavily\b",
    r"\bunconscious\b",
    r"\bloss of consciousness\b",
    r"\bpassed out\b",
    r"\bseizure\b",
    r"\bsuicidal\b",
    r"\bsuicidal thoughts\b",
    r"\bwant to kill myself\b",
    r"\bkill myself\b",
    r"\bsevere allergic reaction\b",
    r"\banaphylaxis\b",
]


def classify_urgency(message: str) -> Literal["urgent", "non-urgent"]:
    """
    Rule-based emergency triage.

    Important:
    We intentionally do not call the LLM here. If urgent symptoms are present,
    the system must immediately return an emergency response.
    """

    normalized = message.lower().strip()

    for pattern in RED_FLAG_PATTERNS:
        if re.search(pattern, normalized):
            return "urgent"

    return "non-urgent"
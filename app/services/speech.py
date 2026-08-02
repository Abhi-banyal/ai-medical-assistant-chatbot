import requests

from app.config import SpeechSettings


class SpeechServiceUnavailable(RuntimeError):
    """Raised when a temporary Azure Speech token cannot be obtained."""


def obtain_speech_token(settings: SpeechSettings) -> str:
    settings.validate_enabled()
    endpoint = (
        f"https://{settings.region}.api.cognitive.microsoft.com/"
        "sts/v1.0/issueToken"
    )

    try:
        response = requests.post(
            endpoint,
            headers={
                "Ocp-Apim-Subscription-Key": settings.key,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            timeout=settings.request_timeout_seconds,
        )
        response.raise_for_status()
    except requests.RequestException as exc:
        raise SpeechServiceUnavailable(
            "Speech service is temporarily unavailable."
        ) from exc

    token = response.text.strip()
    if not token:
        raise SpeechServiceUnavailable(
            "Speech service returned an invalid authorization response."
        )
    return token

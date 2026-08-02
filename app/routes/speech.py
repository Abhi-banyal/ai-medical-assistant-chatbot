import threading
import time
import uuid
from collections import defaultdict, deque

from fastapi import APIRouter, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from app.config import get_speech_settings
from app.services.speech import SpeechServiceUnavailable, obtain_speech_token


router = APIRouter(prefix="/speech", tags=["Speech"])
TOKEN_TTL_SECONDS = 540
_requests_by_client: dict[str, deque[float]] = defaultdict(deque)
_rate_limit_lock = threading.Lock()


class SpeechTokenResponse(BaseModel):
    token: str = Field(description="Short-lived Azure Speech authorization token.")
    region: str
    recognition_language: str
    synthesis_voice: str
    expires_in_seconds: int
    max_audio_duration_seconds: int
    request_id: str


def _client_identifier(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _enforce_rate_limit(client_id: str, limit: int) -> None:
    now = time.monotonic()
    cutoff = now - 60
    with _rate_limit_lock:
        requests = _requests_by_client[client_id]
        while requests and requests[0] < cutoff:
            requests.popleft()
        if len(requests) >= limit:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many speech authorization requests. Please try again shortly.",
            )
        requests.append(now)


@router.post(
    "/token",
    response_model=SpeechTokenResponse,
    summary="Create a short-lived browser authorization token for Azure Speech",
)
def create_speech_token(request: Request, response: Response) -> SpeechTokenResponse:
    request_id = str(uuid.uuid4())
    response.headers["X-Request-ID"] = request_id
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"

    try:
        settings = get_speech_settings()
        settings.validate_enabled()
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    _enforce_rate_limit(
        _client_identifier(request), settings.token_rate_limit_per_minute
    )

    try:
        token = obtain_speech_token(settings)
    except SpeechServiceUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Speech service is temporarily unavailable. Text chat is still available.",
        ) from exc

    return SpeechTokenResponse(
        token=token,
        region=settings.region or "",
        recognition_language=settings.recognition_language,
        synthesis_voice=settings.synthesis_voice,
        expires_in_seconds=TOKEN_TTL_SECONDS,
        max_audio_duration_seconds=settings.max_audio_duration_seconds,
        request_id=request_id,
    )

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _as_positive_int(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    try:
        value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc
    if value <= 0:
        raise RuntimeError(f"{name} must be greater than zero.")
    return value


@dataclass(frozen=True)
class SpeechSettings:
    enabled: bool
    key: str | None
    region: str | None
    recognition_language: str
    synthesis_voice: str
    max_audio_duration_seconds: int
    max_audio_size_bytes: int
    request_timeout_seconds: int
    token_rate_limit_per_minute: int

    def validate_enabled(self) -> None:
        if not self.enabled:
            raise RuntimeError("Voice features are not enabled.")
        if not self.key or not self.region:
            raise RuntimeError(
                "Voice features are enabled but Azure Speech configuration is incomplete."
            )


def get_speech_settings() -> SpeechSettings:
    return SpeechSettings(
        enabled=_as_bool(os.getenv("VOICE_FEATURE_ENABLED")),
        key=os.getenv("AZURE_SPEECH_KEY"),
        region=os.getenv("AZURE_SPEECH_REGION"),
        recognition_language=os.getenv("SPEECH_RECOGNITION_LANGUAGE", "en-US").strip(),
        synthesis_voice=os.getenv(
            "SPEECH_SYNTHESIS_VOICE", "en-US-AvaMultilingualNeural"
        ).strip(),
        max_audio_duration_seconds=_as_positive_int(
            "MAX_AUDIO_DURATION_SECONDS", 30
        ),
        max_audio_size_bytes=_as_positive_int(
            "MAX_AUDIO_SIZE_BYTES", 5_000_000
        ),
        request_timeout_seconds=_as_positive_int(
            "SPEECH_REQUEST_TIMEOUT_SECONDS", 10
        ),
        token_rate_limit_per_minute=_as_positive_int(
            "SPEECH_TOKEN_RATE_LIMIT_PER_MINUTE", 10
        ),
    )

import os
import unittest
from unittest.mock import patch

import requests
from fastapi.testclient import TestClient

from app.config import get_speech_settings
from app.main import app
from app.routes import speech
from app.services.speech import SpeechServiceUnavailable, obtain_speech_token


ENABLED_ENV = {
    "VOICE_FEATURE_ENABLED": "true",
    "AZURE_SPEECH_KEY": "permanent-test-secret",
    "AZURE_SPEECH_REGION": "test-region",
    "SPEECH_RECOGNITION_LANGUAGE": "en-IN",
    "SPEECH_SYNTHESIS_VOICE": "en-IN-NeerjaNeural",
    "MAX_AUDIO_DURATION_SECONDS": "20",
    "SPEECH_REQUEST_TIMEOUT_SECONDS": "3",
    "SPEECH_TOKEN_RATE_LIMIT_PER_MINUTE": "10",
}


class SpeechTokenEndpointTests(unittest.TestCase):
    def setUp(self):
        speech._requests_by_client.clear()
        self.client = TestClient(app)

    def tearDown(self):
        self.client.close()

    def test_disabled_voice_returns_safe_error(self):
        with patch.dict(os.environ, {"VOICE_FEATURE_ENABLED": "false"}, clear=False):
            response = self.client.post("/speech/token")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json()["detail"], "Voice features are not enabled.")

    def test_missing_configuration_returns_safe_error(self):
        environment = {
            "VOICE_FEATURE_ENABLED": "true",
            "AZURE_SPEECH_KEY": "",
            "AZURE_SPEECH_REGION": "",
        }
        with patch.dict(os.environ, environment, clear=False):
            response = self.client.post("/speech/token")

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("AZURE_SPEECH_KEY", response.text)

    def test_response_never_exposes_permanent_key(self):
        with (
            patch.dict(os.environ, ENABLED_ENV, clear=False),
            patch(
                "app.routes.speech.obtain_speech_token",
                return_value="temporary-browser-token",
            ),
        ):
            response = self.client.post("/speech/token")

        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body["token"], "temporary-browser-token")
        self.assertEqual(body["recognition_language"], "en-IN")
        self.assertEqual(body["synthesis_voice"], "en-IN-NeerjaNeural")
        self.assertEqual(body["max_audio_duration_seconds"], 20)
        self.assertNotIn("permanent-test-secret", response.text)
        self.assertIn("X-Request-ID", response.headers)

    def test_provider_failure_returns_safe_error(self):
        with (
            patch.dict(os.environ, ENABLED_ENV, clear=False),
            patch(
                "app.routes.speech.obtain_speech_token",
                side_effect=SpeechServiceUnavailable("provider internals"),
            ),
        ):
            response = self.client.post("/speech/token")

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("provider internals", response.text)
        self.assertIn("Text chat is still available", response.text)

    def test_provider_timeout_is_wrapped_without_key_disclosure(self):
        with (
            patch.dict(os.environ, ENABLED_ENV, clear=False),
            patch("app.services.speech.requests.post", side_effect=requests.Timeout),
        ):
            with self.assertRaisesRegex(
                SpeechServiceUnavailable, "temporarily unavailable"
            ) as raised:
                obtain_speech_token(get_speech_settings())

        self.assertNotIn("permanent-test-secret", str(raised.exception))

    def test_rate_limit_returns_429(self):
        limited_environment = {
            **ENABLED_ENV,
            "SPEECH_TOKEN_RATE_LIMIT_PER_MINUTE": "1",
        }
        with (
            patch.dict(os.environ, limited_environment, clear=False),
            patch(
                "app.routes.speech.obtain_speech_token",
                return_value="temporary-browser-token",
            ),
        ):
            first = self.client.post("/speech/token")
            second = self.client.post("/speech/token")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 429)

    def test_token_endpoint_does_not_accept_audio_or_generate_chat(self):
        with (
            patch.dict(os.environ, ENABLED_ENV, clear=False),
            patch(
                "app.routes.speech.obtain_speech_token",
                return_value="temporary-browser-token",
            ),
        ):
            response = self.client.post(
                "/speech/token",
                files={"audio": ("patient.wav", b"not-used", "audio/wav")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertNotIn("transcript", response.json())
        self.assertNotIn("reply", response.json())


if __name__ == "__main__":
    unittest.main()

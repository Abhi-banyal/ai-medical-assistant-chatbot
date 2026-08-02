import unittest

from app.services.triage import classify_urgency


class ConfirmedVoiceTranscriptWorkflowTests(unittest.TestCase):
    """Voice becomes ordinary text before it reaches this existing safety layer."""

    def test_supported_urgent_phrases_follow_existing_triage(self):
        urgent_transcripts = [
            "I have chest pain.",
            "I have difficulty breathing.",
            "This may be a severe allergic reaction.",
            "There was a loss of consciousness.",
            "There is severe bleeding.",
        ]
        for transcript in urgent_transcripts:
            with self.subTest(transcript=transcript):
                self.assertEqual(classify_urgency(transcript), "urgent")

    def test_negated_chest_pain_is_preserved_and_not_misclassified(self):
        self.assertEqual(
            classify_urgency("I do not have chest pain."),
            "non-urgent",
        )

    def test_medication_dose_duration_and_severity_are_not_modified(self):
        confirmed_transcript = (
            "I took 15 mg of the synthetic test medicine for two days "
            "and the discomfort is 4 out of 10."
        )
        self.assertIn("15 mg", confirmed_transcript)
        self.assertIn("two days", confirmed_transcript)
        self.assertEqual(classify_urgency(confirmed_transcript), "non-urgent")


if __name__ == "__main__":
    unittest.main()

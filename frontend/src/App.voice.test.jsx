import "@testing-library/jest-dom/vitest";
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ChatPanel } from "./App";
import { fetchSpeechToken } from "./lib/api";


let latestRecognizer;
let latestSynthesizer;

vi.mock("./lib/api", async () => {
  const actual = await vi.importActual("./lib/api");
  return {
    ...actual,
    fetchSpeechToken: vi.fn()
  };
});

vi.mock("microsoft-cognitiveservices-speech-sdk", () => {
  class SpeechRecognizer {
    constructor() {
      latestRecognizer = this;
    }

    startContinuousRecognitionAsync(success) {
      success();
    }

    stopContinuousRecognitionAsync(success) {
      success();
    }

    close() {}
  }

  class SpeechSynthesizer {
    constructor() {
      latestSynthesizer = this;
    }

    speakTextAsync(_text, success, failure) {
      this.complete = success;
      this.fail = failure;
    }

    close() {}
  }

  class SpeakerAudioDestination {
    pause() {}
    close() {}
  }

  return {
    SpeechConfig: {
      fromAuthorizationToken: () => ({})
    },
    AudioConfig: {
      fromDefaultMicrophoneInput: () => ({ close() {} }),
      fromSpeakerOutput: () => ({})
    },
    SpeechRecognizer,
    SpeechSynthesizer,
    SpeakerAudioDestination,
    ResultReason: {
      RecognizedSpeech: "RecognizedSpeech"
    }
  };
});

const defaultProps = {
  chatHistory: [],
  profileSubmitted: true,
  sessionActive: true,
  loading: false,
  error: "",
  onSendMessage: vi.fn(),
  selectedDoctorName: "Assistant",
  voiceResetKey: 0,
  onClearChat: vi.fn()
};

describe("voice chat controls", () => {
  afterEach(() => cleanup());

  beforeEach(() => {
    latestRecognizer = null;
    latestSynthesizer = null;
    defaultProps.onSendMessage = vi.fn();
    fetchSpeechToken.mockResolvedValue({
      token: "temporary-token",
      region: "test-region",
      recognition_language: "en-IN",
      synthesis_voice: "en-IN-NeerjaNeural",
      expires_in_seconds: 540,
      max_audio_duration_seconds: 30
    });
  });

  it("puts a transcript in the editable input without automatically sending it", async () => {
    render(<ChatPanel {...defaultProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await waitFor(() => expect(latestRecognizer).not.toBeNull());
    expect(screen.getByText("Microphone active. Listening…")).toBeInTheDocument();

    latestRecognizer.recognized(null, {
      result: {
        reason: "RecognizedSpeech",
        text: "I do not have chest pain for two days."
      }
    });
    fireEvent.click(screen.getByRole("button", { name: "Stop voice recording" }));

    const input = await screen.findByDisplayValue(
      "I do not have chest pain for two days."
    );
    expect(defaultProps.onSendMessage).not.toHaveBeenCalled();
    expect(screen.getByText(/Please check the transcript before sending/)).toBeInTheDocument();

    fireEvent.change(input, {
      target: { value: "I have mild chest discomfort for two days." }
    });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(defaultProps.onSendMessage).toHaveBeenCalledTimes(1);
    expect(defaultProps.onSendMessage).toHaveBeenCalledWith(
      "I have mild chest discomfort for two days."
    );
  });

  it("keeps text chat available when microphone permission is denied", async () => {
    render(<ChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await waitFor(() => expect(latestRecognizer).not.toBeNull());

    latestRecognizer.canceled(null, { errorDetails: "Microphone permission denied" });

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Microphone permission was denied"
    );
    expect(screen.getByPlaceholderText(/Describe symptoms/)).toBeEnabled();
  });

  it("starts read aloud only after user action and keeps response text visible", async () => {
    const message = {
      id: "assistant-1",
      role: "assistant",
      content: "General health guidance remains visible.",
      timestamp: "10:00"
    };
    render(<ChatPanel {...defaultProps} chatHistory={[message]} />);

    expect(screen.getByText(message.content)).toBeVisible();
    expect(latestSynthesizer).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Read response aloud" }));
    await waitFor(() => expect(latestSynthesizer).not.toBeNull());
    expect(screen.getByText(message.content)).toBeVisible();
    expect(screen.getByRole("button", { name: "Stop reading response aloud" })).toBeVisible();
  });

  it("stops active voice resources when the reset signal changes", async () => {
    const { rerender } = render(<ChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await waitFor(() => expect(latestRecognizer).not.toBeNull());

    const stopSpy = vi.spyOn(latestRecognizer, "stopContinuousRecognitionAsync");
    rerender(<ChatPanel {...defaultProps} voiceResetKey={1} />);

    expect(stopSpy).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Start voice recording" })).toBeVisible();
  });

  it("releases an active microphone when the component unmounts", async () => {
    const { unmount } = render(<ChatPanel {...defaultProps} />);
    fireEvent.click(screen.getByRole("button", { name: "Start voice recording" }));
    await waitFor(() => expect(latestRecognizer).not.toBeNull());

    const stopSpy = vi.spyOn(latestRecognizer, "stopContinuousRecognitionAsync");
    unmount();

    expect(stopSpy).toHaveBeenCalledTimes(1);
  });

  it("keeps assistant text visible when synthesis fails", async () => {
    const message = {
      id: "assistant-failure",
      role: "assistant",
      content: "The visible general health guidance.",
      timestamp: "10:05"
    };
    render(<ChatPanel {...defaultProps} chatHistory={[message]} />);
    fireEvent.click(screen.getByRole("button", { name: "Read response aloud" }));
    await waitFor(() => expect(latestSynthesizer).not.toBeNull());

    await act(async () => latestSynthesizer.fail());

    expect(screen.getByText(message.content)).toBeVisible();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Read aloud is unavailable"
    );
  });
});

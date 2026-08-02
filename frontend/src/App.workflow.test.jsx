import "@testing-library/jest-dom/vitest";
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import App from "./App";
import {
  endBackendSession,
  fetchDoctors,
  fetchNearbyHospitals,
  searchConsultationHistory,
  sendChatMessage,
  startBackendSession
} from "./lib/api";

vi.mock("./lib/api", () => ({
  endBackendSession: vi.fn(),
  fetchDoctors: vi.fn(),
  fetchNearbyHospitals: vi.fn(),
  fetchSpeechToken: vi.fn(),
  searchConsultationHistory: vi.fn(),
  sendChatMessage: vi.fn(),
  startBackendSession: vi.fn()
}));

const doctorResponse = {
  doctors: [
    {
      id: 1,
      name: "Dr. Test",
      specialty: "General Physician",
      experience: "8 years"
    }
  ]
};

function dateForAge(age) {
  const date = new Date();
  const year = date.getFullYear() - age;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fillValidProfileAndStart() {
  await screen.findByText("Dr. Test (General Physician)");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Test Patient" } });
  fireEvent.change(screen.getByLabelText("Date of Birth"), {
    target: { value: dateForAge(25) }
  });
  fireEvent.change(screen.getByLabelText("Sex"), { target: { value: "Other" } });
  fireEvent.click(screen.getByRole("button", { name: "Start Consultation" }));
}

describe("consultation workflows", () => {
  beforeEach(() => {
    fetchDoctors.mockResolvedValue(doctorResponse);
    startBackendSession.mockResolvedValue({ session_id: "MED-0100", summary: null });
    sendChatMessage.mockResolvedValue({
      reply: "Backend guidance",
      triage_status: "non-urgent",
      problem_understood: false
    });
    endBackendSession.mockResolvedValue({ session_id: "MED-0100", summary: "Complete" });
    searchConsultationHistory.mockResolvedValue([]);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders, validates required profile fields, and prevents duplicate starts", async () => {
    let resolveStart;
    startBackendSession.mockReturnValue(new Promise((resolve) => { resolveStart = resolve; }));
    render(<App />);
    await screen.findByText("Dr. Test (General Physician)");

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "   " } });
    fireEvent.change(screen.getByLabelText("Date of Birth"), { target: { value: dateForAge(25) } });
    fireEvent.change(screen.getByLabelText("Sex"), { target: { value: "Other" } });
    fireEvent.click(screen.getByRole("button", { name: "Start Consultation" }));
    expect(screen.getByText(/valid name, date of birth, age, and sex/i)).toBeVisible();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: " Test Patient " } });
    fireEvent.click(screen.getByRole("button", { name: "Start Consultation" }));

    expect(screen.getByRole("button", { name: "Starting..." })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Starting..." }));
    expect(startBackendSession).toHaveBeenCalledTimes(1);
    resolveStart({ session_id: "MED-0100", summary: null });
    expect(await screen.findByText(/Hello Test Patient/i)).toBeVisible();
  });

  it("recovers when session start fails", async () => {
    startBackendSession.mockRejectedValue(new Error("The service could not be reached. Please try again."));
    render(<App />);
    await fillValidProfileAndStart();

    expect(await screen.findByText(/service could not be reached/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Consultation" })).toBeEnabled();
  });

  it("handles unavailable doctor data without inventing a selection", async () => {
    fetchDoctors.mockResolvedValue({ doctors: [{ id: "invalid" }] });
    render(<App />);
    expect(await screen.findByText(/Doctor information is unavailable/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Consultation" })).toBeDisabled();
  });

  it("handles unsupported and denied geolocation without making a hospital request", async () => {
    const originalGeolocation = navigator.geolocation;
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: undefined });
    const { unmount } = render(<App />);
    await screen.findByText("Dr. Test (General Physician)");
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(screen.getByText(/Location is not supported/i)).toBeVisible();
    expect(fetchNearbyHospitals).not.toHaveBeenCalled();
    unmount();

    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: { getCurrentPosition: (_success, failure) => failure({ code: 1 }) }
    });
    render(<App />);
    await screen.findByText("Dr. Test (General Physician)");
    fireEvent.click(screen.getByRole("button", { name: "Find" }));
    expect(await screen.findByText(/Location permission was denied/i)).toBeVisible();
    expect(fetchNearbyHospitals).not.toHaveBeenCalled();
    Object.defineProperty(navigator, "geolocation", {
      configurable: true,
      value: originalGeolocation
    });
  });

  it("sends chat once and displays backend-provided status", async () => {
    render(<App />);
    await fillValidProfileAndStart();
    const input = await screen.findByPlaceholderText(/Describe symptoms/);
    fireEvent.change(input, { target: { value: "A medical message" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByText("Backend guidance")).toBeVisible();
    expect(sendChatMessage).toHaveBeenCalledTimes(1);
    expect(sendChatMessage.mock.calls[0][0]).toMatchObject({
      session_id: "MED-0100",
      message: "A medical message",
      doctor_id: 1
    });
  });

  it("preserves unsent text after a chat failure", async () => {
    sendChatMessage.mockRejectedValue(new Error("The request took too long. Please try again."));
    render(<App />);
    await fillValidProfileAndStart();
    const input = await screen.findByPlaceholderText(/Describe symptoms/);
    fireEvent.change(input, { target: { value: "Please keep this text" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    expect(await screen.findByDisplayValue("Please keep this text")).toBeVisible();
    expect(screen.getByText(/request took too long/i)).toBeVisible();
  });

  it("does not end or clear an active consultation when completion fails", async () => {
    endBackendSession.mockRejectedValue(new Error("The service could not complete the request. Please try again."));
    render(<App />);
    await fillValidProfileAndStart();
    const endButton = await screen.findByRole("button", { name: "End Session" });
    fireEvent.click(endButton);

    await waitFor(() => expect(endBackendSession).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/could not complete the request/i)).toBeVisible();
    expect(screen.getByRole("button", { name: "End Session" })).toBeEnabled();
    expect(screen.getByText(/Hello Test Patient/i)).toBeVisible();
  });

  it("marks a session complete only after the end response succeeds", async () => {
    let resolveEnd;
    endBackendSession.mockReturnValue(new Promise((resolve) => { resolveEnd = resolve; }));
    render(<App />);
    await fillValidProfileAndStart();
    fireEvent.click(await screen.findByRole("button", { name: "End Session" }));

    expect(screen.getByRole("button", { name: "End Session" })).toBeDisabled();
    expect(screen.getByText(/Hello Test Patient/i)).toBeVisible();
    resolveEnd({ session_id: "MED-0100", summary: "Complete" });
    await waitFor(() => expect(screen.getByText("Ended")).toBeVisible());
    expect(screen.queryByText(/Hello Test Patient/i)).not.toBeInTheDocument();
  });

  it("clears prior history results before a failed new search", async () => {
    searchConsultationHistory
      .mockResolvedValueOnce([{ session_id: "MED-1", patient_name: "A", date: new Date().toISOString(), full_chat: [] }])
      .mockRejectedValueOnce(new Error("Search unavailable"));
    render(<App />);
    await screen.findByText("Dr. Test (General Physician)");
    fireEvent.click(screen.getByRole("button", { name: "View History" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Patient Name"), { target: { value: "A" } });
    fireEvent.change(within(dialog).getByLabelText("Date of Birth"), { target: { value: "2000-01-01" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Search History" }));
    expect(await screen.findByText("MED-1")).toBeVisible();

    fireEvent.click(within(dialog).getByRole("button", { name: "Search History" }));
    expect(await screen.findByText("Search unavailable")).toBeVisible();
    expect(screen.queryByText("MED-1")).not.toBeInTheDocument();
  });
});

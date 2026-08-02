import { apiRequest } from "./client";

const endpoints = {
  startSession: "/session/start",
  endSession: "/session/end",
  chat: "/chat",
  history: "/history/search",
  doctors: "/doctors",
  hospitals: "/hospitals/nearby",
  speechToken: "/speech/token"
};

export const startBackendSession = (options = {}) =>
  apiRequest(endpoints.startSession, { method: "POST", ...options });

export const endBackendSession = (payload, options = {}) =>
  apiRequest(endpoints.endSession, { method: "POST", body: payload, ...options });

export const sendChatMessage = (payload, options = {}) =>
  apiRequest(endpoints.chat, { method: "POST", body: payload, ...options });

export const fetchDoctors = (options = {}) =>
  apiRequest(endpoints.doctors, options);

export function fetchNearbyHospitals(latitude, longitude, options = {}) {
  const params = new URLSearchParams({ lat: String(latitude), lng: String(longitude) });
  return apiRequest(`${endpoints.hospitals}?${params}`, options);
}

export function searchConsultationHistory({ patientName, dob }, options = {}) {
  const params = new URLSearchParams({ patient_name: patientName, dob });
  return apiRequest(`${endpoints.history}?${params}`, options);
}

export const fetchSpeechToken = (options = {}) =>
  apiRequest(endpoints.speechToken, { method: "POST", ...options });

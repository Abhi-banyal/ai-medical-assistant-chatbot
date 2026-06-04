const API_BASE_URL =
  import.meta.env.VITE_BACKEND_URL || "http://127.0.0.1:8000";

async function buildApiError(response, fallbackMessage) {
  let detail = "";

  try {
    const data = await response.json();
    if (data && typeof data.detail === "string") {
      detail = data.detail;
    }
  } catch {
    detail = "";
  }

  const error = new Error(
    detail || `${fallbackMessage} with status ${response.status}`
  );
  error.status = response.status;
  error.detail = detail;
  throw error;
}

export async function startBackendSession() {
  const response = await fetch(`${API_BASE_URL}/session/start`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    await buildApiError(response, "Session start failed");
  }

  return response.json();
}

export async function sendChatMessage(payload) {
  const response = await fetch(`${API_BASE_URL}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    await buildApiError(response, "Chat request failed");
  }

  return response.json();
}

export async function fetchNearbyHospitals(latitude, longitude) {
  const params = new URLSearchParams({
    lat: String(latitude),
    lng: String(longitude)
  });

  const response = await fetch(`${API_BASE_URL}/hospitals/nearby?${params}`);

  if (!response.ok) {
    await buildApiError(response, "Nearby hospitals request failed");
  }

  return response.json();
}

export async function searchConsultationHistory({ patientName, dob }) {
  const params = new URLSearchParams({
    patient_name: patientName,
    dob
  });

  const response = await fetch(`${API_BASE_URL}/history/search?${params}`);

  if (!response.ok) {
    await buildApiError(response, "History search failed");
  }

  return response.json();
}

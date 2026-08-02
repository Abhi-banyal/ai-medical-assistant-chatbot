const DEFAULT_DEVELOPMENT_API_URL = "/api";
const DEFAULT_TIMEOUT_MS = 15_000;

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

export function getApiBaseUrl() {
  const configuredUrl = normalizeBaseUrl(import.meta.env.VITE_BACKEND_URL);

  if (configuredUrl) {
    return configuredUrl;
  }

  if (import.meta.env.DEV || import.meta.env.MODE === "test") {
    return DEFAULT_DEVELOPMENT_API_URL;
  }

  throw new Error(
    "VITE_BACKEND_URL must be configured for a production frontend build."
  );
}

export class ApiError extends Error {
  constructor(message, { type, status = null, detail = "", cause } = {}) {
    super(message, { cause });
    this.name = "ApiError";
    this.type = type || "unknown";
    this.status = status;
    this.detail = detail;
  }
}

function safePatientMessage(type, status) {
  if (type === "timeout") return "The request took too long. Please try again.";
  if (type === "cancelled") return "The request was cancelled.";
  if (type === "network") return "The service could not be reached. Please try again.";
  if (type === "validation") return "Some information was not accepted. Please review it and try again.";
  if (status === 404) return "The requested information was not found.";
  if (status === 409 || status === 410) return "This consultation is no longer available.";
  return "The service could not complete the request. Please try again.";
}

async function readResponseBody(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      return await response.json();
    } catch {
      return null;
    }
  }

  try {
    return await response.text();
  } catch {
    return null;
  }
}

export async function apiRequest(path, options = {}) {
  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    signal: externalSignal,
    headers,
    body,
    ...fetchOptions
  } = options;
  const controller = new AbortController();
  let timedOut = false;
  const abortFromExternalSignal = () => controller.abort(externalSignal?.reason);

  if (externalSignal?.aborted) {
    abortFromExternalSignal();
  } else {
    externalSignal?.addEventListener("abort", abortFromExternalSignal, { once: true });
  }

  const timeoutId = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, {
      ...fetchOptions,
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...headers
      },
      ...(body === undefined
        ? {}
        : { body: typeof body === "string" ? body : JSON.stringify(body) })
    });
    const data = await readResponseBody(response);

    if (!response.ok) {
      const detail =
        data && typeof data === "object" && typeof data.detail === "string"
          ? data.detail
          : "";
      const type = response.status === 422 ? "validation" : "server";
      throw new ApiError(safePatientMessage(type, response.status), {
        type,
        status: response.status,
        detail
      });
    }

    if (data === null || typeof data === "string") {
      throw new ApiError("The service returned an invalid response. Please try again.", {
        type: "invalid_response",
        status: response.status
      });
    }

    return data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) {
      const type = timedOut ? "timeout" : "cancelled";
      throw new ApiError(safePatientMessage(type), { type, cause: error });
    }
    throw new ApiError(safePatientMessage("network"), {
      type: "network",
      cause: error
    });
  } finally {
    window.clearTimeout(timeoutId);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}

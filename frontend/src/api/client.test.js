import { afterEach, describe, expect, it, vi } from "vitest";

import { ApiError, apiRequest } from "./client";

function response(body, { status = 200, contentType = "application/json" } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => contentType },
    json: vi.fn().mockResolvedValue(body),
    text: vi.fn().mockResolvedValue(String(body))
  };
}

describe("apiRequest", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns JSON success responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response({ ok: true }));
    await expect(apiRequest("/health")).resolves.toEqual({ ok: true });
  });

  it("classifies validation responses without exposing backend detail", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response({ detail: "Internal validation information" }, { status: 422 })
    );
    await expect(apiRequest("/chat")).rejects.toMatchObject({
      type: "validation",
      status: 422,
      message: "Some information was not accepted. Please review it and try again.",
      detail: "Internal validation information"
    });
  });

  it("classifies network failures", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("offline"));
    await expect(apiRequest("/chat")).rejects.toMatchObject({ type: "network" });
  });

  it("classifies timeouts", async () => {
    vi.useFakeTimers();
    vi.spyOn(globalThis, "fetch").mockImplementation((_url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      })
    );
    const request = expect(apiRequest("/chat", { timeoutMs: 10 })).rejects.toMatchObject({
      type: "timeout"
    });
    await vi.advanceTimersByTimeAsync(11);
    await request;
    vi.useRealTimers();
  });

  it("rejects non-JSON success bodies as invalid responses", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      response("not-json", { contentType: "text/plain" })
    );
    await expect(apiRequest("/chat")).rejects.toBeInstanceOf(ApiError);
    await expect(apiRequest("/chat")).rejects.toMatchObject({ type: "invalid_response" });
  });
});

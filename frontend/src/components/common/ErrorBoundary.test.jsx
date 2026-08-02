import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";

import { ErrorBoundary } from "./ErrorBoundary";

function BrokenComponent() {
  throw new Error("sensitive technical failure");
}

it("shows a safe fallback for unexpected render failures", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  render(
    <ErrorBoundary>
      <BrokenComponent />
    </ErrorBoundary>
  );
  expect(screen.getByRole("alert")).toHaveTextContent("could not be displayed");
  expect(screen.queryByText("sensitive technical failure")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reload application" })).toBeVisible();
});

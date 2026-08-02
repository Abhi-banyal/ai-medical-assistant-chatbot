import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import { ErrorBoundary } from "./components/common/ErrorBoundary.jsx";
import { getApiBaseUrl } from "./api/client.js";
import "./index.css";

export function RootApplication() {
  getApiBaseUrl();
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <RootApplication />
    </ErrorBoundary>
  </React.StrictMode>
);

import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    if (import.meta.env.DEV) {
      console.error("Unexpected render failure", {
        name: error?.name,
        message: error?.message
      });
    }
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <main className="medical-dashboard-shell flex min-h-screen items-center justify-center px-4 text-slate-950">
        <section className="card card-blue max-w-lg p-6 text-center" role="alert">
          <h1 className="text-xl font-black">The application could not be displayed.</h1>
          <p className="mt-2 text-sm font-semibold text-slate-600">
            Your information has not been submitted. Reload the page to return to a safe state.
          </p>
          <button
            type="button"
            className="gradient-button mt-5 rounded-2xl px-5 py-3 text-sm font-black"
            onClick={() => window.location.reload()}
          >
            Reload application
          </button>
        </section>
      </main>
    );
  }
}

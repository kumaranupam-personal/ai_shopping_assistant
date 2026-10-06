import { Component, type ReactNode } from "react";

/** Removes the stored chat and reloads, so the page starts a new session instead of restoring the one that failed. */
function startNewChat() {
  try {
    sessionStorage.removeItem("sessionId");
    sessionStorage.removeItem("pendingMessage");
  } catch {
    // blocked storage: nothing was stored, so the reload starts fresh anyway
  }
  window.location.reload();
}

/**
 * Catches any error while rendering the chat, so the page is never left blank (docs/06-frontend.md, Render failure).
 * The cart lives in localStorage and stays.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-4 text-center text-fg">
        <p>Something went wrong showing this chat.</p>
        <button type="button" onClick={startNewChat} className="rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-accent-fg hover:opacity-90">
          Start a new chat
        </button>
      </main>
    );
  }
}

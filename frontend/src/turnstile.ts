// Cloudflare Turnstile: a fresh token before every session creation (docs/11-abuse-protection.md, Turnstile).
// Without VITE_TURNSTILE_SITE_KEY nothing loads and no token is sent.

export const TURNSTILE_SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY || undefined;
export const TURNSTILE_CONTAINER = "turnstile-widget"; // id of the slot in the banner row

const SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

type TurnstileApi = {
  render: (container: string, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  execute: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let script: Promise<TurnstileApi> | null = null;
let widgetId: string | null = null;
let settle: ((token: string | undefined) => void) | null = null;

function loadScript(): Promise<TurnstileApi> {
  script ??= new Promise((resolve, reject) => {
    const tag = document.createElement("script");
    tag.src = SCRIPT_URL;
    tag.async = true;
    const fail = () => {
      script = null; // a later session creation tries again
      tag.remove();
      reject(new Error("Turnstile didn't load"));
    };
    tag.onload = () => (window.turnstile ? resolve(window.turnstile) : fail());
    tag.onerror = fail;
    document.head.append(tag);
  });
  return script;
}

/**
 * Resolves with a new single-use token, or with undefined when Turnstile is off or fails (blocked script, widget
 * error, challenge timeout, unsupported browser). Without a token the server answers `verification_failed` with its
 * own message, which the UI shows.
 */
export async function turnstileToken(): Promise<string | undefined> {
  if (!TURNSTILE_SITE_KEY) return undefined;
  let turnstile: TurnstileApi;
  try {
    turnstile = await loadScript();
  } catch {
    return undefined;
  }
  return new Promise((resolve) => {
    settle?.(undefined); // a newer request replaces one still waiting
    settle = (token) => {
      settle = null;
      resolve(token);
    };
    const done = (token?: string) => settle?.(token);
    try {
      if (widgetId === null) {
        widgetId = turnstile.render(`#${TURNSTILE_CONTAINER}`, {
          sitekey: TURNSTILE_SITE_KEY,
          appearance: "interaction-only", // invisible unless Cloudflare asks the visitor to interact
          execution: "execute",
          callback: (token: string) => done(token),
          "error-callback": () => done(),
          "expired-callback": () => done(),
          "timeout-callback": () => done(), // an interactive challenge left unanswered
          "unsupported-callback": () => done(),
        });
      } else {
        turnstile.reset(widgetId); // tokens are single-use, so each session creation needs a new one
      }
      turnstile.execute(widgetId);
    } catch {
      done(); // the widget couldn't render or run
    }
  });
}

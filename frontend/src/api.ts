// Backend API client and SSE stream parsing (docs/05-api.md).

const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

export type Card = {
  id: string;
  title: string;
  brand: string;
  price: number;
  mrp: number;
  discount_pct: number;
  rating: number;
  review_count: number;
  in_stock: boolean;
  image_url: string;
  highlights: { label: string; value: string }[];
};

export type ResultSet = { headline: string; suggestions: string[]; products: Card[] };

export type Entry = { type: "user" | "assistant"; text: string } | ({ type: "products" } & ResultSet);

export type Product = {
  id: string;
  title: string;
  brand: string;
  description: string;
  sizes: string[];
  colors: string[];
  card: Card;
  details: { label: string; value: string }[]; // every attribute, formatted for display
};

export type StreamEvent =
  | { event: "status" | "text"; data: { text: string } }
  | { event: "products"; data: ResultSet }
  | { event: "done"; data: { turn: number } }
  | { event: "error"; data: { code: string; message: string } };

/** A non-2xx response, carrying the API's error code (docs/05-api.md, Error codes). */
export class ApiError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function toApiError(response: Response): Promise<ApiError> {
  try {
    const { error } = await response.json();
    return new ApiError(error.code, error.message);
  } catch {
    return new ApiError("http_error", "Something went wrong. Try again.");
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(API_BASE_URL + path, init);
  if (!response.ok) throw await toApiError(response);
  return response.json();
}

export async function createSession(): Promise<string> {
  return (await request<{ session_id: string }>("/api/sessions", { method: "POST" })).session_id;
}

export function restoreSession(sessionId: string) {
  return request<{ entries: Entry[] }>(
    `/api/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export function getProduct(productId: string) {
  return request<Product>(`/api/products/${encodeURIComponent(productId)}`);
}

/** Splits complete `event:`/`data:` frames off the buffer; the incomplete tail is returned as `rest`. */
function parseEvents(buffer: string): { events: StreamEvent[]; rest: string } {
  const frames = buffer.split("\n\n");
  const rest = frames.pop() ?? "";
  const events = frames.flatMap((frame) => {
    const fields = Object.fromEntries(
      frame.split("\n").map((line) => [line.slice(0, line.indexOf(":")), line.slice(line.indexOf(":") + 1).trim()]),
    );
    return fields.event && fields.data ? [{ event: fields.event, data: JSON.parse(fields.data) } as StreamEvent] : [];
  });
  return { events, rest };
}

/**
 * Sends a chat message and calls `onEvent` for each streamed event. Throws ApiError for a rejected request, and a
 * plain Error if the connection drops before the stream ends with `done` or `error`.
 */
export async function streamChat(
  sessionId: string,
  message: string,
  onEvent: (event: StreamEvent) => void,
  signal: AbortSignal,
): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, message }),
    signal,
  });
  if (!response.ok || !response.body) throw await toApiError(response);
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) throw new Error("The connection closed before the reply finished.");
    const parsed = parseEvents(buffer + value);
    buffer = parsed.rest;
    for (const event of parsed.events) {
      onEvent(event);
      if (event.event === "done" || event.event === "error") return;
    }
  }
}

import type {
  CreateSessionRequest,
  CreateSessionResponse,
  GetSessionResponse,
  ListSessionsResponse,
  Session,
  StopSessionResponse,
  RetrySessionResponse,
  SSESessionEvent,
} from "@humanlayer/shared";

const BASE = "/api";
type SessionsStreamEvent =
  | { type: "snapshot"; data: Session[] }
  | { type: "error"; data: { message: string } };

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status}`);
  return res.json();
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `POST ${path} failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  sessions: {
    list: () => get<ListSessionsResponse>("/sessions"),
    get: (id: string) => get<GetSessionResponse>(`/sessions/${id}`),
    create: (body: CreateSessionRequest) =>
      post<CreateSessionResponse>("/sessions", body),
    stop: (id: string, reason?: string) =>
      post<StopSessionResponse>(`/sessions/${id}/stop`, { reason }),
    retry: (id: string) => post<RetrySessionResponse>(`/sessions/${id}/retry`),
    stream: (
      onEvent: (event: SessionsStreamEvent) => void,
      onError?: (err: Event) => void
    ): EventSource => {
      const es = new EventSource(`${BASE}/sessions/stream`);
      es.onmessage = (e: MessageEvent) => {
        try {
          onEvent(JSON.parse(e.data as string) as SessionsStreamEvent);
        } catch {
          // ignore parse errors
        }
      };
      if (onError) es.onerror = onError;
      return es;
    },
  },

  stream: (
    sessionId: string,
    since: number,
    onEvent: (e: SSESessionEvent) => void,
    onError?: (err: Event) => void
  ): EventSource => {
    const url = `${BASE}/sessions/${sessionId}/stream?since=${since}`;
    const es = new EventSource(url);
    es.onmessage = (e: MessageEvent) => {
      try {
        onEvent(JSON.parse(e.data as string) as SSESessionEvent);
      } catch {
        // ignore parse errors
      }
    };
    if (onError) es.onerror = onError;
    return es;
  },
};

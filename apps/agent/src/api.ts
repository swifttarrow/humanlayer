/**
 * Typed HTTP client for the HumanLayer server API.
 * Uses native fetch (Node 18+). No external HTTP libs needed.
 */
import type {
  AgentPullResponse,
  AgentHeartbeatResponse,
  IngestEventsRequest,
  IngestEventsResponse,
  ListEventsResponse,
  SessionEvent,
} from "@humanlayer/shared";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";
const API_RETRY_ATTEMPTS = parseInt(process.env.API_RETRY_ATTEMPTS ?? "3", 10);
const API_RETRY_BASE_DELAY_MS = parseInt(process.env.API_RETRY_BASE_DELAY_MS ?? "250", 10);

async function post<T>(path: string, body: unknown): Promise<T> {
  let attempt = 0;
  while (attempt < API_RETRY_ATTEMPTS) {
    attempt++;
    try {
      const res = await fetch(`${SERVER_URL}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`POST ${path} failed ${res.status}: ${text}`);
      }
      if (res.status === 204) return undefined as T;
      return res.json() as Promise<T>;
    } catch (err) {
      if (!isTransientNetworkError(err) || attempt >= API_RETRY_ATTEMPTS) {
        throw err;
      }
      await sleep(API_RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw new Error(`POST ${path} failed after ${API_RETRY_ATTEMPTS} attempts`);
}

async function get<T>(path: string): Promise<T> {
  let attempt = 0;
  while (attempt < API_RETRY_ATTEMPTS) {
    attempt++;
    try {
      const res = await fetch(`${SERVER_URL}${path}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GET ${path} failed ${res.status}: ${text}`);
      }
      return res.json() as Promise<T>;
    } catch (err) {
      if (!isTransientNetworkError(err) || attempt >= API_RETRY_ATTEMPTS) {
        throw err;
      }
      await sleep(API_RETRY_BASE_DELAY_MS * attempt);
    }
  }
  throw new Error(`GET ${path} failed after ${API_RETRY_ATTEMPTS} attempts`);
}

export async function pullSession(agentId: string): Promise<AgentPullResponse | null> {
  const result = await post<AgentPullResponse | null>(`/agents/${agentId}/pull`, {});
  return result ?? null;
}

export async function heartbeat(
  agentId: string,
  attemptId: string,
  sessionId: string
): Promise<AgentHeartbeatResponse> {
  return post<AgentHeartbeatResponse>(`/agents/${agentId}/heartbeat`, {
    attemptId,
    sessionId,
  });
}

export async function ingestEvents(
  sessionId: string,
  attemptId: string,
  events: Omit<SessionEvent, "sessionId">[]
): Promise<IngestEventsResponse> {
  const body: IngestEventsRequest = { attemptId, events };
  return post<IngestEventsResponse>(`/sessions/${sessionId}/events`, body);
}

export async function listSessionEvents(sessionId: string): Promise<ListEventsResponse> {
  return get<ListEventsResponse>(`/sessions/${sessionId}/events`);
}

function isTransientNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const cause = (err as Error & { cause?: { code?: string } }).cause;
  const code = cause?.code;
  if (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "ENOTFOUND"
  ) {
    return true;
  }
  const message = err.message.toLowerCase();
  return (
    message.includes("fetch failed") ||
    message.includes("network error") ||
    message.includes("socket hang up")
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

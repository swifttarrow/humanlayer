/**
 * Typed HTTP client for the HumanLayer server API.
 * Uses native fetch (Node 18+). No external HTTP libs needed.
 */
import type {
  AgentPullResponse,
  AgentHeartbeatResponse,
  IngestEventsRequest,
  IngestEventsResponse,
  SessionEvent,
} from "@humanlayer/shared";

const SERVER_URL = process.env.SERVER_URL ?? "http://localhost:3000";

async function post<T>(path: string, body: unknown): Promise<T> {
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
}

export async function pullSession(agentId: string): Promise<AgentPullResponse | null> {
  try {
    const result = await post<AgentPullResponse | null>(`/agents/${agentId}/pull`, {});
    return result;
  } catch (err) {
    // 204 means no sessions available
    if (err instanceof Error && err.message.includes("204")) return null;
    throw err;
  }
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

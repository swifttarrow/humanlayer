// ============================================================
// Session Lifecycle Status
// ============================================================

export type SessionStatus =
  | "created"
  | "starting"
  | "running"
  | "stopping"
  | "completed"
  | "stopped"
  | "failed";

// ============================================================
// Attempt Status
// ============================================================

export type AttemptStatus =
  | "claimed"
  | "running"
  | "completed"
  | "failed"
  | "stalled"
  | "superseded";

// ============================================================
// Event Types
// ============================================================

export type SessionEventType =
  | "session.started"
  | "session.completed"
  | "session.failed"
  | "session.stopped"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "message.completed"
  | "heartbeat"
  | "stop.requested";

// ============================================================
// Core Domain Interfaces
// ============================================================

export interface Session {
  id: string;
  status: SessionStatus;
  goal: string;
  agentType: string;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  endedAt?: string;
  errorSummary?: string;
  metadata?: Record<string, unknown>;
}

export interface SessionAttempt {
  id: string;
  sessionId: string;
  agentId: string;
  status: AttemptStatus;
  leaseExpiresAt: string;
  stopRequestedAt?: string;
  startedAt: string;
  endedAt?: string;
  stopReason?: string;
}

export interface SessionEvent {
  id: string;
  sessionId: string;
  attemptId: string;
  sequenceNumber: number;
  eventType: SessionEventType;
  eventTime: string;
  actorType: "user" | "agent" | "tool" | "system";
  actorId?: string;
  stepId?: string;
  parentEventId?: string;
  correlationId?: string;
  payload: Record<string, unknown>;
  isTerminal: boolean;
  visibility: "user_visible" | "internal" | "debug_only";
  schemaVersion: string;
}

export interface SessionState {
  sessionId: string;
  status: SessionStatus;
  currentStep?: string;
  currentTool?: string;
  lastHeartbeatAt?: string;
  lastAssistantMessage?: string;
  updatedAt: string;
}

// ============================================================
// API DTOs
// ============================================================

// POST /sessions
export interface CreateSessionRequest {
  goal: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
}

export interface CreateSessionResponse {
  session: Session;
}

// GET /sessions
export interface ListSessionsResponse {
  sessions: Session[];
}

// GET /sessions/:id
export interface GetSessionResponse {
  session: Session;
  state?: SessionState;
  activeAttempt?: SessionAttempt;
}

// POST /sessions/:id/stop
export interface StopSessionRequest {
  reason?: string;
}

export interface StopSessionResponse {
  session: Session;
}

// POST /sessions/:id/retry
export interface RetrySessionResponse {
  session: Session;
  attempt: SessionAttempt;
}

// POST /agents/:id/pull
export interface AgentPullRequest {
  agentId: string;
}

export interface AgentPullResponse {
  session: Session;
  attempt: SessionAttempt;
}

// POST /agents/:id/heartbeat
export interface AgentHeartbeatRequest {
  attemptId: string;
  sessionId: string;
}

export interface AgentHeartbeatResponse {
  leaseExpiresAt: string;
  stopRequested: boolean;
}

// POST /sessions/:id/events
export interface IngestEventsRequest {
  attemptId: string;
  events: Omit<SessionEvent, "id" | "sessionId">[];
}

export interface IngestEventsResponse {
  accepted: number;
  duplicates: number;
}

// GET /sessions/:id/events
export interface ListEventsResponse {
  events: SessionEvent[];
}

// SSE event envelope for GET /sessions/:id/stream
export interface SSESessionEvent {
  type: "snapshot" | "event" | "heartbeat";
  data: Session | SessionEvent | { ts: string };
}

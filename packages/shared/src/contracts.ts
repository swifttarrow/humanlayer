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
  | "stop.requested"
  | "policy.validated"
  | "policy.denied";

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
// Working Directory Policy
// ============================================================

/**
 * Access mode for an exposed surface.
 */
export type SurfaceAccessMode = "read_only" | "read_write";

/**
 * An additional filesystem surface exposed to the agent beyond the working directory.
 */
export interface ExposedSurface {
  /** Absolute host path to expose */
  hostPath: string;
  /** Access mode for this surface */
  mode: SurfaceAccessMode;
  /** Human-readable label for audit/display */
  label?: string;
}

/**
 * Runtime mode for the agent.
 */
export type RuntimeMode = "local" | "docker";

/**
 * Server-normalized working directory policy persisted in session metadata.
 * Returned to agent on claim for enforcement.
 */
export interface WorkingDirectoryPolicy {
  /** Original user-provided path input */
  inputPath: string;
  /** Server-resolved canonical absolute path */
  resolvedPath: string;
  /** Runtime mode */
  runtimeMode: RuntimeMode;
  /** Additional exposed surfaces beyond the working directory */
  exposedSurfaces: ExposedSurface[];
}

/**
 * Machine-readable reason codes for working directory validation failures.
 */
export type WorkdirErrorCode =
  | "WORKDIR_NOT_FOUND"
  | "WORKDIR_NOT_DIRECTORY"
  | "WORKDIR_NOT_ALLOWED"
  | "EXPOSED_SURFACE_NOT_ALLOWED";

/**
 * Structured validation error for working directory failures.
 */
export interface WorkdirValidationError {
  code: WorkdirErrorCode;
  message: string;
  /** The path that caused the failure */
  path?: string;
}

// ============================================================
// API DTOs
// ============================================================

// POST /sessions
export interface CreateSessionRequest {
  goal: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  /** Optional working directory for the agent session */
  workingDirectory?: string;
  /** Optional additional exposed surfaces */
  exposedSurfaces?: ExposedSurface[];
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
// Agent provides event id for server-side dedupe
export interface IngestEventsRequest {
  attemptId: string;
  events: Omit<SessionEvent, "sessionId">[];
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

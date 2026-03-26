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
  | "failed"
  | "blocked";

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
  | "session.blocked"
  | "step.started"
  | "step.completed"
  | "step.failed"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "thinking.token"
  | "message.completed"
  | "heartbeat"
  | "stop.requested"
  | "policy.validated"
  | "policy.denied"
  | "phase.transition"
  | "exploration.budget_warning"
  | "exploration.budget_exhausted"
  | "edit_readiness.hypothesis"
  | "steering.paused"
  | "steering.resumed"
  | "steering.approval_requested"
  | "steering.approved"
  | "steering.rejected"
  | "steering.clarification_requested"
  | "steering.clarification_responded"
  | "hook.started"
  | "hook.completed"
  | "hook.failed";

// ============================================================
// Execution Phase
// ============================================================

/**
 * Explicit execution phases for agent sessions.
 * Progression: exploring -> editing -> validating -> terminal.
 */
export type SessionPhase =
  | "exploring"
  | "editing"
  | "validating";

/**
 * Reason codes for blocked/insufficient-context terminal outcomes.
 */
export type BlockedReason =
  | "exploration_budget_exhausted"
  | "no_credible_target"
  | "insufficient_context"
  /** Inferred npm script (typecheck/build/test/lint) failed twice after a successful patch */
  | "patch_not_validated"
  /** apply_patch failed twice in a row (e.g. bad hunk, missing parent directory) */
  | "patch_apply_failed";

/**
 * Terminal summary payload for session.blocked and session.failed events.
 * Provides machine-readable context for why the session could not complete.
 *
 * Required fields in terminal summary payloads:
 * - reason: BlockedReason code explaining the terminal outcome
 * - phase: The SessionPhase the agent was in when it terminated
 * - writeAttempted: Whether a patch/write was attempted during the session
 *
 * Optional fields:
 * - summary: Human-readable explanation
 * - hypothesis: Last edit-readiness hypothesis if one was emitted
 * - explorationBudget: Budget state at termination
 */
export interface TerminalSummary {
  reason: BlockedReason;
  phase: SessionPhase;
  writeAttempted: boolean;
  summary?: string;
  hypothesis?: EditReadinessHypothesis;
  explorationBudget?: ExplorationBudgetState;
}

/**
 * Structured edit-readiness hypothesis emitted before deep/repeated reads.
 */
export interface EditReadinessHypothesis {
  candidateFile?: string;
  plannedChange?: string;
  uncertaintyReason: string;
  uncertaintyCategory: "missing_context" | "ambiguous_target" | "validation_unknown" | "scope_unclear";
}

/**
 * Exploration budget accounting state emitted in budget events.
 */
export interface ExplorationBudgetState {
  readsUsed: number;
  readsLimit: number;
  searchesUsed: number;
  searchesLimit: number;
  explorationStepsUsed: number;
  explorationStepsLimit: number;
}

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
}

/**
 * Machine-readable reason codes for working directory validation failures.
 */
export type WorkdirErrorCode =
  | "WORKDIR_NOT_FOUND"
  | "WORKDIR_NOT_DIRECTORY"
  | "WORKDIR_NOT_ALLOWED";

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
// Selection Policy — Runtime Mode
// ============================================================

/**
 * System-level runtime mode policy. Controls which modes are available
 * for session creation.
 */
export type RuntimeModePolicy = "local_only" | "docker_only" | "dual_mode";

/**
 * Precedence layer for selection resolution.
 * System < user < session: later layers override earlier ones.
 */
export type SelectionLayer = "system" | "user" | "session";

/**
 * Outcome of a selection resolution: allowed or denied with a reason.
 */
export type SelectionOutcome = "allowed" | "denied";

/**
 * Typed reason codes for selection denials.
 */
export type SelectionDenialReason =
  | "RUNTIME_MODE_NOT_AVAILABLE"
  | "RUNTIME_MODE_POLICY_DENIED"
  | "PROVIDER_NOT_REGISTERED"
  | "PROVIDER_NOT_AVAILABLE"
  | "MODEL_NOT_SUPPORTED"
  | "AGENT_TYPE_NOT_REGISTERED"
  | "AGENT_TYPE_NOT_AVAILABLE"
  | "AGENT_PROVIDER_INCOMPATIBLE"
  | "TOOL_NOT_REGISTERED"
  | "TOOL_POLICY_DENIED"
  | "TOOL_AUTH_REQUIRED";

/**
 * Result of a single selection resolution.
 */
export interface SelectionResult<T = string> {
  outcome: SelectionOutcome;
  /** The resolved value when outcome is "allowed" */
  value?: T;
  /** Which layer determined the final outcome */
  decidedBy: SelectionLayer;
  /** Reason code when denied */
  reason?: SelectionDenialReason;
  /** Human-readable explanation */
  message?: string;
}

/**
 * Batch result from resolving all session-creation selections.
 */
export interface SessionSelectionResult {
  runtimeMode: SelectionResult<RuntimeMode>;
  agentType: SelectionResult<string>;
  provider: SelectionResult<string>;
  model: SelectionResult<string>;
  /** Overall: denied if any individual selection is denied */
  overall: SelectionOutcome;
  /** All denial reasons collected */
  denials: Array<{ field: string; reason: SelectionDenialReason; message: string }>;
}

// ============================================================
// Selection Policy — Provider / Model
// ============================================================

/**
 * Provider selection envelope for session creation.
 */
export interface ProviderModelSelection {
  /** Provider ID (e.g., "openai", "anthropic") */
  provider?: string;
  /** Model ID within provider (e.g., "gpt-4.1-mini") */
  model?: string;
}

/**
 * Provider capability metadata for compatibility checks.
 */
export interface ProviderCapability {
  providerId: string;
  displayName: string;
  supportedModels: string[];
  supportedAgentTypes: string[];
  /** Whether auth/credentials are available */
  available: boolean;
}

// ============================================================
// Selection Policy — Tool / Provider Metadata
// ============================================================

/**
 * Tool registration metadata.
 */
export interface ToolMetadata {
  toolId: string;
  displayName: string;
  /** Which provider category this tool belongs to */
  providerCategory: "builtin" | "mcp" | "browser" | "custom";
  /** Whether the tool requires external auth */
  requiresAuth: boolean;
  /** Whether the tool performs external actions (network, browser, etc.) */
  isExternalAction: boolean;
  /** Current availability based on auth/policy state */
  available: boolean;
  /** Reason if unavailable */
  unavailableReason?: string;
}

/**
 * Agent type registration metadata.
 */
export interface AgentTypeMetadata {
  agentTypeId: string;
  displayName: string;
  /** Compatible provider IDs */
  compatibleProviders: string[];
  /** Whether this is the default agent type */
  isDefault: boolean;
}

// ============================================================
// Run Control — Pause / Resume / Approval
// ============================================================

/**
 * Run control state for same-run steering.
 */
export type RunControlState =
  | "running"
  | "paused"
  | "awaiting_approval"
  | "awaiting_clarification";

/**
 * Run control action types.
 */
export type RunControlAction =
  | "pause"
  | "resume"
  | "approve"
  | "reject"
  | "clarify";

/**
 * Approval decision for gated operations.
 */
export interface ApprovalDecision {
  action: "approve" | "reject";
  /** Who made the decision */
  actor: string;
  /** Timestamp of the decision */
  decidedAt: string;
  /** Optional explanation */
  reason?: string;
}

/**
 * Clarification request from agent to user.
 */
export interface ClarificationRequest {
  /** What the agent needs clarified */
  question: string;
  /** Optional context for the question */
  context?: string;
  /** When the clarification was requested */
  requestedAt: string;
}

/**
 * Clarification response from user to agent.
 */
export interface ClarificationResponse {
  /** The user's response */
  answer: string;
  /** When the response was provided */
  respondedAt: string;
}

/**
 * Steering event payload for run control actions.
 */
export interface SteeringEventPayload {
  action: RunControlAction;
  previousState: RunControlState;
  newState: RunControlState;
  actor: string;
  reason?: string;
  approval?: ApprovalDecision;
  clarificationRequest?: ClarificationRequest;
  clarificationResponse?: ClarificationResponse;
}

// ============================================================
// Repo Config Metadata
// ============================================================

/**
 * Trust mode for repo-level configuration.
 */
export type RepoTrustMode = "trusted" | "restricted" | "disabled";

/**
 * Repo config metadata envelope.
 */
export interface RepoConfigMetadata {
  /** Schema version for forward compatibility */
  schemaVersion: string;
  /** Trust mode for this repo's config */
  trustMode: RepoTrustMode;
  /** Repo root path */
  repoRoot: string;
  /** Config file path relative to repo root */
  configPath?: string;
  /** Whether hooks are enabled under current trust mode */
  hooksEnabled: boolean;
}

// ============================================================
// Extended Event Types
// ============================================================

/**
 * Extended event types for steering, approval, and run-control events.
 */
export type ExtendedSessionEventType =
  | SessionEventType
  | "steering.paused"
  | "steering.resumed"
  | "steering.approval_requested"
  | "steering.approved"
  | "steering.rejected"
  | "steering.clarification_requested"
  | "steering.clarification_responded"
  | "hook.started"
  | "hook.completed"
  | "hook.failed";

// ============================================================
// Extended API DTOs
// ============================================================

/**
 * Request to create a session with extended selection fields.
 */
export interface ExtendedCreateSessionRequest extends CreateSessionRequest {
  /** Provider/model selection */
  providerModel?: ProviderModelSelection;
}

/**
 * Run control request for same-run steering.
 */
export interface RunControlRequest {
  action: RunControlAction;
  reason?: string;
  /** For clarification responses */
  clarificationResponse?: ClarificationResponse;
}

/**
 * Run control response.
 */
export interface RunControlResponse {
  sessionId: string;
  previousState: RunControlState;
  newState: RunControlState;
}

/**
 * Pre-run selection failure response body.
 */
export interface SelectionFailureResponse {
  error: string;
  code: "SELECTION_DENIED";
  denials: Array<{ field: string; reason: SelectionDenialReason; message: string }>;
}

// ============================================================
// API DTOs
// ============================================================

// POST /sessions
export interface CreateSessionRequest {
  goal: string;
  agentType?: string;
  metadata?: Record<string, unknown>;
  /**
   * Optional public GitHub URL: server clones into a session directory and configures push (requires GITHUB_TOKEN).
   * When omitted, the agent uses SESSION_DEFAULT_WORKDIR (e.g. bind-mounted /workspace in Docker).
   */
  githubRepoUrl?: string;
  /** Optional working directory; overrides default local workspace when set */
  workingDirectory?: string;
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

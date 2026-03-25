/**
 * JSONL Event Schema — versioned, machine-readable run output for automation.
 *
 * Each line is a self-contained JSON object conforming to the JsonlEvent interface.
 * Version field enables additive evolution without breaking automation clients.
 */

export interface JsonlEvent {
  /** Schema version — currently "1" */
  version: string;
  /** ISO 8601 timestamp of when the CLI observed this event */
  timestamp: string;
  /** Session ID */
  sessionId: string;
  /** Event type from SSE stream */
  type: "snapshot" | "event" | "heartbeat";
  /** Event payload */
  data: unknown;
}

/**
 * Lifecycle event subtypes emitted in JSONL output.
 */
export type JsonlLifecycleType =
  | "session.started"
  | "session.completed"
  | "session.failed"
  | "session.stopped"
  | "session.blocked";

/**
 * Tool event subtypes emitted in JSONL output.
 */
export type JsonlToolType =
  | "tool.started"
  | "tool.completed"
  | "tool.failed";

/**
 * Approval event subtypes emitted in JSONL output.
 */
export type JsonlApprovalType =
  | "steering.approval_requested"
  | "steering.approved"
  | "steering.rejected";

/**
 * Error event subtypes emitted in JSONL output.
 */
export type JsonlErrorType =
  | "session.failed"
  | "tool.failed"
  | "step.failed";

/**
 * Format a JSONL event as a single line string with newline.
 */
export function formatJsonlEvent(event: JsonlEvent): string {
  return JSON.stringify(event) + "\n";
}

/**
 * Parse a JSONL line into a typed event.
 * Returns null if the line is empty or unparseable.
 */
export function parseJsonlLine(line: string): JsonlEvent | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed) as JsonlEvent;
    if (!parsed.version || !parsed.sessionId || !parsed.type) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Validate that a JSONL event conforms to the expected schema version.
 */
export function isCompatibleVersion(event: JsonlEvent, maxVersion: string = "1"): boolean {
  const eventVersion = parseInt(event.version, 10);
  const maxVer = parseInt(maxVersion, 10);
  return !isNaN(eventVersion) && eventVersion <= maxVer;
}

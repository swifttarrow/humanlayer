import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StructuredTrace } from "../components/StructuredTrace.js";
import type { SessionEvent } from "@humanlayer/shared";

function makeEvent(overrides: Partial<SessionEvent>): SessionEvent {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    sessionId: "sess-1",
    attemptId: "att-1",
    sequenceNumber: 1,
    eventType: "step.started",
    eventTime: new Date().toISOString(),
    actorType: "agent",
    payload: {},
    isTerminal: false,
    visibility: "user_visible",
    schemaVersion: "1.0",
    ...overrides,
  };
}

describe("StructuredTrace", () => {
  it("renders nothing when no events", () => {
    render(<StructuredTrace events={[]} />);
    expect(screen.queryByText(/waiting for execution/i)).toBeNull();
  });

  it("renders a running step", () => {
    const events: SessionEvent[] = [
      makeEvent({
        eventType: "step.started",
        sequenceNumber: 1,
        stepId: "step-1",
        payload: { stepNumber: 1 },
      }),
    ];
    render(<StructuredTrace events={events} />);
    expect(screen.getByText(/Step 1:/)).toBeTruthy();
    expect(screen.getByText("◐")).toBeTruthy();
  });

  it("marks completed step with checkmark", () => {
    const events: SessionEvent[] = [
      makeEvent({ eventType: "step.started", sequenceNumber: 1, stepId: "step-1", payload: { stepNumber: 1 } }),
      makeEvent({ eventType: "step.completed", sequenceNumber: 2, stepId: "step-1", payload: {} }),
    ];
    render(<StructuredTrace events={events} />);
    expect(screen.getByText("✓")).toBeTruthy();
  });

  it("shows tool name inside running step", () => {
    const events: SessionEvent[] = [
      makeEvent({ eventType: "step.started", sequenceNumber: 1, stepId: "s1", payload: { stepNumber: 1 } }),
      makeEvent({ eventType: "tool.started", sequenceNumber: 2, stepId: "s1", actorType: "tool", payload: { toolName: "read_file", toolUseId: "tu-1" } }),
    ];
    render(<StructuredTrace events={events} />);
    expect(screen.getByText(/Step 1: read file/)).toBeTruthy();
  });
});

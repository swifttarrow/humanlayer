import { useState } from "react";
import type { SessionEvent, SessionPhase } from "@humanlayer/shared";

interface Props {
  events: SessionEvent[];
  currentTool?: string;
}

interface Step {
  stepId: string;
  stepNumber: number;
  status: "completed" | "running" | "failed" | "pending";
  phase?: SessionPhase;
  prompt?: string;
  tools: { name: string; status: "completed" | "failed" | "running"; result?: string }[];
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

interface SessionOutcome {
  type: "completed" | "failed" | "stopped" | "blocked";
  reason?: string;
  summary?: string;
}

interface SteeringEvent {
  id: string;
  eventType: string;
  eventTime: string;
  action?: string;
  actor?: string;
  reason?: string;
  question?: string;
  answer?: string;
}

const PHASE_LABELS: Record<SessionPhase, string> = {
  exploring: "Exploring",
  editing: "Editing",
  validating: "Validating",
};

const PHASE_COLORS: Record<SessionPhase, string> = {
  exploring: "#60A5FA",
  editing: "#FBBF24",
  validating: "#A78BFA",
};

function isSteeringEvent(eventType: string): boolean {
  return eventType.startsWith("steering.");
}

function buildSteps(events: SessionEvent[]): { steps: Step[]; outcome?: SessionOutcome; currentPhase?: SessionPhase; steeringEvents: SteeringEvent[] } {
  const stepsMap = new Map<string, Step>();
  const stepOrder: string[] = [];
  let currentPhase: SessionPhase | undefined;
  let outcome: SessionOutcome | undefined;
  const steeringEvents: SteeringEvent[] = [];

  for (const ev of events) {
    const stepId = ev.stepId ?? "_root";

    if (isSteeringEvent(ev.eventType)) {
      steeringEvents.push({
        id: ev.id,
        eventType: ev.eventType,
        eventTime: ev.eventTime,
        action: ev.payload.action as string | undefined,
        actor: ev.actorId ?? ev.payload.actor as string | undefined,
        reason: ev.payload.reason as string | undefined,
        question: (ev.payload.clarificationRequest as Record<string, unknown> | undefined)?.question as string | undefined,
        answer: (ev.payload.clarificationResponse as Record<string, unknown> | undefined)?.answer as string | undefined,
      });
      continue;
    }

    if (ev.eventType === "step.started") {
      if (!stepsMap.has(stepId)) {
        stepOrder.push(stepId);
        stepsMap.set(stepId, {
          stepId,
          stepNumber: (ev.payload.stepNumber as number) ?? stepOrder.length,
          status: "running",
          phase: currentPhase,
          prompt: typeof ev.payload.goal === "string" ? ev.payload.goal : undefined,
          tools: [],
          startedAt: ev.eventTime,
        });
      }
    } else if (ev.eventType === "step.completed") {
      const s = stepsMap.get(stepId);
      if (s) { s.status = "completed"; s.completedAt = ev.eventTime; }
    } else if (ev.eventType === "step.failed") {
      const s = stepsMap.get(stepId);
      if (s) s.status = "failed";
    } else if (ev.eventType === "tool.started") {
      const s = stepsMap.get(stepId);
      if (s) {
        s.tools.push({ name: ev.payload.toolName as string, status: "running" });
      }
    } else if (ev.eventType === "tool.completed") {
      const s = stepsMap.get(stepId);
      if (s) {
        const t = s.tools.find((t) => t.name === ev.payload.toolName && t.status === "running");
        if (t) { t.status = "completed"; t.result = ev.payload.result as string; }
      }
    } else if (ev.eventType === "tool.failed") {
      const s = stepsMap.get(stepId);
      if (s) {
        const t = s.tools.find((t) => t.name === ev.payload.toolName && t.status === "running");
        if (t) t.status = "failed";
      }
    } else if (ev.eventType === "message.completed") {
      const s = stepsMap.get(stepId);
      if (s) s.message = ev.payload.text as string;
    } else if (ev.eventType === "phase.transition") {
      currentPhase = ev.payload.to as SessionPhase;
      // Tag the current step with the new phase
      const s = stepsMap.get(stepId);
      if (s) s.phase = currentPhase;
    } else if (ev.eventType === "session.completed") {
      outcome = { type: "completed", summary: ev.payload.summary as string | undefined };
    } else if (ev.eventType === "session.failed") {
      outcome = { type: "failed", reason: ev.payload.error as string | undefined };
    } else if (ev.eventType === "session.stopped") {
      outcome = { type: "stopped", reason: ev.payload.reason as string | undefined };
    } else if (ev.eventType === "session.blocked") {
      outcome = {
        type: "blocked",
        reason: ev.payload.reason as string | undefined,
        summary: ev.payload.summary as string | undefined,
      };
    }
  }

  const steps = stepOrder.map((sid) => stepsMap.get(sid)!).filter(Boolean);
  return { steps, outcome, currentPhase, steeringEvents };
}

interface PromptGroup {
  id: string;
  prompt: string;
  steps: Step[];
}

function groupStepsByPrompt(steps: Step[]): PromptGroup[] {
  const groups: PromptGroup[] = [];
  let currentGroup: PromptGroup | null = null;

  for (const step of steps) {
    const prompt = step.prompt?.trim() || "Prompt";
    if (!currentGroup || currentGroup.prompt !== prompt) {
      currentGroup = {
        id: `${prompt}-${groups.length}`,
        prompt,
        steps: [],
      };
      groups.push(currentGroup);
    }
    currentGroup.steps.push(step);
  }

  return groups;
}

function buildStepTitle(step: Step, currentTool?: string): string {
  const formatToolName = (name: string) => name.replaceAll("_", " ");
  const toolNames = Array.from(new Set(step.tools.map((tool) => tool.name).filter(Boolean))).map(formatToolName);
  if (toolNames.length > 0) {
    return `Step ${step.stepNumber}: ${toolNames.join(" | ")}`;
  }
  if (step.status === "running" && currentTool) {
    return `Step ${step.stepNumber}: ${formatToolName(currentTool)}`;
  }
  return `Step ${step.stepNumber}: thinking`;
}

const STEERING_LABELS: Record<string, string> = {
  "steering.paused": "Paused",
  "steering.resumed": "Resumed",
  "steering.approval_requested": "Approval Requested",
  "steering.approved": "Approved",
  "steering.rejected": "Rejected",
  "steering.clarification_requested": "Clarification Requested",
  "steering.clarification_responded": "Clarification Responded",
};

const STEERING_COLORS: Record<string, string> = {
  "steering.paused": "#F59E0B",
  "steering.resumed": "#4ADE80",
  "steering.approval_requested": "#A78BFA",
  "steering.approved": "#4ADE80",
  "steering.rejected": "#F87171",
  "steering.clarification_requested": "#60A5FA",
  "steering.clarification_responded": "#60A5FA",
};

export function StructuredTrace({ events, currentTool }: Props) {
  const { steps, outcome, currentPhase, steeringEvents } = buildSteps(events);
  const groupedSteps = groupStepsByPrompt(steps);
  const [expandedSteps, setExpandedSteps] = useState<Record<string, boolean>>({});

  if (steps.length === 0) {
    return null;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Phase indicator */}
      {currentPhase && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 12px",
          background: "#0F172A",
          borderRadius: 6,
          borderLeft: `3px solid ${PHASE_COLORS[currentPhase]}`,
        }}>
          <span style={{ color: PHASE_COLORS[currentPhase], fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
            {PHASE_LABELS[currentPhase]}
          </span>
        </div>
      )}

      {groupedSteps.map((group, groupIndex) => (
        <div key={group.id} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 1, fontFamily: "'JetBrains Mono', monospace" }}>
            Prompt {groupIndex + 1}: {group.prompt}
          </div>
          {group.steps.map((step) => {
            const isRunning = step.status === "running";
            const isExpanded = expandedSteps[step.stepId] ?? false;
            const toggleExpanded = () =>
              setExpandedSteps((prev) => ({ ...prev, [step.stepId]: !isExpanded }));
            return (
              <div
                key={step.stepId}
                style={{
                  background: isRunning ? "#1E293B" : step.status === "failed" ? "#1A0A0A" : "#1E293B",
                  borderRadius: 8,
                  border: isRunning ? "1px solid #22D3EE" : "1px solid transparent",
                  overflow: "hidden",
                }}
              >
                <button
                  type="button"
                  onClick={toggleExpanded}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    background: "transparent",
                    border: "none",
                    padding: 14,
                    cursor: "pointer",
                    color: "#94A3B8",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                    <span style={{
                      fontFamily: "'JetBrains Mono', monospace",
                      fontSize: 14,
                      fontWeight: 700,
                      color: step.status === "completed" ? "#4ADE80"
                        : step.status === "running" ? "#22D3EE"
                        : step.status === "failed" ? "#F87171"
                        : "#475569",
                    }}>
                      {step.status === "completed" ? "✓"
                        : step.status === "running" ? "◐"
                        : step.status === "failed" ? "✗"
                        : "○"}
                    </span>
                    <span
                      style={{
                        color: "#C5D1E2",
                        fontSize: 13,
                        fontWeight: 600,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {buildStepTitle(step, currentTool)}
                    </span>
                  </div>
                  <span style={{ color: "#64748B", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                    {isExpanded ? "−" : "+"}
                  </span>
                </button>

                {isExpanded && (
                  <div style={{ borderTop: "1px solid #334155", padding: 14, maxHeight: 250, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "#94A3B8", fontSize: 12 }}>
                        {step.phase && (
                          <span style={{ color: PHASE_COLORS[step.phase], fontSize: 10, marginRight: 8, fontWeight: 400 }}>
                            [{PHASE_LABELS[step.phase]}]
                          </span>
                        )}
                        {step.status.toUpperCase()}
                      </span>
                      {step.startedAt && (
                        <span style={{ color: "#475569", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                          {new Date(step.startedAt).toLocaleTimeString()}
                        </span>
                      )}
                    </div>

                    {step.tools.length > 0 && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {step.tools.map((tool, i) => (
                          <div key={i} data-artifact-id={`${step.stepId}-tool-${i}`} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                            <span style={{ color: tool.status === "completed" ? "#4ADE80" : tool.status === "failed" ? "#F87171" : "#22D3EE", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                              {tool.status === "completed" ? "✓" : tool.status === "failed" ? "✗" : "→"}
                            </span>
                            <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                              <span style={{ color: "#64748B", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                                {tool.name}
                              </span>
                              {tool.result && (
                                <span style={{ color: "#475569", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                                  {tool.result}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {step.message && (
                      <div style={{ color: "#94A3B8", fontSize: 13, lineHeight: 1.5 }}>
                        {step.message}
                      </div>
                    )}

                    {isRunning && currentTool && (
                      <div style={{ color: "#22D3EE", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                        <span>⟳</span> Running: {currentTool}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Steering events */}
      {steeringEvents.length > 0 && steeringEvents.map((se) => (
        <div
          key={se.id}
          style={{
            background: "#0F172A",
            borderRadius: 6,
            padding: "8px 12px",
            borderLeft: `3px solid ${STEERING_COLORS[se.eventType] ?? "#64748B"}`,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ color: STEERING_COLORS[se.eventType] ?? "#64748B", fontSize: 11, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>
              {STEERING_LABELS[se.eventType] ?? se.eventType}
            </span>
            {se.actor && (
              <span style={{ color: "#475569", fontSize: 11 }}>by {se.actor}</span>
            )}
            <span style={{ color: "#475569", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginLeft: "auto" }}>
              {new Date(se.eventTime).toLocaleTimeString()}
            </span>
          </div>
          {se.reason && <div style={{ color: "#94A3B8", fontSize: 12 }}>{se.reason}</div>}
          {se.question && <div style={{ color: "#60A5FA", fontSize: 12 }}>Q: {se.question}</div>}
          {se.answer && <div style={{ color: "#4ADE80", fontSize: 12 }}>A: {se.answer}</div>}
        </div>
      ))}

      {/* Session outcome banner */}
      {outcome && (
        <div style={{
          background: outcome.type === "blocked" ? "#1C1917" : outcome.type === "failed" ? "#1A0A0A" : "#0F172A",
          borderRadius: 8,
          padding: 16,
          border: `1px solid ${
            outcome.type === "completed" ? "#4ADE80"
              : outcome.type === "blocked" ? "#F59E0B"
              : outcome.type === "failed" ? "#F87171"
              : "#94A3B8"
          }`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              fontSize: 14,
              fontWeight: 700,
              color: outcome.type === "completed" ? "#4ADE80"
                : outcome.type === "blocked" ? "#F59E0B"
                : outcome.type === "failed" ? "#F87171"
                : "#94A3B8",
            }}>
              {outcome.type === "completed" ? "✓" : outcome.type === "blocked" ? "⊘" : outcome.type === "failed" ? "✗" : "■"}
            </span>
            <span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>
              {outcome.type === "blocked" ? "Blocked" : outcome.type.charAt(0).toUpperCase() + outcome.type.slice(1)}
            </span>
            {outcome.reason && (
              <span style={{ color: "#64748B", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                — {outcome.reason}
              </span>
            )}
          </div>
          {outcome.summary && (
            <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 8, lineHeight: 1.5 }}>
              {outcome.summary}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

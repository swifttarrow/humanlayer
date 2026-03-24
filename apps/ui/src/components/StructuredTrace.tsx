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

function buildSteps(events: SessionEvent[]): { steps: Step[]; outcome?: SessionOutcome; currentPhase?: SessionPhase } {
  const stepsMap = new Map<string, Step>();
  const stepOrder: string[] = [];
  let currentPhase: SessionPhase | undefined;
  let outcome: SessionOutcome | undefined;

  for (const ev of events) {
    const stepId = ev.stepId ?? "_root";

    if (ev.eventType === "step.started") {
      if (!stepsMap.has(stepId)) {
        stepOrder.push(stepId);
        stepsMap.set(stepId, {
          stepId,
          stepNumber: (ev.payload.stepNumber as number) ?? stepOrder.length,
          status: "running",
          phase: currentPhase,
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
  return { steps, outcome, currentPhase };
}

export function StructuredTrace({ events, currentTool }: Props) {
  const { steps, outcome, currentPhase } = buildSteps(events);

  if (steps.length === 0) {
    return (
      <div style={{ color: "#475569", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: "24px 0" }}>
        Waiting for execution to begin…
      </div>
    );
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

      {steps.map((step) => {
        const isRunning = step.status === "running";
        return (
          <div
            key={step.stepId}
            style={{
              background: isRunning ? "#1E293B" : step.status === "failed" ? "#1A0A0A" : "#1E293B",
              borderRadius: 8,
              padding: 16,
              border: isRunning ? "1px solid #22D3EE" : "1px solid transparent",
              display: "flex",
              gap: 12,
            }}
          >
            {/* Icon */}
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: 14,
              fontWeight: 700,
              color: step.status === "completed" ? "#4ADE80"
                : step.status === "running" ? "#22D3EE"
                : step.status === "failed" ? "#F87171"
                : "#475569",
              marginTop: 2,
            }}>
              {step.status === "completed" ? "✓"
                : step.status === "running" ? "◐"
                : step.status === "failed" ? "✗"
                : "○"}
            </span>

            {/* Body */}
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#94A3B8", fontSize: 13, fontWeight: 600 }}>
                  Step {step.stepNumber}
                  {step.phase && (
                    <span style={{ color: PHASE_COLORS[step.phase], fontSize: 10, marginLeft: 8, fontWeight: 400 }}>
                      [{PHASE_LABELS[step.phase]}]
                    </span>
                  )}
                </span>
                {step.startedAt && (
                  <span style={{ color: "#475569", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                    {new Date(step.startedAt).toLocaleTimeString()}
                  </span>
                )}
              </div>

              {/* Tools */}
              {step.tools.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
                  {step.tools.map((tool, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ color: tool.status === "completed" ? "#4ADE80" : tool.status === "failed" ? "#F87171" : "#22D3EE", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                        {tool.status === "completed" ? "✓" : tool.status === "failed" ? "✗" : "→"}
                      </span>
                      <span style={{ color: "#64748B", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                        {tool.name}
                      </span>
                      {tool.result && (
                        <span style={{ color: "#475569", fontSize: 11, whiteSpace: "pre-wrap", wordBreak: "break-word", flex: 1 }}>
                          {tool.result}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Message */}
              {step.message && (
                <div style={{ color: "#94A3B8", fontSize: 13, marginTop: 4, lineHeight: 1.5 }}>
                  {step.message}
                </div>
              )}

              {/* Current tool indicator */}
              {isRunning && currentTool && (
                <div style={{ color: "#22D3EE", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", display: "flex", alignItems: "center", gap: 6 }}>
                  <span>⟳</span> Running: {currentTool}
                </div>
              )}
            </div>
          </div>
        );
      })}

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

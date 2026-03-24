import type { SessionEvent } from "@humanlayer/shared";

interface Props {
  events: SessionEvent[];
  currentTool?: string;
}

interface Step {
  stepId: string;
  stepNumber: number;
  status: "completed" | "running" | "failed" | "pending";
  tools: { name: string; status: "completed" | "failed" | "running"; result?: string }[];
  message?: string;
  startedAt?: string;
  completedAt?: string;
}

function buildSteps(events: SessionEvent[]): Step[] {
  const stepsMap = new Map<string, Step>();
  const stepOrder: string[] = [];

  for (const ev of events) {
    const stepId = ev.stepId ?? "_root";

    if (ev.eventType === "step.started") {
      if (!stepsMap.has(stepId)) {
        stepOrder.push(stepId);
        stepsMap.set(stepId, {
          stepId,
          stepNumber: (ev.payload.stepNumber as number) ?? stepOrder.length,
          status: "running",
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
    }
  }

  return stepOrder.map((sid) => stepsMap.get(sid)!).filter(Boolean);
}

export function StructuredTrace({ events, currentTool }: Props) {
  const steps = buildSteps(events);

  if (steps.length === 0) {
    return (
      <div style={{ color: "#475569", fontFamily: "'JetBrains Mono', monospace", fontSize: 13, padding: "24px 0" }}>
        Waiting for execution to begin…
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
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
    </div>
  );
}

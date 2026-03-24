import { useState } from "react";
import type { SessionEvent } from "@humanlayer/shared";

interface Props {
  events: SessionEvent[];
}

const EVENT_COLORS: Record<string, string> = {
  "session.started": "#22D3EE",
  "session.completed": "#4ADE80",
  "session.failed": "#F87171",
  "session.stopped": "#F59E0B",
  "session.blocked": "#F59E0B",
  "step.started": "#94A3B8",
  "step.completed": "#4ADE80",
  "step.failed": "#F87171",
  "tool.started": "#818CF8",
  "tool.completed": "#818CF8",
  "tool.failed": "#F87171",
  "message.completed": "#22D3EE",
  "heartbeat": "#334155",
  "phase.transition": "#60A5FA",
  "exploration.budget_warning": "#FBBF24",
  "exploration.budget_exhausted": "#F59E0B",
  "edit_readiness.hypothesis": "#A78BFA",
};

export function RawEventsPanel({ events }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2, fontFamily: "'JetBrains Mono', monospace" }}>
          RAW EVENTS
        </span>
        <div style={{ flex: 1, height: 1 }} />
        <span style={{ color: "#475569", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
          {events.length} events
        </span>
      </div>

      <div style={{ background: "#1E293B", borderRadius: 8, overflow: "hidden" }}>
        {events.length === 0 && (
          <div style={{ padding: "12px 14px", color: "#475569", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
            No events yet.
          </div>
        )}
        {[...events].reverse().map((ev) => (
          <div key={ev.id} style={{ borderBottom: "1px solid #0F172A" }}>
            <div
              onClick={() => toggle(ev.id)}
              style={{ padding: "8px 14px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#243045")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
            >
              <span style={{ color: EVENT_COLORS[ev.eventType] ?? "#94A3B8", fontSize: 11, fontFamily: "'JetBrains Mono', monospace", minWidth: 160 }}>
                {ev.eventType}
              </span>
              <span style={{ color: "#475569", fontSize: 11, fontFamily: "'JetBrains Mono', monospace" }}>
                #{ev.sequenceNumber}
              </span>
              <span style={{ color: "#334155", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", marginLeft: "auto" }}>
                {expanded.has(ev.id) ? "▾" : "▸"}
              </span>
            </div>
            {expanded.has(ev.id) && (
              <div style={{ padding: "0 14px 12px", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#64748B" }}>
                <pre style={{ margin: 0, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {JSON.stringify(ev.payload, null, 2)}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

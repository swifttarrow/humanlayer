import { useState } from "react";
import type { SessionEvent } from "@humanlayer/shared";

interface Props {
  events: SessionEvent[];
}

interface FileChange {
  path: string;
  status: "added" | "modified" | "patched" | "failed";
  attemptId: string;
  patchContent?: string;
  result?: string;
  eventTime: string;
}

function extractFileChanges(events: SessionEvent[]): FileChange[] {
  const changes: FileChange[] = [];

  for (const ev of events) {
    if (ev.eventType === "tool.completed" || ev.eventType === "tool.failed") {
      const toolName = ev.payload.toolName as string;
      if (toolName === "apply_patch") {
        const input = ev.payload.input as Record<string, unknown> | undefined;
        const path = (input?.path as string) ?? "unknown";
        changes.push({
          path,
          status: ev.eventType === "tool.completed" ? "patched" : "failed",
          attemptId: ev.attemptId,
          patchContent: input?.patch as string | undefined,
          result: ev.payload.result as string | undefined,
          eventTime: ev.eventTime,
        });
      }
    }
  }

  return changes;
}

function groupByAttempt(changes: FileChange[]): Map<string, FileChange[]> {
  const groups = new Map<string, FileChange[]>();
  for (const change of changes) {
    const group = groups.get(change.attemptId) ?? [];
    group.push(change);
    groups.set(change.attemptId, group);
  }
  return groups;
}

export function ChangesPanel({ events }: Props) {
  const changes = extractFileChanges(events);
  const grouped = groupByAttempt(changes);
  const [expandedPaths, setExpandedPaths] = useState<Record<string, boolean>>({});

  if (changes.length === 0) {
    return (
      <div style={{ color: "#64748B", fontSize: 13, padding: 16, textAlign: "center" }}>
        No file changes yet.
      </div>
    );
  }

  const togglePath = (key: string) => {
    setExpandedPaths((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {Array.from(grouped.entries()).map(([attemptId, attemptChanges]) => (
        <div key={attemptId} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{ color: "#64748B", fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: 1 }}>
            ATTEMPT {attemptId.slice(0, 8)}
          </div>
          {attemptChanges.map((change, i) => {
            const key = `${attemptId}-${change.path}-${i}`;
            const isExpanded = expandedPaths[key] ?? false;
            return (
              <div
                key={key}
                style={{
                  background: "#1E293B",
                  borderRadius: 6,
                  overflow: "hidden",
                  borderLeft: `3px solid ${change.status === "failed" ? "#F87171" : "#4ADE80"}`,
                }}
              >
                <button
                  type="button"
                  onClick={() => togglePath(key)}
                  style={{
                    width: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    background: "transparent",
                    border: "none",
                    padding: "10px 12px",
                    cursor: "pointer",
                    color: "#94A3B8",
                    textAlign: "left",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    <span style={{
                      color: change.status === "failed" ? "#F87171" : "#4ADE80",
                      fontSize: 11,
                      fontWeight: 600,
                    }}>
                      {change.status === "failed" ? "✗" : "✓"}
                    </span>
                    <span style={{
                      fontSize: 12,
                      fontFamily: "'JetBrains Mono', monospace",
                      color: "#C5D1E2",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}>
                      {change.path}
                    </span>
                  </div>
                  <span style={{ color: "#475569", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                    {new Date(change.eventTime).toLocaleTimeString()}
                  </span>
                </button>
                {isExpanded && change.patchContent && (
                  <div style={{
                    borderTop: "1px solid #334155",
                    padding: 12,
                    maxHeight: 200,
                    overflowY: "auto",
                  }}>
                    <pre style={{
                      color: "#94A3B8",
                      fontSize: 11,
                      fontFamily: "'JetBrains Mono', monospace",
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                    }}>
                      {change.patchContent}
                    </pre>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

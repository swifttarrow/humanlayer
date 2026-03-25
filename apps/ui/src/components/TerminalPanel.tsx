import { useState } from "react";
import type { SessionEvent } from "@humanlayer/shared";

interface Props {
  events: SessionEvent[];
}

interface CommandEntry {
  id: string;
  command: string;
  cwd?: string;
  output?: string;
  exitCode?: number;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt?: string;
  stepId?: string;
}

function extractCommands(events: SessionEvent[]): CommandEntry[] {
  const commands: CommandEntry[] = [];
  const pendingCommands = new Map<string, CommandEntry>();

  for (const ev of events) {
    if (ev.eventType === "tool.started" && ev.payload.toolName === "run_shell") {
      const input = ev.payload.input as Record<string, unknown> | undefined;
      const entry: CommandEntry = {
        id: ev.id,
        command: (input?.command as string) ?? "unknown",
        cwd: input?.cwd as string | undefined,
        status: "running",
        startedAt: ev.eventTime,
        stepId: ev.stepId,
      };
      pendingCommands.set(ev.stepId ?? ev.id, entry);
      commands.push(entry);
    } else if (
      (ev.eventType === "tool.completed" || ev.eventType === "tool.failed") &&
      ev.payload.toolName === "run_shell"
    ) {
      const key = ev.stepId ?? ev.id;
      const pending = pendingCommands.get(key);
      if (pending) {
        pending.status = ev.eventType === "tool.completed" ? "completed" : "failed";
        pending.output = ev.payload.result as string | undefined;
        pending.exitCode = ev.payload.exitCode as number | undefined;
        pending.completedAt = ev.eventTime;
        pendingCommands.delete(key);
      }
    }
  }

  return commands;
}

export function TerminalPanel({ events }: Props) {
  const commands = extractCommands(events);
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const filtered = searchQuery
    ? commands.filter(
        (c) =>
          c.command.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.output?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : commands;

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  if (commands.length === 0) {
    return (
      <div style={{ color: "#64748B", fontSize: 13, padding: 16, textAlign: "center" }}>
        No shell commands executed yet.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder="Search commands and output..."
        style={{
          background: "#0F172A",
          border: "1px solid #334155",
          borderRadius: 6,
          padding: "8px 12px",
          color: "#fff",
          fontSize: 12,
          fontFamily: "'JetBrains Mono', monospace",
          outline: "none",
          width: "100%",
          boxSizing: "border-box",
        }}
      />

      {/* Command list */}
      {filtered.map((cmd) => {
        const isExpanded = expandedIds[cmd.id] ?? false;
        return (
          <div
            key={cmd.id}
            data-artifact-id={cmd.stepId}
            style={{
              background: "#0F172A",
              borderRadius: 6,
              overflow: "hidden",
              borderLeft: `3px solid ${
                cmd.status === "running" ? "#22D3EE"
                : cmd.status === "completed" ? "#4ADE80"
                : "#F87171"
              }`,
            }}
          >
            <button
              type="button"
              onClick={() => toggleExpand(cmd.id)}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "transparent",
                border: "none",
                padding: "8px 12px",
                cursor: "pointer",
                color: "#94A3B8",
                textAlign: "left",
              }}
            >
              <span style={{
                color: cmd.status === "running" ? "#22D3EE"
                  : cmd.status === "completed" ? "#4ADE80"
                  : "#F87171",
                fontSize: 11,
              }}>
                {cmd.status === "running" ? "→" : cmd.status === "completed" ? "$" : "!"}
              </span>
              <span style={{
                fontSize: 12,
                fontFamily: "'JetBrains Mono', monospace",
                color: "#C5D1E2",
                flex: 1,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}>
                {cmd.command}
              </span>
              {cmd.exitCode !== undefined && (
                <span style={{
                  color: cmd.exitCode === 0 ? "#4ADE80" : "#F87171",
                  fontSize: 10,
                  fontFamily: "'JetBrains Mono', monospace",
                }}>
                  exit {cmd.exitCode}
                </span>
              )}
              <span style={{ color: "#475569", fontSize: 10, fontFamily: "'JetBrains Mono', monospace" }}>
                {new Date(cmd.startedAt).toLocaleTimeString()}
              </span>
            </button>

            {isExpanded && cmd.output && (
              <div style={{
                borderTop: "1px solid #1E293B",
                padding: "8px 12px",
                maxHeight: 300,
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
                  {cmd.output}
                </pre>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

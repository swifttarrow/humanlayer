import type { SessionStatus } from "@humanlayer/shared";

const STATUS_CONFIG: Record<SessionStatus, { label: string; color: string; bg: string; dot?: string }> = {
  created:   { label: "CREATED",   color: "#94A3B8", bg: "#1E293B" },
  starting:  { label: "STARTING",  color: "#0A0F1C", bg: "#22D3EE", dot: "◐" },
  running:   { label: "RUNNING",   color: "#0A0F1C", bg: "#22D3EE", dot: "◐" },
  stopping:  { label: "STOPPING",  color: "#0A0F1C", bg: "#F59E0B", dot: "◐" },
  completed: { label: "COMPLETED", color: "#0A0F1C", bg: "#4ADE80", dot: "✓" },
  stopped:   { label: "STOPPED",   color: "#94A3B8", bg: "#334155" },
  failed:    { label: "FAILED",    color: "#fff",    bg: "#DC2626" },
  blocked:   { label: "BLOCKED",   color: "#0A0F1C", bg: "#F59E0B", dot: "⊘" },
};

interface Props {
  status: string;
}

export function StatusBadge({ status }: Props) {
  const cfg = STATUS_CONFIG[status as SessionStatus] ?? { label: status.toUpperCase(), color: "#fff", bg: "#334155" };
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        background: cfg.bg,
        color: cfg.color,
        borderRadius: 6,
        padding: "6px 12px",
        fontSize: 11,
        fontWeight: 600,
        fontFamily: "'JetBrains Mono', monospace",
        letterSpacing: 2,
      }}
    >
      {cfg.dot && <span>{cfg.dot}</span>}
      {cfg.label}
    </span>
  );
}

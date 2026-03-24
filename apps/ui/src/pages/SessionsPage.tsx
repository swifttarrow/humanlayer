import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Session } from "@humanlayer/shared";
import { api } from "../api.js";
import { StatusBadge } from "../components/StatusBadge.js";

export function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api.sessions.list();
      setSessions(res.sessions);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const interval = setInterval(() => void load(), 5000);
    return () => clearInterval(interval);
  }, [load]);

  const stats = {
    total: sessions.length,
    running: sessions.filter((s) => ["starting", "running"].includes(s.status)).length,
    completed: sessions.filter((s) => s.status === "completed").length,
    failed: sessions.filter((s) => ["failed", "stopped"].includes(s.status)).length,
  };

  return (
    <div style={{ background: "#0A0F1C", minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1E293B", padding: "20px 32px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#22D3EE", fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700 }}>{">"}_</span>
          <span style={{ color: "#fff", fontSize: 20, fontWeight: 600 }}>HumanLayer Agent</span>
        </div>
        <button
          onClick={() => navigate("/sessions/new")}
          style={{ background: "#22D3EE", color: "#0A0F1C", border: "none", borderRadius: 6, padding: "10px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, fontWeight: 600, fontSize: 14 }}
        >
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16 }}>+</span>
          New Session
        </button>
      </div>

      {/* Content */}
      <div style={{ padding: 32, display: "flex", flexDirection: "column", gap: 24 }}>
        {/* Stats */}
        <div style={{ display: "flex", gap: 16 }}>
          {[
            { label: "TOTAL SESSIONS", value: stats.total, color: "#fff" },
            { label: "RUNNING", value: stats.running, color: "#22D3EE" },
            { label: "COMPLETED", value: stats.completed, color: "#4ADE80" },
            { label: "FAILED", value: stats.failed, color: "#F87171" },
          ].map((stat) => (
            <div key={stat.label} style={{ flex: 1, background: "#1E293B", borderRadius: 8, padding: "16px 20px" }}>
              <div style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2, marginBottom: 4 }}>{stat.label}</div>
              <div style={{ color: stat.color, fontFamily: "'JetBrains Mono', monospace", fontSize: 32, fontWeight: 700 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Section label */}
        <div style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>SESSIONS</div>

        {/* Table */}
        <div style={{ background: "#1E293B", borderRadius: 12, overflow: "hidden" }}>
          {/* Header row */}
          <div style={{ background: "#0F172A", padding: "14px 20px", display: "flex" }}>
            <div style={{ width: 420, color: "#64748B", fontSize: 12, fontWeight: 600 }}>GOAL</div>
            <div style={{ width: 160, color: "#64748B", fontSize: 12, fontWeight: 600 }}>STATUS</div>
            <div style={{ width: 200, color: "#64748B", fontSize: 12, fontWeight: 600 }}>UPDATED</div>
            <div style={{ flex: 1, color: "#64748B", fontSize: 12, fontWeight: 600 }}>ACTIONS</div>
          </div>

          {loading && (
            <div style={{ padding: "24px 20px", color: "#64748B", fontFamily: "'JetBrains Mono', monospace" }}>Loading…</div>
          )}
          {error && (
            <div style={{ padding: "24px 20px", color: "#F87171" }}>{error}</div>
          )}
          {!loading && sessions.length === 0 && (
            <div style={{ padding: "24px 20px", color: "#64748B" }}>No sessions yet. Create one above.</div>
          )}

          {sessions.map((session, idx) => (
            <div
              key={session.id}
              onClick={() => navigate(`/sessions/${session.id}`)}
              style={{
                padding: "16px 20px",
                display: "flex",
                alignItems: "center",
                cursor: "pointer",
                borderBottom: idx < sessions.length - 1 ? "1px solid #0F172A" : undefined,
                transition: "background 0.1s",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = "#243045")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = "")}
            >
              <div style={{ width: 420 }}>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 500, marginBottom: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {session.goal}
                </div>
                <div style={{ color: "#64748B", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
                  {session.id.slice(0, 8)}
                </div>
              </div>
              <div style={{ width: 160 }}>
                <StatusBadge status={session.status} />
              </div>
              <div style={{ width: 200, color: "#64748B", fontSize: 13, fontFamily: "'JetBrains Mono', monospace" }}>
                {new Date(session.updatedAt).toLocaleString()}
              </div>
              <div style={{ flex: 1 }}>
                <span style={{ color: "#22D3EE", fontSize: 13 }}>View →</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

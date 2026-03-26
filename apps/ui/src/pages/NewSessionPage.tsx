import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";

export function NewSessionPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [githubRepoUrl, setGithubRepoUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async () => {
    if (!goal.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.sessions.create({
        goal: goal.trim(),
        metadata: context ? { context } : undefined,
        ...(workingDirectory.trim() ? { workingDirectory: workingDirectory.trim() } : {}),
        ...(githubRepoUrl.trim() ? { githubRepoUrl: githubRepoUrl.trim() } : {}),
      });
      navigate(`/sessions/${res.session.id}`);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: "#0A0F1C", minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif" }}>
      <div style={{ background: "#1E293B", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }}
        >
          ←
        </button>
        <span style={{ color: "#fff", fontSize: 20, fontWeight: 600 }}>New Session</span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 32px", minHeight: "calc(100vh - 60px)" }}>
        <div style={{ background: "#1E293B", borderRadius: 12, padding: 32, width: 680, display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>Create Coding Session</div>
            <div style={{ color: "#94A3B8", fontSize: 14, lineHeight: 1.5 }}>
              By default the agent uses the bind-mounted workspace from Docker Compose (typically <code style={{ color: "#94A3B8" }}>/workspace</code> on the
              host as <code style={{ color: "#94A3B8" }}>./_workspace</code>). Edits are written to files on your machine—no GitHub required.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>TASK PROMPT</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Add a README that explains how to run the app..."
              rows={6}
              style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 8,
                padding: 16,
                color: "#fff",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
                resize: "vertical",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>WORKSPACE PATH (OPTIONAL)</label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="Leave empty for default (/workspace in Docker)"
              style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>PUBLIC GITHUB REPO (OPTIONAL)</label>
            <input
              type="url"
              value={githubRepoUrl}
              onChange={(e) => setGithubRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo — requires GITHUB_TOKEN on server"
              style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
                fontSize: 14,
                fontFamily: "'JetBrains Mono', monospace",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
            <div style={{ color: "#64748B", fontSize: 12, lineHeight: 1.5 }}>
              If set, the server clones this public repository into a session folder and can push a branch after edits. Omit for local-file-only mode.
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>ADDITIONAL CONTEXT</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Optional: constraints, files to touch, etc."
              rows={3}
              style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
                fontSize: 14,
                fontFamily: "Inter, sans-serif",
                resize: "vertical",
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            />
          </div>

          {error && <div style={{ color: "#F87171", fontSize: 14 }}>{error}</div>}

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
            <button
              onClick={() => navigate("/")}
              style={{ background: "none", border: "1px solid #475569", borderRadius: 6, padding: "12px 24px", color: "#fff", cursor: "pointer", fontSize: 14 }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handleCreate()}
              disabled={!goal.trim() || submitting}
              style={{
                background: goal.trim() && !submitting ? "#22D3EE" : "#1E4060",
                color: "#0A0F1C",
                border: "none",
                borderRadius: 6,
                padding: "12px 24px",
                cursor: goal.trim() && !submitting ? "pointer" : "not-allowed",
                fontWeight: 600,
                fontSize: 14,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              {submitting ? "Creating…" : "Create Session"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

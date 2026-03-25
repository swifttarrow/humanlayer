import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api.js";
import type { ExposedSurface, RuntimeMode } from "@humanlayer/shared";

export function NewSessionPage() {
  const navigate = useNavigate();
  const [goal, setGoal] = useState("");
  const [context, setContext] = useState("");
  const [workingDirectory, setWorkingDirectory] = useState("");
  const [runtimeMode, setRuntimeMode] = useState<RuntimeMode | "">("");
  const [exposedSurfaces, setExposedSurfaces] = useState<ExposedSurface[]>([]);
  const [newSurfacePath, setNewSurfacePath] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addExposedSurface = () => {
    if (!newSurfacePath.trim()) return;
    setExposedSurfaces((prev) => [
      ...prev,
      { hostPath: newSurfacePath.trim(), mode: "read_only" as const },
    ]);
    setNewSurfacePath("");
  };

  const removeExposedSurface = (index: number) => {
    setExposedSurfaces((prev) => prev.filter((_, i) => i !== index));
  };

  const handleCreate = async () => {
    if (!goal.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.sessions.create({
        goal: goal.trim(),
        metadata: context ? { context } : undefined,
        workingDirectory: workingDirectory.trim() || undefined,
        exposedSurfaces: exposedSurfaces.length > 0 ? exposedSurfaces : undefined,
        ...(runtimeMode ? { runtimeMode: runtimeMode as RuntimeMode } : {}),
      } as Parameters<typeof api.sessions.create>[0]);
      navigate(`/sessions/${res.session.id}`);
    } catch (err) {
      setError(String(err));
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: "#0A0F1C", minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif" }}>
      {/* Header */}
      <div style={{ background: "#1E293B", padding: "20px 32px", display: "flex", alignItems: "center", gap: 12 }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", fontFamily: "'JetBrains Mono', monospace", fontSize: 18 }}
        >
          ←
        </button>
        <span style={{ color: "#fff", fontSize: 20, fontWeight: 600 }}>New Session</span>
      </div>

      {/* Form */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center", padding: "40px 32px", minHeight: "calc(100vh - 60px)" }}>
        <div style={{ background: "#1E293B", borderRadius: 12, padding: 32, width: 680, display: "flex", flexDirection: "column", gap: 28 }}>
          {/* Title */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>Create Coding Session</div>
            <div style={{ color: "#94A3B8", fontSize: 14 }}>Describe the task you want the agent to complete.</div>
          </div>

          {/* Task prompt */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>TASK PROMPT</label>
            <textarea
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. Refactor auth middleware to use JWT tokens..."
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

          {/* Additional context */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>ADDITIONAL CONTEXT</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              placeholder="Optional: relevant files, constraints, or background info..."
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

          {/* Working directory */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>WORKING DIRECTORY</label>
            <input
              type="text"
              value={workingDirectory}
              onChange={(e) => setWorkingDirectory(e.target.value)}
              placeholder="Optional: /path/to/project (absolute path)"
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

          {/* Runtime mode selector */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>RUNTIME MODE</label>
            <select
              value={runtimeMode}
              onChange={(e) => setRuntimeMode(e.target.value as RuntimeMode | "")}
              aria-label="Runtime Mode"
              style={{
                background: "#0F172A",
                border: "1px solid #1E293B",
                borderRadius: 8,
                padding: "12px 16px",
                color: "#fff",
                fontSize: 14,
                outline: "none",
                width: "100%",
                boxSizing: "border-box",
              }}
            >
              <option value="">Default (system policy)</option>
              <option value="local">Local</option>
              <option value="docker">Docker</option>
            </select>
          </div>

          {/* Exposed surfaces editor */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <label style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2 }}>EXPOSED SURFACES</label>
            {exposedSurfaces.map((surface, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#94A3B8", fontSize: 13, fontFamily: "'JetBrains Mono', monospace", flex: 1 }}>
                  {surface.hostPath} ({surface.mode})
                </span>
                <button
                  onClick={() => removeExposedSurface(i)}
                  style={{ background: "none", border: "1px solid #475569", borderRadius: 4, color: "#F87171", cursor: "pointer", padding: "4px 8px", fontSize: 12 }}
                >
                  Remove
                </button>
              </div>
            ))}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                type="text"
                value={newSurfacePath}
                onChange={(e) => setNewSurfacePath(e.target.value)}
                placeholder="/path/to/expose (read-only)"
                style={{
                  background: "#0F172A",
                  border: "1px solid #1E293B",
                  borderRadius: 8,
                  padding: "10px 14px",
                  color: "#fff",
                  fontSize: 13,
                  fontFamily: "'JetBrains Mono', monospace",
                  outline: "none",
                  flex: 1,
                  boxSizing: "border-box",
                }}
              />
              <button
                onClick={addExposedSurface}
                disabled={!newSurfacePath.trim()}
                style={{
                  background: newSurfacePath.trim() ? "#334155" : "#1E293B",
                  color: "#fff",
                  border: "none",
                  borderRadius: 6,
                  padding: "10px 14px",
                  cursor: newSurfacePath.trim() ? "pointer" : "not-allowed",
                  fontSize: 13,
                }}
              >
                Add
              </button>
            </div>
          </div>

          {error && <div style={{ color: "#F87171", fontSize: 14 }}>{error}</div>}

          {/* Buttons */}
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

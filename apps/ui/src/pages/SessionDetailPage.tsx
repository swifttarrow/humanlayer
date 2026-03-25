import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session, SessionEvent, SessionState } from "@humanlayer/shared";
import { api } from "../api.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { StructuredTrace } from "../components/StructuredTrace.js";
import { RawEventsPanel } from "../components/RawEventsPanel.js";
import { ChangesPanel } from "../components/ChangesPanel.js";
import { TerminalPanel } from "../components/TerminalPanel.js";
import { getIdleStopInfo, getSessionDisplayTitle } from "../sessionIdle.js";

export function SessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [state, setState] = useState<SessionState | null>(null);
  const [events, setEvents] = useState<SessionEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [stopping, setStopping] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [reply, setReply] = useState("");
  const [submittingReply, setSubmittingReply] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<"trace" | "changes" | "logs">("trace");
  const lastSeqRef = useRef(-1);
  const esRef = useRef<EventSource | null>(null);

  const connect = useCallback(() => {
    if (!id) return;
    esRef.current?.close();

    const es = api.stream(
      id,
      lastSeqRef.current,
      (sseEvent) => {
        if (sseEvent.type === "snapshot") {
          setSession(sseEvent.data as Session);
        } else if (sseEvent.type === "event") {
          const ev = sseEvent.data as SessionEvent;
          setEvents((prev) => {
            if (prev.some((e) => e.id === ev.id)) return prev;
            const next = [...prev, ev].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
            lastSeqRef.current = next[next.length - 1]?.sequenceNumber ?? lastSeqRef.current;
            return next;
          });
          if (
            ev.eventType === "session.completed" ||
            ev.eventType === "session.failed" ||
            ev.eventType === "session.stopped" ||
            ev.eventType === "session.blocked"
          ) {
            void api.sessions.get(id).then((res) => {
              setSession(res.session);
              if (res.state) setState(res.state);
            }).catch(() => undefined);
          }
        }
        // heartbeat: no-op
      },
      () => {
        // Reconnect on error after short delay
        setTimeout(() => connect(), 3000);
      }
    );
    esRef.current = es;
  }, [id]);

  // Initial load + SSE
  useEffect(() => {
    if (!id) return;

    api.sessions
      .get(id)
      .then((res) => {
        setSession(res.session);
        if (res.state) setState(res.state);
      })
      .catch((err: unknown) => setError(String(err)));

    connect();
    return () => esRef.current?.close();
  }, [id, connect]);

  const handleStop = async () => {
    if (!id) return;
    setStopping(true);
    try {
      const res = await api.sessions.stop(id);
      setSession(res.session);
    } catch (err) {
      setError(String(err));
    } finally {
      setStopping(false);
    }
  };

  const handleRetry = async () => {
    if (!id) return;
    setRetrying(true);
    try {
      const res = await api.sessions.retry(id);
      setSession(res.session);
      setEvents([]);
      lastSeqRef.current = -1;
      connect();
    } catch (err) {
      setError(String(err));
    } finally {
      setRetrying(false);
    }
  };

  const handleReply = async () => {
    if (!id || !reply.trim()) return;
    setSubmittingReply(true);
    setError(null);
    try {
      const metadata = session?.metadata as Record<string, unknown> | undefined;
      const workdirPolicy = metadata?.workdirPolicy as { resolvedPath?: unknown } | undefined;
      const inheritedWorkingDirectory = typeof workdirPolicy?.resolvedPath === "string"
        ? workdirPolicy.resolvedPath
        : undefined;
      const res = await api.sessions.create({
        goal: reply.trim(),
        ...(inheritedWorkingDirectory ? { workingDirectory: inheritedWorkingDirectory } : {}),
        metadata: {
          parentSessionId: id,
          followup: true,
        },
      });
      navigate(`/sessions/${res.session.id}`);
    } catch (err) {
      setError(String(err));
    } finally {
      setSubmittingReply(false);
    }
  };

  const handleDismissIdleStop = async () => {
    if (!id) return;
    try {
      const res = await api.sessions.dismissIdleStop(id);
      setSession(res.session);
    } catch (err) {
      setError(String(err));
    }
  };

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isActive = session && ["starting", "running", "stopping"].includes(session.status);
  const canRetry = session && ["stopped", "failed"].includes(session.status);
  const idleStopInfo = session ? getIdleStopInfo(session, now) : { isActive: false, inCountdown: false };

  return (
    <div style={{ background: "#0A0F1C", minHeight: "100vh", color: "#fff", fontFamily: "Inter, sans-serif", display: "flex", flexDirection: "column" }}>
      {/* Top bar */}
      <div style={{ background: "#0F172A", padding: "0 32px", height: 56, display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => navigate("/")}
          style={{ background: "none", border: "none", color: "#94A3B8", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 14 }}
        >
          ← Sessions
        </button>
        <span style={{ color: "#fff", fontSize: 16, fontWeight: 600, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {session ? getSessionDisplayTitle(session) : "Loading…"}
        </span>
        {session && <StatusBadge status={session.status} />}
        {session && idleStopInfo.isActive && (
          <span
            style={{
              background: idleStopInfo.inCountdown ? "#7F1D1D" : "#1E293B",
              color: idleStopInfo.inCountdown ? "#FCA5A5" : "#94A3B8",
              border: `1px solid ${idleStopInfo.inCountdown ? "#DC2626" : "#334155"}`,
              borderRadius: 6,
              padding: "6px 10px",
              fontSize: 11,
              fontFamily: "'JetBrains Mono', monospace",
            }}
          >
            {idleStopInfo.inCountdown
              ? `Stops in ${idleStopInfo.secondsRemaining ?? 0}s`
              : "Idle: stop warning pending"}
          </span>
        )}
        {isActive && session?.status !== "stopping" && (
          <button
            onClick={() => void handleStop()}
            disabled={stopping}
            style={{ background: "#DC2626", color: "#fff", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontWeight: 600, fontSize: 13 }}
          >
            ■ {stopping ? "Stopping…" : "Stop"}
          </button>
        )}
        {canRetry && (
          <button
            onClick={() => void handleRetry()}
            disabled={retrying}
            style={{ background: "#22D3EE", color: "#0A0F1C", border: "none", borderRadius: 6, padding: "8px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
          >
            {retrying ? "Retrying…" : "↺ Retry"}
          </button>
        )}
      </div>

      {error && (
        <div style={{ background: "#450A0A", color: "#F87171", padding: "8px 32px", fontSize: 13 }}>{error}</div>
      )}

      {/* Main body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Workspace panel */}
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", padding: "24px 32px", gap: 20, overflow: "hidden" }}>
          {/* Workspace tabs */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {(["trace", "changes", "logs"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  background: activeTab === tab ? "#1E293B" : "transparent",
                  border: activeTab === tab ? "1px solid #334155" : "1px solid transparent",
                  borderRadius: 6,
                  padding: "6px 14px",
                  color: activeTab === tab ? "#22D3EE" : "#64748B",
                  cursor: "pointer",
                  fontSize: 11,
                  fontWeight: 600,
                  letterSpacing: 1,
                  fontFamily: "'JetBrains Mono', monospace",
                  textTransform: "uppercase",
                }}
              >
                {tab}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <span style={{ color: "#475569", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              {events.length > 0 ? `${events.length} events` : "waiting…"}
            </span>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingRight: 8, display: "flex", flexDirection: "column", gap: 16 }}>
            {activeTab === "trace" && <StructuredTrace events={events} currentTool={state?.currentTool} />}
            {activeTab === "changes" && <ChangesPanel events={events} />}
            {activeTab === "logs" && <TerminalPanel events={events} />}

            <div style={{ background: "#1E293B", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Enter your coding task here..."
                rows={4}
                style={{
                  background: "#0F172A",
                  border: "1px solid #334155",
                  borderRadius: 6,
                  padding: 10,
                  color: "#fff",
                  fontSize: 13,
                  fontFamily: "Inter, sans-serif",
                  resize: "vertical",
                  outline: "none",
                  width: "100%",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                {idleStopInfo.inCountdown ? (
                  <button
                    onClick={() => void handleDismissIdleStop()}
                    style={{
                      background: "#334155",
                      color: "#E2E8F0",
                      border: "none",
                      borderRadius: 6,
                      padding: "10px 12px",
                      cursor: "pointer",
                      fontWeight: 600,
                      fontSize: 12,
                    }}
                  >
                    Keep Session Open
                  </button>
                ) : <span />}
                <button
                  onClick={() => void handleReply()}
                  disabled={!reply.trim() || submittingReply}
                  style={{
                    background: reply.trim() && !submittingReply ? "#22D3EE" : "#1E4060",
                    color: "#0A0F1C",
                    border: "none",
                    borderRadius: 6,
                    padding: "10px 12px",
                    cursor: reply.trim() && !submittingReply ? "pointer" : "not-allowed",
                    fontWeight: 600,
                    fontSize: 13,
                  }}
                >
                  {submittingReply ? "Sending…" : "Submit"}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div style={{ width: 340, background: "#0F172A", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Session info */}
          <div style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2, fontFamily: "'JetBrains Mono', monospace" }}>SESSION INFO</div>
          {session && (
            <div style={{ background: "#1E293B", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              {[
                ["ID", session.id.slice(0, 12) + "…"],
                ["Status", session.status],
                ["Agent", session.agentType],
                ["Created", new Date(session.createdAt).toLocaleTimeString()],
                ["Updated", new Date(session.updatedAt).toLocaleTimeString()],
                ...(() => {
                  const meta = session.metadata as Record<string, unknown> | undefined;
                  const sel = meta?.selection as Record<string, string> | undefined;
                  const wd = meta?.workdirDetails as Record<string, string> | undefined;
                  const rows: string[][] = [];
                  if (sel?.runtimeMode) rows.push(["Runtime", sel.runtimeMode]);
                  if (sel?.provider) rows.push(["Provider", sel.provider]);
                  if (sel?.model) rows.push(["Model", sel.model]);
                  if (wd?.enteredPath) rows.push(["Workdir", wd.enteredPath]);
                  if (wd?.canonicalPath && wd.canonicalPath !== wd.enteredPath) rows.push(["Canonical", wd.canonicalPath]);
                  return rows;
                })(),
                ...(idleStopInfo.inCountdown ? [["Auto-stop", `${idleStopInfo.secondsRemaining ?? 0}s`]] : []),
                ...(state?.lastHeartbeatAt ? [["Heartbeat", new Date(state.lastHeartbeatAt).toLocaleTimeString()]] : []),
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ color: "#64748B", fontSize: 12 }}>{k}</span>
                  <span style={{ color: "#94A3B8", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ background: "#0F172A", height: 1 }} />

          {/* Raw events */}
          <RawEventsPanel events={events} />
        </div>
      </div>
    </div>
  );
}

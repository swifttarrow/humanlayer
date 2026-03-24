import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { Session, SessionEvent, SessionState } from "@humanlayer/shared";
import { api } from "../api.js";
import { StatusBadge } from "../components/StatusBadge.js";
import { StructuredTrace } from "../components/StructuredTrace.js";
import { RawEventsPanel } from "../components/RawEventsPanel.js";

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
      const followupGoal = `Follow-up on session ${id}:\n\n${reply.trim()}`;
      const metadata = session?.metadata as Record<string, unknown> | undefined;
      const workdirPolicy = metadata?.workdirPolicy as { resolvedPath?: unknown } | undefined;
      const inheritedWorkingDirectory = typeof workdirPolicy?.resolvedPath === "string"
        ? workdirPolicy.resolvedPath
        : undefined;
      const res = await api.sessions.create({
        goal: followupGoal,
        ...(inheritedWorkingDirectory ? { workingDirectory: inheritedWorkingDirectory } : {}),
        metadata: {
          parentSessionId: id,
          followup: true,
        },
      });
      navigate(`/sessions/${res.session.id}`);
    } catch (err) {
      setError(String(err));
      setSubmittingReply(false);
    }
  };

  const isActive = session && ["starting", "running", "stopping"].includes(session.status);
  const canRetry = session && ["stopped", "failed"].includes(session.status);

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
          {session?.goal ?? "Loading…"}
        </span>
        {session && <StatusBadge status={session.status} />}
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
        {/* Trace panel */}
        <div style={{ flex: 1, overflowY: "auto", padding: "24px 32px", display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2, fontFamily: "'JetBrains Mono', monospace" }}>EXECUTION TRACE</span>
            <div style={{ flex: 1, height: 1 }} />
            <span style={{ color: "#475569", fontSize: 12, fontFamily: "'JetBrains Mono', monospace" }}>
              {events.length > 0 ? `${events.length} events` : "waiting…"}
            </span>
          </div>
          <StructuredTrace events={events} currentTool={state?.currentTool} />
        </div>

        {/* Side panel */}
        <div style={{ width: 340, background: "#0F172A", overflowY: "auto", padding: 24, display: "flex", flexDirection: "column", gap: 20 }}>
          {/* Reply composer */}
          <div style={{ color: "#64748B", fontSize: 11, fontWeight: 600, letterSpacing: 2, fontFamily: "'JetBrains Mono', monospace" }}>
            RESPOND
          </div>
          <div style={{ background: "#1E293B", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Send a follow-up instruction..."
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
              {submittingReply ? "Sending…" : "Send Follow-up"}
            </button>
          </div>

          <div style={{ background: "#0F172A", height: 1 }} />

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

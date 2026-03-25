import { Router } from "express";
import { prisma } from "../db.js";
import type { SSESessionEvent } from "@humanlayer/shared";

export const streamRouter = Router({ mergeParams: true });

// In-memory SSE subscriber registry
// sessionId -> Set of response writers
const subscribers = new Map<string, Set<(data: SSESessionEvent) => void>>();

export function publishToSession(sessionId: string, event: SSESessionEvent) {
  const subs = subscribers.get(sessionId);
  if (!subs) return;
  for (const send of subs) {
    try {
      send(event);
    } catch {
      // subscriber disconnected
    }
  }
}

/**
 * GET /sessions/:sessionId/stream
 * SSE stream: sends initial snapshot, then replays missed events since
 * client's last sequence (via ?since=N), then live-tails new events.
 */
streamRouter.get(
  "/",
  async (req: import("express").Request<{ sessionId: string }>, res) => {
    const { sessionId } = req.params;
    const since = req.query["since"] ? parseInt(req.query["since"] as string, 10) : -1;

    // Validate session exists
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { state: true },
    });

    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }

    // SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    function write(event: SSESessionEvent) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    // 1. Send initial snapshot
    write({ type: "snapshot", data: toSessionDto(session) as import("@humanlayer/shared").Session });

    // 2. Replay events. Fresh clients pass since=-1 and should receive full history.
    const missed = await prisma.sessionEvent.findMany({
      where: {
        sessionId,
        ...(since >= 0 ? { sequenceNumber: { gt: since } } : {}),
      },
      orderBy: { sequenceNumber: "asc" },
    });
    for (const ev of missed) {
      write({ type: "event", data: toEventDto(ev) as import("@humanlayer/shared").SessionEvent });
    }

    // 3. Subscribe to live events
    if (!subscribers.has(sessionId)) {
      subscribers.set(sessionId, new Set());
    }
    const subs = subscribers.get(sessionId)!;
    subs.add(write);

    // Keepalive ping every 25s
    const pingInterval = setInterval(() => {
      write({ type: "heartbeat", data: { ts: new Date().toISOString() } });
    }, 25_000);

    // Cleanup on disconnect
    req.on("close", () => {
      clearInterval(pingInterval);
      subs.delete(write);
      if (subs.size === 0) subscribers.delete(sessionId);
    });
  }
);

function toSessionDto(s: {
  id: string;
  status: string;
  goal: string;
  agentType: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  errorSummary: string | null;
  metadata: unknown;
}) {
  return {
    id: s.id,
    status: s.status,
    goal: s.goal,
    agentType: s.agentType,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    startedAt: s.startedAt?.toISOString(),
    endedAt: s.endedAt?.toISOString(),
    errorSummary: s.errorSummary ?? undefined,
    metadata: (s.metadata as Record<string, unknown>) ?? undefined,
  };
}

function toEventDto(e: {
  id: string;
  sessionId: string;
  attemptId: string;
  sequenceNumber: number;
  eventType: string;
  eventTime: Date;
  actorType: string;
  actorId: string | null;
  stepId: string | null;
  parentEventId: string | null;
  correlationId: string | null;
  payload: unknown;
  isTerminal: boolean;
  visibility: string;
  schemaVersion: string;
}) {
  return {
    id: e.id,
    sessionId: e.sessionId,
    attemptId: e.attemptId,
    sequenceNumber: e.sequenceNumber,
    eventType: e.eventType,
    eventTime: e.eventTime.toISOString(),
    actorType: e.actorType,
    actorId: e.actorId ?? undefined,
    stepId: e.stepId ?? undefined,
    parentEventId: e.parentEventId ?? undefined,
    correlationId: e.correlationId ?? undefined,
    payload: (e.payload as Record<string, unknown>) ?? {},
    isTerminal: e.isTerminal,
    visibility: e.visibility,
    schemaVersion: e.schemaVersion,
  };
}

import { Router } from "express";
import { z } from "zod";
import { WorkdirValidationError } from "../services/workdirPolicyService.js";
import {
  createSession,
  listSessions,
  getSession,
  stopSession,
  retrySession,
} from "../services/sessionService.js";

export const sessionsRouter = Router();

const ExposedSurfaceSchema = z.object({
  hostPath: z.string().min(1),
  mode: z.enum(["read_only", "read_write"]),
  label: z.string().optional(),
});

const CreateSessionSchema = z.object({
  goal: z.string().min(1),
  agentType: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
  workingDirectory: z.string().optional(),
  exposedSurfaces: z.array(ExposedSurfaceSchema).optional(),
});

const StopSessionSchema = z.object({
  reason: z.string().optional(),
});

const SESSIONS_STREAM_INTERVAL_MS = parseInt(
  process.env.SESSIONS_STREAM_INTERVAL_MS ?? "2000",
  10
);

// GET /sessions/stream
// SSE stream for list view: emits full session snapshots when changed.
sessionsRouter.get("/stream", async (_req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  let closed = false;
  let lastSnapshotHash = "";

  async function pushSnapshotIfChanged(force = false) {
    if (closed) return;
    const result = await listSessions();
    const hash = JSON.stringify(
      result.sessions.map((s) => ({
        id: s.id,
        status: s.status,
        updatedAt: s.updatedAt,
        endedAt: s.endedAt,
      }))
    );
    if (!force && hash === lastSnapshotHash) return;
    lastSnapshotHash = hash;
    res.write(
      `data: ${JSON.stringify({
        type: "snapshot",
        data: result.sessions,
      })}\n\n`
    );
  }

  try {
    await pushSnapshotIfChanged(true);
  } catch (err) {
    res.write(
      `data: ${JSON.stringify({
        type: "error",
        data: { message: String(err) },
      })}\n\n`
    );
  }

  const interval = setInterval(() => {
    void pushSnapshotIfChanged().catch((err: unknown) => {
      if (closed) return;
      res.write(
        `data: ${JSON.stringify({
          type: "error",
          data: { message: String(err) },
        })}\n\n`
      );
    });
  }, SESSIONS_STREAM_INTERVAL_MS);

  _req.on("close", () => {
    closed = true;
    clearInterval(interval);
  });
});

// POST /sessions
sessionsRouter.post("/", async (req, res) => {
  const parsed = CreateSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await createSession(parsed.data);
    res.status(201).json({ session });
  } catch (err) {
    if (err instanceof WorkdirValidationError) {
      res.status(422).json({
        error: err.message,
        code: err.code,
        path: err.path,
      });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
});

// GET /sessions
sessionsRouter.get("/", async (_req, res) => {
  try {
    const result = await listSessions();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /sessions/:id
sessionsRouter.get("/:id", async (req, res) => {
  try {
    const result = await getSession(req.params.id);
    if (!result) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /sessions/:id/stop
sessionsRouter.post("/:id/stop", async (req, res) => {
  const parsed = StopSessionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const session = await stopSession(req.params.id, parsed.data.reason);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /sessions/:id/retry
sessionsRouter.post("/:id/retry", async (req, res) => {
  try {
    const session = await retrySession(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Session not found" });
      return;
    }
    res.json({ session });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.startsWith("Cannot retry")) {
      res.status(409).json({ error: err.message });
      return;
    }
    res.status(500).json({ error: String(err) });
  }
});

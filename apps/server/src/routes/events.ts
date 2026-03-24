import { Router } from "express";
import { z } from "zod";
import { ingestEvents } from "../services/eventIngestService.js";

export const eventsRouter = Router({ mergeParams: true });

const EventSchema = z.object({
  id: z.string().uuid(),
  attemptId: z.string().uuid(),
  sequenceNumber: z.number().int().positive(),
  eventType: z.string(),
  eventTime: z.string(),
  actorType: z.enum(["user", "agent", "tool", "system"]),
  actorId: z.string().optional(),
  stepId: z.string().optional(),
  parentEventId: z.string().optional(),
  correlationId: z.string().optional(),
  payload: z.record(z.unknown()).default({}),
  isTerminal: z.boolean().default(false),
  visibility: z
    .enum(["user_visible", "internal", "debug_only"])
    .default("user_visible"),
  schemaVersion: z.string().default("1.0"),
});

const IngestBodySchema = z.object({
  attemptId: z.string().uuid(),
  events: z.array(EventSchema).min(1).max(100),
});

// POST /sessions/:sessionId/events
eventsRouter.post("/", async (req: import("express").Request<{ sessionId: string }>, res) => {
  const { sessionId } = req.params;
  const parsed = IngestBodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }

  const { attemptId, events } = parsed.data;

  try {
    const result = await ingestEvents(sessionId, attemptId, events as Parameters<typeof ingestEvents>[2]);
    res.json(result);
  } catch (err: unknown) {
    const msg = String(err);
    if (
      msg.includes("not found") ||
      msg.includes("not active") ||
      msg.includes("lease has expired") ||
      msg.includes("does not belong")
    ) {
      res.status(409).json({ error: msg });
      return;
    }
    res.status(500).json({ error: msg });
  }
});

// GET /sessions/:sessionId/events
eventsRouter.get("/", async (req: import("express").Request<{ sessionId: string }>, res) => {
  const { sessionId } = req.params;
  const { since } = req.query;

  try {
    const { prisma } = await import("../db.js");
    const events = await prisma.sessionEvent.findMany({
      where: {
        sessionId,
        ...(since ? { sequenceNumber: { gt: parseInt(since as string, 10) } } : {}),
      },
      orderBy: { sequenceNumber: "asc" },
    });
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

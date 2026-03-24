import { Router } from "express";
import { z } from "zod";
import { claimNextSession, renewLease } from "../services/leaseService.js";

export const agentsRouter = Router();

const HeartbeatSchema = z.object({
  attemptId: z.string().uuid(),
  sessionId: z.string().uuid(),
});

// POST /agents/:agentId/pull
// Atomically claims one runnable session and returns attempt ownership.
agentsRouter.post("/:agentId/pull", async (req, res) => {
  const { agentId } = req.params;
  try {
    const result = await claimNextSession(agentId);
    if (!result) {
      res.status(204).send();
      return;
    }
    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /agents/:agentId/heartbeat
// Renews lease; also surfaces stop intent from session status.
agentsRouter.post("/:agentId/heartbeat", async (req, res) => {
  const parsed = HeartbeatSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const { agentId } = req.params;
  try {
    const result = await renewLease(parsed.data.attemptId, agentId);
    if (!result) {
      res.status(409).json({ error: "Attempt not found, not owned by this agent, or lease expired" });
      return;
    }
    res.json({
      leaseExpiresAt: result.attempt.leaseExpiresAt.toISOString(),
      stopRequested: result.stopRequested,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

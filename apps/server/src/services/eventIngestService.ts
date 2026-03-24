import type { PrismaClient, Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../db.js";
import type { SessionEvent, SessionEventType, SessionStatus } from "@humanlayer/shared";
import { publishToSession } from "../routes/stream.js";

export interface IngestResult {
  accepted: number;
  duplicates: number;
}

export async function ingestEvents(
  sessionId: string,
  attemptId: string,
  events: Omit<SessionEvent, "sessionId">[],
  db: PrismaClient = defaultPrisma
): Promise<IngestResult> {
  return db.$transaction(async (tx) => {
    // Validate attempt ownership and lease
    const attempt = await tx.sessionAttempt.findUnique({
      where: { id: attemptId },
      include: { session: true },
    });

    if (!attempt) {
      throw new Error(`Attempt ${attemptId} not found`);
    }
    if (attempt.sessionId !== sessionId) {
      throw new Error(`Attempt ${attemptId} does not belong to session ${sessionId}`);
    }
    if (!["claimed", "running"].includes(attempt.status)) {
      throw new Error(`Attempt ${attemptId} is not active (status: ${attempt.status})`);
    }
    if (attempt.leaseExpiresAt < new Date()) {
      throw new Error(`Attempt ${attemptId} lease has expired`);
    }

    let accepted = 0;
    let duplicates = 0;

    // Get existing sequence numbers for dedupe
    const existing = await tx.sessionEvent.findMany({
      where: { sessionId, attemptId },
      select: { sequenceNumber: true },
    });
    const existingSeqs = new Set(existing.map((e) => e.sequenceNumber));

    // Sort events by sequence number
    const sorted = [...events].sort((a, b) => a.sequenceNumber - b.sequenceNumber);

    for (const event of sorted) {
      if (existingSeqs.has(event.sequenceNumber)) {
        duplicates++;
        continue;
      }

      await tx.sessionEvent.create({
        data: {
          id: event.id,
          sessionId,
          attemptId,
          sequenceNumber: event.sequenceNumber,
          eventType: event.eventType,
          eventTime: new Date(event.eventTime),
          actorType: event.actorType,
          actorId: event.actorId ?? null,
          stepId: event.stepId ?? null,
          parentEventId: event.parentEventId ?? null,
          correlationId: event.correlationId ?? null,
          payload: (event.payload ?? {}) as Prisma.InputJsonValue,
          isTerminal: event.isTerminal,
          visibility: event.visibility,
          schemaVersion: event.schemaVersion,
        },
      });

      existingSeqs.add(event.sequenceNumber);
      accepted++;

      // Update derived state based on terminal/significant events
      await updateDerivedState(tx, sessionId, attemptId, event);

      // Fan out to SSE subscribers (best-effort, outside transaction boundary)
      publishToSession(sessionId, { type: "event", data: { ...event, sessionId } });
    }

    return { accepted, duplicates };
  }) as Promise<IngestResult>;
}

async function updateDerivedState(
  tx: Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">,
  sessionId: string,
  attemptId: string,
  event: Omit<SessionEvent, "id" | "sessionId">
) {
  const eventType = event.eventType as SessionEventType;
  const payload = event.payload;

  const stateUpdate: {
    status?: string;
    currentStep?: string | null;
    currentTool?: string | null;
    lastAssistantMessage?: string;
    lastHeartbeatAt?: Date;
  } = {};

  switch (eventType) {
    case "session.started":
      stateUpdate.status = "running";
      break;
    case "step.started":
      stateUpdate.currentStep = `Step ${payload.stepNumber as number}`;
      stateUpdate.currentTool = null;
      break;
    case "step.completed":
      stateUpdate.currentStep = null;
      stateUpdate.currentTool = null;
      break;
    case "tool.started":
      stateUpdate.currentTool = payload.toolName as string;
      break;
    case "tool.completed":
    case "tool.failed":
      stateUpdate.currentTool = null;
      break;
    case "message.completed":
      stateUpdate.lastAssistantMessage = (payload.text as string)?.slice(0, 500);
      break;
    case "heartbeat":
      stateUpdate.lastHeartbeatAt = new Date();
      break;
    case "session.completed": {
      stateUpdate.status = "completed";
      stateUpdate.currentStep = null;
      stateUpdate.currentTool = null;
      // Also update attempt and session
      await tx.sessionAttempt.update({
        where: { id: attemptId },
        data: { status: "completed", endedAt: new Date() },
      });
      await tx.session.update({
        where: { id: sessionId },
        data: { status: "completed" as SessionStatus, endedAt: new Date() },
      });
      break;
    }
    case "session.failed": {
      stateUpdate.status = "failed";
      stateUpdate.currentStep = null;
      stateUpdate.currentTool = null;
      await tx.sessionAttempt.update({
        where: { id: attemptId },
        data: { status: "failed", endedAt: new Date() },
      });
      await tx.session.update({
        where: { id: sessionId },
        data: {
          status: "failed" as SessionStatus,
          endedAt: new Date(),
          errorSummary: (payload.error as string)?.slice(0, 500),
        },
      });
      break;
    }
    case "session.stopped": {
      stateUpdate.status = "stopped";
      stateUpdate.currentStep = null;
      stateUpdate.currentTool = null;
      await tx.sessionAttempt.update({
        where: { id: attemptId },
        data: { status: "completed", endedAt: new Date() },
      });
      await tx.session.update({
        where: { id: sessionId },
        data: { status: "stopped" as SessionStatus, endedAt: new Date() },
      });
      break;
    }
  }

  if (Object.keys(stateUpdate).length > 0) {
    await tx.sessionState.upsert({
      where: { sessionId },
      create: { sessionId, status: stateUpdate.status ?? "running", ...stateUpdate },
      update: stateUpdate,
    });
  }
}

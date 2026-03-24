import { randomUUID } from "crypto";
import type { SessionEvent, SessionEventType } from "@humanlayer/shared";
import { ingestEvents } from "../api.js";

export interface EmitterContext {
  sessionId: string;
  attemptId: string;
}

export class EventEmitter {
  private sequenceNumber = 0;
  private buffer: Omit<SessionEvent, "sessionId">[] = [];

  constructor(private ctx: EmitterContext) {}

  emit(
    eventType: SessionEventType,
    payload: Record<string, unknown>,
    opts: {
      actorType?: SessionEvent["actorType"];
      stepId?: string;
      parentEventId?: string;
      correlationId?: string;
      isTerminal?: boolean;
      visibility?: SessionEvent["visibility"];
    } = {}
  ): string {
    const eventId = randomUUID();
    this.buffer.push({
      id: eventId,  // agent-generated ID used for server-side dedupe
      attemptId: this.ctx.attemptId,
      sequenceNumber: ++this.sequenceNumber,
      eventType,
      eventTime: new Date().toISOString(),
      actorType: opts.actorType ?? "agent",
      actorId: opts.actorType === "tool" ? payload.toolName as string : undefined,
      stepId: opts.stepId,
      parentEventId: opts.parentEventId,
      correlationId: opts.correlationId,
      payload,
      isTerminal: opts.isTerminal ?? false,
      visibility: opts.visibility ?? "user_visible",
      schemaVersion: "1.0",
    });
    return eventId;
  }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const toSend = [...this.buffer];
    this.buffer = [];
    await ingestEvents(this.ctx.sessionId, this.ctx.attemptId, toSend);
  }
}

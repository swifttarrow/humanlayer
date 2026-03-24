import { describe, it, expect, vi, beforeEach } from "vitest";
import { ingestEvents } from "../services/eventIngestService.js";
import type { SessionEvent } from "@humanlayer/shared";

function makeEvent(overrides: Partial<Omit<SessionEvent, "sessionId">> = {}): Omit<SessionEvent, "sessionId"> {
  return {
    id: "evt-" + Math.random().toString(36).slice(2),
    attemptId: "att-1",
    sequenceNumber: 1,
    eventType: "step.started",
    eventTime: new Date().toISOString(),
    actorType: "agent",
    payload: { stepNumber: 1 },
    isTerminal: false,
    visibility: "user_visible",
    schemaVersion: "1.0",
    ...overrides,
  };
}

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    sessionId: "sess-1",
    agentId: "agent-1",
    status: "running",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    stopRequestedAt: null,
    startedAt: new Date(),
    endedAt: null,
    stopReason: null,
    session: { id: "sess-1", status: "running" },
    ...overrides,
  };
}

function makeDb(attempt: ReturnType<typeof makeAttempt>, existingEvents: { sequenceNumber: number }[] = []) {
  const createdEvents: unknown[] = [];
  const tx = {
    sessionAttempt: {
      findUnique: vi.fn().mockResolvedValue(attempt),
      update: vi.fn().mockResolvedValue({}),
    },
    session: {
      update: vi.fn().mockResolvedValue({}),
    },
    sessionEvent: {
      findMany: vi.fn().mockResolvedValue(existingEvents),
      create: vi.fn().mockImplementation((args: unknown) => {
        createdEvents.push(args);
        return Promise.resolve(args);
      }),
    },
    sessionState: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    _createdEvents: createdEvents,
  };

  return {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    _tx: tx,
  } as unknown as import("@prisma/client").PrismaClient & { _tx: typeof tx };
}

describe("ingestEvents", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts a valid event batch", async () => {
    const db = makeDb(makeAttempt());
    const result = await ingestEvents("sess-1", "att-1", [makeEvent()], db);
    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(0);
  });

  it("deduplicates events with the same sequenceNumber", async () => {
    const db = makeDb(makeAttempt(), [{ sequenceNumber: 1 }]);
    const result = await ingestEvents("sess-1", "att-1", [makeEvent({ sequenceNumber: 1 })], db);
    expect(result.accepted).toBe(0);
    expect(result.duplicates).toBe(1);
  });

  it("partially deduplicates a mixed batch", async () => {
    const db = makeDb(makeAttempt(), [{ sequenceNumber: 1 }]);
    const events = [
      makeEvent({ sequenceNumber: 1 }), // duplicate
      makeEvent({ id: "evt-new", sequenceNumber: 2 }), // new
    ];
    const result = await ingestEvents("sess-1", "att-1", events, db);
    expect(result.accepted).toBe(1);
    expect(result.duplicates).toBe(1);
  });

  it("rejects events from a stale (expired) attempt", async () => {
    const db = makeDb(makeAttempt({ leaseExpiresAt: new Date(Date.now() - 1000) }));
    await expect(ingestEvents("sess-1", "att-1", [makeEvent()], db)).rejects.toThrow(
      "lease has expired"
    );
  });

  it("rejects events from a non-active attempt", async () => {
    const db = makeDb(makeAttempt({ status: "stalled" }));
    await expect(ingestEvents("sess-1", "att-1", [makeEvent()], db)).rejects.toThrow(
      "not active"
    );
  });

  it("rejects events with wrong sessionId", async () => {
    const db = makeDb(makeAttempt({ sessionId: "other-sess" }));
    await expect(ingestEvents("sess-1", "att-1", [makeEvent()], db)).rejects.toThrow(
      "does not belong"
    );
  });

  it("rejects events when attempt not found", async () => {
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
        fn({ sessionAttempt: { findUnique: vi.fn().mockResolvedValue(null) } })
      ),
    } as unknown as import("@prisma/client").PrismaClient;
    await expect(ingestEvents("sess-1", "att-1", [makeEvent()], db)).rejects.toThrow("not found");
  });

  it("updates derived state for session.completed event", async () => {
    const db = makeDb(makeAttempt());
    const tx = (db as unknown as { _tx: ReturnType<typeof makeDb>["_tx"] })._tx;
    await ingestEvents(
      "sess-1",
      "att-1",
      [makeEvent({ eventType: "session.completed", isTerminal: true, payload: { summary: "done", stepCount: 3 } })],
      db
    );
    expect(tx.session.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "completed" }) })
    );
  });
});

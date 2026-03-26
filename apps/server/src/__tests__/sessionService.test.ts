import { describe, it, expect, vi } from "vitest";
import { createSession, stopSession, retrySession, getSession } from "../services/sessionService.js";

// ---- helpers to build mock DB ----

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    status: "created",
    goal: "test goal",
    agentType: "default",
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    endedAt: null,
    errorSummary: null,
    metadata: null,
    state: null,
    attempts: [],
    ...overrides,
  };
}

function makeTx(overrides: Record<string, unknown> = {}) {
  const session = makeSession();
  return {
    session: {
      create: vi.fn().mockResolvedValue(session),
      findMany: vi.fn().mockResolvedValue([session]),
      findUnique: vi.fn().mockResolvedValue(session),
      update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({ ...session, ...data })
      ),
    },
    sessionState: {
      create: vi.fn().mockResolvedValue({}),
      upsert: vi.fn().mockResolvedValue({}),
    },
    sessionAttempt: {
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      count: vi.fn().mockResolvedValue(1),
    },
    ...overrides,
  };
}

function makeDb(tx: ReturnType<typeof makeTx>) {
  return {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
  } as unknown as import("@prisma/client").PrismaClient;
}

// ---- tests ----

describe("createSession", () => {
  it("creates a session in 'created' status", async () => {
    const tx = makeTx();
    const db = makeDb(tx);

    const result = await createSession({ goal: "test goal" }, db);

    expect(tx.session.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "created", goal: "test goal" }) })
    );
    expect(tx.sessionState.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: "created" }) })
    );
    expect(result.status).toBe("created");
  });

  it("inherits workdirPolicy from parent session on follow-up when not provided", async () => {
    const tx = makeTx();
    const db = {
      session: {
        findUnique: vi.fn().mockResolvedValue({
          metadata: {
            workdirPolicy: {
              inputPath: "/repo",
              resolvedPath: "/repo",
              runtimeMode: "local",
            },
          },
        }),
      },
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    await createSession(
      {
        goal: "followup",
        metadata: {
          parentSessionId: "sess-parent",
          followup: true,
        },
      },
      db
    );

    expect(tx.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: expect.objectContaining({
            parentSessionId: "sess-parent",
            followup: true,
            workdirPolicy: expect.objectContaining({
              resolvedPath: "/repo",
            }),
          }),
        }),
      })
    );
  });
});

describe("stopSession", () => {
  it("transitions a running session to stopping", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(makeSession({ status: "running" })),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...makeSession({ status: "running" }), ...data })
        ),
      },
    });
    const db = makeDb(tx);

    const result = await stopSession("sess-1", undefined, db);
    expect(result?.status).toBe("stopping");
    expect(tx.sessionAttempt.updateMany).toHaveBeenCalled();
  });

  it("is idempotent when session is already stopping", async () => {
    const stoppingSess = makeSession({ status: "stopping" });
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(stoppingSess),
        update: vi.fn(),
      },
    });
    const db = makeDb(tx);

    const result = await stopSession("sess-1", undefined, db);
    expect(result?.status).toBe("stopping");
    // Should NOT call update on the session again
    expect(tx.session.update).not.toHaveBeenCalled();
  });

  it("is a no-op for already-completed sessions", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(makeSession({ status: "completed" })),
        update: vi.fn(),
      },
    });
    const db = makeDb(tx);

    const result = await stopSession("sess-1", undefined, db);
    expect(result?.status).toBe("completed");
    expect(tx.session.update).not.toHaveBeenCalled();
  });

  it("returns null for missing session", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });
    const db = makeDb(tx);

    const result = await stopSession("missing", undefined, db);
    expect(result).toBeNull();
  });

  it("stops immediately when there is no active attempt", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(makeSession({ status: "running" })),
        update: vi.fn().mockResolvedValue(makeSession({ status: "stopped", endedAt: new Date() })),
      },
      sessionAttempt: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(0),
      },
    });
    const db = makeDb(tx);

    const result = await stopSession("sess-1", undefined, db);
    expect(result?.status).toBe("stopped");
  });
});

describe("retrySession", () => {
  it("resets a stopped session to created", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(makeSession({ status: "stopped" })),
        update: vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
          Promise.resolve({ ...makeSession({ status: "stopped" }), ...data })
        ),
      },
    });
    const db = makeDb(tx);

    const result = await retrySession("sess-1", db);
    expect(result?.status).toBe("created");
    expect(tx.sessionAttempt.updateMany).toHaveBeenCalled();
  });

  it("rejects retry from a running session", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(makeSession({ status: "running" })),
        update: vi.fn(),
      },
    });
    const db = makeDb(tx);

    await expect(retrySession("sess-1", db)).rejects.toThrow("Cannot retry");
  });

  it("returns null for missing session", async () => {
    const tx = makeTx({
      session: {
        findUnique: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
      },
    });
    const db = makeDb(tx);

    const result = await retrySession("missing", db);
    expect(result).toBeNull();
  });
});

describe("getSession", () => {
  it("returns null for unknown sessions", async () => {
    const db = {
      session: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await getSession("unknown", db);
    expect(result).toBeNull();
  });

  it("returns session with state and no active attempt", async () => {
    const sess = {
      ...makeSession(),
      state: {
        sessionId: "sess-1",
        status: "created",
        currentStep: null,
        currentTool: null,
        lastHeartbeatAt: null,
        lastAssistantMessage: null,
        updatedAt: new Date(),
      },
      attempts: [],
    };
    const db = {
      session: {
        findUnique: vi.fn().mockResolvedValue(sess),
      },
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await getSession("sess-1", db);
    expect(result?.session.id).toBe("sess-1");
    expect(result?.state?.status).toBe("created");
    expect(result?.activeAttempt).toBeUndefined();
  });
});

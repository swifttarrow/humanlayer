import { describe, it, expect, vi } from "vitest";
import { claimNextSession, renewLease } from "../services/leaseService.js";

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess-1",
    status: "created",
    goal: "test",
    agentType: "default",
    createdAt: new Date(),
    updatedAt: new Date(),
    startedAt: null,
    endedAt: null,
    errorSummary: null,
    metadata: null,
    ...overrides,
  };
}

function makeAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    sessionId: "sess-1",
    agentId: "agent-1",
    status: "claimed",
    leaseExpiresAt: new Date(Date.now() + 60_000),
    stopRequestedAt: null,
    startedAt: new Date(),
    endedAt: null,
    stopReason: null,
    ...overrides,
  };
}

// ---- claimNextSession ----

describe("claimNextSession", () => {
  it("returns null when no sessions available", async () => {
    const tx = {
      session: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await claimNextSession("agent-1", db);
    expect(result).toBeNull();
  });

  it("atomically creates an attempt and transitions session to starting", async () => {
    const session = makeSession();
    const attempt = makeAttempt();
    const tx = {
      session: {
        findFirst: vi.fn().mockResolvedValue(session),
        update: vi.fn().mockResolvedValue({ ...session, status: "starting" }),
      },
      sessionAttempt: {
        create: vi.fn().mockResolvedValue(attempt),
      },
      sessionState: {
        upsert: vi.fn().mockResolvedValue({}),
      },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await claimNextSession("agent-1", db);
    expect(result).not.toBeNull();
    expect(result!.session.status).toBe("starting");
    expect(tx.sessionAttempt.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ agentId: "agent-1", status: "claimed" }) })
    );
  });
});

// ---- renewLease ----

describe("renewLease", () => {
  it("returns null for non-existent attempt", async () => {
    const tx = {
      sessionAttempt: { findUnique: vi.fn().mockResolvedValue(null) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await renewLease("att-x", "agent-1", db);
    expect(result).toBeNull();
  });

  it("returns null when agent doesn't own the attempt", async () => {
    const attempt = { ...makeAttempt({ agentId: "other-agent" }), session: makeSession({ status: "running" }) };
    const tx = {
      sessionAttempt: { findUnique: vi.fn().mockResolvedValue(attempt) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await renewLease("att-1", "agent-1", db);
    expect(result).toBeNull();
  });

  it("returns null for expired lease", async () => {
    const attempt = {
      ...makeAttempt({ leaseExpiresAt: new Date(Date.now() - 1000) }),
      session: makeSession({ status: "running" }),
    };
    const tx = {
      sessionAttempt: { findUnique: vi.fn().mockResolvedValue(attempt) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await renewLease("att-1", "agent-1", db);
    expect(result).toBeNull();
  });

  it("renews lease and surfaces stop intent", async () => {
    const attempt = {
      ...makeAttempt(),
      session: makeSession({ status: "stopping" }),
    };
    const updatedAttempt = makeAttempt({ status: "running" });
    const tx = {
      sessionAttempt: {
        findUnique: vi.fn().mockResolvedValue(attempt),
        update: vi.fn().mockResolvedValue(updatedAttempt),
      },
      session: { update: vi.fn().mockResolvedValue({}) },
      sessionState: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await renewLease("att-1", "agent-1", db);
    expect(result).not.toBeNull();
    expect(result!.stopRequested).toBe(true);
  });

  it("renews lease for a valid owned attempt", async () => {
    const attempt = {
      ...makeAttempt(),
      session: makeSession({ status: "running" }),
    };
    const updatedAttempt = makeAttempt({ status: "running" });
    const tx = {
      sessionAttempt: {
        findUnique: vi.fn().mockResolvedValue(attempt),
        update: vi.fn().mockResolvedValue(updatedAttempt),
      },
      session: { update: vi.fn().mockResolvedValue({}) },
      sessionState: { upsert: vi.fn().mockResolvedValue({}) },
    };
    const db = {
      $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    } as unknown as import("@prisma/client").PrismaClient;

    const result = await renewLease("att-1", "agent-1", db);
    expect(result).not.toBeNull();
    expect(result!.stopRequested).toBe(false);
  });
});

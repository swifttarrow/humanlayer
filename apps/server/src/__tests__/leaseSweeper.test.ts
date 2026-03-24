import { describe, it, expect, vi, beforeEach } from "vitest";
import { sweepExpiredLeases } from "../jobs/leaseSweeper.js";

// Mock prisma
vi.mock("../db.js", () => ({
  prisma: {
    sessionAttempt: {
      findMany: vi.fn(),
      update: vi.fn().mockResolvedValue({}),
    },
    session: {
      update: vi.fn().mockResolvedValue({}),
    },
    sessionState: {
      upsert: vi.fn().mockResolvedValue({}),
    },
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => {
      const mockTx = {
        sessionAttempt: { update: vi.fn().mockResolvedValue({}) },
        session: { update: vi.fn().mockResolvedValue({}) },
        sessionState: { upsert: vi.fn().mockResolvedValue({}) },
      };
      return fn(mockTx);
    }),
  },
}));

import { prisma } from "../db.js";

function makeExpiredAttempt(overrides: Record<string, unknown> = {}) {
  return {
    id: "att-1",
    sessionId: "sess-1",
    agentId: "agent-1",
    status: "running",
    leaseExpiresAt: new Date(Date.now() - 5000),
    stopRequestedAt: null,
    startedAt: new Date(),
    endedAt: null,
    stopReason: null,
    session: { id: "sess-1", status: "running" },
    ...overrides,
  };
}

describe("sweepExpiredLeases", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns zero count when no expired attempts", async () => {
    vi.mocked(prisma.sessionAttempt.findMany).mockResolvedValue([]);
    const result = await sweepExpiredLeases();
    expect(result.stallCount).toBe(0);
    expect(result.sessionIds).toHaveLength(0);
  });

  it("marks expired attempt as stalled", async () => {
    vi.mocked(prisma.sessionAttempt.findMany).mockResolvedValue([makeExpiredAttempt() as never]);
    const result = await sweepExpiredLeases();
    expect(result.stallCount).toBe(1);
  });

  it("transitions active session to failed", async () => {
    vi.mocked(prisma.sessionAttempt.findMany).mockResolvedValue([makeExpiredAttempt() as never]);
    const result = await sweepExpiredLeases();
    expect(result.sessionIds).toContain("sess-1");
  });

  it("skips already-terminal sessions", async () => {
    vi.mocked(prisma.sessionAttempt.findMany).mockResolvedValue([
      makeExpiredAttempt({ session: { id: "sess-1", status: "completed" } }) as never,
    ]);
    const result = await sweepExpiredLeases();
    // stallCount is still 1 (attempt is stalled), but no session transition
    expect(result.stallCount).toBe(1);
    expect(result.sessionIds).toHaveLength(0);
  });
});

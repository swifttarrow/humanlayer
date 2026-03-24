import type { PrismaClient } from "@prisma/client";
import { prisma as defaultPrisma } from "../db.js";

const LEASE_DURATION_SECONDS = parseInt(
  process.env.LEASE_DURATION_SECONDS ?? "60",
  10
);

function leaseExpiry(): Date {
  return new Date(Date.now() + LEASE_DURATION_SECONDS * 1000);
}

/**
 * Atomically claim a runnable session for an agent.
 * Returns the created attempt or null if no session is available.
 */
export async function claimNextSession(
  agentId: string,
  db: PrismaClient = defaultPrisma
) {
  return db.$transaction(async (tx) => {
    // Find one session in `created` status with no active claimed/running attempt
    const session = await tx.session.findFirst({
      where: {
        status: "created",
        attempts: {
          none: {
            status: { in: ["claimed", "running"] },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    if (!session) return null;

    // Mark the session as starting
    await tx.session.update({
      where: { id: session.id },
      data: { status: "starting", startedAt: new Date() },
    });

    // Create the attempt
    const attempt = await tx.sessionAttempt.create({
      data: {
        sessionId: session.id,
        agentId,
        status: "claimed",
        leaseExpiresAt: leaseExpiry(),
      },
    });

    // Upsert derived state
    await tx.sessionState.upsert({
      where: { sessionId: session.id },
      create: {
        sessionId: session.id,
        status: "starting",
      },
      update: {
        status: "starting",
      },
    });

    return { session: { ...session, status: "starting" }, attempt };
  });
}

/**
 * Renew the lease on an active attempt.
 * Returns the updated attempt or null if ownership check fails.
 */
export async function renewLease(
  attemptId: string,
  agentId: string,
  db: PrismaClient = defaultPrisma
) {
  return db.$transaction(async (tx) => {
    const attempt = await tx.sessionAttempt.findUnique({
      where: { id: attemptId },
      include: { session: true },
    });

    if (!attempt) return null;
    if (attempt.agentId !== agentId) return null;
    if (!["claimed", "running"].includes(attempt.status)) return null;

    // Reject stale (expired) attempts
    if (attempt.leaseExpiresAt < new Date()) return null;

    const updated = await tx.sessionAttempt.update({
      where: { id: attemptId },
      data: {
        status: "running",
        leaseExpiresAt: leaseExpiry(),
      },
    });

    // Ensure session reflects running
    if (attempt.session.status === "starting") {
      await tx.session.update({
        where: { id: attempt.sessionId },
        data: { status: "running" },
      });
      await tx.sessionState.upsert({
        where: { sessionId: attempt.sessionId },
        create: { sessionId: attempt.sessionId, status: "running" },
        update: {
          status: "running",
          lastHeartbeatAt: new Date(),
        },
      });
    } else {
      await tx.sessionState.upsert({
        where: { sessionId: attempt.sessionId },
        create: { sessionId: attempt.sessionId, status: attempt.session.status },
        update: { lastHeartbeatAt: new Date() },
      });
    }

    return {
      attempt: updated,
      stopRequested: attempt.session.status === "stopping",
    };
  });
}

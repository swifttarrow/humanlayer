import { prisma } from "../db.js";

const SWEEP_INTERVAL_MS = parseInt(
  process.env.LEASE_SWEEP_INTERVAL_MS ?? "30000",
  10
);

/**
 * Mark expired attempts as stalled and transition their sessions to `failed`
 * (recoverable via retry). Only affects attempts whose lease has expired and
 * whose session is still active.
 */
export async function sweepExpiredLeases(): Promise<{
  stallCount: number;
  sessionIds: string[];
  idleStoppedCount?: number;
}> {
  const now = new Date();

  // Find all expired active attempts
  const expired = await prisma.sessionAttempt.findMany({
    where: {
      status: { in: ["claimed", "running"] },
      leaseExpiresAt: { lt: now },
    },
    include: { session: true },
  });

  const affectedSessionIds: string[] = [];

  for (const attempt of expired) {
    await prisma.$transaction(async (tx) => {
      // Mark attempt stalled
      await tx.sessionAttempt.update({
        where: { id: attempt.id },
        data: { status: "stalled", endedAt: now },
      });

      // Only transition session if it's still active
      if (!["completed", "stopped", "failed"].includes(attempt.session.status)) {
        await tx.session.update({
          where: { id: attempt.sessionId },
          data: {
            status: "failed",
            endedAt: now,
            errorSummary: `Attempt ${attempt.id} lease expired at ${attempt.leaseExpiresAt.toISOString()}`,
          },
        });

        await tx.sessionState.upsert({
          where: { sessionId: attempt.sessionId },
          create: { sessionId: attempt.sessionId, status: "failed" },
          update: { status: "failed", currentStep: null, currentTool: null },
        });

        affectedSessionIds.push(attempt.sessionId);
      }
    });
  }

  const idleSessions = await prisma.session.findMany({
    where: { status: { in: ["running", "starting", "stopping"] } },
    select: { id: true, metadata: true },
  });

  let idleStoppedCount = 0;
  for (const session of idleSessions) {
    const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
    const idle = metadata.idle as Record<string, unknown> | undefined;
    const stopAtRaw = typeof idle?.idleStopAt === "string" ? idle.idleStopAt : undefined;
    if (!stopAtRaw) continue;
    const stopAt = Date.parse(stopAtRaw);
    if (Number.isNaN(stopAt) || stopAt > Date.now()) continue;

    await prisma.$transaction(async (tx) => {
      await tx.session.update({
        where: { id: session.id },
        data: { status: "stopped", endedAt: new Date() },
      });
      await tx.sessionState.upsert({
        where: { sessionId: session.id },
        create: { sessionId: session.id, status: "stopped" },
        update: { status: "stopped", currentStep: null, currentTool: null },
      });
      await tx.sessionAttempt.updateMany({
        where: { sessionId: session.id, status: { in: ["claimed", "running"] } },
        data: { status: "superseded", endedAt: new Date(), stopReason: "idle_timeout" },
      });
    });
    idleStoppedCount++;
  }

  return { stallCount: expired.length, sessionIds: affectedSessionIds, idleStoppedCount };
}

let _sweepTimer: ReturnType<typeof setInterval> | null = null;

export function startLeaseSweeper(): void {
  if (_sweepTimer) return;
  _sweepTimer = setInterval(async () => {
    try {
      const result = await sweepExpiredLeases();
      if (result.stallCount > 0 || (result.idleStoppedCount ?? 0) > 0) {
        console.log(
          `[sweeper] Stalled ${result.stallCount} attempt(s), affected sessions: ${result.sessionIds.join(", ")}. Idle-stopped: ${result.idleStoppedCount ?? 0}`
        );
      }
    } catch (err) {
      console.error("[sweeper] Error:", err);
    }
  }, SWEEP_INTERVAL_MS);
}

export function stopLeaseSweeper(): void {
  if (_sweepTimer) {
    clearInterval(_sweepTimer);
    _sweepTimer = null;
  }
}

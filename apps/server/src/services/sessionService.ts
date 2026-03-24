import type { PrismaClient } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma as defaultPrisma } from "../db.js";
import type {
  CreateSessionRequest,
  GetSessionResponse,
  ListSessionsResponse,
  Session,
  SessionState,
  SessionAttempt,
  SessionStatus,
  AttemptStatus,
} from "@humanlayer/shared";
import { validateWorkingDirectory } from "./workdirPolicyService.js";

export async function createSession(
  input: CreateSessionRequest,
  db: PrismaClient = defaultPrisma
) {
  // Validate and canonicalize working directory if provided
  let metadata: Record<string, unknown> = input.metadata ? { ...input.metadata } : {};

  if (input.workingDirectory) {
    const policy = await validateWorkingDirectory(
      input.workingDirectory,
      input.exposedSurfaces
    );
    metadata.workdirPolicy = policy;
  } else if (!metadata.workdirPolicy && typeof metadata.parentSessionId === "string") {
    // Follow-up sessions inherit workdir policy from their parent when the caller
    // does not provide a new workingDirectory override.
    const parent = await db.session.findUnique({
      where: { id: metadata.parentSessionId },
      select: { metadata: true },
    });
    const parentMetadata = (parent?.metadata ?? null) as Record<string, unknown> | null;
    if (parentMetadata?.workdirPolicy) {
      metadata.workdirPolicy = parentMetadata.workdirPolicy;
    }
  }

  return db.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        status: "created",
        goal: input.goal,
        agentType: input.agentType ?? "default",
        metadata: Object.keys(metadata).length > 0
          ? (metadata as Prisma.InputJsonValue)
          : Prisma.JsonNull,
      },
    });

    await tx.sessionState.create({
      data: {
        sessionId: session.id,
        status: "created",
      },
    });

    return toSessionDto(session);
  });
}

export async function listSessions(
  db: PrismaClient = defaultPrisma
): Promise<ListSessionsResponse> {
  const sessions = await db.session.findMany({
    orderBy: { createdAt: "desc" },
  });
  return { sessions: sessions.map(toSessionDto) };
}

export async function getSession(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<GetSessionResponse | null> {
  const session = await db.session.findUnique({
    where: { id },
    include: {
      state: true,
      attempts: {
        where: { status: { in: ["claimed", "running"] } },
        orderBy: { startedAt: "desc" },
        take: 1,
      },
    },
  });

  if (!session) return null;

  return {
    session: toSessionDto(session),
    state: session.state ? toStateDto(session.state) : undefined,
    activeAttempt: session.attempts[0]
      ? toAttemptDto(session.attempts[0])
      : undefined,
  };
}

/**
 * Record durable stop intent. Idempotent — safe to call multiple times.
 */
export async function stopSession(
  id: string,
  reason?: string,
  db: PrismaClient = defaultPrisma
): Promise<Session | null> {
  return db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) return null;

    if (["completed", "stopped", "failed", "blocked"].includes(session.status)) {
      return toSessionDto(session);
    }

    if (session.status === "stopping") {
      if (reason) {
        await tx.sessionAttempt.updateMany({
          where: { sessionId: id, status: { in: ["claimed", "running"] } },
          data: { stopRequestedAt: new Date(), stopReason: reason },
        });
      }
      return toSessionDto(session);
    }

    const updated = await tx.session.update({
      where: { id },
      data: { status: "stopping" },
    });

    await tx.sessionAttempt.updateMany({
      where: { sessionId: id, status: { in: ["claimed", "running"] } },
      data: { stopRequestedAt: new Date(), stopReason: reason ?? null },
    });

    await tx.sessionState.upsert({
      where: { sessionId: id },
      create: { sessionId: id, status: "stopping" },
      update: { status: "stopping" },
    });

    return toSessionDto(updated);
  }) as Promise<Session | null>;
}

/**
 * Retry: supersede active attempt and reset session to created.
 * Only allowed from stopped/failed.
 */
export async function retrySession(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<Session | null> {
  return db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({ where: { id } });
    if (!session) return null;

    if (!["stopped", "failed", "blocked"].includes(session.status)) {
      throw new Error(
        `Cannot retry session in status '${session.status}'. Must be stopped, failed, or blocked.`
      );
    }

    await tx.sessionAttempt.updateMany({
      where: { sessionId: id, status: { notIn: ["completed", "superseded"] } },
      data: { status: "superseded", endedAt: new Date() },
    });

    const updated = await tx.session.update({
      where: { id },
      data: {
        status: "created",
        startedAt: null,
        endedAt: null,
        errorSummary: null,
      },
    });

    await tx.sessionState.upsert({
      where: { sessionId: id },
      create: { sessionId: id, status: "created" },
      update: { status: "created", currentStep: null, currentTool: null },
    });

    return toSessionDto(updated);
  }) as Promise<Session | null>;
}

// ---- DTO helpers ----

type DbSession = {
  id: string;
  status: string;
  goal: string;
  agentType: string;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  errorSummary: string | null;
  metadata: unknown;
};

type DbState = {
  sessionId: string;
  status: string;
  currentStep: string | null;
  currentTool: string | null;
  lastHeartbeatAt: Date | null;
  lastAssistantMessage: string | null;
  updatedAt: Date;
};

type DbAttempt = {
  id: string;
  sessionId: string;
  agentId: string;
  status: string;
  leaseExpiresAt: Date;
  stopRequestedAt: Date | null;
  startedAt: Date;
  endedAt: Date | null;
  stopReason: string | null;
};

function toSessionDto(s: DbSession): Session {
  return {
    id: s.id,
    status: s.status as SessionStatus,
    goal: s.goal,
    agentType: s.agentType,
    createdAt: s.createdAt.toISOString(),
    updatedAt: s.updatedAt.toISOString(),
    startedAt: s.startedAt?.toISOString(),
    endedAt: s.endedAt?.toISOString(),
    errorSummary: s.errorSummary ?? undefined,
    metadata: (s.metadata as Record<string, unknown>) ?? undefined,
  };
}

function toStateDto(s: DbState): SessionState {
  return {
    sessionId: s.sessionId,
    status: s.status as SessionStatus,
    currentStep: s.currentStep ?? undefined,
    currentTool: s.currentTool ?? undefined,
    lastHeartbeatAt: s.lastHeartbeatAt?.toISOString(),
    lastAssistantMessage: s.lastAssistantMessage ?? undefined,
    updatedAt: s.updatedAt.toISOString(),
  };
}

function toAttemptDto(a: DbAttempt): SessionAttempt {
  return {
    id: a.id,
    sessionId: a.sessionId,
    agentId: a.agentId,
    status: a.status as AttemptStatus,
    leaseExpiresAt: a.leaseExpiresAt.toISOString(),
    stopRequestedAt: a.stopRequestedAt?.toISOString(),
    startedAt: a.startedAt.toISOString(),
    endedAt: a.endedAt?.toISOString(),
    stopReason: a.stopReason ?? undefined,
  };
}

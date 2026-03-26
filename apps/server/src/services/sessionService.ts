import { randomUUID } from "crypto";
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
import { prepareGithubSessionWorkspace } from "./githubWorkspaceService.js";
import { prepareDefaultLocalWorkspace } from "./localWorkspaceService.js";

const IDLE_WARNING_DELAY_MS = 5 * 60 * 1000;
const IDLE_STOP_DELAY_MS = 30 * 1000;

/** Follow-up session but parent has no workspace in metadata */
export class FollowUpWorkspaceError extends Error {
  readonly code = "FOLLOWUP_WORKSPACE_MISSING" as const;
  constructor() {
    super("Parent session has no workspace to inherit.");
    this.name = "FollowUpWorkspaceError";
  }
}

function withIdleSchedule(now = Date.now()): Record<string, unknown> {
  const warningAt = new Date(now + IDLE_WARNING_DELAY_MS).toISOString();
  const stopAt = new Date(now + IDLE_WARNING_DELAY_MS + IDLE_STOP_DELAY_MS).toISOString();
  return {
    idleWarningAt: warningAt,
    idleStopAt: stopAt,
  };
}

async function summarizeGoalTitle(goal: string): Promise<string | undefined> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return undefined;

  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env.SESSION_TITLE_MODEL ?? "gpt-4.1-mini",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "Summarize the coding request in 3 to 7 words. Return plain text only.",
          },
          {
            role: "user",
            content: goal.slice(0, 3000),
          },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) return undefined;
    const payload = (await res.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim();
    if (!content) return undefined;
    return content.replace(/\s+/g, " ").slice(0, 80);
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeoutHandle);
  }
}

export async function createSession(
  input: CreateSessionRequest,
  db: PrismaClient = defaultPrisma
) {
  const sessionId = randomUUID();
  let metadata: Record<string, unknown> = input.metadata ? { ...input.metadata } : {};
  const title = await summarizeGoalTitle(input.goal);
  if (title) {
    metadata.title = title;
  }

  const isFollowUp =
    typeof metadata.parentSessionId === "string" && metadata.parentSessionId.length > 0;

  if (input.githubRepoUrl?.trim()) {
    const prep = await prepareGithubSessionWorkspace(sessionId, input.githubRepoUrl.trim());
    metadata.workdirPolicy = prep.workdirPolicy;
    metadata.githubSession = prep.githubSession;
    metadata.workdirDetails = prep.workdirDetails;
  } else if (input.workingDirectory?.trim()) {
    const policy = await validateWorkingDirectory(input.workingDirectory.trim());
    metadata.workdirPolicy = policy;
    metadata.workdirDetails = {
      enteredPath: input.workingDirectory.trim(),
      canonicalPath: policy.resolvedPath,
      selectedMode: policy.runtimeMode,
      effectiveMode: policy.runtimeMode,
      source: "local_explicit",
    };
  } else if (isFollowUp) {
    const parent = await db.session.findUnique({
      where: { id: metadata.parentSessionId as string },
      select: { metadata: true },
    });
    const parentMetadata = (parent?.metadata ?? null) as Record<string, unknown> | null;
    if (parentMetadata?.workdirPolicy) {
      metadata.workdirPolicy = parentMetadata.workdirPolicy;
    }
    if (parentMetadata?.githubSession) {
      metadata.githubSession = parentMetadata.githubSession;
    }
    if (parentMetadata?.workdirDetails) {
      metadata.workdirDetails = parentMetadata.workdirDetails;
    }
    if (!metadata.workdirPolicy) {
      throw new FollowUpWorkspaceError();
    }
  } else {
    const local = await prepareDefaultLocalWorkspace();
    metadata.workdirPolicy = local.workdirPolicy;
    metadata.workdirDetails = local.workdirDetails;
  }

  // If selection metadata was passed in, persist selected vs effective mode
  if (metadata.selection && typeof metadata.selection === "object") {
    const sel = metadata.selection as Record<string, unknown>;
    if (sel.runtimeMode && !metadata.workdirDetails) {
      metadata.workdirDetails = {
        selectedMode: sel.runtimeMode,
        effectiveMode: sel.runtimeMode,
      };
    } else if (sel.runtimeMode && metadata.workdirDetails) {
      (metadata.workdirDetails as Record<string, unknown>).selectedMode = sel.runtimeMode;
      (metadata.workdirDetails as Record<string, unknown>).effectiveMode = sel.runtimeMode;
    }
  }

  return db.$transaction(async (tx) => {
    const session = await tx.session.create({
      data: {
        id: sessionId,
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

    const activeAttemptCount = await tx.sessionAttempt.count({
      where: { sessionId: id, status: { in: ["claimed", "running"] } },
    });

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

    if (activeAttemptCount === 0) {
      const stopped = await tx.session.update({
        where: { id },
        data: { status: "stopped", endedAt: new Date() },
      });
      await tx.sessionState.upsert({
        where: { sessionId: id },
        create: { sessionId: id, status: "stopped" },
        update: { status: "stopped", currentStep: null, currentTool: null },
      });
      return toSessionDto(stopped);
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

export async function dismissIdleStop(
  id: string,
  db: PrismaClient = defaultPrisma
): Promise<Session | null> {
  const session = await db.session.findUnique({ where: { id } });
  if (!session) return null;

  const metadata = (session.metadata as Record<string, unknown> | null) ?? {};
  const nextMetadata = {
    ...metadata,
    idle: withIdleSchedule(),
  };

  const updated = await db.session.update({
    where: { id },
    data: {
      metadata: nextMetadata as Prisma.InputJsonValue,
    },
  });

  return toSessionDto(updated);
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

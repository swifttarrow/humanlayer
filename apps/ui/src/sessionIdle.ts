import type { Session } from "@humanlayer/shared";

interface IdleMetadata {
  idleWarningAt?: string;
  idleStopAt?: string;
}

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  return value as Record<string, unknown>;
}

function readIdleMetadata(session: Session): IdleMetadata {
  const metadata = asObject(session.metadata);
  const idle = asObject(metadata?.idle);
  return {
    idleWarningAt: typeof idle?.idleWarningAt === "string" ? idle.idleWarningAt : undefined,
    idleStopAt: typeof idle?.idleStopAt === "string" ? idle.idleStopAt : undefined,
  };
}

export function getSessionDisplayTitle(session: Session): string {
  const metadata = asObject(session.metadata);
  const title = metadata?.title;
  return typeof title === "string" && title.trim().length > 0 ? title : session.goal;
}

export function getIdleStopInfo(session: Session, now = Date.now()): {
  isActive: boolean;
  inCountdown: boolean;
  secondsRemaining?: number;
} {
  if (!["starting", "running", "stopping"].includes(session.status)) {
    return { isActive: false, inCountdown: false };
  }

  const { idleWarningAt, idleStopAt } = readIdleMetadata(session);
  if (!idleWarningAt || !idleStopAt) {
    return { isActive: false, inCountdown: false };
  }

  const warningTs = Date.parse(idleWarningAt);
  const stopTs = Date.parse(idleStopAt);
  if (Number.isNaN(warningTs) || Number.isNaN(stopTs) || now >= stopTs) {
    return { isActive: false, inCountdown: false };
  }

  if (now >= warningTs) {
    return {
      isActive: true,
      inCountdown: true,
      secondsRemaining: Math.max(0, Math.ceil((stopTs - now) / 1000)),
    };
  }

  return { isActive: true, inCountdown: false };
}

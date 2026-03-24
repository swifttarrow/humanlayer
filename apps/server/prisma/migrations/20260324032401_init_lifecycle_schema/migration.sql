-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "agentType" TEXT NOT NULL DEFAULT 'default',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "errorSummary" TEXT,
    "metadata" JSONB,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_attempts" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "leaseExpiresAt" TIMESTAMP(3) NOT NULL,
    "stopRequestedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "stopReason" TEXT,

    CONSTRAINT "session_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_events" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "stepId" TEXT,
    "parentEventId" TEXT,
    "correlationId" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "isTerminal" BOOLEAN NOT NULL DEFAULT false,
    "visibility" TEXT NOT NULL DEFAULT 'user_visible',
    "schemaVersion" TEXT NOT NULL DEFAULT '1.0',

    CONSTRAINT "session_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_state" (
    "sessionId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "currentStep" TEXT,
    "currentTool" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "lastAssistantMessage" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "session_state_pkey" PRIMARY KEY ("sessionId")
);

-- CreateIndex
CREATE INDEX "sessions_status_idx" ON "sessions"("status");

-- CreateIndex
CREATE INDEX "sessions_createdAt_idx" ON "sessions"("createdAt");

-- CreateIndex
CREATE INDEX "session_attempts_sessionId_idx" ON "session_attempts"("sessionId");

-- CreateIndex
CREATE INDEX "session_attempts_agentId_idx" ON "session_attempts"("agentId");

-- CreateIndex
CREATE INDEX "session_attempts_status_idx" ON "session_attempts"("status");

-- CreateIndex
CREATE INDEX "session_attempts_leaseExpiresAt_idx" ON "session_attempts"("leaseExpiresAt");

-- CreateIndex
CREATE INDEX "session_events_sessionId_sequenceNumber_idx" ON "session_events"("sessionId", "sequenceNumber");

-- CreateIndex
CREATE INDEX "session_events_attemptId_idx" ON "session_events"("attemptId");

-- CreateIndex
CREATE INDEX "session_events_stepId_idx" ON "session_events"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "session_events_sessionId_sequenceNumber_key" ON "session_events"("sessionId", "sequenceNumber");

-- AddForeignKey
ALTER TABLE "session_attempts" ADD CONSTRAINT "session_attempts_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_events" ADD CONSTRAINT "session_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "session_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_state" ADD CONSTRAINT "session_state_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

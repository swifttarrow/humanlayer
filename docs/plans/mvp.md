# Sync Agent MVP Implementation Plan

## Overview
Build a greenfield TypeScript MVP that satisfies the PRD: decoupled `server` / `agent` / `ui`, durable append-only events, lease-based attempt ownership, SSE live updates, honest stop semantics, and explicit MVP eval gates.

Planning inputs:
- Prompt: `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/agent/prompts/plan.md`
- PRD: `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/docs/requirements/prd.md`

Decisions confirmed:
- Stack: Express + React (Vite) + Prisma + Postgres
- Retry scope: Include manual retry endpoint + basic UI action

## Current State Analysis
- Repo currently contains requirements/research/process docs only; no runnable TypeScript app components yet.
- There is no existing `server`, `agent`, `ui`, migrations, Compose setup, or package scripts to extend.
- Existing architecture guidance aligns with PRD and is a good source for exact contracts:
  - `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/docs/research/architecture.md`
  - `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/docs/research/data-model.md`

## Desired End State
A `docker compose up` workflow launches:
1. Express API server with session lifecycle, attempts/leases, event ingestion, stop/retry, and SSE.
2. Headless outbound-only agent daemon that polls, heartbeats, executes step loop, emits structured events, and honors stop intent.
3. React (Vite) UI for create/list/detail/stop/retry with structured trace and raw-event fallback.
4. Postgres-backed durable schema (`sessions`, `session_attempts`, `session_events`, `session_state`) with idempotent event ingest and stale-attempt protection.

## What We're NOT Doing
- Multi-agent orchestration
- Token-level persistence as primary UX
- WebSocket-first architecture
- Advanced auth/RBAC/tenant isolation
- Queue/broker infrastructure
- Exact mid-step crash resume
- Autoscaling/production hardening beyond MVP reliability behaviors

## Cross-Cutting Requirement: MVP Evals
The implementation must include an explicit eval loop aligned to PRD requirements:
- Versioned eval scenarios for lifecycle correctness, event integrity, realtime recovery, stop semantics, and safety/adversarial behavior.
- Deterministic pass/fail checks for must-pass cases.
- Repeatability protocol for non-deterministic behavior (recorded model settings, repeated runs, pass-rate thresholds, variance reporting).
- Baseline comparison with explicit no-regression gate for must-pass scenarios.
- Efficiency gates for latency/error/cost budgets.
- Rubric judging method definition (`human`, `model-judge`, or `hybrid`) with threshold and rationale capture.
- Documented command that outputs both machine-readable and human-readable eval results.
- Demo readiness requires all must-pass eval scenarios to pass.

## Phase 1: Project Bootstrap + Shared Contracts
### Overview
Create the monorepo skeleton, baseline tooling, and shared types/status enums so all components use one contract.

### Changes Required
**File**: `package.json`  
**Changes**: Create workspace root scripts (`dev`, `build`, `typecheck`, `lint`, `test`) and workspace package definitions.

**File**: `tsconfig.base.json`  
**Changes**: Add shared TS config for all packages/apps.

**File**: `apps/server/*`, `apps/agent/*`, `apps/ui/*`, `packages/shared/*`  
**Changes**: Create baseline package structure and initial app entrypoints.

**File**: `packages/shared/src/contracts.ts`  
**Changes**: Define shared lifecycle statuses, event types, and API DTO contracts.

### Success Criteria
#### Automated Verification:
- [ ] `npm install`
- [ ] `npm run typecheck`
- [ ] `npm run lint`

#### Manual Verification:
- [ ] Workspace builds with no missing references
- [ ] Shared status/event types imported in all apps

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 2: Lifecycle Backbone (Server + DB)
### Overview
Implement core persistence and correctness model first: sessions, attempts, leases, stop intent, stale-write protection.

### Changes Required
**File**: `apps/server/prisma/schema.prisma`  
**Changes**: Add `sessions`, `session_attempts`, `session_events`, `session_state` models with indexes/uniques for dedupe and ordering.

**File**: `apps/server/src/routes/sessions.ts`  
**Changes**: Add create/list/detail/stop/retry endpoints with Zod validation.

**File**: `apps/server/src/routes/agents.ts`  
**Changes**: Add pull + heartbeat endpoints and attempt-ownership responses.

**File**: `apps/server/src/services/leaseService.ts`  
**Changes**: Implement atomic claim/renewal logic with lease expiry checks.

**File**: `apps/server/src/services/sessionService.ts`  
**Changes**: Implement state transitions and idempotent stop/retry semantics.

### Success Criteria
#### Automated Verification:
- [ ] `npm run db:migrate`
- [ ] `npm run test --workspace=apps/server`
- [ ] `npm run typecheck --workspace=apps/server`

#### Manual Verification:
- [ ] Create session survives server restart
- [ ] Agent pull atomically claims one active attempt only
- [ ] Repeated stop calls are idempotent and session enters `stopping`

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 3: Agent Daemon + Step Loop + Event Ingest
### Overview
Add runnable outbound-only agent and canonical append-only event ingest with idempotency/order checks.

### Changes Required
**File**: `apps/agent/src/main.ts`  
**Changes**: Add CLI startup loop for polling, claiming, and running attempts.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Add step-based execution with clear boundaries and stop checks between steps.

**File**: `apps/agent/src/tools/fileTools.ts`, `apps/agent/src/tools/patchTool.ts`, `apps/agent/src/tools/shellTool.ts`  
**Changes**: Implement minimal coding toolset (search/read, patch, shell execution).

**File**: `apps/server/src/routes/events.ts`  
**Changes**: Add batch event ingestion endpoint with attempt ownership validation.

**File**: `apps/server/src/services/eventIngestService.ts`  
**Changes**: Enforce dedupe (`event_id`) and ordering (`sequence_number`) and update derived state transactionally.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=apps/server`
- [ ] Contract tests for duplicate `event_id` and stale `attempt_id`

#### Manual Verification:
- [ ] Running session emits visible step/tool events
- [ ] Duplicate event submissions do not duplicate persisted truth
- [ ] Lease-expired attempt cannot write new events

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 4: Realtime + UI (Create/List/Detail/Stop/Retry)
### Overview
Implement user-facing experience: structured trace, live updates via SSE, and reliable reconnect behavior.

### Changes Required
**File**: `apps/server/src/routes/stream.ts`  
**Changes**: Add SSE endpoint with initial snapshot + replay from last sequence.

**File**: `apps/ui/src/pages/SessionsPage.tsx`  
**Changes**: Build session list and session creation flow.

**File**: `apps/ui/src/pages/SessionDetailPage.tsx`  
**Changes**: Build session detail with current state, active step, and controls.

**File**: `apps/ui/src/components/StructuredTrace.tsx`  
**Changes**: Render step/tool timeline as primary UX.

**File**: `apps/ui/src/components/RawEventsPanel.tsx`  
**Changes**: Render raw event/log fallback for debugging.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/ui`
- [ ] `npm run typecheck --workspace=apps/ui`
- [ ] End-to-end smoke test for create → run → stop/retry

#### Manual Verification:
- [ ] Session list shows status + updated time + terminal outcome
- [ ] Detail page updates live without refresh
- [ ] Stream reconnect restores correctness using snapshot + replay
- [ ] Stop semantics match PRD (no new step begins after acceptance)

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 5: Reliability Sweep + Docker Compose + Docs/Demo
### Overview
Close MVP with operational reliability requirements, explicit eval gates, and demo-ready packaging.

### Changes Required
**File**: `apps/server/src/jobs/leaseSweeper.ts`  
**Changes**: Detect expired leases and mark attempts/sessions as stalled/recoverable per policy.

**File**: `docker-compose.yml`  
**Changes**: Define `server`, `db`, `agent`, `ui` services with outbound-only agent behavior.

**File**: `apps/server/Dockerfile`, `apps/agent/Dockerfile`, `apps/ui/Dockerfile`  
**Changes**: Containerize each component for Compose-based startup.

**File**: `.env.example`  
**Changes**: Document required environment variables and defaults.

**File**: `apps/server/src/evals/mvpEvalRunner.ts` (or equivalent workspace test package)  
**Changes**: Implement MVP eval runner for lifecycle, event integrity, reconnect/replay, stop-semantic, safety/adversarial, and efficiency (latency/error/cost) scenarios; include repeated-run support and baseline comparison output.

**File**: `docs/evals/mvp-eval-spec.md`  
**Changes**: Define eval fixtures, must-pass criteria, repeatability rules, baseline-regression policy, and scoring rubric for trace clarity and stop-semantic honesty (including judge method, threshold, and rationale format).

**File**: `docs/evals/latest-results.json`, `docs/evals/latest-results.md`  
**Changes**: Store machine-readable and human-readable outputs from the most recent eval run, including run config, run count, pass rates, variance notes, baseline diff, and latency/error/cost budget status.

**File**: `docs/evals/baseline-results.json`  
**Changes**: Store approved eval baseline used for regression comparison.

**File**: `README.md`  
**Changes**: Update architecture, setup, docker, demo, and MVP eval-run instructions to match final implementation behavior.

**File**: `docs/ai-cost.md`  
**Changes**: Add AI cost analysis covering eval runs and demo workflow assumptions (model choices, token/cost drivers, estimated per-run and per-session costs, and optimization levers).

**File**: `docs/developer-log.md`  
**Changes**: Record major architecture and tradeoff decisions during implementation.

### Success Criteria
#### Automated Verification:
- [ ] `docker compose up --build`
- [ ] `npm run test`
- [ ] `npm run eval:mvp`
- [ ] Lint/typecheck pass across all workspaces
- [ ] Eval run enforces no-regression gate against baseline for must-pass scenarios
- [ ] Eval run reports latency/error/cost budget checks

#### Manual Verification:
- [ ] Full demo flow: create → run → observe trace → stop/retry → inspect history
- [ ] Past sessions remain inspectable after restart
- [ ] Agent container has no exposed inbound port
- [ ] Latest eval report shows all must-pass scenarios green
- [ ] Latest eval report includes safety/adversarial scenarios with expected safe outcomes
- [ ] Latest eval report includes repeatability metadata (model config, run count, pass-rate/variance)
- [ ] Latest eval report includes rubric judge type, threshold, and rationale
- [ ] `README.md` reflects final run/test/eval workflow
- [ ] `docs/ai-cost.md` documents assumptions and estimated AI cost envelope

**Note**: Pause for human confirmation after this phase before proceeding.

## References
- Requirements: `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/docs/requirements/prd.md`
- Requirements (original): `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/docs/requirements/original.md`
- Architecture recommendation: `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/docs/research/architecture.md`
- Workflow guidance: `/Users/swifttarrow/learning/gauntlet/hiring-partners/humanlayer/agent/workflow.md`

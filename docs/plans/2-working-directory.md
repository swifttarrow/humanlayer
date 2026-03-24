# Working Directory Isolation Implementation Plan

## Overview
Implement `docs/requirements/2-working-directory.md` by adding a policy-driven working-directory contract that applies consistently to local and Docker agent runs, while keeping Docker sandbox isolation and explicit exposed surfaces.

Planning inputs:
- Prompt: `agent/prompts/plan.md`
- Requirement: `docs/requirements/2-working-directory.md`
- Existing baseline: `docs/plans/1-mvp.md`

## Current State Analysis
- Session creation currently accepts `goal`, `agentType`, and `metadata` only; there is no first-class `working_directory` contract in API validation (`apps/server/src/routes/sessions.ts`).
- Session persistence already has a flexible `metadata` JSON field (`apps/server/prisma/schema.prisma`, `apps/server/src/services/sessionService.ts`), which can store canonicalized path and exposure policy without requiring immediate schema migration.
- Agent tool execution is currently unrestricted beyond basic command pattern blocking; file read/search/patch and shell `cwd` can resolve arbitrary host paths (`apps/agent/src/tools/fileTools.ts`, `apps/agent/src/tools/patchTool.ts`, `apps/agent/src/tools/shellTool.ts`).
- Agent claim/pull path does not currently carry explicit runtime workdir policy to the step loop (`apps/agent/src/api.ts`, `apps/agent/src/main.ts`, `apps/agent/src/runner/stepLoop.ts`).
- UI session creation does not currently provide first-class `working_directory` input or policy-aware error rendering (`apps/ui/src/pages/NewSessionPage.tsx`, `apps/ui/src/api.ts`).
- Docker compose has no workspace bind mount and no selective exposure model for agent surfaces (`docker-compose.yml`).

## Technical Decision Pass (Tradeoffs + Chosen Path)
1. **Persist location policy in `Session.metadata` vs new DB columns**
   - Option A: Add dedicated columns (`workingDirectoryInput`, `workingDirectoryResolved`, etc.).
   - Option B: Store a typed policy envelope in `Session.metadata`.
   - **Decision:** Start with Option B for minimal schema churn and faster delivery; keep a typed contract in shared DTOs so future migration to columns stays straightforward.

2. **Validation authority**
   - Option A: Agent validates requested paths independently.
   - Option B: Server validates and canonicalizes at session creation, agent only enforces received policy.
   - **Decision:** Option B. Server is source of truth for policy; agent is deterministic enforcer.

3. **Symlink policy**
   - Option A: Reject any symlink traversal.
   - Option B: Allow symlinks only if fully resolved target remains within allowed roots.
   - **Decision:** Option B to avoid breaking common local setups while preserving boundary checks via canonical `realpath`.

4. **Local isolation mechanism**
   - Option A: OS sandbox integration in first pass.
   - Option B: Tool-level filesystem boundary enforcement in first pass.
   - **Decision:** Option B for MVP speed and portability; leave stronger local containment as future hardening.

## Desired End State
Creating a session can include a user-selected `working_directory`. The server canonicalizes and validates it against configured allowed roots and optional exposed surfaces, persists the resolved policy, and returns it to the agent on claim.

The agent executes with:
- default `cwd` anchored to resolved workdir,
- tool-level read/write checks against allowed surfaces,
- denied-access events surfaced for auditability.

The UI session-creation flow includes a working-directory control that submits unchanged user input to the server and renders validation errors with retry-friendly behavior.

In Docker mode, agent runtime only sees declared mounts (`/workspace` + explicit surfaces), preserving sandbox isolation with selective exposure.

## What We're NOT Doing
- Full OS-level sandboxing for local mode in this implementation.
- RBAC or multi-tenant policy administration UI.
- Dynamic mount mutation during a running attempt.
- Arbitrary host-root mounting for convenience.
- Non-Docker container runtimes or Kubernetes policy work.

## Phase 1: Shared Contract + Policy Model
### Overview
Define the typed policy envelope and session request contract that all components consume.

### Changes Required
**File**: `packages/shared/src/contracts.ts`  
**Changes**: Add `workingDirectory` field to create-session DTOs; add typed `WorkingDirectoryPolicy`, `ExposedSurface`, and validation/error-code DTOs for API responses and agent pull payloads.

**File**: `docs/requirements/2-working-directory.md`  
**Changes**: Tighten wording to align with selected defaults above (metadata envelope, symlink policy, local containment scope) so requirement and implementation remain consistent.

### Success Criteria
#### Automated Verification:
- [ ] `npm run typecheck --workspace=packages/shared`
- [ ] `npm run lint --workspace=packages/shared`

#### Manual Verification:
- [ ] Shared types clearly describe local vs docker runtime policy
- [ ] Error reason codes map to requirement (`WORKDIR_NOT_FOUND`, etc.)

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 2: Server Validation, Canonicalization, and Persistence
### Overview
Implement server-side validation and policy normalization at session creation, and persist normalized policy in session metadata.

### Changes Required
**File**: `apps/server/src/routes/sessions.ts`  
**Changes**: Extend Zod create-session schema with `workingDirectory` and optional `exposedSurfaces`; return machine-readable validation errors and reason codes.

**File**: `apps/server/src/services/sessionService.ts`  
**Changes**: Call a new policy resolver before create; persist original input + canonical resolved policy into `session.metadata`; expose in session DTO metadata.

**File**: `apps/server/src/services/workdirPolicyService.ts` (new)  
**Changes**: Implement path canonicalization (`realpath`), allow-root checks, exposure-policy validation, symlink target checks, and reason-code mapping.

**File**: `apps/server/src/__tests__/sessionService.test.ts`  
**Changes**: Add tests for accepted/rejected `workingDirectory`, policy persistence, and reason-code behavior.

**File**: `apps/server/src/__tests__/workdirPolicyService.test.ts` (new)  
**Changes**: Unit tests for traversal attempts, not-found/non-directory cases, and exposed-surface allowlist validation.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/server`
- [ ] `npm run typecheck --workspace=apps/server`

#### Manual Verification:
- [ ] Invalid directory requests fail before session creation
- [ ] Valid request stores both input and resolved paths in metadata
- [ ] Claim/pull response includes metadata needed for agent enforcement

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 3: Agent Local Boundary Enforcement
### Overview
Implement UI-based working-directory selection so users can configure path policy from the product surface, not only APIs.

### Changes Required
**File**: `apps/ui/src/pages/NewSessionPage.tsx`  
**Changes**: Add `working_directory` input and optional exposed-surfaces controls to create-session form; preserve entered values on submission errors.

**File**: `apps/ui/src/api.ts`  
**Changes**: Extend create-session request typing to send `workingDirectory` (and optional `exposedSurfaces`) unchanged to server.

**File**: `apps/ui/src/pages/SessionsPage.tsx`  
**Changes**: Ensure create-session action wiring includes new fields and displays server validation errors with reason codes/messages.

**File**: `apps/ui/src/__tests__/new-session.test.tsx` (new)  
**Changes**: Add tests for value submission, validation-error rendering, and retry behavior without input loss.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/ui`
- [ ] `npm run typecheck --workspace=apps/ui`

#### Manual Verification:
- [ ] User can set `working_directory` from UI session-creation flow
- [ ] Server-side validation failures display actionable feedback in UI
- [ ] UI preserves user-entered path and surfaces after failed submission

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 4: Agent Local Boundary Enforcement
### Overview
Enforce server-provided policy in agent runtime and tools so local mode cannot read/write outside allowed surfaces.

### Changes Required
**File**: `apps/agent/src/main.ts`  
**Changes**: Derive attempt runtime context (resolved workdir + surfaces) from claimed session metadata; pass context into step loop/tool executor.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Update tool execution plumbing so every tool call receives policy-aware execution context; default shell `cwd` to resolved workdir.

**File**: `apps/agent/src/tools/workspacePolicy.ts` (new)  
**Changes**: Add reusable `assertReadablePath`/`assertWritablePath` helpers with canonical path checks and clear denial messages.

**File**: `apps/agent/src/tools/fileTools.ts`  
**Changes**: Require path checks for search/read operations; clamp search root to policy-allowed roots.

**File**: `apps/agent/src/tools/patchTool.ts`  
**Changes**: Enforce writable-surface checks before patch apply/write.

**File**: `apps/agent/src/tools/shellTool.ts`  
**Changes**: Resolve and validate `cwd` against policy; reject shell execution outside allowed roots.

**File**: `apps/agent/src/__tests__/stepLoop.test.ts`  
**Changes**: Add policy enforcement tests for denied reads/writes/cwd escapes.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run typecheck --workspace=apps/agent`

#### Manual Verification:
- [ ] Agent runs with policy-derived default `cwd`
- [ ] Read/write attempts outside allowed roots fail safely
- [ ] Denied operations produce structured, inspectable errors/events

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 5: Docker Surfaces + Runtime Isolation
### Overview
Make Docker behavior mirror local policy semantics while preserving container isolation and explicit exposure.

### Changes Required
**File**: `docker-compose.yml`  
**Changes**: Add explicit agent mounts for workspace and optional exposure surfaces; avoid broad host mounts; keep outbound-only networking.

**File**: `apps/agent/Dockerfile`  
**Changes**: Harden runtime defaults (non-root user where feasible, explicit writable paths) and ensure deterministic in-container workspace path (e.g. `/workspace`).

**File**: `README.md`  
**Changes**: Document local vs Docker configuration for working directory and exposed surfaces, with examples and security notes.

**File**: `.env.example` (root and/or `apps/server/.env.example` as applicable)  
**Changes**: Add server policy configuration keys (allowed roots and optional predefined exposed surfaces).

### Success Criteria
#### Automated Verification:
- [ ] `docker compose config`
- [ ] `docker compose up --build` (smoke)

#### Manual Verification:
- [ ] Agent container sees only declared mounts
- [ ] Undeclared host paths are inaccessible in-container
- [ ] Local and Docker requests produce equivalent allow/deny outcomes for same policy input

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 6: Observability, Evals, and Rollout Safety
### Overview
Add runtime visibility, regression checks, and rollout guardrails for the new policy behavior.

### Changes Required
**File**: `apps/server/src/services/eventIngestService.ts`  
**Changes**: Extend/emit structured events for policy-denied operations and startup validation metadata where needed.

**File**: `apps/server/src/evals/mvpEvalRunner.ts`  
**Changes**: Add eval scenarios for working-directory validation, path-escape rejection, and Docker/local parity checks.

**File**: `docs/evals/mvp-eval-spec.md`  
**Changes**: Document new eval cases and expected outcomes tied to requirement acceptance criteria.

**File**: `docs/developer-log.md`  
**Changes**: Record key implementation decisions and tradeoffs made during rollout.

### Success Criteria
#### Automated Verification:
- [ ] `npm run eval:mvp`
- [ ] `npm run test`

#### Manual Verification:
- [ ] Session metadata clearly shows resolved workdir + exposed surfaces
- [ ] Denied accesses are visible and debuggable from session history
- [ ] No regressions in existing lifecycle, stop, and SSE behaviors

**Note**: Pause for human confirmation after this phase before proceeding.

## Rollout and Risk Strategy
- Gate feature behind configuration defaults that preserve current behavior for existing sessions.
- Start with server-side validation + metadata persistence before hard enforcement in tools to reduce blast radius.
- Add parity evals (local vs Docker) before enabling strict enforcement by default.
- Maintain strict default-deny outside configured allowed roots to avoid accidental broad host access.

## References
- Requirement: `docs/requirements/2-working-directory.md`
- PRD: `docs/requirements/1-prd.md`
- Baseline plan: `docs/plans/1-mvp.md`
- Session API route: `apps/server/src/routes/sessions.ts`
- Session service: `apps/server/src/services/sessionService.ts`
- Agent loop + tools: `apps/agent/src/runner/stepLoop.ts`, `apps/agent/src/tools/fileTools.ts`, `apps/agent/src/tools/patchTool.ts`, `apps/agent/src/tools/shellTool.ts`
- Docker runtime: `docker-compose.yml`, `apps/agent/Dockerfile`

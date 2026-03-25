# Requirements 4-11 Platform Expansion Implementation Plan

## Overview
Implement `docs/requirements/4-local-vs-containerized.md` through `docs/requirements/11-repo-level-customization.md` as one coordinated platform expansion, preserving current MVP behavior while adding runtime selection, in-session steering, extensible tools/providers, CLI/headless automation, richer runtime UX, and repo-scoped customization.

Planning inputs:
- Prompt: `agent/prompts/plan.md`
- Requirements: `docs/requirements/4-local-vs-containerized.md` to `docs/requirements/11-repo-level-customization.md`
- Existing plans: `docs/plans/1-mvp.md`, `docs/plans/2-working-directory.md`, `docs/plans/3-agent-exploration-and-edit-balance.md`
- Current architecture references: `docs/research/architecture.md`, `docs/research/overview.md`

## Current State Analysis
- Runtime and workdir foundations exist: `RuntimeMode`, `WorkingDirectoryPolicy`, and workdir validation are already implemented (`packages/shared/src/contracts.ts`, `apps/server/src/services/workdirPolicyService.ts`, `apps/server/src/services/sessionService.ts`), but mode policy is env-driven (`local`/`docker`) rather than `local_only`/`docker_only`/`dual_mode` with layered precedence.
- Session creation UI supports `workingDirectory` input but not surfaced runtime-mode selection, exposed surfaces UX, or resolved-path confirmation workflows (`apps/ui/src/pages/NewSessionPage.tsx`).
- Session control supports stop/retry and follow-up-as-new-session, but not true same-run pause/resume or approvals (`apps/ui/src/pages/SessionDetailPage.tsx`, `apps/server/src/routes/sessions.ts`, `packages/shared/src/contracts.ts`).
- Agent tools are hard-wired in the step loop with no provider registry (`apps/agent/src/runner/stepLoop.ts`), and no MCP/browser provider integration.
- The system has HTTP/SSE APIs and agent daemon operation, but no user-facing CLI/headless contract with JSONL output and deterministic exit-code mapping (`apps/agent/src/main.ts`, `apps/server/src/routes/*`).
- Runtime UI is trace-centric (good baseline), but missing dedicated changes/logs/preview workspace panes with deep-linked artifact navigation (`apps/ui/src/components/StructuredTrace.tsx`, `apps/ui/src/components/RawEventsPanel.tsx`).
- `agentType` exists as metadata, but there is no `AgentRegistry`/multi-implementation dispatch path (`apps/server/src/services/sessionService.ts`, `apps/agent/src/runner/stepLoop.ts`).
- Model runtime is OpenAI-specific with env model selection and no multi-provider abstraction/fallback (`apps/agent/src/runner/stepLoop.ts`, `.env.example`).
- Repo-scoped customization (config discovery, skills/instructions loading, setup/validation hooks) is not implemented in runtime code.

## Technical Decision Pass (Defaults to Confirm)
1. **Unify precedence strategy across runtime mode, provider/model, and agent type**
   - Option A: Independent precedence logic per subsystem.
   - Option B: Shared `SelectionResolver` policy utility for system/user/session overrides and policy gating.
   - **Default path:** Option B to reduce drift and simplify reasoning.

2. **Pause/resume semantics for in-flight tool call**
   - Option A: Cancel-and-hold in-flight tool execution.
   - Option B: Complete-current-step then hold before starting next step.
   - **Default path:** Option B for deterministic behavior with minimal tool-specific cancellation complexity.

3. **Extensibility migration shape**
   - Option A: Big-bang replacement of hard-coded tools/providers/agent dispatch.
   - Option B: Adapter layering: keep current defaults and gradually route through registries.
   - **Default path:** Option B to minimize regression risk.

4. **Repo hooks trust model**
   - Option A: Trusted-by-default if config exists.
   - Option B: Explicit trust modes (`trusted`, `restricted`, `disabled`) with policy controls.
   - **Default path:** Option B for safer rollout.

5. **CLI rollout**
   - Option A: Full feature parity with UI before release.
   - Option B: Thin API-backed CLI first (interactive + headless core contract), then expand.
   - **Default path:** Option B for faster validated delivery.

## Desired End State
The platform supports:
- Runtime-mode policy (`local_only`, `docker_only`, `dual_mode`) with documented layered precedence and typed pre-run failures.
- Same-run in-session steering with pause/resume, agent clarification requests, and configurable approval gates.
- A pluggable tool/provider architecture where built-ins, browser tools, and MCP tools are discovered and policy-filtered through a shared registry.
- A first-class CLI/headless interface with JSONL event streaming and deterministic exit semantics.
- A workspace-centric runtime UX that connects trace events to actionable artifacts (changes/logs/files/preview).
- Runtime agent selection and model-provider selection via explicit registries and compatibility checks.
- Repo-level customization via versioned config, instruction merging, and policy-governed setup/validation hooks.

Verification at end state:
- All requirement acceptance criteria for 4-11 are mapped to automated tests/evals and manual product checks.
- Existing default behavior remains available behind backward-compatible defaults (`default` agent type, OpenAI default provider, no required repo config).

## What We're NOT Doing
- Implementing every possible MCP server/tool in MVP; only enough to validate registry + policy + lifecycle contracts.
- Building multi-user collaborative run editing.
- Adding queue/broker infrastructure for orchestration in this phase.
- Replacing current trace UI wholesale before introducing workspace panes incrementally.
- Enforcing signed repo configuration in the first cut (evaluate later as hardening).

## Phase 1: Shared Selection and Policy Contracts
### Overview
Create cross-cutting contracts and policy primitives reused by runtime mode, agent type, provider/model, and tool/provider selection.

### Changes Required
**File**: `packages/shared/src/contracts.ts`  
**Changes**: Add typed config and errors for runtime mode policy (`local_only`, `docker_only`, `dual_mode`), approval and pause/resume states/events, tool/provider metadata, provider/model selection and fallback events, repo-config metadata envelopes.

**File**: `apps/server/src/services/policySelectionService.ts` (new)  
**Changes**: Implement shared precedence resolver for system/user/session overrides with policy allow/deny reasons.

**File**: `apps/server/src/routes/sessions.ts`  
**Changes**: Extend create-session validation for runtime mode, agent type, provider/model, and repo-config trust mode selections.

### Success Criteria
#### Automated Verification:
- [ ] `npm run typecheck --workspace=packages/shared`
- [ ] `npm run test --workspace=apps/server`

#### Manual Verification:
- [ ] Precedence behavior is documented and consistent across runtime mode/provider/agent type
- [ ] Typed pre-run failures are returned for disallowed selections

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 2: Requirement 4 Foundations - Runtime Mode + Workdir UX Parity
### Overview
Complete runtime-mode selection behavior and first-class working-directory UX parity for local and Docker flows.

### Changes Required
**File**: `apps/server/src/services/workdirPolicyService.ts`  
**Changes**: Extend validation to respect effective runtime mode policy and emit `RUNTIME_MODE_NOT_ALLOWED`/`RUNTIME_MODE_UNAVAILABLE` with guidance.

**File**: `apps/server/src/services/sessionService.ts`  
**Changes**: Resolve selected mode + effective mode + canonical path metadata and persist in a structured envelope for each session.

**File**: `apps/ui/src/pages/NewSessionPage.tsx`  
**Changes**: Add runtime mode selector (when dual-mode), exposed surfaces editor, recent/preset workdir UX, and inline validation messaging.

**File**: `apps/ui/src/pages/SessionDetailPage.tsx`  
**Changes**: Surface selected vs effective runtime mode and entered vs canonical path in run summary.

**File**: `apps/ui/src/__tests__/new-session.test.tsx`  
**Changes**: Add tests for runtime selection submission, inline workdir errors, and mode-policy rejection rendering.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/server`
- [ ] `npm run test --workspace=apps/ui`

#### Manual Verification:
- [ ] Session setup supports explicit local/docker choice in dual-mode
- [ ] Workdir picker path is first-class and no env-var-only flow is required
- [ ] Session metadata exposes selected/effective runtime and canonical path details

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 3: Requirement 5 - In-Session Steering, Pause/Resume, and Approvals
### Overview
Introduce run-control state machine extensions and approval/clarification flows without creating new sessions.

### Changes Required
**File**: `packages/shared/src/contracts.ts`  
**Changes**: Add states/events for `paused_by_user`, `paused_by_agent`, `awaiting_approval`, `resuming`, and typed run-control errors.

**File**: `apps/server/src/routes/sessions.ts`  
**Changes**: Add endpoints for pause/resume/approve/reject/clarification response on existing session/attempt.

**File**: `apps/server/src/services/eventIngestService.ts`  
**Changes**: Extend derived state projection for run-control events and approval timeline visibility.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Gate scheduling on run-control state, support agent clarification yields, and implement approval preflight hooks for gated tools.

**File**: `apps/ui/src/pages/SessionDetailPage.tsx`  
**Changes**: Add pause/resume and approval action UX on same run, including timestamps and actor annotations.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/server`
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=apps/ui`

#### Manual Verification:
- [ ] User can pause and resume same run ID with preserved context
- [ ] Tool calls requiring approval block until approved/rejected
- [ ] Clarification prompts and responses are visible in run timeline

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 4: Requirements 6, 9, and 10 Core Runtime Extensibility
### Overview
Refactor runtime internals to support pluggable tools, pluggable agent types, and multi-provider model adapters with policy-aware compatibility checks.

### Changes Required
**File**: `apps/agent/src/runner/toolRegistry.ts` (new)  
**Changes**: Create unified tool provider registry for built-in, browser, and MCP-backed tools with discovery metadata and schema validation.

**File**: `apps/agent/src/runner/agentRegistry.ts` (new)  
**Changes**: Create registry mapping `agentType` to implementations conforming to shared agent interface.

**File**: `apps/agent/src/providers/modelProvider.ts` (new)  
**Changes**: Define provider adapter interface and normalized error mapping.

**File**: `apps/agent/src/providers/openaiProvider.ts` (new or extracted)  
**Changes**: Move existing OpenAI calls behind adapter interface; preserve current behavior as default provider.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Replace hard-coded tool/provider/agent wiring with registry dispatch and capability negotiation checks.

**File**: `apps/server/src/services/sessionService.ts`  
**Changes**: Validate selected `agentType` and provider/model combinations at session creation using shared policy resolver.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run typecheck --workspace=apps/agent`
- [ ] `npm run test --workspace=apps/server`

#### Manual Verification:
- [ ] At least two registered agent implementations dispatch correctly
- [ ] At least two model providers are selectable (with OpenAI still default)
- [ ] Tool availability in run reflects auth + policy + provider discovery state

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 5: Requirement 6 Integrations + Requirement 7 CLI/Headless Interface
### Overview
Ship first real integrations (MCP + browser category) and introduce a thin API-backed CLI for interactive and headless automation.

### Changes Required
**File**: `apps/agent/src/providers/mcpToolProvider.ts` (new)  
**Changes**: Add MCP server discovery/auth/health integration and exposure via tool registry.

**File**: `apps/agent/src/providers/browserToolProvider.ts` (new)  
**Changes**: Add browser tool category (navigate, snapshot, interaction primitives) under external-action policy gates.

**File**: `apps/cli/package.json` (new workspace)  
**Changes**: Add CLI package with `bin` entrypoint and command scaffolding.

**File**: `apps/cli/src/index.ts` (new)  
**Changes**: Implement interactive and headless commands, token auth, environment targeting, and deterministic exit-code mapping.

**File**: `apps/cli/src/jsonl.ts` (new)  
**Changes**: Implement versioned JSONL event contract for run lifecycle, steps, tools, approvals, and errors.

**File**: `README.md`  
**Changes**: Add CLI usage docs, headless examples, JSONL schema notes, and exit-code table.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=apps/cli`
- [ ] `npm run typecheck --workspace=apps/cli`

#### Manual Verification:
- [ ] CLI interactive mode can run and steer sessions from terminal
- [ ] Headless mode emits valid JSONL to stdout/file
- [ ] Exit codes are deterministic for success, policy denial, timeout, and runtime failure

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 6: Requirement 8 Workspace-Centric Runtime UX
### Overview
Evolve from trace-first-only UI to workspace-style runtime with linked changes/logs/preview surfaces.

### Changes Required
**File**: `apps/ui/src/pages/SessionDetailPage.tsx`  
**Changes**: Introduce pane/tab workspace layout containing chat/steering, trace timeline, changes view, and terminal/logs view.

**File**: `apps/ui/src/components/ChangesPanel.tsx` (new)  
**Changes**: Render grouped changed files by attempt and patch outcomes with navigation.

**File**: `apps/ui/src/components/TerminalPanel.tsx` (new)  
**Changes**: Render command boundaries, statuses, and searchable output streams.

**File**: `apps/ui/src/components/StructuredTrace.tsx`  
**Changes**: Add deep links from trace events to related file diffs/log blocks via stable artifact IDs.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/ui`
- [ ] `npm run typecheck --workspace=apps/ui`

#### Manual Verification:
- [ ] User can pivot from trace events to relevant changes/log artifacts in one click
- [ ] Changes and terminal views stay usable on long runs
- [ ] Capability-dependent preview pane degrades gracefully when unavailable

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 7: Requirement 11 Repo-Level Customization, Skills, and Hooks
### Overview
Add deterministic repo config discovery and controlled instruction/hook execution, with explicit trust modes and full auditability.

### Changes Required
**File**: `packages/shared/src/repoConfig.ts` (new)  
**Changes**: Define versioned repo config schema and merge metadata structures.

**File**: `apps/agent/src/config/repoConfigLoader.ts` (new)  
**Changes**: Discover repo config from working directory scope with deterministic precedence.

**File**: `apps/agent/src/config/instructionMerger.ts` (new)  
**Changes**: Merge repo-scoped instructions/skills with system/user/session context in documented order.

**File**: `apps/agent/src/hooks/hookRunner.ts` (new)  
**Changes**: Execute setup and validation hooks with timeout, trust mode, and policy gating.

**File**: `apps/server/src/services/eventIngestService.ts`  
**Changes**: Persist and expose repo config detection + hook lifecycle events and reason codes.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run test --workspace=packages/shared`

#### Manual Verification:
- [ ] Repo config is auto-detected and reflected in run artifacts
- [ ] Setup/validation hooks obey trust mode and policy controls
- [ ] Hook outputs and failures are visible with clear reason codes

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 8: Validation, Evals, and Rollout Controls
### Overview
Lock in acceptance with requirement-mapped evals, staged rollout flags, and regression guardrails.

### Changes Required
**File**: `apps/server/src/evals/mvpEvalRunner.ts`  
**Changes**: Extend evaluator scenarios for requirements 4-11 acceptance checks and reason-code assertions.

**File**: `docs/evals/mvp-eval-spec.md`  
**Changes**: Add explicit test matrix mapping each requirement criterion to automated/manual checks.

**File**: `README.md`  
**Changes**: Document rollout flags, migration paths, and compatibility notes.

### Success Criteria
#### Automated Verification:
- [ ] `npm run eval:mvp`
- [ ] `npm run test`
- [ ] `npm run lint`

#### Manual Verification:
- [ ] Existing baseline workflows still function with default settings
- [ ] New capabilities are gated behind documented configuration and policy controls
- [ ] Requirement acceptance criteria 4-11 are demonstrably satisfied

**Note**: Pause for human confirmation after this phase before proceeding.

## Rollout and Risk Strategy
- Introduce feature flags per major capability (run control, tool registry, provider registry, CLI, repo hooks) and enable progressively.
- Preserve current defaults (`default` agent type, OpenAI provider, existing stop/retry behavior) until parity tests pass.
- Start integrations in least-privilege mode (read-only MCP first, browser actions policy-gated, repo hooks restricted by default).
- Use requirement-specific reason codes and observability events before turning strict policies on by default.

## Milestone Breakdown
- `m15-policy-and-selection-core`: shared precedence and selection contracts.
- `m16-runtime-mode-and-steering`: req 4 + req 5 implementation.
- `m17-extensible-runtime-core`: req 6 + req 9 + req 10 registry refactors.
- `m18-cli-and-integrations`: req 6 integrations + req 7 CLI/headless.
- `m19-workspace-and-repo-customization`: req 8 + req 11 UX/config/hook support.
- `m20-validation-and-rollout`: eval coverage and controlled default-on rollout.

## References
- Requirements: `docs/requirements/4-local-vs-containerized.md`, `docs/requirements/5-in-session-human-steering.md`, `docs/requirements/6-tool-extensibility-and-mcp.md`, `docs/requirements/7-cli-and-headless-automation.md`, `docs/requirements/8-rich-runtime-workspace-ux.md`, `docs/requirements/9-pluggable-agent-types.md`, `docs/requirements/10-provider-flexibility.md`, `docs/requirements/11-repo-level-customization.md`
- Existing plans: `docs/plans/1-mvp.md`, `docs/plans/2-working-directory.md`, `docs/plans/3-agent-exploration-and-edit-balance.md`
- Architecture research: `docs/research/architecture.md`, `docs/research/overview.md`
- Key implementation files: `apps/agent/src/runner/stepLoop.ts`, `apps/server/src/services/sessionService.ts`, `apps/server/src/services/eventIngestService.ts`, `apps/server/src/services/workdirPolicyService.ts`, `apps/ui/src/pages/NewSessionPage.tsx`, `apps/ui/src/pages/SessionDetailPage.tsx`, `packages/shared/src/contracts.ts`

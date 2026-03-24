# Agent Exploration-to-Edit Balance Implementation Plan

## Overview
Implement `docs/requirements/3-agent-exploration-and-edit-balance.md` by introducing bounded exploration behavior, explicit phase transitions, write-then-validate iteration, and honest terminal semantics when sufficient context is not reached.

Planning inputs:
- Prompt: `agent/prompts/plan.md`
- Requirement: `docs/requirements/3-agent-exploration-and-edit-balance.md`
- Existing plans: `docs/plans/1-mvp.md`, `docs/plans/2-working-directory.md`

## Current State Analysis
- The agent loop currently uses a simple step cap (`MAX_STEPS`) and always ends in `session.completed` unless a stop/error occurs; max-step exhaustion can therefore be misreported as success (`apps/agent/src/runner/stepLoop.ts`).
- The runtime has no explicit exploration/edit/validation state machine and no budget accounting for exploration-only behavior (`apps/agent/src/runner/stepLoop.ts`).
- Tooling supports `search_files`, `read_file`, `apply_patch`, and `run_shell`, but `read_file` is full-file only; there is no range/symbol read path to keep discovery cost bounded (`apps/agent/src/runner/stepLoop.ts`, `apps/agent/src/tools/fileTools.ts`).
- Event contracts do not include phase-specific signals for exploration/editing/validation or insufficient-context terminal reasoning (`packages/shared/src/contracts.ts`).
- Server derived-state logic only handles existing terminal events and statuses; there is no first-class blocked/insufficient-context outcome (`apps/server/src/services/eventIngestService.ts`, `packages/shared/src/contracts.ts`).
- UI traces display step/tool progression, but do not distinguish exploration vs editing vs validation phases or explicit "stuck in reads" semantics (`apps/ui/src/components/StructuredTrace.tsx`, `apps/ui/src/components/RawEventsPanel.tsx`).

## Technical Decision Pass (Tradeoffs + Chosen Path)
1. **Terminal semantics for insufficient context**
   - Option A: Map all exploration exhaustion to `failed`.
   - Option B: Add first-class `blocked` status for insufficient context.
   - **Decision:** Add `blocked` as first-class session status and use it for budget exhaustion without a credible write path.

2. **How to enforce exploration budget**
   - Option A: Prompt-only guidance with no runtime accounting.
   - Option B: Runtime counters for exploration-only steps/tool reads/searches plus prompt guidance.
   - **Decision:** Option B. Runtime-enforced budgets plus explicit prompt contract.

3. **Tooling ladder evolution path**
   - Option A: Keep only full-file reads and rely on stricter step caps.
   - Option B: Add range-based read support and bias agent to cheap discovery first.
   - **Decision:** Option B. Add range-based read as first extension and keep full-file read as fallback.

4. **Edit-readiness representation**
   - Option A: Free-text in assistant messages only.
   - Option B: Structured readiness hypothesis persisted in event payloads/session state metadata.
   - **Decision:** Option B. Emit structured hypothesis fields for observability and debugging.

## Desired End State
Agent runs follow an explicit progression:
`exploring -> editing -> validating -> completed|failed|stopped|blocked`.

Exploration behavior is bounded by configurable budgets (reads, searches, lines, exploration-only steps). When budget is reached, the agent must either:
- attempt a narrow patch,
- declare exact missing context required for a safe patch, or
- terminate as `blocked`/`failed` (based on configuration).

Event streams and UI traces clearly distinguish exploration, editing, validation, and insufficient-context outcomes. Max-step or exploration-budget exhaustion without a write attempt is never reported as `completed`.

## What We're NOT Doing
- Model-provider-specific prompt syntax optimization in this phase.
- Multi-agent coordination strategies.
- Perfect static classification of all tasks into per-task-class dynamic budgets.
- Full symbol-indexing engine; this plan only adds range-based reads first.
- Retrofitting historical events from prior sessions to new phase semantics.

## Phase 1: Runtime State Model + Contracts
### Overview
Define explicit execution phases, insufficient-context terminal semantics, and configuration contracts shared across agent/server/UI.

### Changes Required
**File**: `packages/shared/src/contracts.ts`  
**Changes**: Extend status/event unions to include phase and blocked semantics (`blocked`, phase transition signals, insufficient-context reason payloads).

**File**: `apps/server/src/services/eventIngestService.ts`  
**Changes**: Update derived state transitions for new events/statuses, including `blocked` terminal handling and reason propagation.

**File**: `apps/server/src/services/sessionService.ts`  
**Changes**: Ensure stop/retry and status guards treat `blocked` as a terminal state with clear retry behavior.

**File**: `apps/server/src/__tests__/eventIngestService.test.ts`  
**Changes**: Add coverage for new terminal event mapping and phase-specific state updates.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=packages/shared`
- [ ] `npm run test --workspace=apps/server`

#### Manual Verification:
- [ ] Session status can end as `blocked` with explicit insufficient-context reason
- [ ] Derived state correctly reflects phase and terminal transitions

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 2: Bounded Exploration + Edit Readiness Gate
### Overview
Implement runtime budget accounting and readiness gating so exploration is intentional, bounded, and transitions are enforceable.

### Changes Required
**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Add exploration budget counters (reads/searches/lines/steps-without-write), explicit phase state, and transition rules that require write/validate/escalate on threshold.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Capture and emit structured edit-readiness hypothesis (candidate file, planned change, uncertainty reason) before deep/repeated reads.

**File**: `apps/agent/src/__tests__/stepLoop.test.ts`  
**Changes**: Add tests for budget enforcement, max-step non-completion semantics, and insufficient-context terminal outcomes.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`
- [ ] `npm run typecheck --workspace=apps/agent`

#### Manual Verification:
- [ ] Agent cannot consume entire run in read/search loops without explicit escalation
- [ ] Budget exhaustion without write attempt never emits `session.completed`
- [ ] Readiness hypothesis appears before repeated deep reads

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 3: Tooling Ladder + Write-Then-Validate Iteration
### Overview
Introduce lower-cost context tools and reinforce the patch-first iteration loop after sufficient context is reached.

### Changes Required
**File**: `apps/agent/src/tools/fileTools.ts`  
**Changes**: Add range-based read helper (line window/offset-limit) and lightweight line-count accounting support.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Expose range read tool in tool schema; prioritize search/range-read before full-file reads in runtime guidance.

**File**: `apps/agent/src/runner/stepLoop.ts`  
**Changes**: Implement write-then-validate loop semantics, allowing one targeted follow-up exploration/edit round after failed patch attempt.

**File**: `apps/agent/src/__tests__/stepLoop.test.ts`  
**Changes**: Add tests for failed-first-patch recovery with targeted second exploration/edit within budget.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/agent`

#### Manual Verification:
- [ ] Typical tasks attempt a narrow patch before exhaustive reading
- [ ] Failed first patch can trigger one focused re-read and second attempt
- [ ] Full-file reads are no longer the only discovery path

**Note**: Pause for human confirmation after this phase before proceeding.

---

## Phase 4: Observability, UI Surfacing, and Rollout Controls
### Overview
Surface phase/budget intent in traces, expose configuration knobs, and add eval coverage for regressions and rollout safety.

### Changes Required
**File**: `apps/ui/src/components/StructuredTrace.tsx`  
**Changes**: Render phase transitions and blocked/insufficient-context outcomes distinctly from normal completion.

**File**: `apps/ui/src/components/RawEventsPanel.tsx`  
**Changes**: Add event display/color handling for new phase and insufficient-context event types.

**File**: `apps/server/src/evals/mvpEvalRunner.ts`  
**Changes**: Add eval scenarios for exploration budget enforcement, max-step terminal semantics, and patch-fail recovery path.

**File**: `docs/evals/mvp-eval-spec.md`  
**Changes**: Document acceptance checks mapped to requirement criteria 1-8.

### Success Criteria
#### Automated Verification:
- [ ] `npm run test --workspace=apps/ui`
- [ ] `npm run eval:mvp`

#### Manual Verification:
- [ ] UI shows whether agent is exploring/editing/validating/blocked
- [ ] Session terminal summaries explain whether target was missing, unsafe, or validation failed
- [ ] No regression in existing stop/retry behavior

**Note**: Pause for human confirmation after this phase before proceeding.

## Rollout and Risk Strategy
- Start with additive contracts/events and behind-config runtime budgets to limit blast radius.
- Default budget values should bias toward progress (small exploration window, early patch attempt).
- Keep an explicit fallback mode that maps insufficient-context to `failed` if `blocked` rollout is deferred.
- Use evals to gate default-on rollout for exploration budget enforcement.

## Milestone Breakdown
- `m12-exploration-state-and-terminal-semantics`: shared/server contract + terminal semantics.
- `m13-runtime-exploration-budget-and-readiness-gate`: step-loop budgets and readiness gating.
- `m14-tooling-ladder-write-validate-and-observability`: range reads, retry loop, UI/event surfacing, evals.

## References
- Requirement: `docs/requirements/3-agent-exploration-and-edit-balance.md`
- Existing step loop: `apps/agent/src/runner/stepLoop.ts`
- File tools: `apps/agent/src/tools/fileTools.ts`
- Event ingest projection: `apps/server/src/services/eventIngestService.ts`
- Shared contracts: `packages/shared/src/contracts.ts`
- UI traces: `apps/ui/src/components/StructuredTrace.tsx`, `apps/ui/src/components/RawEventsPanel.tsx`

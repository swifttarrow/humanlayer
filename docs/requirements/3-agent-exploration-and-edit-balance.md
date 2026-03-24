# Requirement: Agent Exploration-to-Edit Balance

## Summary

The coding agent must gather enough context to make safe, useful edits without getting stuck in open-ended reading loops.

The system should treat exploration as a bounded phase with clear escalation rules, explicit transition criteria into editing, and honest failure semantics when the agent cannot reach sufficient confidence within budget.

## Problem

Coding agents often fail in one of two ways:

- they read too little and make brittle or incorrect edits
- they read too much and never transition into writing

An unbounded "search and read until you feel ready" loop creates several problems:

- sessions appear active but make no material progress
- cost grows linearly with repeated file reads and expanding context
- users cannot tell whether the agent is being careful or is stuck
- max-step exhaustion can be misclassified as success

We need a predictable agent behavior model that balances context gathering with forward progress.

## Scope

This requirement defines:

- the execution behavior expected from the coding agent during exploration and editing
- tool and prompt requirements that support bounded exploration
- observability requirements for surfacing why the agent is reading or writing
- terminal semantics when the agent fails to move from exploration into editing

This requirement does not define model-provider-specific prompting syntax or future multi-agent coordination.

## User Stories

### Primary

As a user, I want the coding agent to read enough code to make a credible change without spending the whole run browsing files.

### Trust and Observability

As a user, I want to understand why the agent is reading another file and whether it is still making progress toward a write.

### Cost and Runtime Control

As a developer, I want exploration to have bounded cost and duration so the agent does not silently burn steps with no edits.

### Recovery

As a developer, I want the agent to escalate deliberately when its first patch attempt fails, rather than either looping forever or stopping too early.

## Product Principles

### 1. Exploration is a means, not an outcome

Reading files is only valuable when it advances the agent toward an edit, a validation step, or a clear blocker report.

### 2. Cheap context before expensive context

The agent should prefer lower-cost discovery tools before full-file reads whenever they can answer the same question.

### 3. Small correct patches beat perfect certainty

The system should encourage narrow, testable edits followed by validation rather than waiting for exhaustive certainty.

### 4. Failure must be honest

If the agent cannot safely identify or execute an edit within its exploration budget, the run must surface that condition explicitly instead of reporting success.

## Functional Requirements

## 1. Explicit Exploration Phase

The agent must treat early context gathering as an explicit exploration phase.

The exploration phase must:

- begin with low-cost discovery actions when possible
- gather evidence toward one or more likely edit targets
- record the current hypothesis about what should be changed

The system prompt and runtime contract must instruct the agent to identify:

- the likely file or files to change
- the intended behavior change
- the specific uncertainty that justifies further reading

The agent must not treat indefinite reading as normal completion behavior.

## 2. Exploration Budget

The runtime must enforce a bounded exploration budget before the agent is required to either write, validate, or explicitly escalate.

The exploration budget should support configurable limits such as:

- number of file reads
- number of lines read
- number of search operations
- number of steps spent without attempting a write

When the budget threshold is reached, the agent must do one of the following:

- attempt a narrow patch
- explain the specific missing context required for a safe patch
- terminate with an explicit insufficient-context outcome

The runtime must not allow the model to continue reading indefinitely without one of these transitions.

## 3. Edit Readiness Gate

Before performing deep or repeated reads, the agent should maintain an edit-readiness hypothesis containing at least:

- candidate target file
- planned change summary
- reason additional context is needed

The system should prefer continued exploration only when the next read materially reduces uncertainty about:

- edit location
- interface or API shape
- expected behavior or tests
- surrounding code pattern needed for consistency

If the next read does not answer a concrete uncertainty, the agent should proceed to editing or stop with a blocker explanation.

## 4. Tooling Ladder

The tool surface should support a progression from cheap discovery to expensive context.

The system should provide or evolve toward tools in this order:

- file or path search
- content search
- range-based or symbol-based reads
- full-file reads
- patch application
- shell-based validation

If only full-file reads are available, the runtime or prompt layer must compensate with stronger read budgets and clearer transition rules.

## 5. Write-Then-Validate Loop

Once the agent has sufficient context for a credible first attempt, it should prefer making a narrow edit and validating it over continuing to read.

After a patch attempt, the system should encourage:

- targeted validation
- reading additional context only when validation or patch application fails
- iteration based on concrete failures rather than speculative uncertainty

The runtime should support at least one additional exploration round after a failed first patch, subject to overall session limits.

## 6. Progress and Observability

The system must emit structured signals that distinguish:

- exploration
- editing
- validation
- blocked or insufficient-context states

For exploration actions, the agent should emit or persist machine-readable metadata describing why a read occurred, such as:

- locating implementation
- confirming interface shape
- inspecting neighboring pattern
- verifying expected behavior

The UI should be able to show whether the agent is still gathering context productively or is stuck in repeated reads.

## 7. Terminal Semantics

The system must not report a session as `completed` solely because a max-step or exploration budget boundary was reached.

If the agent exhausts its exploration budget without attempting an edit or without achieving a validated outcome, the session must end as one of:

- `failed`
- `stopped`
- `blocked`

The terminal summary must explain whether the agent:

- never identified a credible edit target
- identified a target but lacked enough context to patch safely
- attempted a patch but could not validate or complete it

## 8. Configuration

The system should expose configuration for exploration-to-edit balancing, including:

- maximum exploration reads
- maximum exploration-only steps
- maximum lines or bytes returned from read tools
- whether range-based reads are enabled
- whether insufficient-context exhaustion is treated as failed or blocked

Defaults should bias toward making progress while still allowing careful first-pass investigation.

## Acceptance Criteria

1. A typical coding task causes the agent to identify a likely edit target before repeated deep reads begin.
2. The agent cannot spend an entire session issuing only `read_file` or equivalent exploration calls without surfacing a blocked or failed outcome.
3. When the agent performs another read after the initial exploration pass, that read is associated with a concrete rationale.
4. The runtime can enforce a configurable cap on exploration-only behavior before requiring a transition to patch, validate, or fail.
5. Max-step exhaustion without a write attempt is not reported as `completed`.
6. The event stream and UI can distinguish between exploration, edit, and validation phases.
7. After an unsuccessful patch attempt, the agent may perform targeted follow-up exploration and a second edit attempt within budget.
8. Full-file reads are not the only intended discovery mechanism in the long-term tool model; the requirement explicitly reserves room for range-based or symbol-based reads.

## Implementation Notes

- **Prompting:** The runtime prompt should instruct the agent to read minimally until it can attempt a safe first patch, then validate and iterate only if needed.
- **Runtime state:** A small explicit state machine such as `exploring -> editing -> validating -> completed|failed|blocked` is preferred over a fully implicit loop.
- **Budget accounting:** Exploration budget may be tracked by tool calls, lines returned, or step count. Exact accounting can evolve as long as behavior is bounded and observable.
- **Backward compatibility:** Existing tools can remain usable initially, but sessions must still gain explicit budget and terminal-state semantics even before new read tools are added.
- **Observability:** Exploration metadata may initially be heuristic or prompt-derived, but it should converge toward explicit structured fields rather than only natural-language summaries.

## Open Questions

- Should insufficient-context exhaustion produce a new first-class `blocked` session status, or should MVP map it to `failed` with a specific reason code?
- Should exploration budgets vary by task class, such as bug fix vs. greenfield implementation?
- Should the first patch attempt be required before budget exhaustion if the agent has already identified a likely target file?

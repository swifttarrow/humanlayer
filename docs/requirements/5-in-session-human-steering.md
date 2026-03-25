# Requirement: In-Session Human Steering and Pause/Resume

## Summary

The agent platform must support in-session human steering so users can pause an active run, provide guidance, approve or reject proposed actions, and continue the same run without discarding context.

The current flow supports stop/retry/follow-up sessions, but this requirement adds "pause here, ask me, then continue" as a first-class runtime capability.

## Problem

Users currently have a hard handoff boundary:

- let the run continue autonomously
- stop and restart with a new session

This creates avoidable friction:

- useful in-memory context is lost when a run is restarted
- human corrections arrive too late, after unnecessary work
- risky actions cannot be safely gated without ending the run

## Scope

This requirement defines:

- pause/resume controls for live runs
- agent-to-user clarification requests within the same run
- approval gates for sensitive actions
- auditability for steering events

This requirement does not define long-term collaborative multi-user editing behavior.

## User Stories

### Primary

As a user, I want to pause a run, clarify intent, and resume the same run so I can redirect execution without losing progress.

### Safety

As an admin, I want policy-controlled approval gates for sensitive actions so risky operations require explicit human consent.

### Visibility

As a reviewer, I want a full timeline of pause/resume/approval decisions so I can understand why the run behaved the way it did.

## Functional Requirements

## 1. Run Control State Machine

The runtime must support at least these states:

- `running`
- `paused_by_user`
- `paused_by_agent`
- `awaiting_approval`
- `resuming`
- terminal states (`completed`, `failed`, `stopped`)

Transitions must be explicit and persisted as structured events.

## 2. User-Initiated Pause and Resume

Users must be able to pause an active run from the session UI.

When paused:

- no new model/tool steps may start
- in-flight step behavior must be deterministic (complete-and-hold or cancel-and-hold, configured and documented)
- runtime status must clearly indicate paused reason and timestamp

Users must be able to resume the same run with optional steering instructions attached to the resume action.

## 3. Agent-Initiated Clarification Requests

The agent must be able to request clarification and yield control to the user without ending the run.

Clarification request payload must include:

- question text
- current hypothesis or intended next action
- why clarification is needed

User response must be recorded and injected into the same run context before continuation.

## 4. Approval Modes

The system must support configurable approval modes, including:

- `auto_approve` (default for low-risk actions)
- `approval_required_for_sensitive_actions`
- `approval_required_for_all_tool_calls` (strict mode)

At minimum, policy must be able to gate:

- shell commands
- filesystem writes
- external network-capable actions when enabled

Approval requests must include concise action summary and impact scope.

## 5. Context Continuity

Pause/resume and approval interactions must preserve run identity and context continuity.

The system must not force creation of a new session ID for steering interactions.

Steering messages must be appended to the same attempt timeline and supplied to the model in chronological order.

## 6. Timeout and Recovery

Paused or awaiting-approval runs must support configurable timeout behavior:

- remain paused until manual resume
- auto-stop after inactivity threshold

On timeout, terminal reason codes must distinguish inactivity timeout from user stop.

## 7. Observability

The system must emit structured events for:

- pause requested
- pause confirmed
- clarification requested
- approval requested
- approval granted or rejected
- resume requested
- resume confirmed

Each event must include actor (`user`, `agent`, `policy`, or `system`) and timestamp.

## 8. Error Semantics

Machine-readable errors must include at minimum:

- `RUN_NOT_PAUSABLE`
- `RUN_NOT_RESUMABLE`
- `APPROVAL_EXPIRED`
- `APPROVAL_REJECTED`
- `STEERING_PAYLOAD_INVALID`

## Acceptance Criteria

1. A user can pause a running session and later resume the same run ID.
2. While paused, no additional autonomous steps are executed.
3. The agent can ask a clarification question mid-run and continue after user response.
4. Policy can require approvals for at least shell and write actions.
5. Approval grant/reject decisions are persisted and visible in the run timeline.
6. Steering interactions do not require creating a follow-up session.
7. Timeout behavior for paused runs is configurable and produces distinct reason codes.

## Implementation Notes

- Prefer extending existing session/attempt event schema with a typed `RunControlEvent`.
- Gate step-loop scheduling on run-control state instead of ad-hoc UI checks.
- Keep approval summaries short and machine-generated from tool invocation metadata.

## Open Questions

- Should paused runs consume the same concurrency slot as active runs?
- Should strict approval mode be policy-only or user-selectable per session?

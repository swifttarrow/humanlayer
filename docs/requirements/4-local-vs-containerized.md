# Requirement: Local vs Containerized Execution Configuration

## Summary

The agent platform must support configurable execution for local development using either direct host execution, Docker containerized execution, or both, with a clear and predictable policy for how mode selection works.

The system must also improve working-directory scoping UX so users do not need to rely on terminal environment variables as the primary mechanism.

## Problem

Current local development setup can require developers to set working-directory scope through environment variables in the agent terminal.

This creates friction and risk:

- developers can forget or misconfigure env vars
- the active scope is not always obvious in the UI
- switching between projects or subdirectories is cumbersome
- local and containerized runs can diverge in ergonomics and policy behavior

We need a first-class configuration model that supports one runtime or both, while making working-directory selection safer and easier.

## Scope

This requirement defines:

- runtime-mode configuration for local development (`local`, `docker`, or both)
- mode selection behavior at app, user, and session levels
- working-directory scoping UX requirements
- security and policy parity expectations across modes
- observability and error semantics

This requirement does not define Docker image internals, CI pipeline design, or final UI visual styling.

## User Stories

### Primary

As a developer, I want to run the agent in local mode, Docker mode, or a hybrid setup so I can optimize for speed, safety, or reproducibility per task.

### Working Directory UX

As a user, I want to choose and confirm the working directory through the product UI (instead of manually exporting env vars) so I can confidently scope agent access.

### Team Consistency

As a team lead, I want consistent policy semantics across runtime modes so security and behavior do not drift between developers.

## Functional Requirements

## 1. Runtime Mode Configuration

The system must support these runtime modes:

- `local_only`
- `docker_only`
- `dual_mode` (both available)

Configuration must support layered defaults:

- system default
- optional user preference override
- optional per-session override

Precedence must be:

1. per-session override (if allowed by policy)
2. user preference
3. system default

If a higher-precedence setting selects a mode disallowed by policy, session creation must fail with a clear reason code.

## 2. Mode Selection Behavior in `dual_mode`

When `dual_mode` is enabled, the session creation flow must allow users to explicitly choose `local` or `docker` before run start.

If no explicit selection is made, the system must apply a configured default mode and surface that choice in the session summary.

The chosen mode must be persisted in session metadata for auditability.

## 3. Working Directory Scoping (Core Contract)

Every session must have an explicit resolved working directory, regardless of runtime mode.

The server must canonicalize and validate the working directory before execution starts.

Validation outcomes and normalized path data must be stored in session metadata.

Path policy behavior must be equivalent in local and Docker modes (except expected container path translation).

## 4. Working Directory UX Improvements (Beyond Env Vars)

The product must provide a first-class UX for setting and reviewing working-directory scope. Environment variables may remain as an advanced fallback, but must not be the primary user path.

The UX must include:

- a dedicated working-directory picker in session setup
- visible current-scope indicator in the session header or run summary
- one-click recent directories list (last N valid selections)
- inline validation and actionable error messaging

Suggested UX options (at least one required for MVP, others optional by phase):

- **Native file/folder picker:** invoke OS directory chooser and store absolute path
- **Repo-relative picker:** browse from configured workspace roots and select subfolders
- **Quick presets:** saved paths such as repo root, `apps/agent`, or user-defined favorites
- **Recent + pinned paths:** fast switching without manual re-entry
- **CLI helper parity:** command to set default workdir preference for terminal-first users

The UX must show both:

- the user-entered path
- the canonical resolved path used by policy

## 5. Mode-Specific Runtime Expectations

### Local Mode

- execution occurs on host with policy-enforced path boundaries
- default `cwd` is resolved working directory
- writes outside allowed surfaces are blocked

### Docker Mode

- execution occurs in container with deterministic mount path (for example `/workspace`)
- default `cwd` is container workspace mount
- only explicitly declared mounts are available

For identical working-directory and exposure settings, policy allow/deny outcomes must match across local and Docker modes.

## 6. Guardrails and Risk Controls

The system should support policy rules that force Docker for higher-risk actions (for example untrusted command execution), while still allowing local mode for low-risk workflows when configured.

If policy escalation changes runtime mode from user-selected `local` to enforced `docker`, the system must:

- notify the user before execution (or at latest in run preflight summary)
- record the reason in session metadata

## 7. Observability

For every run, the system must persist:

- selected runtime mode
- effective runtime mode after policy checks
- working-directory input and canonical resolved path
- exposed surfaces and access modes
- any policy override/escalation reason

## 8. Error Semantics

The system must provide machine-readable errors for misconfiguration and policy violations, including at minimum:

- `RUNTIME_MODE_NOT_ALLOWED`
- `RUNTIME_MODE_UNAVAILABLE`
- `WORKDIR_NOT_FOUND`
- `WORKDIR_NOT_DIRECTORY`
- `WORKDIR_NOT_ALLOWED`

Errors should include user-facing guidance for recovery (for example "choose a directory under allowed roots" or "switch to Docker mode").

## 9. Backward Compatibility

Existing env-var-based working-directory behavior may remain temporarily for compatibility.

When env vars are used, the system should:

- surface that source in diagnostics
- allow migration to persisted user preference or session-level picker

New UI/API paths should be the default documented path for local development.

## Acceptance Criteria

1. Local development can be configured as `local_only`, `docker_only`, or `dual_mode`.
2. In `dual_mode`, a user can explicitly choose runtime mode during session setup.
3. Session metadata records selected mode, effective mode, and working-directory resolution data.
4. Users can set working directory via UI picker without manually exporting env vars.
5. The UI shows both entered and canonical resolved paths and surfaces validation failures inline.
6. Recent or preset directory selection reduces repeated manual path typing.
7. Equivalent policy settings produce equivalent allow/deny path outcomes in local and Docker modes.
8. Disallowed runtime-mode selections fail pre-execution with machine-readable reason codes.

## Implementation Notes

- Prefer a shared `RuntimeSelectionPolicy` contract used by both API and UI to avoid drift.
- Keep working-directory canonicalization server-side; client validation is advisory only.
- For cross-platform path handling, centralize normalization utilities and avoid duplicated logic in UI code.
- Track adoption metrics for picker-based selection vs env-var fallback to guide deprecation timing.

## Open Questions

- Should per-session runtime override be available to all users or policy-gated by role?
- Should the system auto-recommend Docker mode based on task type or risk signals?
- What is the deprecation timeline for env-var-first working-directory configuration?

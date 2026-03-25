# Requirement: CLI and Headless Automation Interface

## Summary

The platform must provide a CLI-first interface for interactive use and a headless execution mode suitable for scripting and CI automation, with structured JSONL event output.

This requirement adds an automation-friendly surface that complements the existing server, daemon, and web UI architecture.

## Problem

Without a dedicated CLI/headless interface:

- automation workflows require custom API glue
- CI integration is brittle and inconsistent
- non-UI users have no ergonomic agent entry point

The product currently favors web-driven operation over scriptable automation.

## Scope

This requirement defines:

- interactive CLI workflow
- non-interactive headless mode
- JSONL event streaming contract
- exit codes and CI compatibility

This requirement does not define vendor-specific CI templates.

## User Stories

### Interactive

As a developer, I want to run and steer agent sessions from a terminal so I can work without opening the web UI.

### Automation

As a platform engineer, I want headless runs with machine-readable output so I can embed agent tasks in CI/CD pipelines.

### Observability

As an SRE, I want deterministic event and exit semantics so failures can be triaged automatically.

## Functional Requirements

## 1. CLI Command Surface

The system must provide a CLI with at least:

- interactive session command
- headless run command
- status and logs retrieval commands

Commands must support auth and target environment selection.

## 2. Interactive Terminal Mode

Interactive mode must support:

- chat-first prompt/response loop
- pause/resume and stop controls
- run status visibility

Interactive mode should stream incremental events and final outcome in terminal-friendly format.

## 3. Headless Mode

Headless mode must:

- run non-interactively from a command invocation
- accept task input and runtime options via flags/file/stdin
- emit structured JSONL events to stdout or output file
- avoid requiring browser interaction

## 4. JSONL Event Contract

Each JSONL event must include:

- event type
- timestamp
- session and attempt identifiers
- sequence number
- payload object specific to event type

The contract must include event types for:

- run start and end
- model step start/end
- tool call lifecycle
- approval and steering events
- error events

## 5. Deterministic Exit Codes

Headless CLI must return stable exit codes, at minimum:

- `0` success
- non-zero for validation failure, runtime failure, policy denial, timeout, and user stop

A mapping document between terminal status and exit code must be maintained.

## 6. Non-Interactive Authentication

The CLI must support token-based auth suitable for local scripts and CI secrets management.

Authentication errors must fail fast before run creation where possible.

## 7. Artifact Output

Headless runs should optionally write artifacts:

- full event log JSONL
- final summary JSON
- patch/change summary text

Output paths must be user-configurable.

## 8. Backward-Compatible API Use

The CLI may be built on existing APIs, but it must provide a stable UX contract independent of internal endpoint refactors.

## Acceptance Criteria

1. A user can launch an interactive session from terminal and exchange steering messages.
2. A headless command can run a task end-to-end without UI interaction.
3. Headless mode emits valid JSONL events containing IDs, timestamps, and event types.
4. Exit codes are deterministic and documented for common terminal outcomes.
5. CLI auth works in non-interactive CI contexts via token input.
6. Event logs can be redirected to file for downstream parsing.

## Implementation Notes

- Prefer a thin CLI client over existing server APIs before adding new backend endpoints.
- Keep event schema versioned (`schemaVersion`) to support future evolution.
- Provide a `--quiet` mode for machine-only consumption and a human-readable default mode.

## Open Questions

- Should the CLI support local daemon auto-start, or require explicit daemon lifecycle management?
- Should headless mode support resumable runs by ID in MVP or post-MVP?

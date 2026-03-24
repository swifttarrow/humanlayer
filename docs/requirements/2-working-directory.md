# Requirement: Agent Working Directory Selection and Isolation

## Summary

Users must be able to specify the working directory that a coding agent can operate in, with consistent behavior across local development and Docker execution.

The system must preserve sandbox isolation by default while allowing explicitly selected surfaces to be exposed to the agent.

## Problem

Without a clear working-directory contract, agent runs can become unsafe, non-reproducible, or inconsistent between local and containerized environments.

Users need:

- a predictable way to choose where the agent can read/write
- bounded filesystem access with least-privilege defaults
- equivalent semantics in local and Docker modes

## Scope

This requirement defines:

- how a user provides a working directory
- normalization and validation rules for that path
- UI requirements for selecting and submitting the working directory
- local runtime access boundaries
- Docker runtime mount and isolation behavior
- selectively exposed surfaces in both modes

This requirement does not define UI visual design details.

## User Stories

### Primary

As a developer, I want to specify the agent working directory so the agent only edits files in the intended project area.

### UI Selection

As a user, I want to choose the working directory from the UI when creating a session so I do not need to manually call APIs for path configuration.

### Local Iteration

As a developer running locally, I want fast iteration while still preventing the agent from touching arbitrary host paths.

### Containerized Execution

As a developer running with Docker, I want the same working-directory behavior with stronger runtime isolation and explicit host-path exposure.

## Functional Requirements

## 1. Working Directory Input Contract

The system must allow a user to provide a `working_directory` for each session run.

The system must support setting `working_directory` from:

- UI session creation flow
- API request payloads used by non-UI clients

The input contract must support:

- absolute host path input
- optional relative path input resolved against a configured workspace root

The system must reject a run request when:

- the resolved path does not exist
- the resolved path is not a directory
- path resolution escapes configured policy boundaries (for example via `..` traversal)

## 1A. UI Selection Contract

The UI must provide a working-directory input in the session creation flow.

The UI behavior must include:

- sending the selected `working_directory` in create-session requests
- allowing optional exposed-surface declarations when supported by deployment policy
- displaying validation errors returned by the server with actionable feedback
- preserving the user-entered value after validation failure so it can be corrected and retried

The UI must not bypass server validation or perform trust-only client-side allowlisting.

## 2. Path Resolution and Policy Enforcement

Before agent start, the runtime must:

- resolve the user-provided path to a canonical absolute path
- validate the path against an allowlist policy
- persist both the original input and resolved canonical path in session metadata

Policy model:

- default deny outside configured allowed roots
- explicit allow for configured additional roots
- no implicit expansion to broader parent directories

## 3. Local Runtime Boundary

In local development mode, the agent must treat the validated `working_directory` as its primary writable root.

The runtime must enforce:

- write operations allowed only under `working_directory` and explicitly exposed writable surfaces
- read operations allowed under `working_directory` and explicitly exposed readable surfaces
- command execution defaults to `cwd = working_directory`

The runtime should block or fail-safe on attempts to access disallowed paths.

## 4. Docker Runtime Boundary

In Docker mode, the agent container must still run with sandbox isolation and no inbound networking requirements.

The container filesystem contract must include:

- a bind mount for the resolved host `working_directory` to a deterministic container path (for example `/workspace`)
- the agent process `cwd` set to that mounted workspace path
- no automatic host root mount

Container security baseline must include:

- least-privilege mounts
- non-root user where feasible
- read-only root filesystem where feasible, with explicit writable exceptions

## 5. Selectively Exposed Surfaces

The system must support an explicit list of additional surfaces that are exposed to the agent beyond `working_directory`.

Each exposed surface must declare:

- host path
- mount/access target
- access mode (`read_only` or `read_write`)
- rationale or label for auditability

Examples of selectively exposed surfaces:

- read-only credentials/config directory needed for tool auth
- read-only package cache
- read-write temp/scratch directory

If a surface is not explicitly exposed, it must remain inaccessible by policy.

## 6. Observability and Auditability

For each run, the system must emit and persist metadata describing:

- resolved `working_directory`
- runtime mode (`local` or `docker`)
- list of exposed surfaces with access modes
- policy validation result at startup

For denied file access attempts, the system should emit structured warnings/events suitable for debugging policy behavior.

## 7. Error Semantics

When working-directory validation fails, the run must fail before agent execution starts.

Error responses must include machine-readable reason codes, at minimum:

- `WORKDIR_NOT_FOUND`
- `WORKDIR_NOT_DIRECTORY`
- `WORKDIR_NOT_ALLOWED`
- `EXPOSED_SURFACE_NOT_ALLOWED`

## 8. Backward Compatibility

If no `working_directory` is provided, the system may use a configured default workspace root only if that default is explicitly configured.

Implicitly using process current directory without configuration is not allowed.

## Acceptance Criteria

1. A user can start a session with `working_directory=/some/path`, and the agent executes with that directory as its default `cwd`.
2. A path outside allowed roots is rejected before execution with `WORKDIR_NOT_ALLOWED`.
3. In local mode, write attempts outside allowed surfaces are blocked and logged.
4. In Docker mode, only declared mounts are visible in-container; undeclared host paths are inaccessible.
5. Docker runs preserve isolation while still allowing explicitly declared read-only/read-write surfaces.
6. Run metadata includes resolved working directory and exposed surfaces for every session.
7. Local and Docker modes produce equivalent policy outcomes for the same configuration (except expected runtime differences in container internals).
8. A user can set `working_directory` from the UI session-creation flow, and the value is transmitted unchanged to the server for canonicalization/validation.
9. When server validation fails, the UI surfaces the returned reason code/message and lets the user correct and resubmit without losing entered values.

## Open Questions

- Should per-session `working_directory` overrides be allowed for all users, or gated by role/policy?
- Should symlink traversal be fully disallowed or allowed only when both source and target are inside allowed roots?
- Should local mode support optional stronger containment (for example a lightweight sandbox profile) to more closely match Docker guarantees?

# Product Requirements Document

## Product

Sync-Based Headless Coding Agent System

## Summary

Build an MVP system that lets a user create, run, monitor, and stop a headless coding-agent session in real time.

The product is not trying to be the most autonomous or feature-rich coding agent. The MVP is explicitly optimizing for:

* clear separation between server, agent, and UI
* visible and inspectable execution
* reliable session lifecycle semantics
* a believable real-time experience
* a simple architecture that can be explained, demoed, and extended

## Problem

Most coding-agent products hide execution details, couple the runtime too tightly to the UI, or make control semantics vague. That makes them hard to trust, hard to debug, and hard to extend.

We need a system where:

* the agent runs independently from the UI
* the server is the source of truth for session state
* users can watch the agent's work as it happens
* stop/retry behavior is explicit and reliable enough for real use
* past sessions remain inspectable for debugging and evaluation

## Goals

The MVP must:

* let a user create a coding session from the UI
* let a headless agent pick up and execute that session
* stream meaningful progress updates to the UI in near real time
* persist the session and its execution history durably
* let the user stop the session with honest, understandable semantics
* preserve partial progress and history after completion, failure, or stop
* run through `docker compose up` with minimal setup

## Non-Goals

The MVP will not attempt to provide:

* best-in-class coding performance
* multi-agent orchestration
* exact mid-step resume after crash
* token-level persistence as a default behavior
* advanced analytics or cross-session dashboards
* tenant isolation or RBAC
* queue or broker infrastructure
* automatic failover between agents
* production-grade autoscaling

## Target Users

### Primary User

Engineers and technical evaluators who want to understand how a coding-agent system behaves, not just whether it returns an answer.

They care about:

* architecture clarity
* runtime observability
* debuggability
* credible control semantics

### Secondary User

Infra or AI engineers exploring orchestration patterns for headless agents.

They care about:

* system boundaries
* event model choices
* failure handling
* portability between local and containerized execution

## Product Principles

### 1. Correctness over cleverness

The system should prefer a simple model that is easy to reason about over a more "real-time" or "distributed" design that is harder to make trustworthy.

### 2. Structured visibility over raw verbosity

Users should see what step the agent is on, what tool it is using, and what happened next. Raw logs should exist, but they are not the primary UI.

### 3. Durable intent over best-effort signaling

Start and stop are server-recorded control intents, not ephemeral messages sent directly to a process.

### 4. Event truth, derived convenience

The canonical history is the append-only event stream. Faster UI reads should come from derived state, not from inventing a different source of truth.

## User Stories

### Session Creation

As a user, I want to submit a coding task from the UI so that an available agent can execute it.

### Live Monitoring

As a user, I want to observe what the agent is doing in real time so that I can understand progress and trust the system.

### Stop Control

As a user, I want to stop a running session so that no new agent work begins after I cancel it.

### Session Review

As a user, I want to inspect completed, failed, or stopped sessions later so that I can debug behavior and evaluate the system.

### Environment Portability

As a developer, I want the same agent contract to work locally and in Docker so that I can iterate quickly and still demo or package the system consistently.

## MVP Scope

The MVP includes three runtime components and one datastore:

* a TypeScript server
* a TypeScript headless agent daemon
* a TypeScript web UI
* a relational database, with Postgres as the default

### Included Capabilities

* create a session from the UI
* persist session metadata
* allow an agent to pull and claim work
* run one active execution attempt per session
* stream structured progress updates to the UI
* persist append-only session events
* derive current session state for fast reads
* stop a running session gracefully
* show historical sessions and session detail

### Excluded From MVP

* multiple agents coordinating on one session
* browser-side collaborative editing
* advanced auth/user management
* large-scale event analytics
* fully interactive streaming chat UX

## End-to-End User Flows

### Flow 1: Create and Run a Session

1. User opens the UI and submits a coding task.
2. Server creates a session in `created`.
3. Agent polls for work.
4. Server atomically assigns the session and creates an `attempt_id`.
5. Session transitions to `starting`, then `running` when the first heartbeat or execution event arrives.
6. Agent emits step-level events while executing.
7. Server persists those events and streams updates to the UI.
8. Session reaches `completed` or `failed`.
9. User can inspect the final trace and outputs.

### Flow 2: Stop a Running Session

1. User clicks Stop in the UI.
2. Server records stop intent durably and transitions the session to `stopping`.
3. Agent observes stop intent before beginning the next step.
4. Agent finishes the current atomic step if necessary, emits final events, and exits the attempt.
5. Session transitions to `stopped`, `completed`, or `failed`.
6. UI preserves visible partial progress and final status.

### Flow 3: Reopen a Past Session

1. User opens a prior session from the session list.
2. UI loads derived session state and historical events from the server.
3. User sees the structured trace, outputs, and terminal outcome.

## Functional Requirements

## 1. Session Management

The system must:

* create a session with a task payload
* persist session lifecycle state
* create and track execution attempts separately from sessions
* allow only one active attempt per session at a time
* expose session detail and history to the UI

### Acceptance Criteria

* Creating a session produces a durable row in the database.
* A session can be listed and fetched after server restart.
* Claiming work creates an attempt with agent ownership and lease metadata.
* The server rejects stale attempt writes after lease loss or reassignment.

## 2. Agent Coordination

The system must:

* support outbound-only agent communication
* let agents poll or long-poll for work
* assign work with lease-based ownership
* support heartbeat-based lease renewal
* support idempotent completion/failure reporting

### Acceptance Criteria

* The agent does not require inbound connectivity or an exposed port.
* Only one agent can claim a session attempt at a time.
* If an agent stops heartbeating and lease expires, the session becomes recoverable or stalled.
* Duplicate event or completion submissions from the same attempt do not corrupt state.

## 3. Agent Execution

The system must:

* run a step-based execution loop
* emit structured lifecycle events at meaningful boundaries
* support a minimal coding-oriented toolset
* persist terminal outcome and summary

The initial toolset should include:

* file search/read
* patch/apply edits
* shell command execution

### Acceptance Criteria

* A running session produces visible step-level progress in the UI.
* At least one tool invocation is visible as a structured event when used.
* The attempt ends in a terminal state with a durable result summary.

## 4. Event Ingestion and Storage

The system must:

* persist an append-only ordered event log per session attempt
* support idempotent event ingestion
* store enough metadata to dedupe and order events correctly
* derive a minimal current-state projection for fast UI reads

Each event must include at least:

* `session_id`
* `attempt_id`
* `event_id`
* `sequence_number`
* `event_type`
* `created_at`
* `payload`

### Acceptance Criteria

* Events remain queryable after session completion.
* The server can reject or ignore duplicate event submissions safely.
* The UI can reconstruct a session from persisted state and event history after reconnect.

## 5. Realtime UI Updates

The system must:

* stream live updates from server to UI
* show current execution status
* show structured step and tool progress
* remain correct when the live stream disconnects and reconnects

The MVP transport choice is:

* HTTP for control actions
* SSE for live session updates

### Acceptance Criteria

* A user watching an active session sees progress without refreshing the page.
* On reconnect, the UI can recover using current state plus missed events.
* The UI remains usable even if the stream drops temporarily.

## 6. Stop Semantics

The MVP stop contract is:

> Once stop is accepted, no new agent step will begin. The current atomic step may finish, and some final buffered output may still appear.

The system must:

* expose a single Stop control in the UI
* record stop intent durably
* transition session state to `stopping`
* prevent new steps after stop is accepted
* preserve partial progress and final metadata

### Acceptance Criteria

* Repeated stop requests are idempotent.
* A stopped session shows the last completed step and terminal reason.
* The session does not continue into additional new work after stop acceptance.

## 7. Historical Inspection

The system must:

* show prior sessions
* show terminal state and summary
* show event-backed session detail
* allow inspection of raw logs or raw events as an escape hatch

### Acceptance Criteria

* A completed or failed session remains viewable after page reload or restart.
* Users can inspect both structured trace information and underlying raw event history.

## 8. Evaluation and Regression Requirements

The MVP must include a lightweight but explicit evaluation loop so behavior changes can be measured, not guessed.

The system must:

* define a small, versioned eval set for core lifecycle behaviors (`create`, `run`, `stop`, `retry`, and `reconnect/replay`)
* define a small, versioned safety/adversarial eval set (for example: prompt-injection attempts, disallowed command patterns, and secret-exfiltration attempts)
* define deterministic pass/fail checks for each eval case
* include qualitative scoring rubrics for trace quality and stop-semantic honesty
* run evals locally via a documented command
* require eval results to be recorded in a durable artifact before demo sign-off
* compare the latest eval run against a saved baseline and fail the gate on must-pass regressions

For non-deterministic model behavior, the MVP eval harness must:

* pin and record model configuration used for evals (including temperature and any other variance-driving settings)
* support repeated runs per scenario and report aggregate pass rate
* define a minimum pass-rate threshold for probabilistic scenarios that are not strict binary checks
* surface variance explicitly in eval output so regressions are distinguishable from noise

MVP eval categories must include at least:

* lifecycle correctness evals (state transitions, terminal outcomes, idempotent controls)
* event integrity evals (`event_id` dedupe, `sequence_number` ordering, stale-attempt rejection)
* realtime recovery evals (SSE disconnect/reconnect with snapshot + replay correctness)
* stop contract evals (no new step starts after stop acceptance)
* safety/adversarial evals (expected refusal or safe-handling behavior under risky inputs)
* efficiency evals (runtime latency, error rate, and cost/token budget adherence)

Rubric-scored dimensions must define:

* judge method (`human`, `model-judge`, or `hybrid`)
* rubric scale and pass threshold
* tie-break or escalation path when rubric scores are ambiguous
* persisted score rationale to support auditability

### Acceptance Criteria

* The repository includes a documented eval spec and fixture set for MVP scenarios.
* Running the eval command produces a machine-readable results artifact and a human-readable summary.
* Any failing eval clearly identifies scenario, expected behavior, and observed mismatch.
* MVP demo readiness requires all must-pass eval cases to pass.
* Eval outputs include run configuration, run count, aggregate pass rates, and variance notes for probabilistic scenarios.
* Eval outputs include baseline comparison and an explicit regression verdict.
* Eval outputs include latency/error/cost budget checks with pass/fail status.
* Rubric-scored outputs include judge type, score, threshold, and rationale.

## UX Requirements

The main experience should be a **structured trace**, not a token waterfall.

### Session List

The UI should show:

* session title or input summary
* current status
* last updated time
* terminal outcome where applicable

### Session Detail

The UI should show:

* current state
* current step
* completed steps
* tool activity
* durations/status per step
* final answer or result summary
* a raw event/log view for debugging

### Status States

The UI must distinguish:

* `created`
* `starting`
* `running`
* `stopping`
* `stopped`
* `completed`
* `failed`
* optionally `stalled`

### UX Constraints

The UI should not:

* make raw token streaming the primary view
* rely on the live stream as the only source of truth
* hide partial progress on stop/failure

## Technical Constraints

The system must satisfy these constraints:

* entire codebase is written in TypeScript
* frontend must not use Next.js
* no paid infra dependencies beyond LLM API keys
* agent must support outbound-only communication
* Docker Compose must be the default demo/deployment path
* the system should work with `.env`-based configuration

## Recommended Architecture Decisions

The PRD adopts the following implementation decisions:

* use pull-based agent coordination over HTTP
* use lease-based session attempt ownership
* use append-only event logging as canonical history
* use derived session state for fast reads
* use SSE for server-to-UI live updates
* use a step-based agent loop
* use soft-stop-first cancellation with backend escalation if needed
* keep the server monolithic for MVP

These decisions are not optional flavor. They are part of the intended MVP shape.

## Data Model Requirements

The MVP data model must include at least:

### Sessions

* session identity
* task summary/input
* lifecycle status
* created/updated timestamps

### Session Attempts

* attempt identity
* assigned agent identity
* lease expiration
* status
* stop metadata
* started/ended timestamps

### Session Events

* ordered append-only event records
* event identity and sequence metadata
* flexible payload storage

### Session State

* latest status
* latest step summary
* latest output summary
* last heartbeat or activity timestamp

## Reliability Requirements

The MVP must be eventually correct under common failure modes.

### Required Reliability Behaviors

* event ingestion is idempotent
* session attempts use heartbeats and leases
* duplicate event delivery does not duplicate persisted truth
* stale attempts cannot overwrite newer attempts
* disconnected UIs can recover via snapshot plus replay
* expired leases are detected by a sweeper or equivalent reconciliation path

### Explicit MVP Reliability Limits

The MVP may:

* require manual retry instead of automatic resume
* lose only very recent in-memory unsent agent events during a hard crash
* treat tools as atomic rather than fully interruptible

## Metrics for MVP Success

The MVP is successful if it demonstrates all of the following:

### Product Success

* a user can create and run a session from the UI
* the session becomes visibly active without manual refresh
* the user can stop a running session and see honest final state
* the user can reopen the session later and inspect what happened

### Architecture Success

* server, agent, and UI remain cleanly separated
* the agent uses outbound-only communication
* canonical session history is durable and inspectable
* the system runs in Docker Compose with minimal setup

### Demo Success

The repository and demo should show:

* session creation
* live execution trace
* tool activity
* stop behavior
* final persisted session history

## Milestones

### Milestone 1: Lifecycle Backbone

Build:

* session schema
* attempt schema
* claim/lease model
* stop intent model

### Milestone 2: Minimal Agent

Build:

* agent daemon
* polling/long-polling for work
* heartbeat loop
* step-based execution skeleton
* minimal toolset

### Milestone 3: Event Pipeline

Build:

* event ingestion
* dedupe and ordering checks
* append-only storage
* session-state projection
* SSE stream

### Milestone 4: UI

Build:

* session creation flow
* session list
* session detail view
* structured trace
* stop control

### Milestone 5: Reliability and Demo Readiness

Build:

* stalled session handling
* reconnect/replay behavior
* manual retry path if included
* Docker Compose setup
* README and demo polish

## Risks

### 1. Overbuilding realtime infrastructure too early

Risk:
WebSockets, queues, or token-heavy streaming could consume time without improving the MVP outcome.

Mitigation:
Keep HTTP + SSE + step-level events as the default.

### 2. Ambiguous stop behavior

Risk:
If stop semantics are unclear, the UI will feel broken even if the backend is functioning.

Mitigation:
Treat stop as durable intent and show `stopping` explicitly.

### 3. Event model too noisy or too sparse

Risk:
Too much detail overwhelms the UI; too little detail makes the system opaque.

Mitigation:
Persist step-level events as canonical and add only selective live text deltas later.

### 4. Recovery semantics become confusing

Risk:
Without attempts and leases, retries and disconnects create correctness bugs.

Mitigation:
Make attempts, event IDs, and sequence numbers mandatory from the start.

## Open Questions

These are intentionally left open for implementation, not architecture:

* which exact TypeScript stack to use for server and UI
* which LLM provider or abstraction layer to use first
* whether agent work polling should start as short-polling or long-polling
* whether retry is part of MVP UI or left as an operator/developer action

## Final MVP Definition

The MVP is complete when a user can:

1. create a coding session in the UI
2. watch a headless agent pick it up and execute it
3. see structured live progress and tool activity
4. stop the run with understandable semantics
5. revisit the full session history later

And when the implementation clearly demonstrates:

* a decoupled server/agent/UI architecture
* durable event-backed state
* credible realtime behavior
* credible failure handling for an early-stage system

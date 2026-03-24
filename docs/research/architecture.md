# Architecture Recommendation

## Recommended Architecture

Build a **single-writer control plane** around four runtime components:

1. **Server**
   Owns session lifecycle, agent coordination, event ingestion, derived session state, and UI fan-out.
2. **Agent**
   Runs a **step-based execution loop**, pulls work from the server, executes locally, and posts append-only events back.
3. **UI**
   Creates sessions, watches live progress, and issues infrequent control actions like stop/retry.
4. **Postgres**
   Stores canonical session metadata, the append-only event log, and a minimal derived state/read model.

For MVP, keep the topology intentionally boring:

* `ui -> server` over HTTP for commands and SSE for live updates
* `agent -> server` over outbound HTTP only
* `server -> postgres` as the sole durable store

Do **not** start with Redis, Kafka, NATS, a workflow engine, or separate realtime infrastructure.

### Control Plane Shape

The server is the coordination authority. The agent should not talk to the UI or the database directly.

Use this contract:

* `POST /sessions` creates a session in `created`
* `POST /agents/:id/pull` atomically claims one runnable session and returns an `attempt_id`
* `POST /agents/:id/heartbeat` renews liveness and lease
* `POST /sessions/:id/events` ingests an ordered batch of events for the current attempt
* `POST /sessions/:id/stop` records durable stop intent
* `GET /sessions/:id` returns current derived state
* `GET /sessions/:id/events` returns canonical history
* `GET /sessions/:id/stream` streams live updates over SSE

### Execution Model

Use a **step-based, single-active-attempt loop**:

* plan
* inspect
* act
* validate
* summarize

Each step produces structured events and explicit boundaries. This is the right abstraction for a coding agent because it makes cancellation, replay, debugging, and UI presentation tractable.

### Data Model

Use a **hybrid model with event-log-first bias**:

* `sessions`: lifecycle, ownership, coarse metadata
* `session_attempts`: execution attempts, lease ownership, stop reason, timestamps
* `session_events`: append-only canonical trace
* `session_state`: derived latest view for fast UI reads
* optionally later: `tool_invocations` and `session_messages` as richer read models

The canonical write path is:

`agent event batch -> server dedupe/order check -> persist to session_events -> update session_state -> fan out to SSE subscribers`

### Streaming Model

Persist **step-level events** as the system record.

Examples:

* `session.started`
* `step.started`
* `tool.started`
* `tool.completed`
* `message.completed`
* `session.completed`
* `session.failed`

If you want more responsiveness, add **live-only coarse text deltas** for the final assistant message, but do not make raw token persistence the default. The system should stream meaning, not noise.

### Environment Model

Design the agent with one entrypoint and two runtimes:

* **local-first** for day-to-day development
* **containerized** for Compose demos, CI, and reproducible runs

That means the agent contract should be identical across environments, even if the runtime differs.

## Key Design Decisions

### 1. Use pull-based HTTP coordination, not agent-side WebSockets

This is the most important tradeoff to resolve.

Choose:

* agent polls or long-polls for work
* agent renews a lease while running
* agent posts event batches back over HTTP

Do not choose a long-lived agent socket for MVP.

Why:

* outbound-only agents already fit pull semantics naturally
* leases + polling solve correctness before latency
* reconnect/replay logic is much simpler
* Docker and local development stay straightforward
* dispatch latency is not the bottleneck that will make or break the first version

This gives up some elegance, but it dramatically lowers coordination risk.

### 2. Use SSE for server-to-UI streaming

The UI is primarily an observer, not a peer in a duplex protocol.

Choose:

* SSE for live session updates
* normal HTTP for start/stop/retry actions

Do not choose browser WebSockets first.

Why:

* simpler browser/server implementation
* easier reconnect behavior
* good fit for append-only session feeds
* enough for the actual interaction model

If the UI later becomes highly interactive, move to WebSockets then. Not before.

### 3. Make the event log the source of truth

Persist ordered immutable events first, then derive friendly views.

Why:

* agent behavior will evolve quickly
* trace fidelity matters more than perfect schema purity early on
* replay and debugging are first-class requirements here
* derived models can be rebuilt; lost truth cannot

The mistake to avoid is designing tables around the current UI instead of the runtime reality.

### 4. Introduce attempts and leases on day one

A session is not enough. You need explicit **attempts**.

Each attempt should have:

* `attempt_id`
* `assigned_agent_id`
* `lease_expires_at`
* `status`
* `stop_requested_at`

Each event should carry:

* `session_id`
* `attempt_id`
* `event_id`
* `sequence_number`

Why:

* prevents stale agents from finishing old work
* makes retries and crash recovery understandable
* makes idempotency possible
* removes ambiguity around split-brain behavior

Without attempts, recovery gets hand-wavy very quickly.

### 5. Default to one-tool-per-step orchestration

Let the agent reason in a flexible loop, but constrain execution:

* one planning/action decision at a time
* one authoritative tool action per step
* explicit validation before continuing

Why:

* much easier to observe and debug
* safer cancellation boundaries
* easier prompt/state design
* enough power for MVP coding tasks

Batched read-only discovery can come later. Do not start there.

### 6. Define stop as durable intent, not instant kill

Expose a single Stop action, but implement:

* graceful stop first
* no new steps after stop is accepted
* current atomic step may finish
* backend escalation to hard kill only after timeout

Why:

* honest contract
* preserves partial progress
* matches the step-based loop
* avoids lying to users about immediate termination guarantees

This should surface in the session state machine:

`created -> starting -> running -> stopping -> completed | stopped | failed`

### 7. Keep the server monolithic until fan-out becomes painful

For MVP, one backend service should handle:

* session APIs
* claim/lease logic
* event ingest
* derived state updates
* SSE fan-out

Why:

* fewer moving parts
* faster iteration
* easier to reason about end-to-end correctness

The first scale split should be **ingestion API vs realtime gateway**, not a queue-first redesign.

### 8. Optimize granularity before adding infrastructure

When the system strains, first reduce message volume:

* batch agent events
* coalesce text deltas
* persist semantic step events, not every micro-update
* cap per-subscriber buffers

Why:

* the earliest scaling pain will come from chatty fan-out and write amplification
* infra additions will not save a noisy event model

### 9. Make the primary UX a structured trace, not raw logs

The main session screen should show:

* current step
* completed steps
* tool invocations
* status and duration
* expandable raw logs per step

Why:

* this matches the mental model users actually need
* raw logs remain available without becoming the default experience
* it reinforces the step-based execution model across the stack

## What To Build First

Build the MVP in this order.

### 1. Session lifecycle and attempt model

Ship the data model and server contract first:

* `sessions`
* `session_attempts`
* `session_events`
* `session_state`
* claim + lease renewal
* stop intent recording
* stale attempt rejection

If this is wrong, everything above it becomes unreliable.

### 2. Minimal headless agent loop

Implement a local-first TypeScript agent that can:

* pull one session
* create/receive an attempt
* emit step lifecycle events
* run a tiny toolset
* respect stop requests at step boundaries
* complete or fail cleanly

Keep the first toolset narrow:

* read/search files
* apply patch
* run command

This is enough to prove the architecture without disappearing into tool platform work.

### 3. Canonical event ingestion and SSE fan-out

Build the hot path next:

* ordered event batch ingestion
* dedupe by `event_id` or `(attempt_id, sequence_number)`
* persistence before fan-out
* SSE stream from canonical history plus live tail

This is the backbone of correctness and observability.

### 4. Derived session state and structured trace UI

Once raw events are flowing, add the minimum read model needed for usability:

* current status
* current step
* latest assistant output
* last heartbeat
* tool currently running

Then build a simple UI with:

* session list
* session detail
* structured trace
* stop button
* raw logs escape hatch

Avoid dashboards, graphs, and token waterfalls.

### 5. Reliability guardrails

Before adding richer features, add the small pieces that make the system trustworthy:

* heartbeat timeout
* stalled session detection
* replay from last seen sequence for UI reconnect
* idempotent event ingest
* manual retry as a new attempt
* server sweeper for expired leases

This is the minimum “production-shaped” reliability set.

### 6. Only then add UX polish

After the core loop is correct:

* coarse live text deltas for final assistant output
* richer per-step summaries
* retry button
* improved tool result rendering

Do not start with token streaming, multi-agent flows, or queue infrastructure.

## Explicit Non-Decisions For MVP

Do not build these yet:

* WebSockets for the agent
* browser WebSockets
* Redis/Kafka/NATS
* automatic failover to another agent
* exact mid-step resume
* token-level persistence
* multi-tenant isolation
* DAG/workflow orchestration
* a separate analytics pipeline

Those are legitimate later upgrades, but they are not the shortest path to a system that is correct, inspectable, and convincingly real.

## Bottom Line

The MVP should optimize for **deterministic coordination, inspectable execution, and honest recovery semantics**.

That means:

* **pull-based agent coordination**
* **SSE to the UI**
* **append-only events as truth**
* **derived state for reads**
* **step-based execution with cooperative cancellation**
* **attempts and leases from day one**

The right first version is not the most “real-time” architecture. It is the one you can operate, debug, and trust when the first ugly failure happens.

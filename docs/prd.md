# StreamForge
*Building Reliable Agent Orchestration for Real-Time Coding Systems*

## Before You Start: Pre-Search ([time: 1-2 hours])

You must complete the Pre-Search appendix before you write production code. This is not optional and it is part of your grading rubric.

Your completed Pre-Search output is part of your final submission and must be saved at `docs/pre-search.md`.

This sprint emphasizes **systems-first engineering**: define constraints, choose interfaces, then implement. The Pre-Search process forces you to make architecture decisions intentionally before you touch implementation details.

## Background

Modern developer tooling companies such as GitHub (Copilot/Codespaces), Replit (cloud execution), and sourcegraph-style code intelligence products rely on reliable real-time coordination between an execution runtime, backend control plane, and frontend observability surface. The core challenge is not just generating model output; it is creating durable, replayable, controllable session state while tools execute in noisy network conditions.

You must build a sync-based headless coding agent system with three clear boundaries: server process, agent daemon, and reactive UI. Your technical challenge is to implement robust event streaming (agent -> server -> UI), strict session lifecycle control, and production-like operability through `docker compose up`, while staying within TypeScript-only and dependency constraints.

## Gate Statement

Gate: **Project completion + interviews** required for Austin admission.

## Project Overview

One-week sprint with three checkpoints:

| Checkpoint | Deadline | Focus |
|---|---|---|
| Pre-Search | Day 1 (1-2 hours) | Constraints, architecture options, stack decisions, risk plan |
| Build Checkpoint | Tuesday / 24 hours | End-to-end skeleton with live streaming path and persisted sessions |
| Early Submission | Friday / 4 days | Hardened core workflows, replay semantics, measurable reliability |
| Final Submission | Sunday / 7 days | Complete deliverables, documentation, demo, and cost analysis |

## Build Checkpoint Requirements (24 Hours)

Progress gate. All items required for this checkpoint:

- ☐ Server boots with TypeScript build and exposes health + session API routes.
- ☐ Database schema exists for `sessions` and `events` and is auto-created/migrated in local run.
- ☐ Agent starts via one CLI command and establishes outbound connection to server.
- ☐ You can create a session from the UI and see it persisted in the database.
- ☐ Agent can claim one queued session and emit at least three event types (status, token/message, tool-call placeholder).
- ☐ Server persists incoming events and broadcasts them to connected UI clients in near real-time.
- ☐ Stop session request transitions session to stopping/stopped and interrupts active agent loop.
- ☐ `docker compose up` starts all required containers with no manual post-start steps.
- ☐ Deployed and publicly accessible.

A simple event pipeline with deterministic ordering beats a complex orchestration layer with broken replay behavior.

## Core Technical Requirements

### Control Plane and Session Lifecycle

| Feature | Requirements |
|---|---|
| Session creation | Create a session through API and return stable `sessionId`. |
| Session states | Support queued, running, stopping, stopped, failed, completed transitions. |
| Session claiming | Only one agent may claim a runnable session at a time. |
| Session stop | Stop requests must be durable and visible to agent within 2 seconds. |
| Session idempotency | Repeated create/stop requests must not corrupt state. |
| Session auditability | Each lifecycle transition must produce an event with timestamp. |

### Event Ingestion and Realtime Sync

| Feature | Requirements |
|---|---|
| Event envelope | Every event includes `eventId`, `sessionId`, `sequence`, `timestamp`, `type`, and typed payload. |
| Event ordering | Events must be persisted and replayed in increasing session sequence order. |
| Deduplication | Duplicate event submissions with same `eventId` must be ignored safely. |
| Reconnect replay | UI reconnect must request replay from last seen event sequence. |
| Backpressure | Server must batch or throttle high-frequency event fanout without dropping terminal events. |
| Fanout | Multiple UI clients may watch the same session concurrently. |
| Persistence | All tool calls, intermediate reasoning tokens/messages, and final outputs are stored. |

### Agent Runtime and Tool Execution

| Feature | Requirements |
|---|---|
| Daemon startup | Agent starts from CLI and can run in containerized or local runtime. |
| Outbound networking | Agent must not require inbound ports and must only connect outward. |
| Poll/push loop | Agent repeatedly requests work or receives assignment over existing connection. |
| Tool execution model | Tool calls are represented as explicit events with start/result/failure semantics. |
| Cancellation boundaries | Agent checks cancellation between model chunks and tool steps. |
| Error handling | Provider/tool errors emit structured events and transition session safely. |
| Runtime portability | No dependency on managed paid infra except optional LLM API key. |

### Testing Scenarios

We will test:

1. You create a session, start processing, and observe ordered live updates in UI.
2. You refresh the UI mid-run and replay resumes from the last received event.
3. You issue stop during tool execution and the run halts without orphaned active state.
4. You simulate duplicate event submission and the timeline remains logically correct.
5. You disconnect agent network briefly, reconnect, and recover with no duplicate terminal output.
6. You run multiple concurrent sessions and confirm no cross-session event leakage.
7. You run everything through `docker compose up` from a clean environment.
8. You inspect persistence and confirm lifecycle, tool, and final message events are queryable.

### Performance Targets

| Metric | Target |
|---|---|
| Session create API latency (p95) | <= 250 ms |
| Agent event ingest latency (p95, agent->persisted) | <= 400 ms |
| UI propagation delay (persisted->visible, p95) | <= 700 ms |
| Concurrent active sessions on baseline laptop/dev VM | >= 20 |
| Event durability | 0 lost terminal events across forced UI reconnect tests |
| Stop request reaction time (p95) | <= 2 seconds |

## Domain-Specific Deep Section: Streaming Protocol and Session Orchestration

This project's signature challenge is implementing a replay-safe, idempotent, low-latency event protocol across a distributed system.

### Required Capabilities

You must implement all of the following protocol capabilities:

- Session-scoped monotonic event sequencing.
- Durable stop intent and cancellation handshake.
- Replay endpoint (or stream handshake) from last acknowledged sequence.
- Event schema validation at ingest boundary.
- Agent liveness heartbeat with timeout-based stale detection.

Example API commands:

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "content-type: application/json" \
  -d '{"prompt":"Refactor parser and add tests"}'
```

```bash
curl -X POST http://localhost:3000/api/sessions/<sessionId>/stop
```

```bash
curl "http://localhost:3000/api/sessions/<sessionId>/events?afterSequence=142&limit=200"
```

### Protocol Schema (TypeScript)

```ts
export type SessionEventType =
  | "session.created"
  | "session.claimed"
  | "agent.heartbeat"
  | "model.delta"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "message.final"
  | "session.stopping"
  | "session.stopped"
  | "session.failed"
  | "session.completed";

export interface SessionEvent<TPayload = unknown> {
  eventId: string;
  sessionId: string;
  sequence: number;
  timestamp: string;
  type: SessionEventType;
  payload: TPayload;
}
```

### API Signatures (Minimum)

```ts
// session control
POST /api/sessions
POST /api/sessions/:sessionId/stop
GET  /api/sessions/:sessionId

// event ingestion and replay
POST /api/agent/events/batch
GET  /api/sessions/:sessionId/events?afterSequence=<n>&limit=<m>

// realtime
GET  /api/sessions/:sessionId/stream
```

### Evaluation Criteria (Input -> Expected Output)

| Input | Expected Output |
|---|---|
| Agent submits batch with duplicated `eventId` | Duplicate ignored; response reports accepted vs deduped counts |
| UI reconnects with `afterSequence=80` | Stream/replay returns events `81...N` with no gap or reordering |
| Stop requested while model is streaming deltas | Session transitions to stopping then stopped; no new tool starts after stop |
| Agent heartbeat missing beyond timeout | Session marked stale/failed with explicit system event |
| Tool execution throws error | Structured `tool.failed` persisted; session can fail gracefully or recover based on policy |

### Implement at least 4 of the following:

1. Batched event ingest endpoint with per-event validation and partial success response.
2. Sequence-gap detector that emits `system.sequence_gap_detected` alert event.
3. Resume tokens for UI stream subscriptions.
4. Agent lease mechanism (`claimedBy`, `leaseExpiresAt`) with renewal heartbeat.
5. Event archival process for old sessions into compressed storage.
6. Reconciliation job that rebuilds session summary state from event log.

### Deep-Section Performance Targets

| Metric | Target |
|---|---|
| Event dedupe false-positive rate | 0% in deterministic replay tests |
| Replay correctness | 100% contiguous sequence coverage in 50 reconnect runs |
| Batch ingest throughput | >= 200 events/sec sustained for 60 seconds |
| Heartbeat stale detection lag | <= 10 seconds after missed lease window |
| Stream disconnect recovery | UI receives new events within 3 seconds after reconnect |

## AI Cost Analysis (Required)

### Development & Testing Costs

Track these during implementation:

- LLM API spend by day and by feature area (protocol design, bug fixing, tests, docs).
- Input/output token counts per provider/model.
- Number of model calls per successful session run.
- Cost per end-to-end test run when real inference is enabled.
- Retry/amplification overhead caused by failed tool calls or invalid model outputs.
- Optional local model compute cost proxy (CPU/GPU runtime minutes) if applicable.

### Production Cost Projections

| Cost Driver | 100 users | 1K users | 10K users | 100K users |
|---|---:|---:|---:|---:|
| LLM inference | $40-120/mo | $400-1,200/mo | $4,000-12,000/mo | $40,000-120,000/mo |
| Server compute | $20-60/mo | $80-250/mo | $600-2,000/mo | $6,000-20,000/mo |
| Database/storage | $15-40/mo | $60-180/mo | $500-1,500/mo | $5,000-15,000/mo |
| Logging/observability | $0-25/mo | $25-120/mo | $250-1,200/mo | $2,500-12,000/mo |
| Total projected monthly range | $75-245 | $565-1,750 | $5,350-16,700 | $53,500-167,000 |

Include assumptions:

- Average sessions per user per month and average turns/events per session.
- Model mix (premium vs low-cost models) and cache hit rate.
- Event retention window (for example 7 vs 30 vs 90 days) and replay frequency.

## Technical Stack

| Layer | Technology |
|---|---|
| Backend | Node.js + Fastify, Node.js + Express, Bun + Elysia |
| Frontend | React + Vite, SvelteKit (non-Next), SolidStart |
| AI/LLM | OpenAI API, Anthropic API, local llama.cpp-compatible endpoint |
| Database/Storage | PostgreSQL, MySQL, SQLite (dev) + object storage for archives |
| Realtime Framework | Native WebSocket, SSE + REST hybrid, Socket.IO |
| Deployment | Docker Compose (required), Fly.io, Railway, Render, self-hosted VPS |

Use whatever stack helps you ship. Complete the Pre-Search process to make informed decisions.

## Build Strategy

### Priority Order

1. Define and implement event envelope schema, sequencing rules, and idempotency keys.
2. Implement server persistence model and lifecycle transitions for sessions/events.
3. Implement agent claim/execute/report loop with outbound-only connectivity.
4. Implement stop/cancellation propagation and terminal-state guarantees.
5. Implement realtime fanout to UI with replay-from-sequence support.
6. Add Docker Compose orchestration, health checks, and `.env` wiring.
7. Add end-to-end tests for create/run/reconnect/stop/error paths.
8. Harden docs, demo script, and production cost analysis.

### Critical Guidance

- Start with protocol correctness, not UI polish.
- Treat every network write as retryable; design ingest as idempotent.
- Persist canonical state server-side; UI is a projection, never source of truth.
- Put hard execution limits in the agent loop (`maxSteps`, timeout, cancellation checks).
- Measure latency and event rates by default so you can prove performance targets.
- Keep the first version boring and stable before adding advanced tooling.

## Required Documentation

You must include a 1-2 page architecture document in `docs/architecture.md`.

| Section | Content |
|---|---|
| System Boundaries | Server, agent, and UI responsibilities with trust boundaries |
| Data Model | Session and event schema, indexes, and idempotency constraints |
| Realtime Protocol | Transport choice, replay semantics, and ordering guarantees |
| Failure Handling | Cancellation, retries, lease timeout, and dedupe behavior |
| Deployment Topology | Docker Compose services, networking rules, and environment model |
| Tradeoffs | Chosen stack alternatives and why you rejected other options |

## Submission Requirements

Deadline: **Sunday 10:59 PM CT**

| Deliverable | Requirements |
|---|---|
| GitHub Repository | Public repo with full source code and commit history |
| Demo Video (3-5 min) | Show create session, run agent, live updates, stop flow, and replay/reconnect behavior |
| Pre-Search Document | Completed artifact at `docs/pre-search.md` |
| Domain-Specific Docs | `docs/architecture.md` plus protocol/event model explanation |
| AI Cost Analysis | Development tracking + production projection table with assumptions |
| Deployed Application | Public URL where evaluator can run or observe core flow |
| Social Post | Public post summarizing build + lessons, tag @GauntletAI |

## Interview Preparation

### Technical Topics

- Why you chose your realtime transport and how reconnect/replay works.
- How idempotency and sequence ordering prevent duplicate or missing events.
- How cancellation propagates across UI, server, agent, and model/tool execution.
- Tradeoffs in event granularity: raw token deltas vs coalesced events.
- How your schema and indexes support both write throughput and replay reads.
- How you would scale to many agents without duplicate session claims.

### Mindset & Growth

- Explain one architectural mistake you made and how you corrected it.
- Show where you traded scope for reliability under time pressure.
- Describe what you measured versus what you assumed.
- Identify the next refactor you would ship with one more week.

## Final Note

A simple control plane with replay-safe events beats a complex agent platform with broken session guarantees.

Gate remains: **Project completion + interviews** required for Austin admission.

## Appendix: Pre-Search Checklist

Complete this before writing code. Save your AI conversation as a reference document at `docs/pre-search.md`.

### Phase 1: Define Your Constraints

#### 1) Scale and Load Envelope

- How many concurrent active sessions must your MVP support on a laptop?
- What is your expected peak event rate per active session?
- How many UI watchers can subscribe to one session simultaneously?
- What is your acceptable p95 delay from agent event creation to UI visibility?

#### 2) Budget and Operating Cost Limits

- What is your hard weekly budget for model usage during development?
- What model tiers will you allow for local testing vs demo recording?
- What stop conditions will prevent runaway token or tool costs?
- Which costs are variable with users and which are fixed platform costs?

#### 3) Timeline and Scope Boundaries

- Which three workflows are absolutely required by Tuesday checkpoint?
- Which features are explicitly deferred to avoid destabilizing core flow?
- What functionality can be mocked at first without invalidating architecture?
- What “done” definition will you enforce for each checkpoint?

#### 4) Compliance and Data Sensitivity

- Will prompts or tool outputs include secrets, private code, or personal data?
- What fields must be redacted before persistence or logging?
- How long will you retain events and raw model deltas in development?
- What deletion behavior is required if a user requests session removal?

#### 5) Team and Skill Reality

- What parts of this stack are you strongest in and can ship fastest?
- Which subsystem is highest-risk based on your current experience?
- What debugging tools are you comfortable using under time pressure?
- Where will you rely on templates vs writing from first principles?

### Phase 2: Architecture Discovery

#### 1) Realtime Transport Decisions

- Will you use WebSockets, SSE, or a hybrid, and why for this project?
- How will clients resume from disconnect without gaps or duplicates?
- What heartbeat/keepalive mechanism will detect stale connections?
- How will you enforce authN/authZ on long-lived channels?

#### 2) Event Model and Protocol Semantics

- What exact event envelope fields are mandatory for every event?
- Who assigns sequence numbers: agent, server, or both with reconciliation?
- What is your idempotency key and dedupe storage strategy?
- How do you represent partial model deltas vs final assistant messages?

#### 3) Session Orchestration and Claiming

- How will agents discover work: polling, push assignment, or hybrid?
- How do you prevent two agents from claiming the same queued session?
- What lease timeout and renewal cadence will you use?
- What state transitions are legal and who can trigger each transition?

#### 4) Persistence and Query Patterns

- Which tables/indexes do you need for fast ingest and replay?
- How will you query “latest session status” without scanning full event logs?
- What migration strategy will you use for schema evolution?
- How will you archive old sessions while preserving auditability?

#### 5) Agent Loop and Tool Safety

- What tool categories are in scope for MVP execution?
- How will you sandbox or constrain dangerous tool actions?
- Where will cancellation checks occur inside model/tool loops?
- How will tool failures be surfaced to users without losing session integrity?

#### 6) Deployment and Environment Model

- What services are mandatory in Docker Compose and in what startup order?
- How will you health-check database, server, and agent readiness?
- What environment variables are required for a fresh evaluator run?
- How will you guarantee agent container has outbound-only behavior?

### Phase 3: Post-Stack Refinement

#### 1) Security and Failure Modes

- What are the top five failure modes in your end-to-end event path?
- How will you test duplicate delivery, out-of-order events, and dropped connections?
- Which attacks matter most for your chosen realtime protocol?
- What monitoring alert should trigger when stop requests do not complete?

#### 2) Testing and Verification

- Which deterministic integration tests must pass before every merge?
- Which flows require full end-to-end browser-level tests?
- How will you run low-cost test mode without paid LLM dependencies?
- What metrics prove replay correctness and cancellation reliability?

#### 3) Tooling and Developer Workflow

- What lint/type/test commands must pass in CI and local pre-push?
- How will you generate or validate API contracts shared by agent/UI/server?
- What local scripts reduce setup time for evaluators and teammates?
- How will you record architecture decisions during implementation?

#### 4) Deployment and Operability

- What one-command startup path must work on a clean machine?
- What log output should clearly show session assignment and stream health?
- How will you expose health/readiness endpoints for every critical service?
- What rollback plan exists if a schema migration fails in deployment?

#### 5) Observability and Cost Guardrails

- Which metrics will you capture for latency, throughput, and queue depth?
- How will you correlate one user action across UI, server, and agent logs?
- What dashboard thresholds indicate imminent cost overrun?
- What retention policy balances debugging value against storage cost?

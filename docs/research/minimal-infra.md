## High-level architecture

### Components

**1. Server**
A single backend service that does three jobs:

* exposes APIs for the UI
* accepts event ingestion from the agent
* broadcasts real-time updates to connected UI clients

**2. Agent**
A headless daemon that:

* polls or subscribes for work from the server
* runs the execution loop
* streams events back to the server as they happen

**3. UI**
A web client that:

* creates and views sessions
* connects to the server for live updates
* renders session state from streamed events

**4. Database**
One relational database that stores:

* sessions
* agent heartbeats / leases
* append-only event records
* optionally a small derived session-state table for fast reads

### Simplest interaction model

```text
UI -> Server API -> Database
Agent -> Server API -> Database
Server -> UI (real-time stream)
```

And more concretely:

1. User starts a session in the UI.
2. UI calls server API to create the session.
3. Server stores session in DB with status `pending`.
4. Agent asks server for available work.
5. Server assigns the session to that agent.
6. Agent runs the task and sends events back incrementally:

   * message started
   * token chunks
   * tool call started
   * tool output
   * step completed
   * final result
7. Server writes each event to the DB.
8. Server pushes those events to subscribed UI clients in real time.
9. UI renders the live session from the incoming stream.
10. On completion, server marks session finished.

---

## Recommended minimal topology in Docker Compose

Use **4 containers**:

* `server`
* `agent`
* `ui`
* `db`

Optional later:

* `redis`

For MVP, I would **not** include a broker yet unless you already know you need it.

### Compose-friendly layout

* `db`: Postgres
* `server`: API + ingestion + real-time fanout
* `agent`: daemon process
* `ui`: React/Next app

This keeps deployment and local development dead simple:

* one compose file
* one private Docker network
* predictable service names
* minimal moving parts

---

## Component responsibilities

## 1) Server

The server is the system’s coordination point.

### Responsibilities

* create/control sessions
* assign work to agents
* receive agent events
* persist everything
* stream updates to the UI
* detect stale agents/sessions

### Minimal endpoints

You do not need many:

* `POST /sessions` — create session
* `GET /sessions/:id` — fetch current session state
* `GET /sessions/:id/events` — historical events
* `POST /agents/:id/heartbeat` — liveness
* `POST /agents/:id/pull` — ask for work
* `POST /sessions/:id/events` — ingest agent events
* `POST /sessions/:id/complete` — mark complete/failure
* `GET /sessions/:id/stream` — UI real-time stream

That is enough for a first version.

---

## 2) Agent

The agent should be dumb about coordination and smart about execution.

### Responsibilities

* identify itself to server
* pull work
* acquire a session lease
* execute the run loop
* send events as append-only records
* heartbeat while running
* report terminal status

### Important simplification

The agent should **not** talk directly to the UI or the DB.

That keeps it portable and decoupled:

* local
* in Docker
* on another machine later

The only dependency is the server API.

---

## 3) UI

The UI should never depend on the agent directly.

### Responsibilities

* start sessions
* subscribe to session updates
* display session timeline / current state
* allow stop/retry actions later

### Real-time

For simplicity, use:

* **SSE** from server to UI

That is the easiest thing that works well for:

* token streaming
* tool status updates
* append-only event feeds

You do not need WebSockets first unless the UI must send frequent bidirectional live messages.

---

## 4) Database

Use Postgres and keep the model simple.

### Minimal tables

**sessions**

* id
* status
* requested_task
* assigned_agent_id
* lease_expires_at
* created_at
* updated_at

**session_events**

* id
* session_id
* sequence_number
* event_type
* payload_json
* created_at

**agents**

* id
* status
* last_heartbeat_at
* capabilities_json

Optional but useful:

**session_state**

* session_id
* latest_status
* latest_message
* summary_json
* updated_at

This can be derived from events, but having one denormalized table makes UI reads much easier.

---

## Key design decisions

## 1) Append-only events as the source of truth

Instead of trying to store every concept in a complex normalized schema, store execution as ordered events.

Why:

* easy to debug
* easy to replay
* easy to stream to UI
* easy to evolve schema

Examples:

* `session.started`
* `llm.token`
* `tool.started`
* `tool.finished`
* `message.completed`
* `session.completed`
* `session.failed`

This is the cleanest backbone for a real-time system.

---

## 2) Server-mediated real-time streaming

The agent sends events only to the server.
The UI listens only to the server.

Why:

* fewer connections
* better security boundary
* easier local dev
* agent and UI remain independent

This is the main decoupling move.

---

## 3) Pull-based agent coordination

For MVP, the agent should **poll/pull for work** rather than maintain a complicated subscription channel.

Why:

* simple to reason about
* robust in Docker/local environments
* no inbound connectivity needed for agent
* easy restart behavior

A simple pattern:

* agent heartbeats every few seconds
* agent asks for work every few seconds when idle
* server atomically assigns one pending session

Not elegant, but very effective for an MVP.

---

## 4) SSE for server → UI streaming

Use Server-Sent Events for live updates.

Why:

* dead simple
* great for one-way event streams
* works well with append-only event model
* easier than WebSockets to operate initially

If the UI needs to send actions, it can still use regular HTTP.

---

## 5) Lease-based session ownership

When server assigns work to an agent, it gives that agent a lease with expiry.

Why:

* handles crashes
* avoids stuck sessions forever
* supports reassignment later

If heartbeat stops and lease expires, server can mark the session as recoverable or failed.

---

## 6) Compose-first service boundaries

Each major runtime gets its own container:

* server
* agent
* UI
* DB

Why:

* clean dev environment
* mirrors future deployment boundaries
* prevents accidental tight coupling in code

Even if the server and UI could be merged, I would keep them separate in Compose because it forces healthier interfaces.

---

## What I am intentionally **not** building yet

This is the important part. Simplicity comes from refusing premature infrastructure.

### Not building yet

* Redis / Kafka / NATS
* distributed job queue
* multi-agent scheduling sophistication
* fine-grained RBAC
* multi-tenant isolation
* advanced retry orchestration
* exactly-once delivery
* event compaction pipelines
* horizontal fanout infrastructure
* direct agent-to-agent coordination
* workflow DAG engine in the platform layer
* full observability stack beyond basic logs/metrics
* separate read model service
* per-token persistence optimizations
* offline reconciliation workers
* autoscaling logic

For MVP, these are distractions unless your expected load is already high.

---

## A concrete simple flow

### Session creation

* UI posts a new task to server
* server inserts session row with `pending`

### Work pickup

* agent polls `/pull`
* server atomically picks one unassigned `pending` session
* server writes `assigned_agent_id` and `lease_expires_at`

### Execution

* agent starts running
* agent sends heartbeat every few seconds
* agent posts batched or single events as it executes
* server stores each event and broadcasts it to connected SSE clients

### Completion

* agent posts terminal event
* server marks session `completed` or `failed`

### Recovery

* if agent disappears and lease expires:

  * server marks session `orphaned` or back to `pending`
  * later retry can reassign it

That is enough for a good MVP.

---

## Where this architecture breaks at scale

It will break in predictable places.

## 1) Server becomes the bottleneck

The server is doing too much:

* API handling
* event ingestion
* DB writes
* live fanout to clients
* coordination/assignment logic

At low scale, fine.
At higher scale, this becomes hot and fragile.

### Symptoms

* rising latency on event ingestion
* SSE connections consuming memory
* slow session creation/control during heavy streaming

---

## 2) Per-event DB writes get expensive

If you persist every token as its own row, Postgres will start to feel it.

### Symptoms

* write amplification
* large event tables
* slow queries on session history
* index growth

Token-level streaming is especially expensive.

---

## 3) Polling becomes inefficient

Polling is simple, but many idle agents create noise.

### Symptoms

* unnecessary request volume
* slower assignment latency
* coordination overhead at higher agent counts

---

## 4) SSE fanout from one server process hits limits

A single backend process can only hold so many open streaming connections comfortably.

### Symptoms

* memory pressure
* dropped client streams
* uneven performance across sessions

---

## 5) Recovery semantics stay weak

Lease expiry is enough for “good enough” recovery, but not for strong guarantees.

### Symptoms

* duplicate execution after retries
* ambiguous partial completion
* manual cleanup needed for edge cases

---

## 6) Read performance degrades on raw event replay

If the UI always reconstructs session state from a large event log, long sessions get slower.

### Symptoms

* slow initial page load
* expensive server-side aggregation
* heavy DB queries for active sessions

---

## Next upgrades, in order

These are the upgrades I’d make only when pain appears.

## Upgrade 1: Batch and coarsen event writes

Before adding infrastructure, reduce write volume.

Do:

* batch token chunks
* persist message deltas every N ms instead of every token
* keep important lifecycle events as discrete rows

This usually buys a lot of headroom.

---

## Upgrade 2: Add derived session state

If not already present, maintain a lightweight materialized state per session.

Do:

* latest status
* latest assistant message snapshot
* current tool status
* timestamps

This makes UI reads fast without abandoning the event log.

---

## Upgrade 3: Introduce Redis for fanout / ephemeral state

When server-side streaming starts hurting, add Redis.

Use it for:

* pub/sub fanout
* presence / heartbeat cache
* lightweight coordination

This removes pressure from the app server and DB without a full queueing platform.

---

## Upgrade 4: Split coordination from ingestion

As load grows, separate responsibilities:

* API service
* event ingestion service
* real-time delivery service
* background recovery worker

Still simple, but each service is narrower.

---

## Upgrade 5: Replace polling with a stronger work-dispatch model

When agent count grows, move from simple polling to one of:

* long-polling
* server push over a persistent connection
* queue-based dispatch

For MVP, polling is fine.
At scale, it becomes wasteful.

---

## Upgrade 6: Use a broker for durable ingestion

Only when event throughput is materially high.

Candidates:

* Redis Streams
* NATS JetStream
* Kafka

This helps when you need:

* buffering
* replay
* decoupled consumers
* higher ingestion reliability

But it is unnecessary early unless volume is large.

---

## Upgrade 7: Partition storage strategy

When the event log gets large:

* partition events by date or session
* archive cold sessions
* move token-heavy raw streams to cheaper storage if needed

This is a later operational concern, not an MVP concern.

---

## Recommended MVP architecture in one sentence

**Use Postgres + one backend service + one polling headless agent + SSE to the UI, with append-only events and lease-based session assignment.**

That gives you:

* Docker Compose compatibility
* real-time streaming
* decoupled components
* easy debugging
* minimal infrastructure

## Final opinionated recommendation

If I were building this from scratch and optimizing for clarity, I would choose:

* **Postgres** for persistence
* **Server API** as the single coordination boundary
* **Polling agent** for work acquisition
* **SSE** for live UI updates
* **Append-only event log** plus optional derived session state
* **Docker Compose** with four services only
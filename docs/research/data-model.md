## High-level schema

### 1. Sessions

Represents one agent run or user-initiated work unit.

**Purpose**

* Top-level container for everything that happened
* Lifecycle tracking
* Query anchor for debugging and replay

**Key fields**

* `session_id`
* `project_id` or `workspace_id` (optional parent scope)
* `user_id` or `creator_id`
* `status`
  Examples: `pending`, `running`, `completed`, `failed`, `cancelled`
* `started_at`
* `ended_at`
* `created_at`
* `updated_at`
* `agent_type` or `runner_type`
* `model_profile` or `execution_profile`
* `input_summary`
  Lightweight summary of what was asked
* `error_summary`
  Final session-level failure summary, if any
* `metadata`
  Flexible bag for environment, version, flags, tags

**Why it exists**

* Lets you list and filter runs
* Lets UI subscribe at the session level
* Gives replay/debug systems a stable root object

---

### 2. Events

Single append-only log of everything that happened during a session.

**Purpose**

* Source of truth for replay
* Supports real-time streaming
* Enables detailed debugging

**Key fields**

* `event_id`
* `session_id` → Sessions
* `event_seq`
  Monotonic per-session sequence number for deterministic replay
* `event_time`
* `event_type`
  Examples: `message_started`, `message_delta`, `message_completed`, `tool_call_started`, `tool_call_completed`, `token`, `state_update`, `error`
* `event_subtype`
  Optional finer classification
* `actor_type`
  Examples: `user`, `agent`, `tool`, `system`
* `actor_id`
  Optional identifier for agent/tool/node
* `parent_event_id`
  For nesting, such as deltas under a message or tool result under a tool call
* `correlation_id`
  Groups related events across a step
* `step_id`
  Optional logical step/turn identifier
* `stream_channel`
  Useful if multiple output streams exist
* `payload`
  Flexible structured data specific to event type
* `is_terminal`
  Whether this event closes a unit of work
* `visibility`
  Examples: `user_visible`, `internal`, `debug_only`

**Why it exists**

* A single event log is the simplest replay model
* Real-time consumers can subscribe to new events
* Debugging becomes “show me everything in order”

---

### 3. Agent Outputs

Materialized or canonical higher-level outputs derived from events.

**Purpose**

* Easier querying than raw event logs
* Faster UI loading for finalized outputs
* Stable abstraction for downstream consumers

This can be one table/collection for all durable outputs, or split later if needed.

**Key fields**

* `output_id`
* `session_id` → Sessions
* `source_event_id` → Events
  The event that finalized or emitted this output
* `output_type`
  Examples: `message`, `tool_call`, `tool_result`, `artifact`, `final_answer`
* `role`
  Examples: `assistant`, `system`, `tool`
* `status`
  Examples: `streaming`, `completed`, `failed`
* `index_in_session`
  Display/order position
* `title` or `label`
  Optional human-readable descriptor
* `content`
  Final normalized output body
* `structured_content`
  Optional richer JSON for parsed/tool-specific output
* `started_at`
* `completed_at`
* `metadata`

**Why it exists**

* Raw events are great for replay, but painful for common reads
* Output records let you answer questions like:

  * “What was the final answer?”
  * “What tools were called?”
  * “Which output failed?”

---

## Key relationships

### Sessions → Events

One-to-many.

A session owns its ordered event stream.

### Sessions → Agent Outputs

One-to-many.

A session can produce many user-visible or system-level outputs.

### Events → Events

Self-referential via `parent_event_id`.

Useful for:

* token/delta events belonging to one message
* tool result events belonging to one tool call
* nested execution trees later

### Events → Agent Outputs

Usually one output is finalized from one or more events, but the most important link is:

* `AgentOutputs.source_event_id` → `Events.event_id`

This lets you trace any durable output back to the event log.

---

## Minimal event model by category

To keep it abstract but useful, your `payload` should vary by type.

### Message events

Payload might include:

* role
* content delta or full content
* message format
* citations / annotations
* reasoning visibility flag

### Tool call events

Payload might include:

* tool name
* arguments
* invocation id
* result summary
* latency
* error details

### Token events

Payload might include:

* token text or chunk text
* token index
* stream id
* model channel

### State / control events

Payload might include:

* status transition
* cancellation requested
* retry started
* checkpoint created

---

## How this supports the constraints

### Replay

Use `Events` as the authoritative append-only log ordered by:

* `session_id`
* `event_seq`

That gives deterministic replay and time-travel debugging.

### Real-time streaming

Producers append events as they happen.
Consumers subscribe to new events per `session_id`.
A UI can render deltas in near real time without waiting for finalized outputs.

### Queryability for debugging

Use `AgentOutputs` for fast “normal” reads, and `Events` for deep inspection.
This gives both:

* product-facing reads
* engineering-facing forensic reads

---

## Where schema rigidity could cause problems

### 1. Hardcoding event types too early

If you define overly specific tables for every event kind, you’ll struggle when the agent starts emitting:

* new tool phases
* partial results
* retries
* multi-agent coordination events
* richer streaming shapes

A rigid schema breaks as soon as the execution model evolves.

### 2. Forcing one message/tool shape

Different models and tools emit different structures:

* token deltas
* structured JSON
* binary artifact metadata
* tool progress updates
* nested call trees

One strict “message” schema often becomes a bad fit.

### 3. Assuming linear execution

MVPs often start linear, but later you may add:

* parallel tool calls
* branch/merge flows
* sub-agents
* retries and resumptions

If you only support a flat sequence and no parent/correlation fields, debugging gets messy fast.

### 4. Treating final outputs as the only useful data

If you only store final outputs, you lose:

* replayability
* partial progress
* interrupted runs
* root-cause debugging

### 5. Baking UI concerns too directly into storage

If storage mirrors the current UI too tightly, backend evolution becomes painful when the UX changes.

---

## How to future-proof it

### Keep the event log append-only

This is the most important choice.
An append-only event stream is resilient to product changes and replay needs.

### Use stable core fields + flexible payloads

Keep a small universal envelope for all events:

* ids
* ordering
* timestamps
* type
* actor
* relationships

Put evolving detail into structured `payload`.

### Separate source-of-truth from read models

Let `Events` be canonical.
Let `AgentOutputs` be optimized read models.
You can rebuild outputs later if output requirements change.

### Include correlation and hierarchy early

Even if MVP is simple, add:

* `parent_event_id`
* `correlation_id`
* `step_id`

These are cheap now and very valuable later.

### Version payload schemas

Add something like:

* `schema_version`
* `producer_version`

This helps when event formats evolve across deployments.

### Preserve incomplete and failed states

Do not assume every started thing completes cleanly.
Make room for:

* partial outputs
* failed tool calls
* cancelled sessions
* resumed sessions

### Avoid over-normalizing early

For MVP, don’t split every subtype into separate tables.
You want enough structure to query well, but enough flexibility to evolve.

---

## Recommended minimal shape

If I were keeping it truly minimal, I would start with just three top-level entities:

### Sessions

Lifecycle + metadata

### Events

Append-only ordered event stream with flexible payloads

### Agent Outputs

Materialized finalized outputs for fast reads

That’s enough to:

* replay sessions
* stream live updates
* inspect failures
* avoid premature schema lock-in

The main design principle is: **store raw execution truth once, then derive friendlier views from it.**
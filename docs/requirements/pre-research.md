# Pre-Research PRD: Sync-Based Headless Coding Agent System

---

## 1. Problem Framing

### Problem

Developers lack a **transparent, controllable, and observable system** for running coding agents in real time. Existing tools:

* Hide execution details (black-box agents)
* Are tightly coupled (UI ↔ agent ↔ infra)
* Are difficult to monitor, debug, or extend

This project aims to explore a **modular, observable agent system** where:

* Agents execute coding tasks independently
* All activity is streamed and inspectable
* Users can control and monitor sessions in real time

### Users

* **Primary**: Engineers building or experimenting with coding agents
* **Secondary**: AI infra developers exploring agent orchestration patterns

### Success Criteria

* Users can:

  * Start/stop agent sessions
  * Observe execution in real time (tokens, tools, outputs)
* System demonstrates:

  * Clear separation (agent vs server vs UI)
  * Reliable real-time event streaming
* Enables reasoning about:

  * Agent behavior
  * System architecture tradeoffs

---

## 2. Core Use Cases

### 1. Start a Coding Session

* User creates a session via UI
* Agent picks up work and begins execution

### 2. Monitor Agent Execution

* User observes:

  * Messages
  * Tool calls
  * Intermediate reasoning (tokens)
* Updates stream live

### 3. Stop or Interrupt Execution

* User stops session mid-run
* Agent halts gracefully

### 4. Inspect Past Sessions

* User views historical sessions and event logs
* Enables debugging and analysis

### 5. Run Agent in Different Environments

* Agent runs locally or in container
* Connects to central server without inbound networking

---

## 3. System Overview (Abstract)

### Key Components

**1. Server**

* Session manager + event ingestion layer
* Stores all state (sessions, events)
* Broadcasts updates to UI

**2. Agent (Daemon)**

* Executes coding tasks
* Maintains agent loop (LLM + tools)
* Streams events to server

**3. UI**

* Displays live session data
* Sends control commands (start/stop)

**4. Data Layer**

* Persistent storage for:

  * Sessions
  * Event streams

### Interaction Model (High-Level)

```
User → UI → Server → Agent
                     ↓
                Event Stream
                     ↓
            Server → UI (real-time)
```

* Agent pulls work from server (or subscribes)
* Agent pushes events to server
* Server acts as **source of truth + relay**

---

## 4. Key Unknowns / Research Areas

### Technical Unknowns

* **Real-time transport**

  * WebSockets vs SSE vs polling
  * Handling high-frequency token streams

* **Event streaming model**

  * Append-only log vs structured events
  * Ordering + consistency guarantees

* **Agent-server coordination**

  * Pull-based vs push-based work assignment
  * Heartbeats / liveness detection

* **Streaming granularity**

  * Token-level vs message-level vs batch

* **Failure handling**

  * What happens if agent crashes mid-session?
  * Idempotency of events

---

### Product / Design Unknowns

* **How much visibility is useful?**

  * Raw tokens vs summarized steps
* **User mental model**

  * “Session” vs “job” vs “conversation”
* **Control semantics**

  * What does “stop” actually guarantee?
* **Debugging UX**

  * Timeline vs log vs structured trace

---

### Data Dependencies

* Volume of event data (especially tokens)
* Schema for:

  * Tool calls
  * Messages
  * Intermediate reasoning
* Retention strategy:

  * Full logs vs sampled vs summarized

---

### Scaling Concerns

* High-frequency event ingestion (token streams)
* Fan-out to multiple UI clients
* Multiple concurrent agents
* DB write throughput for event logs

---

## 5. Critical Decisions

### 1. Real-Time Communication Mechanism

**Options:**

* WebSockets
* Server-Sent Events (SSE)
* Polling

**Tradeoffs:**

* WebSockets: bidirectional, complex, scalable challenges
* SSE: simpler, unidirectional, fits streaming well
* Polling: simplest, poor real-time experience

---

### 2. Event Storage Model

**Options:**

* Append-only event log
* Normalized relational schema
* Hybrid (log + derived views)

**Tradeoffs:**

* Log: flexible, replayable, harder to query
* Relational: structured, rigid
* Hybrid: more complex but flexible

---

### 3. Agent Work Retrieval Model

**Options:**

* Polling for new sessions
* Long-lived subscription (stream)
* Push via queue (if allowed)

**Tradeoffs:**

* Polling: simple, inefficient
* Subscription: efficient, more complex
* Queue: robust, may violate constraints

---

### 4. Streaming Granularity

**Options:**

* Token-level streaming
* Step-level (messages/tools)
* Hybrid (tokens + checkpoints)

**Tradeoffs:**

* Token-level: high fidelity, high volume
* Step-level: simpler, less insight
* Hybrid: balanced, more complex

---

### 5. Session Control Semantics

**Options:**

* Soft stop (agent decides when to halt)
* Hard stop (kill process)
* Cooperative cancellation

**Tradeoffs:**

* Soft: safe, slow
* Hard: immediate, unsafe
* Cooperative: best UX, requires design

---

## 6. Risks

### Technical Risks

* **Event overload**

  * Token streaming may overwhelm system
* **State consistency**

  * Out-of-order or dropped events
* **Agent reliability**

  * Long-running processes may fail unpredictably
* **Networking constraints**

  * Outbound-only agent limits design space

### Product Risks

* Over-exposing low-level data → poor UX
* Under-exposing → defeats purpose of observability

### Architectural Risks

* Tight coupling between components
* Premature optimization of infra (over-engineering)

---

## 7. Research Plan

### Phase 1: Real-Time Streaming Foundations

* Compare:

  * WebSockets vs SSE for this use case
* Evaluate:

  * Latency
  * Complexity
  * Failure modes

**Good outcome:**

* Clear decision on transport with simple prototype

---

### Phase 2: Event Model Design

* Define:

  * Minimal event schema
  * Ordering + IDs
* Prototype:

  * Append-only event ingestion

**Good outcome:**

* Events are replayable and debuggable

---

### Phase 3: Agent Loop + Streaming Integration

* Implement:

  * Basic agent loop
  * Streaming events to server
* Validate:

  * Reliability under interruptions

**Good outcome:**

* Stable end-to-end loop (agent → server → UI)

---

### Phase 4: Session Lifecycle + Control

* Explore:

  * Start/stop semantics
  * Cancellation behavior

**Good outcome:**

* Predictable and controllable sessions

---

### Phase 5: Observability UX

* Experiment with:

  * Timeline view
  * Log view
  * Structured traces

**Good outcome:**

* Users can understand agent behavior quickly

---

## Final Notes

This system is less about building a feature-complete product and more about exploring:

* **Agent observability**
* **Decoupled system design**
* **Real-time AI system patterns**

The key goal is to **surface the right abstractions**, not finalize implementation.

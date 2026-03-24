# Developer Log

Major product and technical decisions are captured here to preserve implementation context.

Use this format for new entries:

## [YYYY-MM-DD] [Short decision title]

**Context:** [What decision was needed and why]  
**Options considered:** [Option A vs Option B and core tradeoff]  
**Decision:** [Chosen option]  
**Rationale:** [Why this option was selected]  
**Impact:** [What changes as a result]  
**Owner:** [Developer / Agent + developer confirmation]

## [2026-03-23] Pull-based agent coordination over HTTP

**Context:** The system needs reliable agent-server coordination while supporting outbound-only agent connectivity.  
**Options considered:** Pull-based coordination over HTTP vs push-based inbound control channels; push can reduce polling latency but requires more networking assumptions and operational complexity.  
**Decision:** Use pull-based agent coordination over HTTP.  
**Rationale:** Pull over HTTP keeps agent networking simple, works in restricted environments, and is easy to reason about for MVP correctness.  
**Impact:** Agent daemon must poll or long-poll for work and never depend on inbound callbacks from server to agent.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] Lease-based session attempt ownership

**Context:** Only one active executor should own a session attempt at any moment, including during failures or disconnects.  
**Options considered:** Permanent claim locks vs lease-based ownership; permanent locks are simpler initially but can strand work after agent failure.  
**Decision:** Use lease-based session attempt ownership.  
**Rationale:** Time-bounded leases with heartbeats enable safe ownership transfer and reduce stuck-session risk.  
**Impact:** Attempt claims require lease metadata, heartbeat renewal, and stale-attempt write rejection rules.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] Append-only event logging as canonical history

**Context:** The product requires durable, inspectable execution traces that remain trustworthy after restarts and reconnects.  
**Options considered:** Mutable status-only records vs append-only event history; mutable records are easier to query directly but lose auditability and replay detail.  
**Decision:** Use append-only event logging as canonical history.  
**Rationale:** Immutable events provide a reliable audit trail and a stable source for reconstruction and debugging.  
**Impact:** Event ingestion must enforce ordering/idempotency guarantees and preserve per-attempt event sequences durably.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] Derived session state for fast reads

**Context:** UI views need low-latency reads without sacrificing event-stream correctness.  
**Options considered:** Read directly from raw events only vs maintain a derived state projection; raw-only simplifies storage logic but makes common reads expensive and harder to serve quickly.  
**Decision:** Use derived session state for fast reads.  
**Rationale:** Projection tables provide responsive UI queries while canonical truth remains in the event log.  
**Impact:** Server must maintain projection update logic and ensure projection recovery from event history when needed.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] SSE for server-to-UI live updates

**Context:** The UI needs near-real-time session updates with simple infrastructure.  
**Options considered:** WebSockets vs Server-Sent Events; WebSockets allow bidirectional communication but add protocol/state complexity not required for MVP.  
**Decision:** Use SSE for server-to-UI live updates.  
**Rationale:** SSE aligns with one-way update streaming, is browser-friendly, and keeps realtime behavior straightforward.  
**Impact:** Control actions remain HTTP request/response while live session progress is delivered through SSE streams with reconnect support.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] Step-based agent execution loop

**Context:** The system must expose understandable progress rather than opaque, continuous output.  
**Options considered:** Token/stream-centric loop vs step-based loop; token-centric flow can feel more realtime but is noisier and harder to map to structured lifecycle semantics.  
**Decision:** Use a step-based agent loop.  
**Rationale:** Step boundaries provide meaningful checkpoints for tracing, stop handling, and event modeling.  
**Impact:** Agent runtime must emit structured step lifecycle events and treat tools/actions as bounded step units.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] Soft-stop-first cancellation with escalation

**Context:** Stop behavior must be honest and predictable without unsafe mid-step interruption by default.  
**Options considered:** Immediate hard-kill cancellation vs soft-stop-first with backend escalation; hard-kill can terminate faster but risks inconsistent state and partial writes.  
**Decision:** Use soft-stop-first cancellation with backend escalation if needed.  
**Rationale:** Durable stop intent with step-boundary cessation balances user control with state integrity.  
**Impact:** Server must persist stop intent and move session to `stopping`; agent must avoid starting new steps after stop acceptance and allow controlled termination escalation.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-23] Monolithic server for MVP

**Context:** MVP delivery prioritizes speed, clarity, and reduced operational overhead over distributed decomposition.  
**Options considered:** Monolithic service vs early microservice split; microservices improve isolation at scale but introduce coordination overhead too early for MVP.  
**Decision:** Keep the server monolithic for MVP.  
**Rationale:** A single service minimizes deployment complexity and accelerates implementation while boundaries are still evolving.  
**Impact:** Core control APIs, event ingestion, state projection, and streaming endpoints live in one server process for MVP, with decomposition deferred.  
**Owner:** Agent (Codex) with developer approval

## [2026-03-24] Workdir policy as server-validated metadata contract

**Context:** The working-directory requirement needs consistent behavior across local and Docker runs without introducing disruptive schema churn.  
**Options considered:** Add dedicated DB columns for workdir policy vs store a typed policy envelope in `Session.metadata`; columns improve queryability but increase migration scope and rollout complexity.  
**Decision:** Validate/canonicalize workdir policy on server create-session and persist the normalized contract in `Session.metadata` for first implementation.  
**Rationale:** This keeps diffs minimal, aligns with existing session metadata usage, and allows fast rollout while preserving a clear typed contract for later column migration if needed.  
**Impact:** Server becomes source of truth for policy validation; agent enforces the returned policy at tool/runtime boundaries; Docker/local parity can be tested against one shared contract.  
**Owner:** Agent (Codex) with developer confirmation


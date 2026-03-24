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

## [2026-03-24] Working directory enforcement via tool-level boundary checks

**Context:** The working-directory requirement needs runtime enforcement in the agent, with a choice between OS-level sandboxing and tool-level path checks.
**Options considered:** OS sandbox integration (macOS sandbox-exec, Linux seccomp) vs tool-level filesystem boundary enforcement at each tool call; OS sandboxing provides stronger guarantees but adds platform-specific complexity and reduces portability.
**Decision:** Implement tool-level boundary enforcement in the agent for MVP, with canonical path resolution via `realpathSync` and check functions (`assertReadablePath`, `assertWritablePath`, `assertExecutableCwd`).
**Rationale:** Tool-level checks are portable across platforms, straightforward to test, and sufficient for MVP trust boundaries. Stronger OS-level containment can be layered in later without changing the policy contract.
**Impact:** Agent tools check paths against `WorkingDirectoryPolicy` before every read/write/execute. Denied operations produce structured `policy.denied` events for observability. Docker mode supplements this with read-only root filesystem, non-root user, and explicit mount restrictions.
**Owner:** Agent (Claude) with developer confirmation

## [2026-03-24] Policy observability via structured event types

**Context:** Denied file access attempts need to be visible for debugging and auditing.
**Options considered:** Log-only denied access signals vs structured event types emitted through the existing append-only event pipeline.
**Decision:** Add `policy.validated` and `policy.denied` event types to the shared `SessionEventType` union and emit them through the standard event emitter.
**Rationale:** Structured events flow through existing SSE and UI trace infrastructure, making policy behavior visible without additional tooling. They also persist in the durable event log for post-session audit.
**Impact:** Agent emits `policy.validated` at session start (showing resolved policy) and `policy.denied` on each blocked tool call (showing operation, path, and reason).
**Owner:** Agent (Claude) with developer confirmation

## [2026-03-24] Exploration budget with blocked terminal semantics

**Context:** The current step loop can read/search until max steps and still report success, which violates requirement 3 expectations around bounded exploration and honest failure semantics.  
**Options considered:** Prompt-only exploration guidance with existing statuses vs runtime-enforced budgets with first-class blocked semantics and explicit phase metadata.  
**Decision:** Use runtime budget enforcement plus explicit phase transitions, and introduce `blocked` for insufficient-context terminal outcomes when no safe edit path is reached.  
**Rationale:** Runtime accounting is the only reliable way to prevent unbounded exploration loops, and a distinct blocked outcome preserves operator visibility into "could not safely proceed" cases.  
**Impact:** Shared contracts, agent step loop, server derived-state logic, UI traces, and evals must all support exploration/edit/validation phases and blocked terminal summaries.  
**Owner:** Agent (Codex) with developer confirmation


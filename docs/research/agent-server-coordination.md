Here’s a practical evaluation of the coordination options for an outbound-only headless agent.

## Constraints recap

Your agent:

* cannot accept inbound connections
* must initiate all communication
* needs to fetch work from a central server
* needs to stream progress/results back while running

That pushes you toward a **pull-based architecture**, even if the user experience feels “real-time.”

---

## 1. Polling for work

### How it works

The agent periodically asks the server: “Do you have work for me?”
If yes, it claims a job, executes it, and sends status/events/results via outbound requests.

### Latency and efficiency

**Pros**

* Very simple to reason about
* Easy to implement with plain HTTP
* Works in restrictive network environments

**Cons**

* Idle polling wastes requests
* Lower polling intervals improve latency but increase server/load cost
* Higher polling intervals reduce load but increase dispatch latency

This is the main tradeoff:

* 1-second polling feels responsive but is noisy
* 10–30 second polling is cheap but sluggish

### Failure handling

**Agent crash**

* If the agent crashes after claiming work, the server needs a lease/visibility timeout so the job can be reassigned
* Server should mark work as “claimed until T,” not permanently assigned

**Network issues**

* Temporary disconnect just means missed polls
* Agent resumes on next successful poll
* In-flight result uploads should be idempotent

**Server restart**

* Easy to recover if job state is persisted centrally

Polling is forgiving because there’s no persistent session to reconstruct.

### Complexity of coordination

Lowest complexity of the three.

You mainly need:

* job state machine
* claim/lease semantics
* result/event upload API
* timeout/recovery logic

No complex connection lifecycle management.

### Best use case

Great for:

* MVPs
* low/medium job volume
* environments where reliability and simplicity matter more than ultra-low latency

---

## 2. Long-lived subscription / streaming

### How it works

The agent opens a long-lived outbound connection to the server, such as:

* WebSocket
* SSE-like control stream
* gRPC bidirectional stream

The server pushes work down the stream, and the agent streams events/results back over the same or a companion channel.

### Latency and efficiency

**Pros**

* Lowest work dispatch latency
* Efficient when agents are frequently idle but should react quickly
* Fewer repeated poll requests

**Cons**

* More sensitive to connection instability
* Requires connection/session management on both sides
* More operational complexity at scale

This is usually the best model for “live” agent systems, but only if you’re ready to own connection lifecycle issues.

### Failure handling

**Agent crash**

* Stream drops; server must detect disconnect
* Claimed jobs still need lease/timeout recovery
* Disconnect alone should not immediately reassign work unless lease expires or the agent is definitely gone

**Network issues**

* Reconnect logic becomes critical
* Need backoff + resume semantics
* Must decide whether reconnect restores session, creates a new session, or requires re-registration

**Half-open connections**

* One of the trickiest parts
* You need heartbeat/ping logic to detect dead streams

### Complexity of coordination

Highest complexity.

You now need:

* agent registration/session model
* stream reconnect logic
* heartbeat/ping/pong
* lease handling anyway
* ordering/replay semantics for streamed events
* possibly buffering if one side is temporarily unavailable

Even with streaming, you still usually need a durable server-side job table and lease model. The stream is mostly a faster delivery/control plane, not a substitute for durable coordination.

### Best use case

Great when:

* low latency matters
* many agents are online continuously
* you want live control/observability
* you’re willing to invest in infra and reconnect semantics

---

## 3. Queue-based with outbound-only agents

### How it works

Since the agent cannot receive inbound pushes, “queue-based” really means one of two things:

1. **Agent polls a queue or queue-backed API**
2. **Agent opens a long-lived outbound subscription to a broker**, if the broker supports it

In practice, outbound-only constraints do **not** eliminate queues. They just mean the queue must still be consumed via outbound connection.

Typical pattern:

* server enqueues tasks
* agent pulls from queue / claims message
* agent periodically extends visibility timeout while working
* agent posts progress/results to server

### Latency and efficiency

Depends on the mechanism:

* **Queue polling**: similar tradeoffs to polling the app server
* **Broker streaming/consumer protocol**: closer to long-lived subscription

Efficiency is often better than homegrown DB polling if you already use a proper queue, because the queue gives you leasing, retries, and redelivery patterns out of the box.

### Failure handling

This is where queues shine.

**Agent crash**

* Unacked message or expired visibility timeout causes re-delivery
* Natural recovery mechanism

**Network issues**

* Consumer reconnects and resumes consuming
* Broker often handles delivery guarantees better than a custom app server

**Server restart**

* Durable queues reduce coordination loss

But note: queues handle **work delivery**, not necessarily:

* live token streaming
* rich event logs
* session presence
* UI fanout

You usually still need a separate result/event ingestion path.

### Complexity of coordination

Medium.

**Simpler than building your own robust dispatch semantics**, but:

* adds an external dependency
* requires understanding broker semantics
* still needs idempotency and lease-aware execution
* still needs event/result channel outside the queue

So queues reduce one class of complexity while introducing infra complexity.

### Best use case

Best when:

* you expect retries/redelivery to matter
* multiple agents may compete for work
* you want durable work dispatch early
* you’re okay introducing a broker into the architecture

---

# Comparison summary

## Polling

* **Latency:** medium to poor depending on interval
* **Efficiency:** poor at low intervals, okay at higher intervals
* **Failure recovery:** straightforward
* **Coordination complexity:** low

## Long-lived subscription

* **Latency:** best
* **Efficiency:** best for active real-time systems
* **Failure recovery:** harder due to reconnect/session issues
* **Coordination complexity:** high

## Queue-based

* **Latency:** medium to good depending on queue consumption model
* **Efficiency:** good
* **Failure recovery:** strongest for job delivery
* **Coordination complexity:** medium overall

---

# MVP recommendation

For an MVP, I would recommend:

## **Polling for work + leased job claims + outbound event/result posting**

Why:

* simplest to build correctly
* easiest to debug
* least infrastructure-heavy
* works naturally with outbound-only agents
* gives you a clean path to later upgrades

A good MVP shape is:

1. Agent polls `/work/next`
2. Server atomically assigns one job with a **lease expiration**
3. Agent executes
4. Agent posts:

   * heartbeat / lease renewal
   * progress events
   * final result
5. If heartbeat stops and lease expires, job becomes eligible for reassignment

This is boring in a good way.

---

# Robustness improvements after MVP

Once the polling MVP works, I’d improve it in this order:

## 1. Add long-polling before full streaming

Instead of polling every few seconds, let the request hang briefly:

* agent calls `/work/next?wait=20s`
* server returns immediately if work exists
* otherwise holds connection open until work arrives or timeout occurs

This gives you:

* much lower idle request volume
* near-real-time dispatch
* much less complexity than WebSockets

It is often the best step between naive polling and full duplex streaming.

## 2. Add explicit leases and lease renewal

Every claimed job should have:

* `claimed_by_agent_id`
* `lease_expires_at`
* `attempt_number`

Agent renews lease periodically while running.

This prevents orphaned jobs from getting stuck forever.

## 3. Make all writes idempotent

For:

* event ingestion
* final result upload
* job completion
* heartbeat updates

Use event IDs / sequence numbers / idempotency keys.

Without this, reconnects and retries will create duplicates.

## 4. Split control plane from data plane

Use separate concepts for:

* **work coordination**: claim, heartbeat, complete, fail
* **event streaming**: logs, tokens, tool calls, progress

This keeps scheduling logic clean.

## 5. Consider a queue later

Once you want stronger delivery semantics or more scale, move work dispatch onto a queue while keeping the same agent-side execution contract.

---

# Agent liveness

You asked specifically about heartbeats and timeouts.

## Recommended model

Use **lease-based liveness**, not just a binary “online/offline.”

When agent claims a job:

* server sets `lease_expires_at = now + lease_duration`

While agent is running:

* it sends heartbeats every few seconds
* each heartbeat extends the lease

If lease expires:

* server marks the job reclaimable
* agent is treated as stale for that job

### Why this is better than simple heartbeats

A heartbeat alone tells you “agent was alive recently,” but doesn’t directly encode job ownership.
A lease ties liveness to safe job execution.

## Suggested timing

Example:

* heartbeat every 5–10 seconds
* lease duration 20–30 seconds
* reclaim after lease expiry plus optional short grace window

This avoids false failover from a single delayed heartbeat.

## Separate agent presence from job lease

Track both:

### Agent presence

“Has this agent been seen recently at all?”

* useful for dashboards / capacity estimation

### Job lease

“Is this agent still allowed to own this specific job?”

* useful for correctness

Do not rely only on global agent presence to infer job ownership.

---

# Preventing duplicate work and race conditions

This is the most important part.

## 1. Atomic claim

The server must ensure only one agent can claim a piece of work.

Typical pattern:

* select an eligible queued job
* atomically transition it to `claimed`
* attach `claimed_by_agent_id`, `lease_expires_at`, `attempt_number`

This must happen in a transaction or equivalent atomic queue operation.

## 2. Lease-based ownership

Only the current lease owner may:

* renew heartbeat
* append authoritative progress
* mark complete/fail

If an old agent comes back after losing lease, its writes should be rejected or treated as stale.

## 3. Attempt IDs

Each execution attempt should have a unique attempt ID.

Then:

* events are associated with attempt ID
* completion is associated with attempt ID
* stale attempts cannot overwrite newer attempts

This protects against split-brain behavior where:

* agent A claims job
* agent A stalls
* lease expires
* agent B reclaims
* agent A later resumes and tries to finish

Without attempt IDs, agent A could incorrectly mark the job complete.

## 4. Idempotent completion

Completion endpoint should be safe against retries.

Example:

* first valid completion for current attempt succeeds
* duplicate completion for same attempt is no-op
* completion from stale attempt is rejected

## 5. Ordered event ingestion

For streamed logs/tokens/tool events:

* include monotonic sequence numbers per attempt
* server can dedupe or detect gaps/out-of-order delivery

This matters if network retries happen.

## 6. Reconciliation loop

Run a server-side sweeper that periodically:

* finds expired leases
* requeues stuck jobs
* marks zombie agents stale
* optionally flags jobs with repeated failures

This is your backstop against edge cases.

---

# Concrete recommendation

For your stated system, I’d recommend this architecture:

## MVP

* **Work retrieval:** polling, preferably long-polling
* **Work ownership:** lease-based claims
* **Result streaming:** outbound event POSTs or chunked append API
* **Liveness:** heartbeats that renew job lease
* **Correctness:** attempt IDs + idempotent writes

This gives you a system that is:

* outbound-only compliant
* operationally simple
* correct under crashes and disconnects
* easy to evolve

## Later robustness upgrades

* move from short polling to long-polling
* add WebSocket/gRPC stream only if low latency truly matters
* introduce a queue when throughput/reliability needs justify it
* add server-side reconciliation and dead-letter handling
* add per-attempt event sequencing and resumable uploads

---

# Practical final take

If this is for a first production-capable version, the best answer is not “real-time streaming everywhere.” The best answer is:

**Use a pull-based leased job model, with long-polling for dispatch and separate outbound progress/result reporting.**

That gives you most of the benefits people want from streaming systems without prematurely taking on the hardest parts of streaming coordination.

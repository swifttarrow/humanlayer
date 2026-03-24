## 1. Define the semantics first

### What “start” should mean

“Start” should not mean “the agent is already doing useful work.” It should mean:

1. A new session is created or an existing queued session is transitioned to `starting`
2. The system has accepted responsibility for launching agent execution
3. A specific execution attempt is created
4. The UI gets a durable session state change immediately

In other words, **start = intent accepted + execution attempt created**, not “work has completed” and not even necessarily “the agent loop is live yet.”

A good state progression for MVP:

`created -> starting -> running -> stopping -> stopped | completed | failed`

That distinction matters because launch can fail after the user clicks Start. Without `starting`, the UI will lie.

### What “stop” should guarantee

“Stop” should not guarantee instantaneous termination in all cases. That is usually unrealistic for long-running processes. It should guarantee:

1. **No new work should begin** after the stop is accepted
2. The system records a durable stop intent
3. The UI reflects that the session is stopping
4. The system makes a best effort to end the current work safely
5. The session eventually reaches a terminal state: `stopped`, `failed`, or `completed`

For MVP, the most important semantic is:

> Once stop is accepted, the system will not intentionally schedule further agent steps.

That is a much better guarantee than “all activity ceases immediately,” which is often false if a tool call or subprocess is already running.

---

## 2. The three stop models

## Soft stop (graceful)

A soft stop means: the system asks the agent to finish its current safe boundary, persist state, emit final events, and exit cleanly.

Typical behavior:

* Agent sees cancellation requested
* Stops before beginning the next step
* Optionally finishes the current atomic action
* Flushes buffered outputs
* Writes final state
* Marks session `stopped`

### UX implications

Pros:

* Most understandable to users when paired with “Stopping…” state
* Preserves partial progress better
* Less likely to corrupt state or lose logs
* Better for tool-heavy agents that may be editing files or writing DB records

Cons:

* Not instant
* Users may think Stop is broken if output keeps arriving briefly
* Needs clear UI copy: “Stopping after current step…”

### System complexity

Moderate.
You need:

* Cancellation flag or stop token
* Well-defined interruption points
* Finalization/flush path
* Session state machine

This is usually the best default, but only if the agent loop is designed to check for cancellation frequently.

### Failure modes

* Agent ignores stop because it is stuck in a blocking call
* Long tool invocation delays stop for too long
* Final cleanup hangs
* User sees more output after pressing Stop and loses trust unless UI explains it

Soft stop works well only when there are clear step boundaries.

---

## Hard stop (kill process)

A hard stop means: the runtime or orchestrator forcibly terminates the agent process, container, or job.

Typical behavior:

* Send SIGKILL / terminate container / revoke worker
* Process ends immediately or near-immediately
* In-memory state may be lost
* Cleanup may not run

### UX implications

Pros:

* Matches user expectation of “stop now”
* Useful for runaway agents, cost control, or broken sessions
* Good emergency escape hatch

Cons:

* May lose recent streamed outputs
* Can leave partial file edits, orphan subprocesses, or inconsistent state
* Can feel destructive if it discards useful progress

### System complexity

Low to moderate at first, but hidden complexity later.
Killing a process is simple. Recovering from what that kill leaves behind is not.

You may need:

* Orphan detection
* Retry-safe storage writes
* Reconciliation on restart
* Incomplete-step markers

### Failure modes

* Process dies while writing state
* Child processes survive parent kill
* Locks/resources remain held
* UI shows stale running state until heartbeat timeout
* Partial outputs appear without closure event

Hard stop is necessary eventually, but risky as the only stop semantic.

---

## Cooperative cancellation

Cooperative cancellation means: cancellation is a first-class signal passed through the system, and the agent plus tools are expected to honor it.

This is related to soft stop, but broader. Soft stop is a behavior; cooperative cancellation is the underlying mechanism.

Typical behavior:

* Server records `stop_requested_at`
* Agent polls or subscribes for control signals
* Current loop, tools, and subprocess wrappers periodically check cancellation
* Long operations become interruptible
* Agent exits gracefully if possible

### UX implications

Pros:

* Most predictable once implemented well
* Can support nuanced messaging like “Canceling current command…”
* Best foundation for safe long-running systems

Cons:

* Users do not care about the mechanism; they care whether Stop works
* Early versions may feel inconsistent if only some operations honor cancellation

### System complexity

Highest of the three, because it cuts across the whole stack:

* Agent loop
* Tool runner
* Subprocess wrapper
* Network streaming
* Persistence layer

But it gives the cleanest long-term model.

### Failure modes

* Some tools check cancellation, others do not
* Cancellation races with completion
* Double-finalization bugs
* Session appears stopped while background work is still unwinding

Cooperative cancellation is the right architectural direction, but you do not need full coverage on day one.

---

## 3. Comparison summary

### Soft stop

Best default user-facing behavior. Safe, understandable, slightly delayed.

### Hard stop

Best emergency mechanism. Fast, but potentially messy.

### Cooperative cancellation

Best implementation model underneath. More work, but enables soft stop to behave well.

---

## 4. Recommended control model for MVP

For MVP, I’d use a **two-tier model**:

### Start

* User clicks Start
* Session enters `starting`
* Execution attempt is created
* Agent begins work and transitions to `running` once it emits first heartbeat or first event

### Stop

Expose **one Stop button** in the UI, but make it behave as:

1. **Request graceful stop first**

   * Mark session `stopping`
   * Set durable cancellation flag
   * Agent should stop before next step
   * Allow current atomic step to finish

2. **Escalate to hard stop only if needed**

   * If agent does not stop within a timeout, backend may force terminate
   * This can be automatic or hidden behind “Force stop” later

This gives you the right UX without overwhelming the user with too many controls.

For MVP, I would not expose separate “Soft Stop” vs “Hard Stop” buttons unless the product is explicitly for power users or developers. Users usually just want “Stop,” not a process-control menu.

---

## 5. What stop should mean in the MVP contract

A strong MVP contract could be:

> When a user stops a session, the system guarantees that no new agent step will begin after the stop request is accepted. The current in-flight step may complete, and some final buffered output may still appear. The session will then transition to a terminal state.

That is honest, implementable, and user-comprehensible.

---

## 6. UX recommendations

The biggest UX risk is ambiguity. So the UI should clearly show:

### Running

* Agent is actively executing

### Stopping

* Stop has been accepted
* Current task is winding down
* Some output may still arrive

### Stopped

* No further agent work will be performed
* Partial progress is preserved

Helpful copy:

* **Stopping… finishing current step**
* **Stopped**
* **Force stopping…** only if escalation happens

Also:

* Disable repeated Start clicks while `starting`
* Disable repeated Stop clicks while `stopping`
* Show the latest completed step / tool when stopping, so users understand why it’s taking time

---

## 7. Failure modes to plan for

## A. Stop requested during LLM call

What happens:

* Agent cannot interrupt the provider call immediately
* Tokens may continue briefly

MVP behavior:

* Let call finish if cancellation cannot interrupt it
* Prevent next step from starting

## B. Stop requested during tool execution

What happens:

* Tool may be non-interruptible
* External side effects may already be in progress

MVP behavior:

* Define tools as atomic unless explicitly interruptible
* Stop after the tool returns
* Mark that the session ended with partial progress

## C. Agent crashes while stopping

What happens:

* Session may get stuck in `stopping`

MVP behavior:

* Heartbeat timeout transitions to `failed` or `stopped_with_error`
* Reconciler marks abandoned executions terminal

## D. Network partition between agent and server

What happens:

* User clicks Stop, but agent does not see it immediately

MVP behavior:

* Server records stop intent durably
* Agent checks on reconnect/poll
* If unreachable too long, backend may mark execution lost and terminate infra if possible

## E. Duplicate stop requests

What happens:

* UI retries or user clicks multiple times

MVP behavior:

* Stop must be idempotent
* Same request just returns current state

---

## 8. Partial progress semantics

Long-running systems should assume partial progress is normal, not exceptional.

Define partial progress like this:

* Completed steps remain durable
* In-flight step may be incomplete
* Final session summary should distinguish:

  * completed work
  * interrupted work
  * work not started

Useful outcome fields:

* `last_completed_step`
* `last_emitted_event_id`
* `stop_reason` (`user_requested`, `system_timeout`, `force_killed`)
* `final_status` (`completed`, `stopped`, `failed`)

This is especially important for agents editing files or generating artifacts. Users should be able to inspect what was done before the stop.

---

## 9. Cleanup model for MVP

Cleanup should be minimal and explicit.

On graceful stop:

* Flush event buffer
* Close streams
* Persist final session status
* Release session lease / worker ownership
* Record final timestamp and stop reason

On hard stop:

* Do not assume cleanup ran
* On next worker/server reconciliation:

  * detect abandoned execution
  * mark incomplete step as interrupted
  * release leases
  * surface that termination was forced

Avoid promising rollback unless you truly implement rollback. In most agent systems, rollback is harder and less reliable than preserving partial progress with clear metadata.

---

## 10. Practical recommendation

For MVP, build:

### Control semantics

* `Start` = create execution attempt and transition to `starting`
* `Stop` = request graceful cancellation and transition to `stopping`

### Cancellation behavior

* Check cancellation at step boundaries
* Treat tool execution as atomic for now
* Do not start new steps after stop accepted

### Safety net

* Add backend timeout-based escalation to hard kill for stuck sessions
* Reconcile orphaned sessions via heartbeat timeout

### User-facing behavior

* Single Stop button
* Clear `Stopping…` state
* Preserve partial progress
* Show why/where execution stopped

---

## 11. Final recommendation

**Best MVP model:**
Use **cooperative cancellation implementing a soft-stop-first model**, with **hard stop as backend escalation**.

Why:

* Best balance of user trust, implementation simplicity, and operational safety
* Preserves logs and partial progress
* Avoids pretending you can safely kill everything instantly
* Leaves room to add true force-stop later

The key principle is:

> Stopping should be a durable control intent, not just a signal sent to a process.

That gives you reliable semantics even when processes crash, networks fail, or agents are distributed.
## 1. What the execution loop is doing

A coding agent loop has one job: repeatedly convert **state + goal** into either:

* a user-facing response,
* a tool action,
* or a decision to stop.

At a high level, each cycle is:

1. Read current state
2. Decide next action with the LLM
3. Optionally execute a tool
4. Capture outputs and update state
5. Stream what happened
6. Decide whether to continue

That sounds simple, but most of the real design work is in making the loop **bounded, inspectable, and recoverable**.

---

## 2. Loop structure: step-based vs continuous

### A. Step-based loop

In a step-based loop, the agent advances in discrete turns.

Each step looks like:

* assemble context
* call LLM
* parse decision
* maybe run one or more tools
* record results
* check termination conditions
* proceed to next step

#### Characteristics

* Easier to reason about
* Easier to persist/resume
* Easier to stream structured events
* Better for debugging and replay
* Natural place to enforce budgets and guards

#### Typical step outcome types

A step usually ends in one of these states:

* `assistant_message`
* `tool_request`
* `tool_result_processed`
* `needs_user_input`
* `completed`
* `failed`

#### Why it works well

For coding agents, work is naturally chunked:

* inspect files
* search code
* edit files
* run tests
* inspect failures
* patch again

That maps very well onto a finite state progression.

---

### B. Continuous loop

In a continuous loop, the agent behaves more like a daemon or autonomous process that keeps running until externally stopped.

It may:

* continuously observe state changes,
* emit thoughts/actions as they arise,
* chain multiple tool calls without clear step boundaries.

#### Characteristics

* Feels more autonomous
* Can react quickly to new events
* Useful for long-lived background workers
* Harder to debug
* Harder to guarantee consistency
* Easier to create runaway behavior

#### Main problem

Without explicit step boundaries, it becomes harder to answer:

* What exactly happened?
* Which LLM output caused this command?
* What state version did that edit use?
* Where should the system resume after a crash?

For a coding agent, those questions matter a lot.

---

### Recommendation on structure

For most coding agents, especially early on, a **step-based loop** is the right default.

You can still make it feel “live” by streaming events within each step:

* token deltas from the model
* proposed tool calls
* command stdout/stderr
* patch previews
* step summaries

So you get the UX benefits of continuous activity without the operational downside.

---

## 3. State management across steps

State is the heart of the system. Bad state design is what makes agents feel flaky.

A useful mental model is to separate state into layers.

### A. Session state

Long-lived state for the overall task.

Examples:

* session id
* user goal
* repo/workspace path
* task status
* budgets: token, cost, step count, wall clock
* permissions/policy
* current branch or sandbox metadata

This is durable and should survive process restarts.

---

### B. Working memory

The agent’s current actionable context.

Examples:

* active plan
* current subtask
* files of interest
* latest tool outputs
* current hypotheses
* unresolved errors
* pending follow-ups

This changes step to step.

A key design choice: do **not** let the model’s entire raw conversation become your state model. Keep structured state outside the prompt, and inject only what is needed.

---

### C. Event log

An append-only history of what happened.

Examples:

* model started
* token streamed
* tool called
* tool output chunk
* patch applied
* test command exited nonzero
* step completed

This is critical for:

* replay
* observability
* debugging
* UI sync
* auditability

The event log should be the source of truth for “what happened,” not reconstructed from final text.

---

### D. Artifact state

State about the world the agent changed.

Examples:

* files created/edited/deleted
* command side effects
* git diff summary
* build/test results
* generated outputs

This should be captured explicitly, not inferred later.

---

### E. Prompt state

The exact material passed into the LLM for a given step.

You want this for reproducibility:

* system instructions
* user request
* structured state snapshot
* selected tool schemas
* summarized history
* relevant tool results

If a step fails or behaves oddly, you want to inspect the exact prompt state that produced it.

---

## 4. Good state design principles

### Keep a typed state model

Instead of “just a list of messages,” define structured fields like:

* `goal`
* `plan`
* `current_step_index`
* `candidate_files`
* `last_command_result`
* `test_status`
* `termination_reason`

This reduces drift and helps downstream systems make decisions without re-parsing text.

### Use snapshots plus event sourcing

A practical approach:

* append every event to a log
* periodically materialize a snapshot of current state

This gives you:

* easy recovery,
* fast reads,
* and replay when needed.

### Version state

Every step should operate against a known state version.

That matters when:

* the UI sends new input,
* a command is still running,
* or multiple components race to update state.

A simple optimistic concurrency model is often enough for MVP:

* read version N
* produce step result
* write version N+1 only if still current

### Separate model-visible and system-private state

The LLM does not need every implementation detail.
Some state is for orchestration only:

* budget counters
* internal IDs
* sandbox policy
* rollback metadata

Only expose what helps reasoning.

---

## 5. Tool invocation patterns

Tool use is where agent design usually succeeds or fails.

### A. Single-tool-per-step

Each LLM turn may request one tool call, then the loop resumes.

#### Pros

* simplest to validate
* easiest to observe
* easiest to recover from failure
* best for MVP safety

#### Cons

* slower
* may require many round trips

This is a strong MVP choice.

---

### B. Batched tool requests

The LLM can request multiple tools at once when they are independent.

Example:

* read file A
* read file B
* grep for symbol C

#### Pros

* faster
* better for parallel read-only work

#### Cons

* more orchestration complexity
* harder to keep outputs coherent
* more failure handling paths

Good later, especially for read-heavy discovery phases.

---

### C. Plan-then-act

The agent first produces a short structured plan, then executes one action at a time.

Example:

1. inspect repo structure
2. identify auth entry points
3. edit middleware
4. run tests

#### Pros

* more legible
* easier for users to trust
* easier to interrupt
* helps constrain wandering

#### Cons

* plans can become stale
* extra LLM call unless combined with execution

This is often the best balance for coding agents.

---

### D. ReAct-style interleaving

Reason → act → observe → reason again.

This is the classic flexible agent pattern.

#### Pros

* adapts well to unexpected outcomes
* strong for debugging workflows

#### Cons

* can loop
* can over-explore
* can create noisy traces if not structured

Useful, but should be wrapped in strict orchestration rules.

---

### E. Tool-first deterministic subroutines

For known tasks, bypass free-form reasoning.

Examples:

* apply diff
* run tests
* read file
* search symbol
* format code
* collect diagnostics

In these cases, the agent may choose *which* subroutine to invoke, but the subroutine itself is deterministic.

This hybrid is usually stronger than making the LLM control every micro-step.

---

## 6. Streaming intermediate outputs

A good coding agent should stream more than just model tokens.

There are really three streams:

### A. Model token stream

Useful for:

* showing live thinking/progress
* partial natural-language responses
* visibility into planned actions

Be careful not to overcommit to token text before tool execution confirms it.

---

### B. Structured action stream

This is more important than token streaming.

Examples:

* `step_started`
* `llm_token_delta`
* `tool_call_proposed`
* `tool_call_started`
* `tool_stdout_chunk`
* `tool_stderr_chunk`
* `tool_completed`
* `patch_generated`
* `patch_applied`
* `step_completed`

This is what the UI and observability systems should really consume.

---

### C. Artifact/result stream

Examples:

* diff preview
* test results
* generated files
* logs
* exit codes

This lets the user watch actual work, not just words.

---

### Best practice

Treat tokens as one event type among many, not the primary protocol.

For coding agents, the most valuable stream is usually:

* what tool was called,
* what it did,
* what changed,
* what failed,
* what the agent will do next.

---

## 7. Deterministic pipelines vs flexible agent loops

This is the central tradeoff.

### Deterministic pipeline

A deterministic pipeline is a fixed sequence like:

1. gather repo metadata
2. search relevant files
3. generate patch
4. apply patch
5. run tests
6. summarize result

#### Strengths

* predictable
* easy to test
* easier to secure
* easier to debug
* easier to estimate cost/time
* good for repeated workflows

#### Weaknesses

* brittle when tasks vary
* weak under ambiguity
* poor at open-ended debugging
* may need many hardcoded branches

This is good when the task shape is known.

---

### Flexible agent loop

A flexible loop lets the model decide dynamically:

* what to inspect,
* what tool to use,
* when to revise plan,
* when to stop.

#### Strengths

* adapts to messy tasks
* better for debugging and code exploration
* handles unknown unknowns better
* more general-purpose

#### Weaknesses

* less predictable
* harder to contain
* more likely to loop or thrash
* more prompt-sensitive
* harder to certify correctness

This is good when task shape is not known.

---

### The real answer: hybrid

The strongest systems are usually hybrid:

* **deterministic outer control**
* **flexible inner reasoning**

Meaning:

* the orchestrator defines step boundaries, budgets, validation, and stopping rules
* the LLM chooses the next action within those constraints

This keeps the system agentic without letting it become chaotic.

---

## 8. Recommended MVP loop structure

For an MVP, I would recommend:

## **A bounded, step-based loop with plan-then-act behavior and one tool action per step**

Concretely:

### Step 0: Initialize session

Create:

* goal
* workspace/sandbox
* permissions
* budgets
* empty event log
* initial state snapshot

### Step 1: Planning pass

Ask the LLM for:

* short plan
* current subtask
* next best action
* expected completion criteria

Store that as structured state.

### Step 2+: Repeated execution steps

On each step:

1. Load current structured state
2. Build prompt with:

   * goal
   * short plan
   * recent tool results
   * artifact summaries
   * available tools
   * constraints
3. Ask LLM for exactly one of:

   * tool call
   * final response
   * request for clarification/input
   * stop/fail decision
4. Validate the output
5. If tool call:

   * execute it
   * stream its events
   * summarize result into state
6. Update plan/subtask if needed
7. Check termination rules

### Termination conditions

Stop when one of these is true:

* task success criteria met
* user input required
* max steps reached
* budget exceeded
* repeated failure threshold exceeded
* no-progress threshold triggered
* safety/policy violation

This gives you a controllable, debuggable loop that still feels interactive.

---

## 9. Risks to watch

### Runaway loops

The classic failure mode.

Examples:

* repeatedly grepping similar files
* repeatedly rerunning the same failing command
* editing the same code without converging

Mitigations:

* max steps
* max repeated tool calls of same type
* no-progress detector
* command retry limits
* explicit “why this next step?” field

---

### Inconsistent state

Very common in coding agents.

Examples:

* model thinks file changed, but patch failed
* test results correspond to old code version
* state references files from pre-reset workspace

Mitigations:

* treat tool results as authoritative
* version workspace state
* persist applied diffs explicitly
* never let model assertions overwrite tool facts

---

### Context bloat

As sessions grow, prompts become noisy and expensive.

Mitigations:

* maintain structured summaries
* keep raw logs outside prompt
* include only recent relevant tool outputs
* compress stale history into state summaries

---

### Tool-result misinterpretation

The LLM may misunderstand stderr, partial output, or patch failures.

Mitigations:

* structure tool outputs when possible
* provide normalized fields like:

  * exit code
  * changed files
  * test counts
  * failure categories
* avoid making the model parse huge raw blobs unless necessary

---

### Unsafe or destructive actions

Especially commands and file writes.

Mitigations:

* sandboxing
* allowlist or policy tiers
* approval gates for destructive actions
* separate read tools from write tools
* dry-run mode where possible

---

### Thrashing between planning and execution

The agent keeps rewriting the plan instead of doing work.

Mitigations:

* require concrete next action
* keep plans short
* only replan after meaningful new evidence or failure

---

### Streaming/UI mismatch

The user sees an optimistic token stream that later contradicts actual tool results.

Mitigations:

* distinguish clearly between:

  * “agent intends to…”
  * “tool is running…”
  * “tool completed…”
* make tool events first-class in UI

---

## 10. Practical design stance for MVP vs later

### MVP

Use:

* step-based loop
* one tool call per step
* structured state
* append-only event log
* strong termination guards
* deterministic outer orchestration
* flexible inner reasoning

This will feel less magical, but much more reliable.

### Later

Add selectively:

* batched read-only tool calls
* subroutines for common workflows
* richer planning/replanning
* background execution
* checkpoint/resume
* limited parallelism
* speculative execution only where safe

---

## Final recommendation

For an MVP coding agent, build a **bounded step-based execution loop** with:

* explicit step boundaries,
* structured durable state,
* append-only event logging,
* one validated tool action per step,
* and strict stop conditions.

Use the LLM for:

* choosing the next action,
* interpreting tool results,
* and adapting the plan.

Do **not** let the LLM own the control plane entirely.

That gives you the best tradeoff between:

* flexibility,
* debuggability,
* safety,
* and implementation simplicity.

The biggest risks are runaway loops, stale or inconsistent state, and weak observability. Design around those first, and the rest of the system gets much easier to evolve.
# MVP Eval Specification — v1.0

## Overview

The MVP eval suite validates the HumanLayer session-sync server against a deterministic set of scenarios. All evals are black-box HTTP tests against a running server instance and produce machine-readable JSON plus a human-readable markdown report.

## Running Evals

```bash
# Start server first
npm run dev --workspace=apps/server

# Run evals (pass/fail only)
npm run eval:mvp

# Optional parity check (primary vs secondary environment, e.g. local vs docker)
PARITY_SERVER_URL=http://localhost:3001 npm run eval:mvp

# Save results to docs/evals/latest-results.json
npm run eval:mvp -- --save

# Compare against baseline (regression gate)
npm run eval:mvp -- --baseline
```

## Repeatability Protocol

1. Evals run against a **clean-ish** server — existing sessions in the DB are tolerated (evals create their own).
2. Each eval creates its own session(s) via `POST /sessions`; no shared state between scenarios.
3. Scenarios are deterministic — no LLM calls, no timing dependencies beyond the latency budget.
4. The `--baseline` flag writes `latest-results.json` and compares must-pass results against `baseline-results.json`.

## Baseline-Regression Policy

- A **baseline** is an approved set of must-pass results saved to `docs/evals/baseline-results.json`.
- On CI, run with `--baseline`. If any must-pass scenario passes in baseline but fails now, the process exits 1 (regression).
- To update the baseline after deliberate behavior changes: run with `--save`, review results, then copy `latest-results.json` → `baseline-results.json`.

## Scoring Rubric

| Category | Must-Pass | Failure means |
|---|---|---|
| lifecycle | ✓ | Core session CRUD is broken — blocker |
| event | ✓ | Event ingest or agent pull is broken — blocker |
| stop | ✓ | Stop semantics broken — data integrity risk |
| safety | ✓ | Validation not enforced — security/reliability risk |
| workdir | ✓ | Working directory policy not enforced — security risk |
| exploration | ✓ | Phase/budget semantics broken — incorrect terminal outcomes |
| efficiency | — | Latency regression — advisory only |

All must-pass scenarios must be green to exit 0. Efficiency failures are warnings only.

---

## Scenario Fixtures

### Lifecycle

| ID | Name | Must-Pass | Judge |
|---|---|---|---|
| LC-01 | Create session returns created status | ✓ | deterministic |
| LC-02 | Stop idempotency: repeated stop returns stopping | ✓ | deterministic |
| LC-03 | Retry from stopped resets session to created | ✓ | deterministic |
| LC-04 | List sessions returns array | ✓ | deterministic |
| LC-05 | Get session returns detail with state | ✓ | deterministic |

**LC-01 fixture**: `POST /sessions { goal: "eval test" }` → expect `session.status === "created"`

**LC-02 fixture**: Create session, call stop twice → second stop returns `status === "stopping"` (idempotent)

**LC-03 fixture**: Create session, stop it, attempt retry → expect rejection (session is `stopping`, not `stopped`/`failed`)

**LC-04 fixture**: `GET /sessions` → expect `sessions` is an array

**LC-05 fixture**: Create session, `GET /sessions/:id` → expect `session.id` matches and `state` is present

---

### Event Integrity

| ID | Name | Must-Pass | Judge |
|---|---|---|---|
| EV-01 | Event ingest rejects stale attempt_id | ✓ | deterministic |
| EV-02 | Agent pull returns 204 when no sessions | ✓ | deterministic |

**EV-01 fixture**: Create session, `POST /sessions/:id/events` with a random `attemptId` (nil UUID) → expect HTTP 4xx (no active attempt owns this session)

**EV-02 fixture**: `POST /agents/eval-agent/pull` → expect `204` (no sessions) or `201` (session assigned)

---

### Stop Semantics

| ID | Name | Must-Pass | Judge |
|---|---|---|---|
| ST-01 | Stop accepted in creating state | ✓ | deterministic |
| ST-02 | Stop is no-op for completed session | ✓ | deterministic |

**ST-01 fixture**: Create session, immediately stop → expect `status === "stopping"`

**ST-02 fixture**: Covered by LC-02 (idempotency test)

---

### Safety / Adversarial

| ID | Name | Must-Pass | Judge |
|---|---|---|---|
| SA-01 | Event batch rejects oversized arrays (>100) | ✓ | deterministic |
| SA-02 | Create session rejects missing goal | ✓ | deterministic |

**SA-01 fixture**: Send 101-event batch → expect HTTP 4xx

**SA-02 fixture**: `POST /sessions { goal: "" }` → expect HTTP 4xx

---

### Working Directory Policy

| ID | Name | Must-Pass | Judge |
|---|---|---|---|
| WD-01 | Create session with workingDirectory stores policy in metadata | ✓ | deterministic |
| WD-02 | Create session without workingDirectory succeeds (backward compat) | ✓ | deterministic |
| WD-03 | Create session with invalid workingDirectory returns reason code | ✓ | deterministic |
| WD-04 | Local/docker parity: same workdir input has same allow/deny outcome | — | deterministic |

**WD-01 fixture**: `POST /sessions { goal: "workdir eval test", workingDirectory: "/tmp" }` → expect session metadata contains `workdirPolicy` with `resolvedPath` and `runtimeMode`

**WD-02 fixture**: `POST /sessions { goal: "no workdir" }` → expect `session.status === "created"` (no error)

**WD-03 fixture**: `POST /sessions { goal: "invalid", workingDirectory: "/nonexistent/path" }` → expect HTTP 422 with `WORKDIR_NOT_FOUND` or `WORKDIR_NOT_ALLOWED` reason code

**WD-04 fixture**: if `PARITY_SERVER_URL` is set, submit a small set of identical `workingDirectory` values to both servers and compare allow/deny outcomes. Expected result: outcomes match for each sampled path. If `PARITY_SERVER_URL` is unset, scenario is skipped and marked advisory pass.

---

### Exploration Budget / Phase Semantics

| ID | Name | Must-Pass | Judge |
|---|---|---|---|
| EX-01 | Blocked status accepted as terminal session state | ✓ | deterministic |
| EX-02 | Retry allowed from blocked session status | ✓ | deterministic |
| EX-03 | Phase transition events have machine-readable payloads | ✓ | deterministic |

**EX-01 fixture**: Create session → verify `blocked` is a valid terminal status in the system. Acceptance checks mapped to requirement criteria 1 (exploration exhaustion never reported as success).

**EX-02 fixture**: Verify `retrySession` accepts `blocked` as a valid starting state for retry. Maps to requirement criteria 2 (blocked sessions are retryable).

**EX-03 fixture**: Verify `phase.transition`, `exploration.budget_exhausted`, and `edit_readiness.hypothesis` are valid `SessionEventType` values with structured payloads. Maps to requirement criteria 3-8 (phase observability, budget enforcement, hypothesis tracking).

---

### Efficiency / Latency

| ID | Name | Must-Pass | Budget |
|---|---|---|---|
| EF-01 | Create session latency < 500ms | — | 500ms |
| EF-02 | List sessions latency < 500ms | — | 500ms |

Latency is measured wall-clock from request start to response end. These are advisory — failures produce warnings but do not block CI.

# Milestone 5: Reliability Sweep + Docker Compose + Docs/Demo

## Overview
Close MVP with operational reliability requirements, explicit eval gates, and demo-ready packaging.

## Dependencies
- [x] Milestone 4: `m4-realtime-ui-create-list-detail-stop-retry`

## Changes Required
- Add lease sweeper job to detect expired leases and mark sessions/attempts recoverably.
- Containerize server/agent/ui and define full stack in `docker-compose.yml`.
- Implement MVP eval runner, baseline comparison, repeated-run metadata, and budget gates.
- Finalize docs and runbooks for setup, eval workflow, AI cost envelope, and decision log.
- Source plan section: [Phase 5 in `docs/plans/mvp.md`](../../mvp.md).

## Success Criteria

### Automated Verification
- [x] `docker compose up --build`
- [x] `npm run test`
- [x] `npm run eval:mvp`
- [x] Lint/typecheck pass across all workspaces
- [x] Eval run enforces no-regression gate against baseline for must-pass scenarios
- [x] Eval run reports latency/error/cost budget checks

### Manual Verification
- [ ] Full demo flow: create -> run -> observe trace -> stop/retry -> inspect history
- [ ] Past sessions remain inspectable after restart
- [ ] Agent container has no exposed inbound port
- [ ] Latest eval report shows all must-pass scenarios green
- [ ] Latest eval report includes safety/adversarial scenarios with expected safe outcomes
- [ ] Latest eval report includes repeatability metadata (model config, run count, pass-rate/variance)
- [ ] Latest eval report includes rubric judge type, threshold, and rationale
- [ ] `README.md` reflects final run/test/eval workflow
- [ ] `docs/ai-cost.md` documents assumptions and estimated AI cost envelope

## Tasks
- [001-implement-lease-sweeper-and-recovery-policy](./001-implement-lease-sweeper-and-recovery-policy.md)
- [002-containerize-stack-and-compose-workflow](./002-containerize-stack-and-compose-workflow.md)
- [003-implement-mvp-evals-baseline-and-docs](./003-implement-mvp-evals-baseline-and-docs.md)

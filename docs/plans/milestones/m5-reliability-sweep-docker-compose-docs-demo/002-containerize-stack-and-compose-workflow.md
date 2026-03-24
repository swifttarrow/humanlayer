# Task 002: Containerize Stack and Compose Workflow

## Goal
Package server, agent, UI, and Postgres into a reproducible local stack using Docker Compose.

## Deliverables
- [ ] `apps/server/Dockerfile`, `apps/agent/Dockerfile`, and `apps/ui/Dockerfile` are added and buildable
- [ ] `docker-compose.yml` defines `server`, `db`, `agent`, and `ui` services
- [ ] `.env.example` documents required configuration and defaults

## Notes
Maintain outbound-only behavior for the agent container and avoid exposing inbound agent ports.

## Verification
Run `docker compose up --build` and verify services start with expected networking constraints.

# HumanLayer Session Sync Agent

A real-time session management platform for human-in-the-loop AI agents. Agents register, pull work, emit structured events, and humans observe or intervene via a live UI.

## Architecture

```
┌─────────────┐      pull/heartbeat/events      ┌──────────────────┐
│  AI Agent   │ ──────────────────────────────▶ │  Express Server  │
│  (Node.js)  │                                  │  + PostgreSQL    │
└─────────────┘                                  └────────┬─────────┘
                                                          │ SSE
                                                  ┌───────▼──────────┐
                                                  │   React UI       │
                                                  │  (nginx + Vite)  │
                                                  └──────────────────┘
```

**Packages:**
- `packages/shared` — TypeScript contracts (DTOs, status unions)
- `apps/server` — Express API + Prisma/PostgreSQL + SSE stream
- `apps/agent` — Autonomous agent daemon with OpenAI step loop
- `apps/ui` — React SPA (session list, detail, live trace)

## Quick Start

### Local Development

**Prerequisites:** Node 20+, PostgreSQL 16+

```bash
# Install deps
npm install

# Configure env
cp apps/server/.env.example apps/server/.env
# Edit DATABASE_URL to point to your local Postgres

# Run DB migration
npm run db:migrate

# Start all services
npm run dev
```

- Server: http://localhost:3000
- UI: http://localhost:5173

### Docker (all-in-one)

```bash
# Requires OPENAI_API_KEY in environment
export OPENAI_API_KEY=sk-...

# Optional: set workspace host path (default: ./_workspace)
export WORKSPACE_PATH=/path/to/your/project

docker compose up --build
```

- UI: http://localhost:5173
- API: http://localhost:3000

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start server + agent + UI in parallel |
| `npm run build` | Build all workspaces |
| `npm run typecheck` | TypeScript check across all packages |
| `npm run lint` | ESLint across all packages |
| `npm run test` | Vitest across all packages |
| `npm run db:migrate` | Apply Prisma migrations (deploy) |
| `npm run eval:mvp` | Run MVP eval suite against live server |

## Eval Suite

The eval suite runs deterministic black-box scenarios against a running server.

```bash
# Start server first
npm run dev --workspace=apps/server

# Run evals
npm run eval:mvp

# Save results + compare against baseline
npm run eval:mvp -- --baseline
```

Results: `docs/evals/latest-results.json` and `docs/evals/latest-results.md`

See [docs/evals/mvp-eval-spec.md](docs/evals/mvp-eval-spec.md) for full scenario specs.

## Demo Walkthrough

1. Open http://localhost:5173
2. Click **New Session** → enter a goal (e.g. "Find all TypeScript files and count lines")
3. Watch the session appear in the list as `created`
4. The agent picks it up within the poll interval (default 5s) → status transitions to `running`
5. Open the session detail to see the live structured trace update in real time
6. Click **Stop** to request graceful shutdown
7. The agent completes the current step, emits a stop event, and the session transitions to `stopped`

## Environment Variables

### Server

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | — | PostgreSQL connection string |
| `PORT` | `3000` | HTTP server port |
| `LEASE_DURATION_SECONDS` | `60` | How long an agent lease is valid |
| `LEASE_SWEEP_INTERVAL_MS` | `30000` | Expired lease sweep interval |
| `WORKDIR_ALLOWED_ROOTS` | `/tmp` | Comma-separated allowed root directories for working directory policy |
| `RUNTIME_MODE` | `local` | Runtime mode: `local` or `docker` |

### Agent

| Variable | Default | Description |
|---|---|---|
| `SERVER_URL` | `http://localhost:3000` | Server base URL |
| `AGENT_ID` | `default-agent` | Unique agent identifier |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `AGENT_MODEL` | `gpt-4.1-mini` | OpenAI model to use |
| `POLL_INTERVAL_MS` | `5000` | Session pull poll interval |
| `HEARTBEAT_INTERVAL_MS` | `15000` | Lease heartbeat interval |

### Docker-specific

| Variable | Default | Description |
|---|---|---|
| `WORKSPACE_PATH` | `./_workspace` | Host path mounted as `/workspace` in agent container |

## Working Directory Policy

Sessions can include a `working_directory` that constrains where the agent can read and write files.

### Local Mode

Set `WORKDIR_ALLOWED_ROOTS` to control which host directories are available for working directory selection. The server validates and canonicalizes paths at session creation; the agent enforces boundaries at tool execution time.

```bash
# Allow projects under ~/code and /tmp
export WORKDIR_ALLOWED_ROOTS="$HOME/code,/tmp"
```

**Example — valid request:**
```bash
curl -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' \
  -d '{"goal":"fix the bug","workingDirectory":"/tmp/my-project"}'
```

**Example — rejected request (outside allowed roots):**
```bash
curl -X POST http://localhost:3000/sessions \
  -H 'Content-Type: application/json' \
  -d '{"goal":"fix the bug","workingDirectory":"/etc/secrets"}'
# → 422: {"error":"Working directory is outside allowed roots","code":"WORKDIR_NOT_ALLOWED"}
```

### Docker Mode

In Docker mode, the agent container only sees `/workspace` (mapped from `WORKSPACE_PATH`) and `/tmp`. The `read_only: true` root filesystem prevents writes outside declared mounts. The agent runs as a non-root user for additional isolation.

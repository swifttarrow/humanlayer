# @humanlayer/cli

Thin API-backed CLI for interactive and headless HumanLayer session execution.

## Usage

```bash
# Interactive mode — creates a session and streams events to the terminal
humanlayer run "Refactor auth middleware to use JWT tokens"

# Headless mode — emits JSONL to stdout for automation
humanlayer run "Fix bug in login flow" --headless

# With options
humanlayer run "Add unit tests" --workdir /path/to/project --runtime-mode docker --timeout 600000

# Session management
humanlayer list
humanlayer status <session-id>
humanlayer stop <session-id>
```

## Commands

| Command | Description |
|---------|-------------|
| `run <goal>` | Create and stream a session |
| `status <id>` | Check session status |
| `stop <id>` | Stop a running session |
| `list` | List all sessions |

## Options

| Flag | Description |
|------|-------------|
| `--headless` | Emit JSONL output instead of interactive display |
| `--output <path>` | Write JSONL output to file (headless only) |
| `--workdir <path>` | Working directory for the session |
| `--runtime-mode <local\|docker>` | Runtime mode override |
| `--agent-type <type>` | Agent type selection |
| `--timeout <ms>` | Timeout in milliseconds (default: 1800000) |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success — session completed |
| 1 | General failure |
| 2 | Policy denied — selection or approval blocked |
| 3 | Timeout — session did not complete in time |
| 4 | Runtime error — server or network failure |
| 64 | Usage error — invalid arguments |

## JSONL Schema

When running in `--headless` mode, each line of output is a JSON object:

```json
{
  "version": "1",
  "timestamp": "2025-01-01T00:00:00.000Z",
  "sessionId": "sess-abc123",
  "type": "event",
  "data": { "eventType": "session.started", "payload": { "goal": "..." } }
}
```

### Event types in JSONL output

- **Lifecycle:** `session.started`, `session.completed`, `session.failed`, `session.stopped`, `session.blocked`
- **Tool:** `tool.started`, `tool.completed`, `tool.failed`
- **Step:** `step.started`, `step.completed`, `step.failed`
- **Approval:** `steering.approval_requested`, `steering.approved`, `steering.rejected`
- **Clarification:** `steering.clarification_requested`, `steering.clarification_responded`
- **Snapshot:** Full session state snapshot (type: `"snapshot"`)

### Version compatibility

The `version` field is an integer string. Clients should check `parseInt(version) <= maxSupportedVersion` to ensure forward compatibility.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `HUMANLAYER_SERVER_URL` | `http://localhost:3000` | Server API URL |
| `HUMANLAYER_API_TOKEN` | — | Optional bearer token for auth |

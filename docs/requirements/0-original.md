# Requirements

## Overview

Build a **sync-based headless coding agent system** consisting of:

- A server process
- A headless coding agent (daemon)
- A reactive user interface

The system enables users to create and monitor coding sessions in real-time, with the agent executing tasks and streaming events back to the server.

---

## Core Components

### 1. Server Process

#### Responsibilities
- Run on a web server
- Manage a database (Postgres, MySQL, etc.)
- Provide APIs for:
  - Session creation
  - Session control (start/stop)
  - Event ingestion from agent
- Enable real-time sync with UI

#### Requirements
- Must persist:
  - Sessions
  - Agent events (tool calls, tokens, messages)
- Must support real-time updates to clients
- Must accept inbound connections from agents (no outbound initiation)

---

### 2. Headless Coding Agent (Daemon)

#### Responsibilities
- Execute coding sessions
- Maintain agent loop (LLM calls, state, tools)
- Stream events to server in real time

#### Requirements
- Must:
  - Run in any environment (local, container, sandbox)
  - Start via a simple CLI command
  - Connect **outbound only** to server
- Must:
  - Pull session work from server
  - Execute tasks locally
  - Stream:
    - Tool calls
    - Thinking tokens
    - Assistant messages
- Must NOT:
  - Require inbound connections
  - Expose ports

---

### 3. User Interface

#### Responsibilities
- Provide interactive UI for users
- Display real-time agent activity

#### Requirements
- Must allow:
  - Creating a session
  - Stopping a session
- Must:
  - Reactively update with live session data
  - Sync with server state in real time
- Must communicate with server via API

---

## Functional Requirements

### Session Management
- Create session
- Start session (implicitly or explicitly)
- Stop session
- Persist session state

### Real-Time Sync
- Agent → Server: streaming events
- Server → UI: live updates

### Event Handling
- Capture and store:
  - Tool calls
  - Intermediate reasoning (tokens)
  - Final outputs/messages

---

## Technical Constraints

### Language
- Entire project MUST be written in **TypeScript**
  - Backend
  - Agent
  - Frontend

### Frameworks / Libraries
- Allowed:
  - LLM SDKs (OpenAI, Anthropic, etc.)
  - Agent frameworks (Langchain.js, Vercel AI SDK, etc.)
- Not allowed:
  - Prebuilt coding agent SDKs (e.g. Claude Code SDK, Cursor SDK, OpenCode, Amp)

### Frontend Framework
- MUST NOT use **Next.js**

### Dependencies
- Must NOT require paid services (except LLM API keys)
- May:
  - Use hosted LLM APIs
  - Use local models (e.g. llama.cpp)

---

## Infrastructure Requirements

### Docker Compose

Must include a `docker-compose` setup with:

#### Required Containers
1. Server (and optionally UI)
2. Database
3. Agent runtime container (e.g. Ubuntu)

#### Networking Rules
- Server/UI:
  - Must expose ports
- Agent container:
  - MUST NOT expose ports
  - Only outbound connections allowed

#### Usability Requirement
- Must run with:
  ```bash
  docker compose up
```

* Must:

  * Work without additional setup steps
  * Use `.env` file for API keys

---

## Data Requirements

### Database Must Store

* Sessions
* Event streams
* Agent outputs

---

## Deliverables

### Repository

* Public GitHub repo
* Full source code
* Git history included

### README.md Must Include

* Architecture overview
* Stack and design decisions
* Setup instructions
* How to run with Docker
* Agent usage explanation

### Demo

* Loom (or equivalent) video demonstrating:

  * Creating a session
  * Running agent
  * Viewing live updates

### AI Usage Disclosure

* List any coding agents used
* Include:

  * Config directories (`.cursor`, `.claude`, etc.)
  * Prompt files (e.g. `AGENTS.md`)

---

## Non-Goals

* Feature completeness is NOT required
* Evaluation focuses on:

  * Architecture
  * Design decisions
  * System thinking

---

## Success Criteria

A successful implementation:

* Runs via `docker compose up` with minimal setup
* Demonstrates:

  * Session lifecycle
  * Real-time streaming
  * Agent execution loop
* Clearly separates:

  * Server
  * Agent
  * UI
* Maintains clean, extensible architecture
# FAQ

## What is a daemon?

A daemon is a background process that runs continuously to provide a service, usually without direct user interaction. On Unix-like systems (including macOS and Linux), daemons often start at boot and wait for work, such as handling web requests, processing jobs, or watching files.

In this project context, an agent server running in the background could be considered a daemon if it stays alive and coordinates tasks over time.

## What is the difference between pull-based and push-based agent coordination?

In pull-based coordination, agents ask a coordinator (or queue) for work when they are ready. The worker controls pacing, which can simplify backpressure and make scaling straightforward, but it may add polling overhead or small pickup delays.

In push-based coordination, the coordinator proactively sends work or control messages to agents over a live channel. This can reduce assignment latency and improve realtime responsiveness, but it requires stronger connection management, flow control, and failure handling (for example, reconnects and half-open detection).

In practice, many systems use a hybrid model: pull for durable task acquisition and push streams for low-latency updates, cancellations, and progress signals.

## What are "half-open connections"?

A half-open connection is a connection where one side believes the connection is still active, but the other side has already dropped or lost it (for example, after a crash, network interruption, or silent timeout).

In realtime systems, half-open connections can cause stale sessions, missed heartbeats, and wasted resources unless you detect and clean them up using keepalives, heartbeat timeouts, or explicit reconnect logic.

## What is an SSE-like control stream?

An SSE-like control stream is a long-lived, server-to-client stream that behaves like Server-Sent Events (SSE): the client opens one connection, and the server continuously pushes ordered text events (such as status updates, heartbeats, and control signals) over it.

It is useful for lightweight control-plane messaging where the client mostly listens and does not need high-throughput, full-duplex communication.

## What is a gRPC bidirectional stream?

A gRPC bidirectional stream is a persistent stream where both client and server can send messages independently over the same connection at any time.

Unlike SSE-style streaming (primarily server-to-client), bidirectional gRPC supports full-duplex, low-latency request and response flows, which is useful when both sides must continuously exchange commands, acknowledgements, and data.
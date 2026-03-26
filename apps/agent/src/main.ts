import { loadEnv, envLoadPathsForLog } from "./loadEnv.js";
import { randomUUID } from "crypto";

loadEnv();
import { pullSession } from "./api.js";
import { runStepLoop } from "./runner/stepLoop.js";
import type { WorkingDirectoryPolicy } from "@humanlayer/shared";

const AGENT_ID = process.env.AGENT_ID ?? `agent-${randomUUID().slice(0, 8)}`;
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS ?? "5000", 10);
const MAX_CONCURRENT = 1; // one attempt at a time

let running = 0;
let shuttingDown = false;

process.on("SIGTERM", () => {
  console.log("[agent] SIGTERM received — draining");
  shuttingDown = true;
});
process.on("SIGINT", () => {
  console.log("[agent] SIGINT received — draining");
  shuttingDown = true;
});

async function pollAndRun() {
  if (shuttingDown || running >= MAX_CONCURRENT) return;

  try {
    const result = await pullSession(AGENT_ID);
    if (!result) return; // no sessions available

    const { session, attempt } = result;
    console.log(`[agent] Claimed session ${session.id} (attempt ${attempt.id})`);
    running++;

    try {
      // Extract workdir policy from session metadata if present
      const metadata = session.metadata as Record<string, unknown> | undefined;
      const workdirPolicy = metadata?.workdirPolicy as WorkingDirectoryPolicy | undefined;
      const parentSessionId = typeof metadata?.parentSessionId === "string"
        ? metadata.parentSessionId
        : undefined;

      const outcome = await runStepLoop({
        sessionId: session.id,
        attemptId: attempt.id,
        agentId: AGENT_ID,
        goal: session.goal,
        parentSessionId,
        workdirPolicy,
      });
      console.log(`[agent] Session ${session.id} finished: ${outcome.outcome}`);
    } finally {
      running--;
    }
  } catch (err) {
    console.error("[agent] Poll error:", err);
  }
}

async function main() {
  console.log(`[agent] Starting agent ${AGENT_ID}`);
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error(
      "[agent] OPENAI_API_KEY is not set after loading .env from:\n  " +
        envLoadPathsForLog().join("\n  ")
    );
  }
  console.log(`[agent] Polling every ${POLL_INTERVAL_MS}ms`);

  // Poll loop
  while (!shuttingDown) {
    await pollAndRun();
    await sleep(POLL_INTERVAL_MS);
  }

  console.log("[agent] Shutdown complete");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error("[agent] Fatal:", err);
  process.exit(1);
});

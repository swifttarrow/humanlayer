import type { SessionStatus } from "@humanlayer/shared";

async function main() {
  const status: SessionStatus = "created";
  console.log(`Agent daemon starting. Initial status: ${status}`);
  // Poll loop will be implemented in Milestone 3
}

main().catch((err) => {
  console.error("Agent fatal error:", err);
  process.exit(1);
});

import { config } from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

/**
 * Load .env from fixed paths so OPENAI_API_KEY (etc.) work regardless of process.cwd()
 * (e.g. `npm run dev` from repo root via concurrently).
 *
 * Later files only fill keys that are still unset (default dotenv behavior).
 * Order: apps/agent → apps/server → repo root.
 */
export function loadEnv(): void {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const agentRoot = path.resolve(here, "..");
  const appsRoot = path.resolve(agentRoot, "..");
  const repoRoot = path.resolve(appsRoot, "..");

  const paths = [
    path.join(agentRoot, ".env"),
    path.join(appsRoot, "server", ".env"),
    path.join(repoRoot, ".env"),
  ];

  for (const envPath of paths) {
    config({ path: envPath });
  }
}

export function envLoadPathsForLog(): string[] {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const agentRoot = path.resolve(here, "..");
  const appsRoot = path.resolve(agentRoot, "..");
  const repoRoot = path.resolve(appsRoot, "..");
  return [
    path.join(agentRoot, ".env"),
    path.join(appsRoot, "server", ".env"),
    path.join(repoRoot, ".env"),
  ];
}

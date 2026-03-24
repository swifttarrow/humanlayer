import { readFile } from "fs/promises";
import * as globModule from "glob";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

const glob = (
  (globModule as unknown as { glob?: unknown }).glob ??
  (globModule as unknown as { default?: { glob?: unknown } }).default?.glob ??
  (globModule as unknown as { default?: unknown }).default ??
  globModule
) as typeof import("glob").glob;

/**
 * Search files by glob pattern or content string.
 */
export async function runFileSearch(
  pattern: string,
  type: "glob" | "content",
  searchPath?: string
): Promise<string> {
  const cwd = searchPath ?? process.cwd();

  if (type === "glob") {
    const matches = await glob(pattern, { cwd, nodir: true, maxDepth: 10 });
    if (matches.length === 0) return "No files matched.";
    return matches.slice(0, 100).join("\n");
  }

  // content search — grep-like scan
  const allFiles = await glob("**/*", { cwd, nodir: true, maxDepth: 8 });
  const results: string[] = [];

  for (const file of allFiles) {
    if (results.length >= 50) break;
    const fullPath = path.join(cwd, file);
    try {
      const rl = createInterface({ input: createReadStream(fullPath) });
      let lineNum = 0;
      for await (const line of rl) {
        lineNum++;
        if (line.includes(pattern)) {
          results.push(`${file}:${lineNum}: ${line.trim()}`);
          if (results.length >= 50) break;
        }
      }
    } catch {
      // skip binary/unreadable files
    }
  }

  if (results.length === 0) return `No matches for "${pattern}".`;
  return results.join("\n");
}

/**
 * Read the contents of a file.
 */
export async function runFileRead(filePath: string, baseDir?: string): Promise<string> {
  const resolved = path.isAbsolute(filePath)
    ? filePath
    : baseDir
      ? path.resolve(baseDir, filePath)
      : path.resolve(filePath);
  const content = await readFile(resolved, "utf-8");
  // Truncate large files
  if (content.length > 50_000) {
    return content.slice(0, 50_000) + "\n... [truncated]";
  }
  return content;
}

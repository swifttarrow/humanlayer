import { readFile } from "fs/promises";
import { glob } from "glob";
import { createReadStream } from "fs";
import { createInterface } from "readline";
import path from "path";

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
export async function runFileRead(filePath: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const content = await readFile(resolved, "utf-8");
  // Truncate large files
  if (content.length > 50_000) {
    return content.slice(0, 50_000) + "\n... [truncated]";
  }
  return content;
}

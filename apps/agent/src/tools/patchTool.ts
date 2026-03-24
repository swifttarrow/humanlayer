import { readFile, writeFile } from "fs/promises";
import path from "path";

/**
 * Apply a unified diff patch to a file.
 * Supports simple +/- line diffs produced by Claude.
 */
export async function runPatch(filePath: string, patch: string): Promise<string> {
  const resolved = path.resolve(filePath);
  const original = await loadOriginalForPatch(resolved, patch);
  const patched = applyUnifiedDiff(original, patch);
  await writeFile(resolved, patched, "utf-8");
  return `Patched ${filePath} successfully.`;
}

async function loadOriginalForPatch(filePath: string, patch: string): Promise<string> {
  try {
    return await readFile(filePath, "utf-8");
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      "code" in err &&
      err.code === "ENOENT" &&
      isCreateFilePatch(patch)
    ) {
      return "";
    }
    throw err;
  }
}

function isCreateFilePatch(patch: string): boolean {
  const lines = patch.split("\n");
  const hasCreateHunk = lines.some((line) => /^@@ -0(?:,0)? \+\d+(?:,\d+)? @@/.test(line));
  if (!hasCreateHunk) return false;

  return lines.every((line) => !line.startsWith("-") || line.startsWith("---"));
}

/**
 * Minimal unified diff applicator.
 * Handles @@ hunks with context lines.
 */
function applyUnifiedDiff(original: string, patch: string): string {
  const origLines = original.split("\n");
  const patchLines = patch.split("\n");

  // Find hunk headers
  const hunks: { startLine: number; removes: string[]; adds: string[] }[] = [];

  let i = 0;
  while (i < patchLines.length) {
    const line = patchLines[i];
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      const startLine = parseInt(hunkMatch[1], 10) - 1; // 0-indexed
      const removes: string[] = [];
      const adds: string[] = [];
      i++;
      while (i < patchLines.length && !patchLines[i].startsWith("@@")) {
        const pl = patchLines[i];
        if (pl.startsWith("-") && !pl.startsWith("---")) {
          removes.push(pl.slice(1));
        } else if (pl.startsWith("+") && !pl.startsWith("+++")) {
          adds.push(pl.slice(1));
        }
        i++;
      }
      hunks.push({ startLine, removes, adds });
    } else {
      i++;
    }
  }

  if (hunks.length === 0) {
    throw new Error("No valid hunks found in patch");
  }

  // Apply hunks in reverse order to preserve line offsets
  const result = [...origLines];
  for (const hunk of [...hunks].reverse()) {
    let pos = hunk.startLine;
    // Find where the removes start
    for (let j = 0; j < hunk.removes.length; j++) {
      if (result[pos + j] !== hunk.removes[j]) {
        // Try to find context
        const found = findContext(result, hunk.removes[0], pos - 5);
        if (found >= 0) pos = found;
        break;
      }
    }
    result.splice(pos, hunk.removes.length, ...hunk.adds);
  }

  return result.join("\n");
}

function findContext(lines: string[], target: string, startFrom: number): number {
  const start = Math.max(0, startFrom);
  for (let i = start; i < Math.min(lines.length, start + 20); i++) {
    if (lines[i] === target) return i;
  }
  return -1;
}

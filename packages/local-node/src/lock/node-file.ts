// node.json: how a second launch finds the running node.
import { readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** `startedAt` and `firstFrameAt` are milliseconds since the epoch; `firstFrameAt` is null until the window drew. */
export interface NodeFile {
  pid: number;
  nodeUrl: string;
  launchToken: string;
  startedAt: number;
  firstFrameAt: number | null;
}

const NODE_FILE = "node.json";

/** An integer of zero or more. */
const isCount = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0;

const isText = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0;

function toNodeFile(value: unknown): NodeFile | null {
  if (typeof value !== "object" || value === null) return null;
  if (
    !("pid" in value && "nodeUrl" in value && "launchToken" in value) ||
    !("startedAt" in value && "firstFrameAt" in value)
  )
    return null;
  const { pid, nodeUrl, launchToken, startedAt, firstFrameAt } = value;
  if (!isCount(pid) || pid < 1 || !isCount(startedAt)) return null;
  if (!isText(nodeUrl) || !isText(launchToken)) return null;
  if (firstFrameAt !== null && !isCount(firstFrameAt)) return null;
  return { pid, nodeUrl, launchToken, startedAt, firstFrameAt };
}

/** Mode 0600 where the system has modes; written to a temporary name and renamed, so a reader sees a whole file or the one before. */
export function writeNodeFile(root: string, file: NodeFile): void {
  const path = join(root, NODE_FILE);
  writeFileSync(`${path}.tmp`, JSON.stringify(file), { mode: 0o600 });
  renameSync(`${path}.tmp`, path);
}

/** Null when the file is missing or not well formed. */
export function readNodeFile(root: string): NodeFile | null {
  let text: string;
  try {
    text = readFileSync(join(root, NODE_FILE), "utf8");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return null;
    throw error;
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    // Not JSON: a file cut short reads as no file.
    return null;
  }
  return toNodeFile(value);
}

export function removeNodeFile(root: string): void {
  rmSync(join(root, NODE_FILE), { force: true });
}

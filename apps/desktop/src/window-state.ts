// The shell's window-state.json: each window role's frame and first-paint values, saved a moment after they settle.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import type { Clock } from "@manent/server-core";
import { parsePageMessage } from "@manent/sync-protocol";
import type { FirstPaintWrite } from "@manent/sync-protocol";
import type { Frame } from "./frames.ts";

export const WINDOW_ROLES = ["main", "room", "prompter"] as const;
export type WindowRole = (typeof WINDOW_ROLES)[number];

/** `frame` is null until the window has been moved or resized. */
export interface WindowRecord {
  frame: Frame | null;
  maximised: boolean;
  fullScreen: boolean;
  firstPaint: FirstPaintWrite[];
}

export interface WindowStateFile {
  v: 1;
  roles: Partial<Record<WindowRole, WindowRecord>>;
}

const EMPTY_RECORD: WindowRecord = Object.freeze({
  frame: null,
  maximised: false,
  fullScreen: false,
  firstPaint: [],
});

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const isCoordinate = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const isLength = (value: unknown): value is number =>
  isCoordinate(value) && value > 0;

function readFrame(value: unknown): Frame | null {
  if (!isFields(value)) return null;
  const { x, y, width, height } = value;
  if (!isCoordinate(x) || !isCoordinate(y)) return null;
  if (!isLength(width) || !isLength(height)) return null;
  return { x, y, width, height };
}

/** The writes as the shell channel accepts them; null when it would refuse them. */
function readFirstPaint(writes: unknown): FirstPaintWrite[] | null {
  const message = parsePageMessage({ v: 1, t: "first_paint", writes });
  return message?.t === "first_paint" ? message.writes : null;
}

function readRecord(value: unknown): WindowRecord | null {
  if (!isFields(value)) return null;
  const { maximised, fullScreen } = value;
  if (typeof maximised !== "boolean" || typeof fullScreen !== "boolean")
    return null;
  const frame = value.frame === null ? null : readFrame(value.frame);
  if (frame === null && value.frame !== null) return null;
  const firstPaint = readFirstPaint(value.firstPaint);
  return firstPaint === null
    ? null
    : { frame, maximised, fullScreen, firstPaint };
}

/** Null when `value` is not a state file of this version; a role this build does not know is left out. */
function readFile(value: unknown): WindowStateFile | null {
  if (!isFields(value) || value.v !== 1 || !isFields(value.roles)) return null;
  const roles: WindowStateFile["roles"] = {};
  for (const role of WINDOW_ROLES) {
    if (!(role in value.roles)) continue;
    const record = readRecord(value.roles[role]);
    if (record === null) return null;
    roles[role] = record;
  }
  return { v: 1, roles };
}

/** A missing, unreadable or malformed file reads as `{ v: 1, roles: {} }`. */
export function readWindowState(path: string): WindowStateFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    // no file yet, or one that cannot be read: every window opens as if new
    parsed = null;
  }
  return readFile(parsed) ?? { v: 1, roles: {} };
}

/** Writes beside `path`, then renames over it, so a reader never sees half a file. */
function replaceFile(path: string, text: string): void {
  const temporary = `${path}.tmp`;
  try {
    writeFileSync(temporary, text);
    renameSync(temporary, path);
  } catch {
    // a convenience only: the window reopens as last saved, and the next write replaces any partial temporary file
  }
}

/**
 * Starts from what `path` holds. Each `update` merges its patch into the role's record and
 * writes the whole file `delayMs` after the last update; `flush` writes a pending change at once.
 * A file that cannot be written is left as it was.
 */
export function createWindowStateWriter(options: {
  path: string;
  clock: Clock;
  delayMs: number;
}): {
  update(role: WindowRole, patch: Partial<WindowRecord>): void;
  flush(): void;
} {
  const { path, clock, delayMs } = options;
  let state = readWindowState(path);
  let cancel: (() => void) | null = null;
  const write = (): void => {
    cancel = null;
    replaceFile(path, JSON.stringify(state));
  };
  return {
    update(role, patch) {
      const record = { ...(state.roles[role] ?? EMPTY_RECORD), ...patch };
      state = { v: 1, roles: { ...state.roles, [role]: record } };
      cancel?.();
      cancel = clock.schedule(write, delayMs);
    },
    flush() {
      if (cancel === null) return;
      cancel();
      write();
    },
  };
}

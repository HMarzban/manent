// Pure helpers for daily writing goals (word counting, local-day boundaries, stored goal parsing) and sprint formatting.
import { scriptBody } from "@manent/crdt";
import type { CrdtDoc } from "@manent/crdt";
import { blockText, blocksOf } from "@manent/schema";

export type GoalKind = "pages" | "words";

export interface ScriptGoal {
  readonly kind: GoalKind;
  readonly target: number;
  readonly setAt: number;
  readonly day: string | null;
  readonly baseline: number | null;
}

const WORD_BLOCK_TYPES = new Set(["dialogue", "action", "parenthetical"]);
const WHITESPACE = /\s+/;
const LEADING_MINUTES = /^(\d+)/;

/** Counts words across dialogue, action, and parenthetical blocks only. */
export function countScriptWords(
  blocks: readonly { readonly type: string; readonly text: string }[],
): number {
  let words = 0;
  for (const block of blocks) {
    if (!WORD_BLOCK_TYPES.has(block.type)) continue;
    const trimmed = block.text.trim();
    if (trimmed === "") continue;
    words += trimmed.split(WHITESPACE).length;
  }
  return words;
}

/** Counts words in a CRDT script document across dialogue, action, and parenthetical blocks. */
export function countDocWords(doc: CrdtDoc): number {
  return countScriptWords(
    blocksOf(scriptBody(doc).materialize()).map((block) => ({
      type: block.attrs.type,
      text: blockText(block),
    })),
  );
}

/** Local calendar day `YYYY-MM-DD` for `atMs`. */
export function localDayKey(atMs: number): string {
  const date = new Date(atMs);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Milliseconds from `atMs` until the next local midnight (minimum 1,000 ms). */
export function msUntilNextLocalMidnight(atMs: number): number {
  const date = new Date(atMs);
  const next = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate() + 1,
    0,
    0,
    0,
    0,
  );
  return Math.max(1000, next.getTime() - atMs);
}

/** Parses a stored private-index `goals` entry; returns null when missing or malformed. */
export function parseScriptGoal(value: unknown): ScriptGoal | null {
  if (typeof value !== "object" || value === null) return null;
  const raw = value as Record<string, unknown>;
  const kind = raw.kind;
  const target = raw.target;
  const setAt = raw.setAt;
  if (kind !== "pages" && kind !== "words") return null;
  if (typeof target !== "number" || !Number.isInteger(target) || target < 1)
    return null;
  if (typeof setAt !== "number" || !Number.isFinite(setAt)) return null;
  const day = typeof raw.day === "string" && raw.day !== "" ? raw.day : null;
  const baseline =
    typeof raw.baseline === "number" &&
    Number.isFinite(raw.baseline) &&
    raw.baseline >= 0
      ? Math.floor(raw.baseline)
      : null;
  return { kind, target, setAt, day, baseline };
}

/** Daily progress added today: non-negative difference from today's baseline (0 when day changed). */
export function dailyGoalDone(
  goal: ScriptGoal,
  currentCount: number,
  today: string,
): number {
  if (goal.day !== today || goal.baseline === null) return 0;
  return Math.max(0, currentCount - goal.baseline);
}

/** Formats non-negative seconds as `m:ss` (e.g. `25:00`, `12:40`, `0:00`). */
export function formatMmSs(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

/** Parses a sprint prompt choice ("25 minutes" or "25") into positive minutes; null if invalid. */
export function parseSprintMinutes(input: string): number | null {
  const match = LEADING_MINUTES.exec(input.trim());
  if (match === null) return null;
  const minutes = Number(match[1]);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 240) return null;
  return minutes;
}

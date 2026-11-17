// Timing marks that ship in the product build and stay off until a flag turns
// them on. Records live in a fixed ring buffer, so a long session stays flat.

export const MARK_BUFFER_SIZE = 10_000;

/** Times in milliseconds, from `performance.now()`. */
export interface MarkRecord {
  name: string;
  start: number;
  duration: number;
}

let enabled = false;
const buffer: MarkRecord[] = [];
/** Where the next record goes once the buffer is full. */
let next = 0;

function record(name: string, start: number): void {
  const entry = { name, start, duration: performance.now() - start };
  if (buffer.length < MARK_BUFFER_SIZE) {
    buffer.push(entry);
    return;
  }
  buffer[next] = entry;
  next = (next + 1) % MARK_BUFFER_SIZE;
}

/** Off by default. */
export function setMarksEnabled(value: boolean): void {
  enabled = value;
}

export function marksEnabled(): boolean {
  return enabled;
}

/** Always runs `fn`; records its duration only when marks are enabled, even when it throws. */
export function mark<T>(name: string, fn: () => T): T {
  if (!enabled) return fn();
  const start = performance.now();
  try {
    return fn();
  } finally {
    record(name, start);
  }
}

/** A token for `markEnd`: the start time, or -1 when marks are disabled. */
export function markStart(_name: string): number {
  return enabled ? performance.now() : -1;
}

/** Records the time since `markStart`; a no-op for -1 or while disabled. */
export function markEnd(name: string, token: number): void {
  if (token === -1 || !enabled) return;
  record(name, token);
}

/** The kept records, oldest first, optionally only those with `name`. */
export function readMarks(name?: string): MarkRecord[] {
  const ordered = [...buffer.slice(next), ...buffer.slice(0, next)].map(
    (entry) => ({ ...entry }),
  );
  return name === undefined
    ? ordered
    : ordered.filter((entry) => entry.name === name);
}

export function clearMarks(): void {
  buffer.length = 0;
  next = 0;
}

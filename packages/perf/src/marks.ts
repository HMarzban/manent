// Timing marks that ship in the product build and stay off until a flag turns
// them on. Records live in a fixed ring buffer, so a long session stays flat.

export const MARK_BUFFER_SIZE = 10_000;

export interface MarkRecord {
  name: string;
  /** Milliseconds on the marks' clock. */
  startMs: number;
  durationMs: number;
}

export interface Marks {
  /** Off until switched on. */
  setEnabled(value: boolean): void;
  enabled(): boolean;
  /** Always runs `fn`; records its duration only while enabled, even when it throws. */
  mark<T>(name: string, fn: () => T): T;
  /** A token for `end`: the start time, or -1 while disabled. */
  start(): number;
  /** Records the time since `start`; a no-op for -1 or while disabled. */
  end(name: string, token: number): void;
  /** The kept records, oldest first, optionally only those with `name`. */
  read(name?: string): MarkRecord[];
  clear(): void;
}

/** Marks that keep the newest `size` records, timed by `now` in milliseconds. */
export function createMarks(options: {
  size: number;
  now: () => number;
}): Marks {
  const { size, now } = options;
  let on = false;
  const buffer: MarkRecord[] = [];
  /** Where the next record goes once the buffer is full. */
  let next = 0;

  const record = (name: string, startMs: number): void => {
    const entry = { name, startMs, durationMs: now() - startMs };
    if (buffer.length < size) {
      buffer.push(entry);
      return;
    }
    buffer[next] = entry;
    next = (next + 1) % size;
  };

  return {
    setEnabled(value) {
      on = value;
    },
    enabled() {
      return on;
    },
    mark(name, fn) {
      if (!on) return fn();
      const startMs = now();
      try {
        return fn();
      } finally {
        record(name, startMs);
      }
    },
    start() {
      return on ? now() : -1;
    },
    end(name, token) {
      if (token === -1 || !on) return;
      record(name, token);
    },
    read(name) {
      const ordered = [...buffer.slice(next), ...buffer.slice(0, next)].map(
        (entry) => ({ ...entry }),
      );
      return name === undefined
        ? ordered
        : ordered.filter((entry) => entry.name === name);
    },
    clear() {
      buffer.length = 0;
      next = 0;
    },
  };
}

const product = createMarks({
  size: MARK_BUFFER_SIZE,
  now: () => performance.now(),
});

export function setMarksEnabled(value: boolean): void {
  product.setEnabled(value);
}

export function marksEnabled(): boolean {
  return product.enabled();
}

export function mark<T>(name: string, fn: () => T): T {
  return product.mark(name, fn);
}

export function markStart(): number {
  return product.start();
}

export function markEnd(name: string, token: number): void {
  product.end(name, token);
}

export function readMarks(name?: string): MarkRecord[] {
  return product.read(name);
}

export function clearMarks(): void {
  product.clear();
}

// Atomic prompter-file writer with byte diffing, EPERM/EACCES/EBUSY rename retries, and PrompterHandle adapter.
import {
  closeSync,
  fsyncSync,
  openSync,
  renameSync,
  statSync,
  unlinkSync,
  writeSync,
} from "node:fs";
import { basename, join } from "node:path";
import type { BlockJSON } from "@manent/schema";
import type { Clock, PrompterHandle } from "@manent/sync-client";
import type { PrompterFilesStatus, PrompterRow } from "@manent/sync-protocol";
import type { PrompterEncoding } from "./encoding.ts";
import { buildPrompterFiles } from "./format.ts";

const MAX_RENAME_RETRIES = 20;
const RENAME_RETRY_MS = 25;
const noop = (): void => {};
const RETRYABLE_CODES: ReadonlySet<string> = new Set([
  "EPERM",
  "EACCES",
  "EBUSY",
]);

export interface PrompterFeedSnapshot {
  readonly runOrder: readonly PrompterRow[];
  readonly stories: ReadonlyMap<string, readonly BlockJSON[]>;
}

/** Source of live rundown run-order and sent stories for the prompter files writer. */
export interface PrompterFeed {
  current(): PrompterFeedSnapshot | null;
  subscribe(listener: () => void): () => void;
}

export interface PrompterFilesWriterOptions {
  readonly rundownId?: string;
  readonly folder: string;
  readonly encoding: PrompterEncoding;
  readonly feed: PrompterFeed;
  readonly clock: Clock;
  onStatus(status: PrompterFilesStatus | null): void;
}

interface PendingRename {
  readonly tmpPath: string;
  cancel: () => void;
}

function errorCodeOf(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("code" in error))
    return null;
  const code: unknown = error.code;
  return typeof code === "string" ? code : null;
}

function bytesEqual(a: Uint8Array | undefined, b: Uint8Array): boolean {
  if (a === undefined || a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

function isSafeFileName(name: string): boolean {
  return (
    name.length > 0 &&
    basename(name) === name &&
    !name.includes("/") &&
    !name.includes("\\") &&
    name !== "." &&
    name !== ".."
  );
}

function isWritableDirectory(folder: string): boolean {
  if (folder === "" || folder.includes("\0")) return false;
  try {
    return statSync(folder).isDirectory();
  } catch {
    return false;
  }
}

function unlinkQuietly(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // missing or already removed temp/target file is safe to ignore
  }
}

function writeTempFile(tmpPath: string, bytes: Uint8Array): void {
  const fd = openSync(tmpPath, "w");
  try {
    let offset = 0;
    while (offset < bytes.byteLength) {
      offset += writeSync(fd, bytes, offset, bytes.byteLength - offset);
    }
    fsyncSync(fd);
  } finally {
    closeSync(fd);
  }
}

/**
 * Adapts a `PrompterHandle` into a `PrompterFeed`: while `status.get().feed !== "live"`
 * `current()` returns `null` so no files are touched, and on resume only changed files are written.
 */
export function feedFromPrompterHandle(handle: PrompterHandle): PrompterFeed {
  const snapshot = (): PrompterFeedSnapshot | null => {
    if (handle.status.get().feed !== "live") return null;
    return {
      runOrder: handle.runOrder.get(),
      stories: handle.stories.get(),
    };
  };
  return {
    current: snapshot,
    subscribe(listener) {
      let lastOrder: readonly PrompterRow[] | null = null;
      let lastStories: ReadonlyMap<string, readonly BlockJSON[]> | null = null;
      let wasLive = handle.status.get().feed === "live";

      const notifyIfLiveChanged = (): void => {
        const live = handle.status.get().feed === "live";
        if (!live) {
          wasLive = false;
          return;
        }
        const order = handle.runOrder.get();
        const stories = handle.stories.get();
        if (wasLive && order === lastOrder && stories === lastStories) return;
        wasLive = true;
        lastOrder = order;
        lastStories = stories;
        listener();
      };

      const offOrder = handle.runOrder.subscribe(notifyIfLiveChanged);
      const offStories = handle.stories.subscribe(notifyIfLiveChanged);
      const offStatus = handle.status.subscribe(notifyIfLiveChanged);
      return () => {
        offOrder();
        offStories();
        offStatus();
      };
    },
  };
}

/**
 * Writes `run-order.txt` and per-story `NN-<slug>.txt` files atomically into `folder`
 * whenever `feed` changes, deleting only story files this run previously wrote that left the run order.
 */
export function createPrompterFilesWriter(
  options: PrompterFilesWriterOptions,
  fsOps?: { readonly rename?: typeof renameSync },
): { stop(): void } {
  const { folder, encoding, feed, clock, onStatus } = options;
  const renameFile = fsOps?.rename ?? renameSync;
  const rundownId = options.rundownId ?? "";
  const lastWritten = new Map<string, Uint8Array>();
  const pendingRenames = new Map<string, PendingRename>();
  let cumulativeReplaced = 0;
  let stopped = false;
  let announcedStart = false;
  let unsubscribe: () => void = noop;

  const statusOf = (failure: "unwritable" | null): PrompterFilesStatus => ({
    rundownId,
    path: folder,
    encoding,
    replaced: cumulativeReplaced,
    failure,
  });

  const cancelPending = (name: string): void => {
    const existing = pendingRenames.get(name);
    if (existing === undefined) return;
    existing.cancel();
    unlinkQuietly(existing.tmpPath);
    pendingRenames.delete(name);
  };

  const cancelAllPending = (): void => {
    for (const name of pendingRenames.keys()) cancelPending(name);
  };

  const failUnwritable = (): void => {
    if (stopped) return;
    stopped = true;
    cancelAllPending();
    unsubscribe();
    onStatus(statusOf("unwritable"));
    onStatus(null);
  };

  const attemptRename = (
    name: string,
    tmpPath: string,
    targetPath: string,
    bytes: Uint8Array,
    replaced: number,
    attempt: number,
  ): void => {
    if (stopped) {
      unlinkQuietly(tmpPath);
      return;
    }
    try {
      renameFile(tmpPath, targetPath);
      pendingRenames.delete(name);
      lastWritten.set(name, bytes);
      cumulativeReplaced += replaced;
      if (attempt > 0) onStatus(statusOf(null));
      return;
    } catch (error) {
      const code = errorCodeOf(error);
      if (code !== null && RETRYABLE_CODES.has(code)) {
        if (attempt < MAX_RENAME_RETRIES) {
          const cancel = clock.schedule(() => {
            attemptRename(
              name,
              tmpPath,
              targetPath,
              bytes,
              replaced,
              attempt + 1,
            );
          }, RENAME_RETRY_MS);
          pendingRenames.set(name, { tmpPath, cancel });
          return;
        }
        pendingRenames.delete(name);
        unlinkQuietly(tmpPath);
        return;
      }
      pendingRenames.delete(name);
      unlinkQuietly(tmpPath);
      failUnwritable();
    }
  };

  const writeFileAtomic = (
    name: string,
    bytes: Uint8Array,
    replaced: number,
  ): void => {
    if (!isSafeFileName(name)) {
      failUnwritable();
      return;
    }
    cancelPending(name);
    const tmpPath = join(folder, `.${name}.manent-tmp`);
    const targetPath = join(folder, name);
    try {
      writeTempFile(tmpPath, bytes);
    } catch {
      unlinkQuietly(tmpPath);
      failUnwritable();
      return;
    }
    attemptRename(name, tmpPath, targetPath, bytes, replaced, 0);
  };

  const sync = (): void => {
    if (stopped) return;
    if (!isWritableDirectory(folder)) {
      failUnwritable();
      return;
    }
    const snapshot = feed.current();
    if (snapshot === null) return;
    const desired = buildPrompterFiles(
      snapshot.runOrder,
      snapshot.stories,
      encoding,
    );

    let touched = false;
    for (const [name, encoded] of desired) {
      if (stopped) return;
      if (bytesEqual(lastWritten.get(name), encoded.bytes)) continue;
      touched = true;
      writeFileAtomic(name, encoded.bytes, encoded.replaced);
    }
    if (stopped) return;

    for (const name of lastWritten.keys()) {
      if (desired.has(name)) continue;
      cancelPending(name);
      try {
        unlinkSync(join(folder, name));
      } catch (error) {
        if (errorCodeOf(error) !== "ENOENT") {
          failUnwritable();
          return;
        }
      }
      lastWritten.delete(name);
      touched = true;
    }

    if (!stopped && (touched || !announcedStart)) {
      announcedStart = true;
      onStatus(statusOf(null));
    }
  };

  if (!isWritableDirectory(folder)) {
    failUnwritable();
    return { stop: () => {} };
  }

  unsubscribe = feed.subscribe(sync);
  sync();
  if (!stopped && !announcedStart) {
    announcedStart = true;
    onStatus(statusOf(null));
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      cancelAllPending();
      unsubscribe();
      onStatus(null);
    },
  };
}

import { afterAll, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  OUTBOX_RETENTION_MS,
  OUTBOX_STOPPED_AT,
  StorageError,
  openSqliteStorage,
} from "../src/index.ts";
import type { Storage } from "../src/index.ts";
import { createMemoryStorage } from "../src/testing/index.ts";

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "manent-admin-stores-"));
  tempDirs.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
});

function exerciseApiKeys(
  storage: Storage,
  advance: (ms: number) => void,
): void {
  const hashA = new Uint8Array([1, 2, 3, 4]);
  const hashB = new Uint8Array([5, 6, 7, 8]);
  const createdA = storage.apiKeys.create({
    id: "key-a",
    workspaceId: "ws-1",
    name: "Automation",
    keyHash: hashA,
    createdByUserId: "priya",
  });
  // Mutating caller buffer must not alter stored hash
  hashA[0] = 99;
  expect(createdA).toEqual({
    id: "key-a",
    workspaceId: "ws-1",
    name: "Automation",
    keyHash: new Uint8Array([1, 2, 3, 4]),
    createdByUserId: "priya",
    createdAt: 1000,
    lastUsedAt: null,
    revokedAt: null,
  });

  // Duplicate hash is refused
  expect(() =>
    storage.apiKeys.create({
      id: "key-dup-hash",
      workspaceId: "ws-2",
      name: "Duplicate",
      keyHash: new Uint8Array([1, 2, 3, 4]),
      createdByUserId: "dana",
    }),
  ).toThrow(StorageError);

  advance(500);
  storage.apiKeys.create({
    id: "key-b",
    workspaceId: "ws-1",
    name: "Build bot",
    keyHash: hashB,
    createdByUserId: "priya",
  });

  // Byte-exact lookup and newest-first listing scoped by workspace
  expect(storage.apiKeys.findByHash(new Uint8Array([1, 2, 3, 4]))?.id).toBe(
    "key-a",
  );
  expect(storage.apiKeys.findByHash(new Uint8Array([1, 2, 3, 9]))).toBeNull();
  expect(storage.apiKeys.list("ws-1").map((row) => row.id)).toEqual([
    "key-b",
    "key-a",
  ]);
  expect(storage.apiKeys.list("ws-2")).toEqual([]);

  // Touch updates lastUsedAt
  advance(250);
  storage.apiKeys.touch("key-a");
  expect(
    storage.apiKeys.findByHash(new Uint8Array([1, 2, 3, 4]))?.lastUsedAt,
  ).toBe(1750);

  // Cross-workspace revoke is refused and leaves key active
  advance(250);
  expect(storage.apiKeys.revoke("ws-2", "key-a")).toBe(false);
  expect(
    storage.apiKeys.findByHash(new Uint8Array([1, 2, 3, 4]))?.revokedAt,
  ).toBeNull();

  // Workspace-scoped revoke succeeds once and is idempotent on repeat
  expect(storage.apiKeys.revoke("ws-1", "key-a")).toBe(true);
  expect(storage.apiKeys.revoke("ws-1", "key-a")).toBe(false);
  expect(
    storage.apiKeys.findByHash(new Uint8Array([1, 2, 3, 4]))?.revokedAt,
  ).toBe(2000);
}

function exerciseOutbox(storage: Storage, advance: (ms: number) => void): void {
  const first = storage.outbox.enqueue({
    workspaceId: "ws-1",
    adapter: "webhook",
    payload: '{"event":"draft_sent"}',
  });
  const second = storage.outbox.enqueue({
    workspaceId: "ws-1",
    adapter: "slack",
    payload: '{"event":"comment"}',
  });
  expect([first.id, second.id, first.attempts, first.deliveredAt]).toEqual([
    1,
    2,
    0,
    null,
  ]);
  expect(storage.outbox.due(1).map((row) => row.id)).toEqual([1]);
  expect(storage.outbox.due(Number.NaN)).toEqual([]);
  expect(storage.outbox.due(Number.POSITIVE_INFINITY)).toEqual([]);
  expect(storage.outbox.due(Number.NEGATIVE_INFINITY)).toEqual([]);

  // Retry defers first until 5000, so second is due first
  storage.outbox.retry(first.id, 5000);
  expect(storage.outbox.due(10).map((row) => row.id)).toEqual([2]);

  // Deliver second; pending keeps first with retrying state
  storage.outbox.delivered(second.id);
  expect(storage.outbox.pending("ws-1")).toEqual([
    { adapter: "webhook", attempts: 1, nextTryAt: 5000 },
  ]);

  // Advance to 5000 and give up; due never returns it again, pending shows stopped
  advance(5000);
  expect(storage.outbox.due(10).map((row) => row.id)).toEqual([1]);
  storage.outbox.giveUp(first.id);
  expect(storage.outbox.due(10)).toEqual([]);
  expect(storage.outbox.pending("ws-1")).toEqual([
    { adapter: "webhook", attempts: 2, nextTryAt: OUTBOX_STOPPED_AT },
  ]);

  // After 30 days, due() purges delivered rows cleanly without touching stopped rows
  advance(OUTBOX_RETENTION_MS);
  expect(storage.outbox.due(10)).toEqual([]);
  expect(storage.outbox.pending("ws-1")).toEqual([
    { adapter: "webhook", attempts: 2, nextTryAt: OUTBOX_STOPPED_AT },
  ]);
}

test("SQLite and memory API key and outbox stores enforce workspace isolation, retry/stop semantics and parity", () => {
  let sqliteNow = 1000;
  const sqlite = openSqliteStorage({
    dir: makeTempDir(),
    now: () => sqliteNow,
  });
  exerciseApiKeys(sqlite, (ms) => {
    sqliteNow += ms;
  });
  exerciseOutbox(sqlite, (ms) => {
    sqliteNow += ms;
  });
  sqlite.close();

  let memoryNow = 1000;
  const memory = createMemoryStorage({ now: () => memoryNow });
  exerciseApiKeys(memory, (ms) => {
    memoryNow += ms;
  });
  exerciseOutbox(memory, (ms) => {
    memoryNow += ms;
  });

  // Memory snapshot/restore and fault propagation
  const snap = memory.snapshot();
  memory.failNextCommit("disk_full");
  expect(() =>
    memory.apiKeys.create({
      id: "key-fail",
      workspaceId: "ws-1",
      name: "Fails",
      keyHash: new Uint8Array([9, 9]),
      createdByUserId: "priya",
    }),
  ).toThrow(StorageError);
  expect(memory.apiKeys.findByHash(new Uint8Array([9, 9]))).toBeNull();
  memory.apiKeys.create({
    id: "key-temp",
    workspaceId: "ws-1",
    name: "Temp",
    keyHash: new Uint8Array([9, 9]),
    createdByUserId: "priya",
  });
  memory.restore(snap);
  expect(memory.apiKeys.findByHash(new Uint8Array([9, 9]))).toBeNull();
  memory.close();
});

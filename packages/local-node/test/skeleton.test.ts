import { expect, test } from "bun:test";
import { applyBlockOps } from "@manent/crdt";
import { createSyncService } from "@manent/server-core";
import {
  MIGRATIONS,
  STORAGE_SCHEMA_VERSION,
  openSqliteStorage,
} from "@manent/storage";
import { createSyncClient } from "@manent/sync-client";
import { CONTROL_KINDS } from "@manent/sync-protocol";

test("what this plan builds on is present", () => {
  expect([...CONTROL_KINDS].slice(9)).toEqual([
    "upstream_status",
    "upstream_refused",
    "copies_kept",
  ]);
  expect([
    MIGRATIONS.control.length,
    MIGRATIONS.documents.length,
    MIGRATIONS.checkpoints.length,
  ]).toEqual([
    STORAGE_SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
    STORAGE_SCHEMA_VERSION,
  ]);
  expect(typeof createSyncService).toBe("function");
  expect(typeof createSyncClient).toBe("function");
  expect(typeof openSqliteStorage).toBe("function");
  expect(typeof applyBlockOps).toBe("function");
});

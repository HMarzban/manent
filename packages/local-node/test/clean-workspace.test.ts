import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DesktopGlobal } from "@manent/sync-protocol";
import {
  RECORDS_VERSION,
  bootScript,
  openSqliteRecords,
} from "../src/index.ts";
import { DOC, nodeWorld } from "./relay-world.ts";

const GLOBAL: DesktopGlobal = {
  v: 1,
  platform: "mac",
  version: "0.1.0",
  channel: "canary",
  dataDir: "/Users/sam/Library/Application Support/Manent",
};

const deterministicBytes = (length: number): Uint8Array =>
  Uint8Array.from({ length }, (_, index) => (index + 1) & 0xff);

test("openSqliteRecords migrates v1 records.sqlite to v2 and persists demoDismissed across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "manent-records-v2-"));
  const path = join(dir, "records.sqlite");
  try {
    // Seed a version-1 records.sqlite without cloud.demo_dismissed
    const v1 = new Database(path, { create: true, strict: true });
    v1.run(
      "CREATE TABLE secret (id INTEGER PRIMARY KEY CHECK (id = 1), key BLOB NOT NULL) STRICT",
    );
    v1.run(
      "CREATE TABLE people (user_id TEXT PRIMARY KEY, name TEXT NOT NULL, wants_cloud INTEGER NOT NULL, cloud_token TEXT, chosen_at INTEGER NOT NULL) STRICT",
    );
    v1.run(
      "CREATE TABLE current_person (id INTEGER PRIMARY KEY CHECK (id = 1), user_id TEXT NOT NULL, node_token TEXT NOT NULL) STRICT",
    );
    v1.run(
      "CREATE TABLE docs (doc_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, state TEXT NOT NULL, generation INTEGER NOT NULL, changed_at INTEGER NOT NULL) STRICT",
    );
    v1.run(
      "CREATE TABLE handoffs (doc_id TEXT PRIMARY KEY, key TEXT NOT NULL, kind TEXT NOT NULL, home TEXT NOT NULL, workspace_id TEXT, snapshot BLOB NOT NULL, started_at INTEGER NOT NULL, refused TEXT) STRICT",
    );
    v1.run(
      "CREATE TABLE cloud (id INTEGER PRIMARY KEY CHECK (id = 1), seed_id TEXT) STRICT",
    );
    v1.run(
      "CREATE TABLE recovered (doc_id TEXT NOT NULL, n INTEGER NOT NULL, user_id TEXT NOT NULL, cause TEXT NOT NULL, block_id TEXT, near_block_id TEXT, text TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (doc_id, n)) STRICT",
    );
    v1.run(
      "CREATE TABLE workspaces (doc_id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL) STRICT",
    );
    v1.run("INSERT INTO cloud (id, seed_id) VALUES (1, 'seed-1')");
    v1.run("PRAGMA user_version = 1");
    v1.close();

    expect(RECORDS_VERSION).toBe(2);
    const first = openSqliteRecords(path, () => 1_000, deterministicBytes);
    expect(first.seedId()).toBe("seed-1");
    expect(first.demoDismissed()).toBe(false);
    first.setDemoDismissed(true);
    expect(first.demoDismissed()).toBe(true);
    first.close();

    const reopened = openSqliteRecords(path, () => 2_000, deterministicBytes);
    expect(reopened.demoDismissed()).toBe(true);
    expect(reopened.seedId()).toBe("seed-1");
    reopened.setDemoDismissed(false);
    expect(reopened.demoDismissed()).toBe(false);
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

const makeMemoryStore = (map: Map<string, string>) => ({
  getItem: (key: string) => map.get(key) ?? null,
  setItem: (key: string, value: string) => void map.set(key, value),
});

function runBootScript(demoDismissed?: boolean): Map<string, string> {
  const local = new Map<string, string>();
  const session = new Map<string, string>();
  const src = bootScript({
    global: GLOBAL,
    boot: [],
    session: null,
    demoDismissed,
  });
  new Function("window", src)({
    sessionStorage: makeMemoryStore(session),
    localStorage: makeMemoryStore(local),
  });
  return local;
}

test("bootScript injects manent.workspace.clean into localStorage only when demoDismissed is true", () => {
  expect(
    runBootScript(undefined).get("manent.workspace.clean"),
  ).toBeUndefined();
  expect(runBootScript(false).get("manent.workspace.clean")).toBeUndefined();
  expect(runBootScript(true).get("manent.workspace.clean")).toBe("1");
});

test("POST /api/local/demo-mode gates /api/demo, validates input, and shields You's local scripts from cloud demo reseeds", async () => {
  const w = nodeWorld();
  w.records.setSeedId("seed-1");

  // Demo route initially responds 200
  const before = await w.request("GET", "/api/demo");
  expect(before.status).toBe(200);

  // Invalid payload rejected
  const bad = await w.request("POST", "/api/local/demo-mode", {
    body: { dismissed: "yes" },
  });
  expect(bad.status).toBe(400);

  // Choose You and write a local script
  await w.chooses("you");
  await w.open("you", DOC, true);
  w.windowTypes("you", DOC, "my private opening scene");
  await w.settle();

  // Dismiss Demo mode via local route
  const dismissed = await w.request("POST", "/api/local/demo-mode", {
    body: { dismissed: true },
  });
  expect(dismissed.status).toBe(204);
  expect(w.records.demoDismissed()).toBe(true);
  expect(w.records.seedId()).toBeNull();

  // /api/demo now returns 404
  const hidden = await w.request("GET", "/api/demo");
  expect(hidden.status).toBe(404);

  // A cloud seed change + reconnect never wipes You's local document
  w.cloud.seedId = "seed-2";
  await w.settle();
  expect(w.nodeText(DOC)).toEqual(["my private opening scene"]);

  // Restoring demo mode brings /api/demo back to 200 without losing You's script
  const restored = await w.request("POST", "/api/local/demo-mode", {
    body: { dismissed: false },
  });
  expect(restored.status).toBe(204);
  expect((await w.request("GET", "/api/demo")).status).toBe(200);
  expect(w.nodeText(DOC)).toEqual(["my private opening scene"]);
});

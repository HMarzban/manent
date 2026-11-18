import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(import.meta.dir, "..", "..");

interface Manifest {
  exports?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
}

interface BudgetRow {
  scenario: string;
  metric: string;
  stat: string;
  budget: number;
  hardFail: number;
}

const manifest = (dir: string): Manifest =>
  JSON.parse(readFileSync(join(repoRoot, dir, "package.json"), "utf8"));
const rootManifest = manifest(".");
const readJson = (path: string): Promise<{ budgets: BudgetRow[] }> =>
  Bun.file(path).json();

// values only: a type has no name at run time
const ASSUMED: Record<string, readonly string[]> = {
  "@manent/schema": [
    "canonicalDoc",
    "canonicalBlock",
    "blocksOf",
    "blockText",
    "validateBlocks",
    "rejects",
    "sectionize",
    "SCHEMA_VERSION",
  ],
  "@manent/sync-protocol": [
    "createMessageIds",
    "createFrameEncoder",
    "prepareMessage",
    "createFrameDecoder",
    "encodeMessage",
    "DOC_ROLES",
    "CAPABILITIES",
    "CODE",
    "FRAME",
    "isPermanentPushError",
    "gateConnection",
    "gateDocument",
    "HTTP_ERROR_CODES",
  ],
  "@manent/crdt": [
    "createDoc",
    "loadDoc",
    "scriptDocFromJSON",
    "scriptBody",
    "mergeUpdates",
    "updateMeta",
    "CrdtUpdateError",
    "ORIGIN_REMOTE",
    "ORIGIN_LOAD",
  ],
  "@manent/server-core": ["createServer"],
  "@manent/demo": [
    "createDemoSignIn",
    "createDemoDirectory",
    "DEMO_PEOPLE",
    "createRng",
  ],
  "@manent/testkit": ["createTempTrees"],
};

const SERVER_ROWS = [
  ["server.fanout", "fanout_ms", "p99", 50, 200],
  ["server.fanout", "event_loop_lag_ms", "p99", 20, 100],
  ["server.join-storm", "last_synced_ms", "p99", 3000, 10000],
  ["server.room-memory", "rooms_after_idle", "p99", 0, 0],
  ["server.room-memory", "loaded_room_bytes", "p99", 20000000, 60000000],
  [
    "server.persistence",
    "growth_bytes_per_typist_hour",
    "p99",
    1000000,
    2000000,
  ],
  ["server.persistence", "checkpoint_stall_ms", "p99", 0, 20],
  ["server.push-cost", "push_ms_120", "p95", 2, 20],
  ["server.push-cost", "push_ms_2000", "p95", 2, 20],
  ["server.durability", "acked_lost", "p99", 0, 0],
  ["server.soak", "memory_growth_percent", "p99", 10, 30],
  ["server.soak", "diverged", "max", 0, 0],
];

const LAYOUT = [
  "packages/storage/src/index.ts",
  "packages/storage/src/checksum.ts",
  "packages/storage/src/home.ts",
  "packages/storage/src/ports.ts",
  "packages/storage/src/sqlite/index.ts",
  "packages/storage/src/sqlite/checkpoints.ts",
  "packages/storage/src/sqlite/directory.ts",
  "packages/storage/src/sqlite/doc-file.ts",
  "packages/storage/src/sqlite/files.ts",
  "packages/storage/src/sqlite/migrations.ts",
  "packages/storage/src/sqlite/storage.ts",
  "packages/storage/src/testing/index.ts",
  "packages/storage/src/testing/contract.ts",
  "packages/storage/src/testing/memory.ts",
  "packages/crdt/src/awareness.ts",
  "packages/crdt/src/inspect.ts",
  "packages/crdt/src/set-aside.ts",
  "packages/crdt/src/settings.ts",
  "packages/crdt/src/vectors.ts",
  "packages/sync-client/src/index.ts",
  "packages/sync-client/src/client/index.ts",
  "packages/sync-client/src/client/client.ts",
  "packages/sync-client/src/client/follower.ts",
  "packages/sync-client/src/coalescer/index.ts",
  "packages/sync-client/src/coalescer/coalescer.ts",
  "packages/sync-client/src/link/index.ts",
  "packages/sync-client/src/link/backoff.ts",
  "packages/sync-client/src/link/gate.ts",
  "packages/sync-client/src/link/machine.ts",
  "packages/sync-client/src/memory-store/index.ts",
  "packages/sync-client/src/memory-store/memory-store.ts",
  "packages/sync-client/src/outbox/index.ts",
  "packages/sync-client/src/outbox/plan.ts",
  "packages/sync-client/src/outbox/status.ts",
  "packages/sync-client/src/outbox/subscribable.ts",
  "packages/sync-client/src/ports/index.ts",
  "packages/sync-client/src/ports/defaults.ts",
  "packages/sync-client/src/ports/ports.ts",
  "packages/sync-client/src/recovery/index.ts",
  "packages/sync-client/src/recovery/recover.ts",
  "packages/sync-client/src/recovery/versions.ts",
  "packages/sync-client/src/session/index.ts",
  "packages/sync-client/src/session/handshake.ts",
  "packages/sync-client/src/session/session.ts",
  "packages/sync-client/src/session/settings.ts",
  "packages/sync-client/src/tabs/index.ts",
  "packages/sync-client/src/tabs/messages.ts",
  "packages/sync-client/src/tabs/solo.ts",
  "packages/sync-client/src/view/index.ts",
  "packages/sync-client/src/view/view.ts",
  "packages/sync-client/src/testing/index.ts",
  "packages/sync-client/src/testing/fake-clock.ts",
  "packages/sync-client/src/testing/faulty-store.ts",
  "packages/sync-client/src/testing/memory-network.ts",
  "packages/sync-client/src/testing/memory-tabs.ts",
  "packages/sync-client/src/testing/store-contract.ts",
  "packages/client-web/src/index.ts",
  "packages/client-web/src/browser.ts",
  "packages/client-web/src/idb-store.ts",
  "packages/client-web/src/leader.ts",
  "packages/client-web/src/lease.ts",
  "packages/client-web/src/seed.ts",
  "packages/client-web/src/transport.ts",
  "packages/server-core/src/limits/index.ts",
  "packages/server-core/src/limits/bucket.ts",
  "packages/server-core/src/limits/caps.ts",
  "packages/server-core/src/view/index.ts",
  "packages/server-core/src/view/view.ts",
  "packages/server-core/src/sync/index.ts",
  "packages/server-core/src/sync/access.ts",
  "packages/server-core/src/sync/awareness.ts",
  "packages/server-core/src/sync/checkpointer.ts",
  "packages/server-core/src/sync/errors.ts",
  "packages/server-core/src/sync/heal.ts",
  "packages/server-core/src/sync/peer.ts",
  "packages/server-core/src/sync/ports.ts",
  "packages/server-core/src/sync/rooms.ts",
  "packages/server-core/src/sync/service.ts",
  "packages/server-core/src/sync/settings.ts",
  "packages/server-core/src/sync/validate.ts",
  "packages/server-core/src/sync/viewers.ts",
  "packages/server-core/src/sync/write-path.ts",
  "packages/server-core/src/http/routes/docs.ts",
  "packages/server-core/src/testing/sync-fakes.ts",
  "packages/sync-protocol/src/doc-id.ts",
  "packages/testkit/src/sync/index.ts",
  "packages/testkit/src/sync/bot.ts",
  "packages/testkit/src/sync/ledger.ts",
  "packages/testkit/src/sync/test-server.ts",
  "packages/testkit/src/sync/sim/index.ts",
  "packages/testkit/src/sync/sim/network.ts",
  "packages/testkit/src/sync/sim/world.ts",
];

test("every name the sync work builds on is there", async () => {
  for (const [pkg, names] of Object.entries(ASSUMED))
    for (const name of names)
      expect({ pkg, name, found: name in (await import(pkg)) }).toEqual({
        pkg,
        name,
        found: true,
      });
  for (const pkg of [
    "packages/storage",
    "packages/sync-client",
    "packages/server-core",
  ])
    expect(manifest(pkg).exports).toEqual({
      ".": "./src/index.ts",
      "./testing": "./src/testing/index.ts",
    });
  expect(
    Object.keys(manifest("packages/client-web").devDependencies!),
  ).toContain("fake-indexeddb");
  expect(rootManifest.scripts!["test:durability"]).toBe(
    "MANENT_KILLS=200 bun test ./packages/testkit/test/kill-recover.test.ts",
  );
});

test("the server's budget rows are the agreed ones", async () => {
  const rows = (
    await readJson(join(repoRoot, "bench/budgets.json"))
  ).budgets.filter((b) => b.scenario.startsWith("server."));
  expect(
    rows.map((b) => [b.scenario, b.metric, b.stat, b.budget, b.hardFail]),
  ).toEqual(SERVER_ROWS);
});

test("every module of the layout exists and every entry imports cleanly", async () => {
  for (const file of LAYOUT)
    expect({
      file,
      exists: await Bun.file(join(repoRoot, file)).exists(),
    }).toEqual({ file, exists: true });
  for (const entry of [
    "@manent/storage",
    "@manent/storage/testing",
    "@manent/sync-client",
    "@manent/sync-client/testing",
    "@manent/client-web",
    "@manent/server-core",
    "@manent/server-core/testing",
    "@manent/crdt",
    "@manent/testkit",
  ])
    await import(entry);
});

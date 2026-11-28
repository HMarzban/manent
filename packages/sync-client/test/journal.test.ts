import { expect, test } from "bun:test";
import { LOCAL_CHECKPOINT_EVERY } from "../src/ports/defaults.ts";
import type {
  LoadedDocument,
  LocalStore,
  StoredEntry,
  StoredSetting,
  StoredUpdate,
} from "../src/ports/ports.ts";
import { freshMeta } from "../src/session/journal-meta.ts";
import { createJournal } from "../src/session/journal.ts";
import { createMemoryStore } from "../src/testing/index.ts";

const DOC = "0190f1a0-0000-7000-8000-000000000010";
const LARGE = 700_000;
const EMPTY = new Uint8Array();

function settingEntry(localSeq: number, acked = false): StoredSetting {
  return { kind: "set", localSeq, key: "script.paper", value: '"a4"', acked };
}

function serverUpdate(localSeq: number, applied: boolean): StoredUpdate {
  return {
    kind: "update",
    localSeq,
    update: EMPTY,
    own: false,
    acked: true,
    applied,
    elements: [],
  };
}

function makeJournal(
  entries: StoredEntry[],
  options: {
    store?: LocalStore;
    checkpointThrough?: number;
    append?: (entry: StoredEntry) => Promise<void>;
  } = {},
) {
  const store = options.store ?? createMemoryStore("user-1");
  const loaded: LoadedDocument = {
    meta: freshMeta(DOC, null),
    checkpoint:
      options.checkpointThrough === undefined
        ? null
        : {
            state: EMPTY,
            throughLocalSeq: options.checkpointThrough,
          },
    syncedBase: null,
    entries,
  };
  return createJournal({
    docId: DOC,
    store,
    loaded,
    create: null,
    stored() {},
    changed() {},
    sendable() {},
    lostLead() {},
    checkpoint: () => ({ state: EMPTY, synced: false }),
    append: options.append ?? (() => Promise.resolve()),
  });
}

test("journal constructor scales past spread argument limits for loaded entries", () => {
  const entries: StoredEntry[] = [];
  for (let seq = 1; seq <= LARGE; seq++) entries.push(serverUpdate(seq, true));

  const below = makeJournal(entries, { checkpointThrough: 50 });
  expect(below.appendServer(EMPTY, true)).toBe(LARGE + 1);

  const above = makeJournal(entries, { checkpointThrough: LARGE + 500 });
  expect(above.appendServer(EMPTY, true)).toBe(LARGE + 501);
});

test("journal healSeq scales past spread argument limits for waiting settings", () => {
  const entries: StoredEntry[] = [];
  for (let seq = 10; seq < 10 + LARGE; seq++)
    entries.push(settingEntry(seq, false));

  const journal = makeJournal(entries);
  expect(journal.healSeq()).toBe(9);
});

test("journal healSeq and outbox scale past spread argument limits for unsettled writes and preserve Infinity when empty", () => {
  const ready = makeJournal([settingEntry(1, false), settingEntry(2, false)]);
  expect(ready.outbox(0)).toEqual([
    { kind: "set", clientSeq: 1, key: "script.paper", value: '"a4"' },
    { kind: "set", clientSeq: 2, key: "script.paper", value: '"a4"' },
  ]);
  expect(ready.healSeq()).toBe(0);

  const never = new Promise<void>(() => {});
  const quietStore = createMemoryStore("user-1");
  quietStore.checkpoint = () => Promise.resolve();
  const large = makeJournal([settingEntry(1, false), settingEntry(2, false)], {
    store: quietStore,
    append: () => never,
  });
  for (let i = 0; i < LARGE; i++) large.appendSetting("script.paper", '"a4"');
  expect(large.unsavedWrites()).toBe(LARGE);
  expect(large.healSeq()).toBe(0);
  expect(large.outbox(0).map((item) => item.clientSeq)).toEqual([1, 2]);
}, 30_000);

test("journal checkpoint calculation scales past spread argument limits for unapplied server updates", () => {
  const entries: StoredEntry[] = [];
  for (let seq = 20; seq < 20 + LARGE; seq++)
    entries.push(serverUpdate(seq, false));
  const checkpoints: number[] = [];
  const store = createMemoryStore("user-1");
  store.checkpoint = async (_docId, _state, throughLocalSeq) => {
    checkpoints.push(throughLocalSeq);
  };
  const journal = makeJournal(entries, { store });
  for (let i = 0; i < LOCAL_CHECKPOINT_EVERY; i++)
    journal.appendServer(EMPTY, true);
  expect(checkpoints).toEqual([19]);
});

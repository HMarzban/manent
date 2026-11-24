import { afterEach, beforeEach, expect, test } from "bun:test";
import { createDoc } from "@manent/crdt";
import { SCHEMA_VERSION } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { DeviceVersion, DocStatus } from "@manent/sync-client";
import type {
  VersionContent,
  VersionItem,
  VersionListResponse,
} from "@manent/sync-protocol";
import type { HistoryState } from "../src/state/history.store.ts";
import { defaultBaseline } from "../src/history/baseline.ts";
import { historyFacts } from "../src/history/facts.ts";
import { readLastOpened, writeLastOpened } from "../src/history/last-opened.ts";
import { createHistorySource, createUploader } from "../src/history/source.ts";
import type { HistoryRow } from "../src/history/source.ts";
import { nextDraftName } from "../src/screens/document/draft-name.tsx";
import { SYNCED_STATUS, fakeHandle, turn, until } from "./sync.fixtures.ts";
import type { FakeHandle } from "./sync.fixtures.ts";

const DOC = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
const NOW = new Date(2026, 10, 17, 15, 0).getTime();
const TODAY_14_10 = new Date(2026, 10, 17, 14, 10).getTime();
const TODAY_09_02 = new Date(2026, 10, 17, 9, 2).getTime();
const YESTERDAY_17_40 = new Date(2026, 10, 16, 17, 40).getTime();

const BLOCK: BlockJSON = {
  type: "block",
  attrs: { id: "blk00001", type: "action" },
  content: [{ type: "text", text: "The ferry leaves at nine." }],
};
const DOC_JSON: DocJSON = {
  type: "doc",
  content: [{ type: "section", content: [BLOCK] }],
};

const CONTENT: VersionContent = {
  v: 1,
  blocks: [BLOCK],
  settings: { "script.format": "screenplay" },
  schemaVersion: 1,
  engineVersion: 1,
  locks: null,
  authors: {},
};

/** The content of a version whose one block holds `size` characters. */
const sized = (size: number): VersionContent => ({
  ...CONTENT,
  blocks: [{ ...BLOCK, content: [{ type: "text", text: "x".repeat(size) }] }],
});

function item(
  id: string,
  createdAt: number,
  more: Partial<VersionItem> = {},
): VersionItem {
  return {
    id,
    kind: "auto",
    name: null,
    createdByUserId: "dana",
    createdAt,
    onDevice: false,
    position: { generation: 1, seq: 10 },
    engineVersion: 1,
    summary: { authorUserIds: ["dana"], changes: 3, scenes: 1 },
    ...more,
  };
}

function deviceVersion(
  id: string,
  createdAt: number,
  more: Partial<DeviceVersion> = {},
): DeviceVersion {
  return {
    id,
    docId: DOC,
    kind: "device",
    label: "session_end",
    name: null,
    createdAt,
    content: DOC_JSON,
    uploaded: false,
    ...more,
  };
}

function list(
  versions: VersionItem[],
  more: Partial<VersionListResponse> = {},
): VersionListResponse {
  return {
    versions,
    next: null,
    head: { generation: 1, seq: 42 },
    othersCanOpen: true,
    ...more,
  };
}

interface Call {
  method: string;
  path: string;
  body: unknown;
  authorization: string | null;
}

type Answer = (call: Call) => Promise<Response> | Response;

const json = (value: unknown, status = 200): Response =>
  new Response(JSON.stringify(value), { status });

function fakeFetch(answer: Answer): { fetch: typeof fetch; calls: Call[] } {
  const calls: Call[] = [];
  const fake = async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      method: init?.method ?? "GET",
      path: String(input),
      body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
      authorization: headers.get("Authorization"),
    };
    calls.push(call);
    return answer(call);
  };
  return {
    fetch: Object.assign(fake, { preconnect: fetch.preconnect }),
    calls,
  };
}

function deferred<T>(): { promise: Promise<T>; resolve(value: T): void } {
  const kept: { resolve?: (value: T) => void } = {};
  const promise = new Promise<T>((resolve) => {
    kept.resolve = resolve;
  });
  return { promise, resolve: (value) => kept.resolve?.(value) };
}

function sourceOver(handle: FakeHandle, answer: Answer) {
  const { fetch, calls } = fakeFetch(answer);
  let keys = 0;
  const source = createHistorySource({
    fetch,
    token: () => "tok",
    open: async () => handle,
    userId: "sam",
    now: () => NOW,
    ids: () => (++keys).toString(16).padStart(32, "0"),
  });
  return { source, calls };
}

function handleWith(
  versions: DeviceVersion[] = [],
  status: Partial<DocStatus> = {},
): FakeHandle {
  const handle = fakeHandle(DOC, createDoc());
  handle.status.set({ ...SYNCED_STATUS, ...status });
  return Object.assign(handle, { deviceVersions: async () => versions });
}

/** The rows of `DOC` as the source holds them once `ready` says so; the subscription is kept. */
async function rowsWhen(
  source: ReturnType<typeof sourceOver>["source"],
  ready: (kind: string) => boolean,
) {
  const rows = source.rows(DOC);
  rows.subscribe(() => {});
  await until(() => ready(rows.get().state.kind));
  return rows;
}

const row = (
  version: VersionItem,
  title: string,
  day: string,
  time: string,
  local: DeviceVersion | null = null,
): HistoryRow => ({ item: version, title, day, time, local });

const storage = new Map<string, string>();
const fakeStorage = {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => void storage.set(key, value),
  removeItem: (key: string) => void storage.delete(key),
};

beforeEach(() => {
  storage.clear();
  Reflect.set(globalThis, "localStorage", fakeStorage);
});

afterEach(() => {
  Reflect.deleteProperty(globalThis, "localStorage");
});

test("rows are grouped by day with today and yesterday, device rows first while the list loads", async () => {
  const onDevice = deviceVersion("d1", TODAY_14_10);
  const answer = deferred<Response>();
  const { source, calls } = sourceOver(
    handleWith([onDevice]),
    () => answer.promise,
  );
  const rows = await rowsWhen(source, () => calls.length > 0);
  await turn();
  const deviceItem: VersionItem = {
    id: "d1",
    kind: "device",
    name: null,
    createdByUserId: "sam",
    createdAt: TODAY_14_10,
    onDevice: true,
    position: null,
    engineVersion: null,
    summary: null,
  };
  expect(rows.get()).toEqual({
    rows: [row(deviceItem, "Tue 14:10", "Today", "14:10", onDevice)],
    state: { kind: "loading", sinceMs: NOW },
    othersCanOpen: null,
  });
  expect(calls).toEqual([
    {
      method: "GET",
      path: `/api/versions?docId=${DOC}`,
      body: null,
      authorization: "Bearer tok",
    },
  ]);

  const morning = item("v2", TODAY_09_02);
  const draft = item("v1", YESTERDAY_17_40, {
    kind: "named",
    name: "Studio draft",
  });
  answer.resolve(json(list([morning, draft])));
  await until(() => rows.get().state.kind === "ready");
  expect(rows.get()).toEqual({
    rows: [
      row(deviceItem, "Tue 14:10", "Today", "14:10", onDevice),
      row(morning, "Tue 09:02", "Today", "09:02"),
      row(draft, "Studio draft", "Yesterday", "17:40"),
    ],
    state: { kind: "ready" },
    othersCanOpen: true,
  });
});

test("a version opened once is not fetched again, and the cache keeps eight versions and at most 64 MB", async () => {
  const big = 40_000_000;
  const { source, calls } = sourceOver(handleWith(), (call) => {
    const id = new URL(call.path, "http://x").searchParams.get("versionId");
    const content = id?.startsWith("big") === true ? sized(big) : CONTENT;
    return json({ content, position: null });
  });
  const open = (versionId: string) =>
    source.content(DOC, { versionId }).then((content) => content?.v);
  const fetched = () => calls.length;

  expect(await open("v1")).toBe(1);
  expect(await open("v1")).toBe(1);
  expect(fetched()).toBe(1);
  for (const id of ["v2", "v3", "v4", "v5", "v6", "v7", "v8"]) await open(id);
  expect(fetched()).toBe(8);
  // v1 is used again, so v2 is now the oldest used and a ninth evicts it
  await open("v1");
  await open("v9");
  expect(fetched()).toBe(9);
  await open("v1");
  await open("v3");
  expect(fetched()).toBe(9);
  await open("v2");
  expect(fetched()).toBe(10);

  await open("big1");
  await open("big2");
  expect(fetched()).toBe(12);
  await open("big2");
  expect(fetched()).toBe(12);
  await open("big1");
  expect(fetched()).toBe(13);
});

test("offline, the device's versions and those already opened are what History holds", async () => {
  const onDevice = deviceVersion("d1", TODAY_14_10, { uploaded: true });
  const opened = item("v2", TODAY_09_02);
  const unopened = item("v1", YESTERDAY_17_40);
  const handle = handleWith([onDevice]);
  const { source } = sourceOver(handle, (call) =>
    call.path.startsWith("/api/versions/content")
      ? json({ content: CONTENT, position: null })
      : json(list([opened, unopened])),
  );
  const rows = await rowsWhen(source, (kind) => kind === "ready");
  await source.content(DOC, { versionId: "v2" });
  handle.status.set({ ...SYNCED_STATUS, link: "offline" });
  await turn();
  expect(rows.get()).toEqual({
    rows: [
      row(
        {
          id: "d1",
          kind: "device",
          name: null,
          createdByUserId: "sam",
          createdAt: TODAY_14_10,
          onDevice: true,
          position: null,
          engineVersion: null,
          summary: null,
        },
        "Tue 14:10",
        "Today",
        "14:10",
      ),
      row(opened, "Tue 09:02", "Today", "09:02"),
    ],
    state: { kind: "offline" },
    othersCanOpen: true,
  });
});

test("restore goes to the server when it can, and to the device when it cannot", async () => {
  const restored: unknown[] = [];
  const handle = Object.assign(handleWith([deviceVersion("d1", TODAY_14_10)]), {
    restoreLocally: async (target: DocJSON, scope: unknown) => {
      restored.push({ target, scope });
      return { beforeVersionId: "before-device", applied: 1 };
    },
  });
  const { source, calls } = sourceOver(handle, () =>
    json({ beforeVersionId: "before-server", serverSeq: 43, applied: 1 }),
  );
  expect(await source.restore(DOC, "v1", { kind: "script" })).toEqual({
    ok: true,
    beforeVersionId: "before-server",
  });
  expect(calls.filter((call) => call.method === "POST")).toEqual([
    {
      method: "POST",
      path: "/api/versions/restore",
      body: {
        docId: DOC,
        key: "00000000000000000000000000000001",
        versionId: "v1",
        scope: { kind: "script" },
        clientId: 7,
      },
      authorization: "Bearer tok",
    },
  ]);
  expect(restored).toEqual([]);

  handle.status.set({ ...SYNCED_STATUS, link: "offline" });
  const sent = calls.length;
  expect(await source.restore(DOC, "d1", { kind: "script" })).toEqual({
    ok: true,
    beforeVersionId: "before-device",
  });
  expect(calls.length).toBe(sent);
  expect(restored).toEqual([{ target: DOC_JSON, scope: { kind: "script" } }]);
  expect(await source.restore(DOC, "v9", { kind: "script" })).toEqual({
    ok: false,
    reason: "offline",
  });
});

test("a restore whose answer was lost is sent again under its key and never restored on the device", async () => {
  let restoredOnDevice = 0;
  const handle = Object.assign(handleWith(), {
    restoreLocally: async () => {
      restoredOnDevice += 1;
      return { beforeVersionId: "before-device", applied: 1 };
    },
  });
  let attempts = 0;
  const { source, calls } = sourceOver(handle, () => {
    attempts += 1;
    if (attempts === 1) throw new TypeError("the connection was lost");
    return json({
      beforeVersionId: "before-server",
      serverSeq: 43,
      applied: 1,
    });
  });
  const restoring = source.restore(DOC, "v1", {
    kind: "scene",
    headingId: "h8",
  });
  await until(() => attempts > 0);
  await turn();
  handle.status.set({ ...SYNCED_STATUS, link: "connecting" });
  handle.status.set({ ...SYNCED_STATUS, link: "online" });
  expect(await restoring).toEqual({
    ok: true,
    beforeVersionId: "before-server",
  });
  const keys = calls
    .filter((call) => call.path === "/api/versions/restore")
    .map((call) => Reflect.get(Object(call.body), "key"));
  expect(keys).toEqual([
    "00000000000000000000000000000001",
    "00000000000000000000000000000001",
  ]);
  expect(restoredOnDevice).toBe(0);
});

const S: HistoryState = {
  docId: DOC,
  selected: null,
  baseline: null,
  mode: "page",
  filter: { sceneIds: null, authorUserIds: null },
  step: null,
  draftsOnly: false,
  naming: false,
  sinceDismissed: null,
};
const NAMES: Readonly<Record<string, string>> = { dana: "Dana", sam: "Sam" };
const NAME = (userId: string): string => NAMES[userId] ?? userId;

test("the state bar says what is shown, and the baseline offered is since you last opened when others edited", () => {
  expect(
    historyFacts(
      {
        ...S,
        baseline: {
          versionId: "v",
          position: null,
          title: "Studio draft",
          date: "Mon 16 Nov",
        },
        mode: "page",
      },
      null,
      NAME,
    ),
  ).toEqual([
    { kind: "showing_changes", name: "Studio draft", date: "Mon 16 Nov" },
  ]);
  expect(
    historyFacts(
      { ...S, baseline: null },
      { changes: 14, authorUserIds: ["dana", "sam"] },
      NAME,
    ),
  ).toEqual([
    { kind: "changes_since_opened", count: 14, names: ["Dana", "Sam"] },
  ]);
  expect(
    historyFacts(
      {
        ...S,
        baseline: {
          versionId: "v",
          position: null,
          title: "Tue 09:02",
          date: null,
        },
        mode: "as_it_was",
      },
      null,
      NAME,
    ),
  ).toEqual([{ kind: "viewing_version", name: null, date: "Tue 09:02" }]);
  expect(historyFacts(S, { changes: 0, authorUserIds: [] }, NAME)).toEqual([]);

  const draft = row(
    item("v1", YESTERDAY_17_40, { kind: "named", name: "Studio draft" }),
    "Studio draft",
    "Yesterday",
    "17:40",
  );
  const older = row(
    item("v0", YESTERDAY_17_40 - 60_000, {
      kind: "named",
      name: "First draft",
    }),
    "First draft",
    "Yesterday",
    "17:39",
  );
  const rows = [
    row(item("v2", TODAY_09_02), "Tue 09:02", "Today", "09:02"),
    draft,
    older,
  ];
  const lastOpened = { generation: 1, seq: 40 };
  expect(
    defaultBaseline(rows, { changes: 14, authorUserIds: ["dana"] }, lastOpened),
  ).toEqual({
    versionId: null,
    position: lastOpened,
    title: "you last opened",
    date: null,
  });
  expect(
    defaultBaseline(rows, { changes: 0, authorUserIds: [] }, lastOpened),
  ).toEqual({
    versionId: "v1",
    position: null,
    title: "Studio draft",
    date: "Mon 16 Nov",
  });
  expect(defaultBaseline(rows.slice(0, 1), null, null)).toBeNull();
});

test("the last-opened position uses its fixed key", async () => {
  writeLastOpened("sam", "other-doc", { generation: 2, seq: 7 });
  const handle = Object.assign(handleWith(), { lastServerSeq: () => 42 });
  const { source } = sourceOver(handle, () =>
    json(list([], { head: { generation: 1, seq: 41 } })),
  );
  const rows = source.rows(DOC);
  const stop = rows.subscribe(() => {});
  await until(() => rows.get().state.kind === "empty");
  stop();
  await turn();
  expect(JSON.parse(storage.get("manent.lastOpened.sam") ?? "null")).toEqual({
    "other-doc": "2:7",
    [DOC]: "1:42",
  });
  expect(readLastOpened("sam", DOC)).toEqual({ generation: 1, seq: 42 });
  expect(readLastOpened("dana", DOC)).toBeNull();
  expect(handle.closes()).toBe(1);
});

test("a tab that does not lead keeps the head the list read as where the person was, and closes its view", async () => {
  const handle = Object.assign(handleWith(), { lastServerSeq: () => null });
  const { source } = sourceOver(handle, () =>
    json(list([], { head: { generation: 1, seq: 41 } })),
  );
  const rows = source.rows(DOC);
  const stop = rows.subscribe(() => {});
  await until(() => rows.get().state.kind === "empty");
  stop();
  await turn();
  expect(readLastOpened("sam", DOC)).toEqual({ generation: 1, seq: 41 });
  expect(handle.closes()).toBe(1);
});

test("a device version is uploaded once the server takes it or will never take it", async () => {
  const statuses = [200, 422, 500];
  const { fetch, calls } = fakeFetch(() =>
    json({ error: "invalid" }, statuses[calls.length - 1]),
  );
  const upload = createUploader({ fetch, token: () => "tok", deviceId: "dev" });
  const version = deviceVersion("d1", TODAY_14_10, { label: "manual" });
  expect([
    await upload(version),
    await upload(version),
    await upload(version),
  ]).toEqual([true, true, false]);
  expect(calls[0]).toEqual({
    method: "POST",
    path: "/api/versions/upload",
    body: {
      docId: DOC,
      version: {
        id: "d1",
        kind: "saved",
        name: null,
        deviceId: "dev",
        content: DOC_JSON,
        schemaVersion: SCHEMA_VERSION,
      },
    },
    authorization: "Bearer tok",
  });
});

test("nextDraftName advances along the ladder past named and sent rows", () => {
  const rows: HistoryRow[] = [
    {
      item: item("v-1", TODAY_09_02, {
        kind: "sent",
        name: "First draft",
        createdByUserId: "sam",
      }),
      title: "First draft",
      day: "Today",
      time: "09:02",
      local: null,
    },
    {
      item: item("v-2", TODAY_14_10, {
        kind: "named",
        name: "White draft",
        createdByUserId: "sam",
      }),
      title: "White draft",
      day: "Today",
      time: "14:10",
      local: null,
    },
  ];
  expect([
    nextDraftName(rows, []),
    nextDraftName(rows, ["First draft", "White draft", "Blue draft"]),
  ]).toEqual(["Third draft", "Blue draft"]);
});

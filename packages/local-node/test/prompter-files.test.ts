import { afterAll, expect, test } from "bun:test";
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import type { BlockJSON } from "@manent/schema";
import { createSignedSessionStore } from "@manent/server-core";
import type {
  PrompterHandle,
  PrompterStatus,
  SyncClient,
} from "@manent/sync-client";
import { createFakeClock } from "@manent/sync-client/testing";
import type {
  PrompterFilesStatus,
  PrompterRow,
  ShellMessage,
} from "@manent/sync-protocol";
import { createTempTrees } from "@manent/testkit";
import {
  createPrompterFilesWriter,
  createShellChannel,
  encodeWindows1252,
  feedFromPrompterHandle,
  formatRunOrderDuration,
  localRoutes,
} from "../src/index.ts";
import type { PrompterFeed, PrompterFeedSnapshot } from "../src/index.ts";
import { createMemoryRecords } from "../src/testing/index.ts";

const trees = createTempTrees("manent-prompter-files-");
afterAll(trees.removeAll);

const RUNDOWN_A = "11111111-1111-4111-8111-111111111111";
const RUNDOWN_B = "22222222-2222-4222-8222-222222222222";
const BASE = "http://127.0.0.1:51234";

function speech(character: string, dialogue: string): BlockJSON[] {
  return [
    {
      type: "block",
      attrs: { id: "block001", type: "character" },
      content: [{ type: "text", text: character }],
    },
    {
      type: "block",
      attrs: { id: "block002", type: "dialogue" },
      content: [{ type: "text", text: dialogue }],
    },
  ];
}

function fakeFeed(initial: PrompterFeedSnapshot | null): {
  feed: PrompterFeed;
  push(next: PrompterFeedSnapshot | null): void;
} {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    feed: {
      current: () => current,
      subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
    push(next) {
      current = next;
      for (const listener of listeners) listener();
    },
  };
}

function createSubscribable<T>(initial: T) {
  let value = initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const listener of listeners) listener(next);
    },
    subscribe(listener: (value: T) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

test("encodeWindows1252 encodes ASCII, Latin-1, all 27 special code points, and counts unencodable code points once each", () => {
  const specials = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
  const expectedSpecialBytes = [
    0x80, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x8b, 0x8c,
    0x8e, 0x91, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0x9b,
    0x9c, 0x9e, 0x9f,
  ];
  const encodedSpecials = encodeWindows1252(specials);
  expect([...encodedSpecials.bytes]).toEqual(expectedSpecialBytes);
  expect(encodedSpecials.replaced).toBe(0);

  // ASCII + Latin-1 Supplement (é = 0xE9) + unencodable BMP (日) + surrogate-pair emoji (😀) + C1 control (\u0081)
  const mixed = "Café—日😀\u0081";
  const encoded = encodeWindows1252(mixed);
  expect([...encoded.bytes]).toEqual([
    0x43, 0x61, 0x66, 0xe9, 0x97, 0x3f, 0x3f, 0x3f,
  ]);
  expect(encoded.replaced).toBe(3);
});

test("formatRunOrderDuration formats nearest second halves up without @manent/ui", () => {
  expect(formatRunOrderDuration(0)).toBe("0:00");
  expect(formatRunOrderDuration(499)).toBe("0:00");
  expect(formatRunOrderDuration(500)).toBe("0:01");
  expect(formatRunOrderDuration(245_000)).toBe("4:05");
  expect(formatRunOrderDuration(3_727_000)).toBe("1:02:07");
});

test("writer creates run-order.txt and story files with CRLF, diffs updates, deletes removed stories, preserves unrelated files, and keeps files on stop", async () => {
  const folder = await trees.tree({ "unrelated.txt": "keep me" });
  const { clock } = createFakeClock(0);
  const statuses: (PrompterFilesStatus | null)[] = [];

  const rows: PrompterRow[] = [
    {
      rowId: "hdr-1",
      kind: "header",
      number: null,
      title: "Block A",
      storyId: null,
      durationMs: null,
    },
    {
      rowId: "r-1",
      kind: "story",
      number: 1,
      title: "Tolle Exchange library: council votes yes",
      storyId: "doc-1",
      durationMs: 245_000,
    },
    {
      rowId: "r-2",
      kind: "story",
      number: 2,
      title: "Unsent story",
      storyId: "doc-2",
      durationMs: 65_000,
    },
    {
      rowId: "r-3",
      kind: "story",
      number: 100,
      title: "!!!",
      storyId: "doc-1",
      durationMs: 3_727_000,
    },
    {
      rowId: "r-4",
      kind: "story",
      number: 100,
      title: "???",
      storyId: "doc-4",
      durationMs: 0,
    },
  ];

  // Keyed by rowId per C3-1 (r-1 and r-3 share storyId "doc-1" as split stories).
  const initialStories = new Map<string, readonly BlockJSON[]>([
    ["r-1", speech("Anchor", "Good evening — welcome.")],
    ["r-3", speech("Reporter", "Live from the pier.")],
    ["r-4", speech("Host", "Back to the desk.")],
  ]);
  const source = fakeFeed({ runOrder: rows, stories: initialStories });

  const writer = createPrompterFilesWriter({
    rundownId: RUNDOWN_A,
    folder,
    encoding: "utf-8",
    feed: source.feed,
    clock,
    onStatus: (status) => statuses.push(status),
  });

  const expectedOrder = [
    "\tBlock A\t\t",
    "1\tTolle Exchange library: council votes yes\t01-tolle-exchange-library-council-votes-yes.txt\t4:05",
    "2\tUnsent story\t\t1:05",
    "100\t!!!\t100-story.txt\t1:02:07",
    "100\t???\t100-story-2.txt\t0:00",
    "",
  ].join("\r\n");

  const orderBytes = readFileSync(join(folder, "run-order.txt"));
  // UTF-8 has no BOM.
  expect([orderBytes[0], orderBytes[1], orderBytes[2]]).not.toEqual([
    0xef, 0xbb, 0xbf,
  ]);
  expect(orderBytes.toString("utf8")).toBe(expectedOrder);
  expect(
    readFileSync(
      join(folder, "01-tolle-exchange-library-council-votes-yes.txt"),
      "utf8",
    ),
  ).toBe("ANCHOR\r\nGood evening — welcome.\r\n");
  expect(readFileSync(join(folder, "100-story.txt"), "utf8")).toBe(
    "REPORTER\r\nLive from the pier.\r\n",
  );
  expect(readFileSync(join(folder, "100-story-2.txt"), "utf8")).toBe(
    "HOST\r\nBack to the desk.\r\n",
  );

  // Remove r-4 from the run order: its file is deleted, unrelated.txt stays untouched.
  source.push({
    runOrder: rows.slice(0, 4),
    stories: new Map([
      ["r-1", speech("Anchor", "Good evening — welcome.")],
      ["r-3", speech("Reporter", "Updated from the pier.")],
    ]),
  });
  expect(existsSync(join(folder, "100-story-2.txt"))).toBe(false);
  expect(readFileSync(join(folder, "100-story.txt"), "utf8")).toBe(
    "REPORTER\r\nUpdated from the pier.\r\n",
  );
  expect(readFileSync(join(folder, "unrelated.txt"), "utf8")).toBe("keep me");

  // stop() leaves written files in place and emits null.
  writer.stop();
  expect(statuses.at(-1)).toBeNull();
  expect(existsSync(join(folder, "run-order.txt"))).toBe(true);
  expect(readdirSync(folder).some((f) => f.endsWith(".manent-tmp"))).toBe(
    false,
  );
});

test("writer retries EBUSY rename up to 20 times via clock and emits unwritable on missing folder", async () => {
  const folder = await trees.tree({});
  const fakeClock = createFakeClock(0);
  const statuses: (PrompterFilesStatus | null)[] = [];
  const source = fakeFeed({
    runOrder: [
      {
        rowId: "r-1",
        kind: "story",
        number: 1,
        title: "Lead",
        storyId: "doc-1",
        durationMs: 10_000,
      },
    ],
    stories: new Map([["r-1", speech("Anchor", "Hello 日")]]),
  });

  let busyRemaining = 3;
  const writer = createPrompterFilesWriter(
    {
      rundownId: RUNDOWN_A,
      folder,
      encoding: "windows-1252",
      feed: source.feed,
      clock: fakeClock.clock,
      onStatus: (status) => statuses.push(status),
    },
    {
      rename(from, to) {
        if (String(to).endsWith("01-lead.txt") && busyRemaining > 0) {
          busyRemaining -= 1;
          const err = Object.assign(new Error("busy"), { code: "EBUSY" });
          throw err;
        }
        renameSync(from, to);
      },
    },
  );

  // Story file not yet renamed; advancing 3 * 25 ms completes rename and updates replaced count.
  expect(existsSync(join(folder, "01-lead.txt"))).toBe(false);
  fakeClock.advance(75);
  expect(existsSync(join(folder, "01-lead.txt"))).toBe(true);
  expect(readFileSync(join(folder, "01-lead.txt"), "latin1")).toBe(
    "ANCHOR\r\nHello ?\r\n",
  );
  expect(statuses.at(-1)?.replaced).toBe(1);
  writer.stop();

  // Missing folder immediately emits failure: "unwritable" then null.
  const missing = join(folder, "does-not-exist");
  rmSync(missing, { recursive: true, force: true });
  const failStatuses: (PrompterFilesStatus | null)[] = [];
  createPrompterFilesWriter({
    rundownId: RUNDOWN_A,
    folder: missing,
    encoding: "utf-8",
    feed: source.feed,
    clock: fakeClock.clock,
    onStatus: (status) => failStatuses.push(status),
  });
  expect(failStatuses).toEqual([
    {
      rundownId: RUNDOWN_A,
      path: missing,
      encoding: "utf-8",
      replaced: 0,
      failure: "unwritable",
    },
    null,
  ]);
});

test("feedFromPrompterHandle pauses while lost and routes authenticate, reject busy/unreachable, broadcast shell status, and clean up on close", async () => {
  const folder = await trees.tree({});
  const records = createMemoryRecords();
  const sessions = createSignedSessionStore({
    secret: records.secret(),
    now: () => 1_000,
  });
  records.savePerson({
    userId: "sam",
    name: "Sam Okafor",
    wantsCloud: true,
    cloudToken: null,
    chosenAt: 1,
  });
  const token = sessions.issue("sam");
  const fakeClock = createFakeClock(0);
  const shell = createShellChannel({
    clock: fakeClock.clock,
    heartbeatMs: 30_000,
  });
  const sent: ShellMessage[] = [];
  const origSend = shell.shell.send;
  shell.shell.send = (message) => {
    sent.push(message);
    origSend(message);
  };

  let handleClosed = 0;
  const runOrder = createSubscribable<readonly PrompterRow[]>([
    {
      rowId: "r-1",
      kind: "story",
      number: 1,
      title: "Opening",
      storyId: "doc-1",
      durationMs: 30_000,
    },
  ]);
  const stories = createSubscribable<ReadonlyMap<string, readonly BlockJSON[]>>(
    new Map([["r-1", speech("Anchor", "First line.")]]),
  );
  const status = createSubscribable<PrompterStatus>({
    feed: "lost",
    lastReceivedAt: null,
  });

  const handle: PrompterHandle = {
    runOrder,
    stories,
    status,
    close: () => {
      handleClosed += 1;
    },
  };
  const adapted = feedFromPrompterHandle(handle);
  expect(adapted.current()).toBeNull();

  let hasClient = false;
  const closeCallbacks: (() => void)[] = [];
  const routes = localRoutes({
    records,
    shell,
    sessions,
    signInToSync: async () => ({ ok: true }),
    onFocus: () => {},
    storeUsage: () => ({ scripts: 0, bytes: 0 }),
    setConnection: () => {},
    clientOf: () =>
      hasClient ? ({ prompter: () => handle } as unknown as SyncClient) : null,
    clock: fakeClock.clock,
    onClose: (fn) => closeCallbacks.push(fn),
  });

  const call = async (
    method: "GET" | "POST" | "DELETE",
    init: { token?: string; body?: unknown } = {},
  ): Promise<[number, unknown]> => {
    const headers: Record<string, string> =
      init.token === undefined ? {} : { authorization: `Bearer ${init.token}` };
    const answer = await routes(
      new Request(
        `${BASE}/api/local/prompter-files`,
        init.body === undefined
          ? { method, headers }
          : { method, headers, body: JSON.stringify(init.body) },
      ),
    );
    if (answer === null) return [0, null];
    const text = await answer.text();
    return [answer.status, text === "" ? null : JSON.parse(text)];
  };

  // Unauthenticated refused.
  expect(await call("GET")).toEqual([401, { error: "unauthenticated" }]);
  // Bad body refused.
  expect(
    await call("POST", {
      token,
      body: { rundownId: "not-a-uuid", folder, encoding: "utf-8" },
    }),
  ).toEqual([400, { error: "bad_request" }]);
  // No sync client -> 503 unreachable.
  expect(
    await call("POST", {
      token,
      body: { rundownId: RUNDOWN_A, folder, encoding: "utf-8" },
    }),
  ).toEqual([503, { error: "unreachable" }]);

  // Start while feed is "lost" -> no files written yet.
  hasClient = true;
  expect(
    await call("POST", {
      token,
      body: { rundownId: RUNDOWN_A, folder, encoding: "utf-8" },
    }),
  ).toEqual([204, null]);
  expect(existsSync(join(folder, "run-order.txt"))).toBe(false);
  expect(await call("GET", { token })).toEqual([
    200,
    {
      rundownId: RUNDOWN_A,
      path: folder,
      encoding: "utf-8",
      replaced: 0,
      failure: null,
    },
  ]);

  // Another rundown -> 409 busy.
  expect(
    await call("POST", {
      token,
      body: { rundownId: RUNDOWN_B, folder, encoding: "utf-8" },
    }),
  ).toEqual([409, { error: "busy" }]);

  // Feed transitions to "live" -> writes files!
  status.set({ feed: "live", lastReceivedAt: 100 });
  expect(readFileSync(join(folder, "01-opening.txt"), "utf8")).toBe(
    "ANCHOR\r\nFirst line.\r\n",
  );

  // DELETE stops active writer and closes handle, emitting null.
  expect(await call("DELETE", { token })).toEqual([204, null]);
  expect(handleClosed).toBe(1);
  expect(await call("GET", { token })).toEqual([200, null]);
  expect(sent.at(-1)).toEqual({
    v: 1,
    t: "prompter_files",
    status: null,
  });
  // Idempotent DELETE when nothing is running.
  expect(await call("DELETE", { token })).toEqual([204, null]);

  // Restart and trigger onClose cleanup.
  expect(
    await call("POST", {
      token,
      body: { rundownId: RUNDOWN_A, folder, encoding: "utf-8" },
    }),
  ).toEqual([204, null]);
  for (const fn of closeCallbacks) fn();
  expect(handleClosed).toBe(2);
  expect(await call("GET", { token })).toEqual([200, null]);
});

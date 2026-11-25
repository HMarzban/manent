import { afterEach, expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import { readInk } from "@manent/formats";
import type { SyncClient } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { archiveSource } from "../src/archive/archive-source.ts";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { inkJsonFileType } from "../src/send/file-types/ink-json.ts";
import { inkProjectFileType } from "../src/send/file-types/ink-project.ts";
import { registerServicesMeta } from "../src/services/api-cache.ts";
import type { PersonServices } from "../src/services/ports.ts";
import { fakeApi } from "./services.fixtures.ts";
import { fakeHandle } from "./sync.fixtures.ts";

const USER = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
const TEAM_WS = "1c2d3e4f-5061-4728-93a4-b5c6d7e8f901";
const noop = (): void => {};
const restores: (() => void)[] = [];

afterEach(() => {
  for (const restore of restores.splice(0).toReversed()) restore();
});

function sequentialIds(prefix = "k"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

function registerInkEditor(docId: string, source: string): void {
  const doc = createDoc();
  scriptBody(doc).write((w) =>
    w.insertBlocks(null, readInk(source, sequentialIds())),
  );
  const editor: LiveEditor = {
    docId,
    doc,
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {
      publish: noop,
      subscribe: () => noop,
      subscribePeople: () => noop,
    },
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  };
  restores.push(registerLiveEditor(editor));
}

test("inkProjectOf discovers cached local workspace index from sync.documents() when offline", async () => {
  registerInkEditor("ink-a", "-> start\n=== start ===\nAct one.\n-> END\n");
  const actTwoBlocks = readInk(
    "=== act_two ===\nAct two.\n-> END\n",
    sequentialIds("b"),
  );

  const teamIndexId = indexDocId("workspace", TEAM_WS);
  const teamIndex = createDoc();
  jsonMap(teamIndex, "projects").set("proj-team", {
    title: "Harbour Tale",
    kind: "game",
    createdAt: 1,
    createdByUserId: USER,
  });
  jsonMap(teamIndex, "documents").set("ink-a", {
    projectId: "proj-team",
    title: "Act One",
    kind: "ink",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
  });
  jsonMap(teamIndex, "documents").set("ink-b", {
    projectId: "proj-team",
    title: "Act Two",
    kind: "ink",
    createdAt: 2,
    editedAt: null,
    editedByUserId: null,
  });

  const offlineServices = {
    api: {
      ...fakeApi(),
      me: async () => ({ ok: false as const, reason: "unreachable" as const }),
    },
    userId: USER,
    openHandle: async (docId: string) =>
      fakeHandle(docId, docId === teamIndexId ? teamIndex : createDoc()),
    documentBlocks: async (docId: string) =>
      docId === "ink-b" ? actTwoBlocks : null,
  } as unknown as PersonServices;

  registerServicesMeta(offlineServices, {
    storage: null,
    client: Promise.resolve({
      documents: async () => [
        {
          docId: teamIndexId,
          neverSynced: false,
          waiting: 0,
          parked: null,
          recovered: 0,
        },
        {
          docId: "ink-a",
          neverSynced: false,
          waiting: 0,
          parked: null,
          recovered: 0,
        },
      ],
    } as unknown as SyncClient),
  });

  const prev = archiveSource.get();
  archiveSource.set(offlineServices);
  restores.push(() => {
    if (prev !== null) archiveSource.set(prev);
  });

  const file = await inkProjectFileType.write({
    docId: "ink-a",
    title: "Act One",
    pages: null,
    now: () => 1,
  });
  expect(file.name).toBe("Harbour Tale.ink");
  const joined = new TextDecoder().decode(file.bytes);
  expect(joined).toContain("// Act One");
  expect(joined).toContain("// Act Two");
});

test("inkJsonFileType.leftOut reports compile problems before export and returns null when clean", async () => {
  registerInkEditor("ink-clean", "=== start ===\nClean line.\n-> END\n");
  expect(
    await inkJsonFileType.leftOut?.({ docId: "ink-clean", title: "Clean" }),
  ).toBeNull();

  registerInkEditor("ink-bad", "=== start ===\n-> missing_knot\n");
  const problem = await inkJsonFileType.leftOut?.({
    docId: "ink-bad",
    title: "Bad",
  });
  expect(problem).not.toBeNull();
  expect(problem).toMatch(/^Line \d+:/);
});

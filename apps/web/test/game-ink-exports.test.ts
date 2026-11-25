import { afterEach, expect, test } from "bun:test";
import { createDoc, jsonMap, scriptBody } from "@manent/crdt";
import { createInkStory, readInk } from "@manent/formats";
import type { BlockJSON } from "@manent/schema";
import type { SyncClient } from "@manent/sync-client";
import { indexDocId } from "@manent/sync-protocol";
import { createMessageQueue } from "@manent/ui";
import { archiveSource } from "../src/archive/archive-source.ts";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { readInkFile } from "../src/import/ink-reader.ts";
import { createFileOpener } from "../src/import/open-files.ts";
import { importReaders } from "../src/import/readers.ts";
import { createReopenMemory } from "../src/import/reopen.ts";
import { typesOffered, typesPrinted } from "../src/send/file-types.ts";
import { inkJsonFileType } from "../src/send/file-types/ink-json.ts";
import { inkProjectFileType } from "../src/send/file-types/ink-project.ts";
import { inkSourceFileType } from "../src/send/file-types/ink-source.ts";
import { lineDataJsonFileType } from "../src/send/file-types/line-data-json.ts";
import { lineDataXmlFileType } from "../src/send/file-types/line-data-xml.ts";
import type { LibraryIndex, PersonServices } from "../src/services/ports.ts";
import { documentBlocks } from "../src/services/sync/document-blocks.ts";
import { createInkProject } from "../src/services/sync/ink-project.ts";
import { fakeApi } from "./services.fixtures.ts";
import { SYNCED_STATUS, fakeHandle } from "./sync.fixtures.ts";

const USER = "0b1c2d3e-4f50-4617-8293-a4b5c6d7e8f9";
const noop = (): void => {};
const restores: (() => void)[] = [];

afterEach(() => {
  for (const restore of restores.splice(0).toReversed()) restore();
});

function makeDocWithBlocks(blocks: readonly BlockJSON[]) {
  const doc = createDoc();
  scriptBody(doc).write((w) => w.insertBlocks(null, blocks));
  return doc;
}

function registerDocEditor(docId: string, blocks: readonly BlockJSON[]) {
  const doc = makeDocWithBlocks(blocks);
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
  return doc;
}

function sequentialIds(prefix = "b"): () => string {
  let n = 0;
  return () => `${prefix}${++n}`;
}

test("documentBlocks reads held documents locally and returns null without opening unheld or never-synced ones", async () => {
  const blocks: BlockJSON[] = [
    {
      type: "block",
      attrs: { id: "k1", type: "ink_line" },
      content: [{ type: "text", text: "=== start ===" }],
    },
    {
      type: "block",
      attrs: { id: "k2", type: "ink_line" },
      content: [{ type: "text", text: "The fog bell rings." }],
    },
  ];
  const heldDoc = makeDocWithBlocks(blocks);
  const neverSyncedDoc = createDoc();
  const opened: string[] = [];

  const client = Promise.resolve({
    documents: async () => [
      { docId: "held-1", waiting: 0 },
      { docId: "never-1", waiting: 0 },
    ],
    open: async (docId: string) => {
      opened.push(docId);
      if (docId === "held-1") return fakeHandle(docId, heldDoc);
      const handle = fakeHandle(docId, neverSyncedDoc);
      handle.status.set({ ...SYNCED_STATUS, neverSynced: true, waiting: 0 });
      return handle;
    },
  } as unknown as SyncClient);

  const readHeld = await documentBlocks(client, "held-1");
  const readUnheld = await documentBlocks(client, "remote-only");
  const readNeverSynced = await documentBlocks(client, "never-1");

  expect(readHeld?.map((b) => b.attrs?.id)).toEqual(["k1", "k2"]);
  expect(readUnheld).toBeNull();
  expect(readNeverSynced).toBeNull();
  expect(opened).toEqual(["held-1", "never-1"]);
});

test("createInkProject creates a game project holding an ink document with script.format=ink and blocks", async () => {
  const createdDoc = createDoc();
  const writtenSettings: [string, unknown][] = [];
  const handle = fakeHandle("ink-doc-1", createdDoc);
  handle.setSetting = (key, value) => {
    writtenSettings.push([key, value]);
  };
  const calls: {
    ws: string;
    projectId: string | null;
    kind: string;
    title: string;
    docKind: string;
  }[] = [];

  const addCopy: LibraryIndex["addCopy"] = async (
    ws,
    projectId,
    kind,
    title,
    start,
  ) => {
    calls.push({ ws, projectId, kind, title, docKind: start.docKind });
    start.start(handle);
    return { projectId: "proj-1", docId: "ink-doc-1" };
  };
  const library = { addCopy } as unknown as LibraryIndex;

  const blocks = readInk(
    "=== harbour ===\nFog rolls in.\n-> END\n",
    sequentialIds(),
  );
  const made = await createInkProject(library, "ws-1", {
    title: "The Keeper's Logbook",
    blocks,
  });

  expect(made).toEqual({ projectId: "proj-1", docId: "ink-doc-1" });
  expect(calls).toEqual([
    {
      ws: "ws-1",
      projectId: null,
      kind: "game",
      title: "The Keeper's Logbook",
      docKind: "ink",
    },
  ]);
  expect(writtenSettings).toEqual([["script.format", "ink"]]);
  const savedBlocks = (
    scriptBody(createdDoc).materialize().content ?? []
  ).flatMap((s) => s.content ?? []);
  expect(savedBlocks.length).toBe(3);
  expect(savedBlocks[0]?.attrs?.type).toBe("ink_line");
});

test("Game Script offers Line data (JSON) and (XML) and preserves stable block IDs across edits", async () => {
  const offered = typesOffered("export", {
    docKind: "script",
    format: "game",
    locked: false,
  });
  expect(offered.map((t) => [t.id, t.label])).toContainEqual([
    "line_data_json",
    "Line data (JSON)",
  ]);
  expect(offered.map((t) => [t.id, t.label])).toContainEqual([
    "line_data_xml",
    "Line data (XML)",
  ]);

  const blocks: BlockJSON[] = [
    {
      type: "block",
      attrs: { id: "blk-cue", type: "character" },
      content: [{ type: "text", text: "CAL (V.O.)" }],
    },
    {
      type: "block",
      attrs: { id: "blk-knock", type: "dialogue" },
      content: [{ type: "text", text: "Did you hear that knock?" }],
    },
    {
      type: "block",
      attrs: { id: "blk-choice", type: "general" },
      content: [{ type: "text", text: "* Open the door" }],
    },
  ];
  const doc = registerDocEditor("game-1", blocks);

  const jsonFile = await lineDataJsonFileType.write({
    docId: "game-1",
    title: "Twelve on Foot — Chapter 1: Fog Bell",
    pages: null,
    now: () => 1,
  });
  const xmlFile = await lineDataXmlFileType.write({
    docId: "game-1",
    title: "Twelve on Foot — Chapter 1: Fog Bell",
    pages: null,
    now: () => 1,
  });

  expect(jsonFile.name).toBe(
    "Twelve on Foot — Chapter 1- Fog Bell line data.json",
  );
  expect(xmlFile.name).toBe(
    "Twelve on Foot — Chapter 1- Fog Bell line data.xml",
  );
  const rows = JSON.parse(new TextDecoder().decode(jsonFile.bytes));
  expect(rows).toEqual([
    { id: "blk-cue", type: "character", text: "CAL (V.O.)" },
    {
      id: "blk-knock",
      type: "dialogue",
      character: "CAL",
      text: "Did you hear that knock?",
    },
    {
      id: "blk-choice",
      type: "general",
      kind: "choice",
      depth: 1,
      text: "Open the door",
    },
  ]);
  const xmlText = new TextDecoder().decode(xmlFile.bytes);
  expect(xmlText).toContain(
    '<line id="blk-knock" type="dialogue" character="CAL" text="Did you hear that knock?"/>',
  );

  // Edit Cal's knock line in place and re-export: ID stays stable.
  scriptBody(doc).write((w) => {
    w.deleteText("blk-knock", 0, 24);
    w.insertText("blk-knock", 0, "Three knocks on the hull.");
  });
  const afterEdit = await lineDataJsonFileType.write({
    docId: "game-1",
    title: "Twelve on Foot — Chapter 1: Fog Bell",
    pages: null,
    now: () => 2,
  });
  const editedRows = JSON.parse(new TextDecoder().decode(afterEdit.bytes));
  expect(editedRows[1]).toEqual({
    id: "blk-knock",
    type: "dialogue",
    character: "CAL",
    text: "Three knocks on the hull.",
  });
});

test("Ink offers its three export types, disables Print with S4-IK-16, round-trips .ink, compiles JSON, and joins project with missing/problem notices", async () => {
  const inkTarget = {
    docKind: "ink" as const,
    format: "ink" as const,
    locked: false,
  };
  const offered = typesOffered("export", inkTarget);
  expect(offered.map((t) => [t.id, t.label])).toEqual([
    ["ink_source", "Ink"],
    ["ink_project", "Whole project as Ink"],
    ["ink_json", "Compiled Ink (JSON)"],
  ]);
  expect(typesPrinted(inkTarget)).toEqual([]);
  for (const type of offered)
    expect(type.print).toEqual({
      offered: false,
      reason: "isn't part of the Ink format",
    });

  const source =
    "-> start\n=== start ===\nThe lantern burns.\n* Trim the wick\n  Brighter now.\n  -> END\n";
  registerDocEditor("ink-1", readInk(source, sequentialIds("a")));

  // Single .ink export round-trips cleanly.
  const single = await inkSourceFileType.write({
    docId: "ink-1",
    title: "The Keeper's Logbook",
    pages: null,
    now: () => 1,
  });
  expect(single.name).toBe("The Keeper's Logbook.ink");
  expect(new TextDecoder().decode(single.bytes)).toBe(source);
  const reimported = await readInkFile(single.bytes, sequentialIds("r"));
  expect(reimported.from).toBe("ink");
  expect(reimported.blocks.length).toBe(6);

  // Compiled Ink (JSON) loads into inkjs Story.
  const compiled = await inkJsonFileType.write({
    docId: "ink-1",
    title: "The Keeper's Logbook",
    pages: null,
    now: () => 1,
  });
  expect(compiled.name).toBe("The Keeper's Logbook.ink.json");
  const story = createInkStory({
    json: new TextDecoder().decode(compiled.bytes),
  });
  const step = story.proceed();
  expect(step.ok).toBe(true);
  if (step.ok) expect(step.passages[0]?.text.trim()).toBe("The lantern burns.");

  // Whole project as Ink: 3 docs in project — ink-1 (live), ink-2 (on device with duplicate knot), ink-3 (not on device).
  const index = createDoc();
  jsonMap(index, "projects").set("proj-game", {
    title: "Game samples",
    kind: "game",
    createdAt: 1,
    createdByUserId: USER,
  });
  jsonMap(index, "documents").set("ink-1", {
    projectId: "proj-game",
    title: "The Keeper's Logbook",
    kind: "ink",
    createdAt: 1,
    editedAt: null,
    editedByUserId: null,
  });
  jsonMap(index, "documents").set("ink-2", {
    projectId: "proj-game",
    title: "Logbook — Act Two",
    kind: "ink",
    createdAt: 2,
    editedAt: null,
    editedByUserId: null,
  });
  jsonMap(index, "documents").set("ink-3", {
    projectId: "proj-game",
    title: "Logbook — Act Three",
    kind: "ink",
    createdAt: 3,
    editedAt: null,
    editedByUserId: null,
  });

  const duplicateBlocks = readInk(
    "=== start ===\nSecond start.\n-> END\n",
    sequentialIds("d"),
  );
  const prevSource = archiveSource.get();
  archiveSource.set({
    api: fakeApi(),
    userId: USER,
    openHandle: async (docId: string) =>
      fakeHandle(
        docId,
        docId === indexDocId("workspace", USER) ? index : createDoc(),
      ),
    documentBlocks: async (docId: string) =>
      docId === "ink-2" ? duplicateBlocks : null,
  } as unknown as PersonServices);
  restores.push(() => {
    if (prevSource !== null) archiveSource.set(prevSource);
  });

  const notice = await inkProjectFileType.leftOut?.({
    docId: "ink-1",
    title: "The Keeper's Logbook",
  });
  expect(notice).toContain(
    "'Logbook — Act Three' isn't on this device, so the file leaves it out.",
  );
  expect(notice).toContain("listed in Checks. It is written as it is.");
  expect(notice).toMatch(/! Line \d+ of the joined file:/);

  // Even with compile problems, Whole project as Ink writes the joined file as it is.
  const projectFile = await inkProjectFileType.write({
    docId: "ink-1",
    title: "The Keeper's Logbook",
    pages: null,
    now: () => 1,
  });
  expect(projectFile.name).toBe("Game samples.ink");
  const joinedText = new TextDecoder().decode(projectFile.bytes);
  expect(joinedText).toContain("// The Keeper's Logbook\n\n-> start");
  expect(joinedText).toContain("// Logbook — Act Two\n\n=== start ===");
  expect(joinedText).not.toContain("Logbook — Act Three");
});

test("opening a .ink file creates a Game project with Ink doc, counts knots excluding functions, and refuses non-UTF-8 with S4-IK-33", async () => {
  const created: { title: string; blocks: readonly BlockJSON[] }[] = [];
  const navigated: string[] = [];
  const messages = createMessageQueue({
    now: () => 1000,
    schedule: () => noop,
  });
  const addCopy: LibraryIndex["addCopy"] = async (
    _ws,
    _proj,
    _kind,
    title,
    start,
  ) => {
    const doc = createDoc();
    start.start(fakeHandle("new-ink-1", doc));
    const blocks = (scriptBody(doc).materialize().content ?? []).flatMap(
      (s) => s.content ?? [],
    );
    created.push({ title, blocks });
    return { projectId: "p1", docId: `doc-${created.length}` };
  };
  const library = {
    addCopy,
    documentTitle: () => ({ get: () => null, subscribe: () => noop }),
    readProjects: async () => [],
  } as unknown as LibraryIndex;

  const opener = createFileOpener({
    readers: importReaders(() => {
      throw new Error("xml not used");
    }),
    library,
    messages,
    place: async () => ({
      workspaceId: "ws-1",
      navigate: (path) => navigated.push(path),
    }),
    reopen: createReopenMemory({ storage: null, userId: USER }),
    userId: USER,
    now: () => 1000,
    ids: sequentialIds("i"),
    randomKey: () => "rk",
    sha256: async (bytes) => `sha-${bytes.length}-${bytes[0] ?? 0}`,
    language: "en-GB",
  });

  // 1. Valid .ink with 2 knots and 1 function (function excluded from knot count).
  const inkText =
    [
      "=== function helper(x) ===",
      "~ return x + 1",
      "=== harbour ===",
      "Sea mist.",
      "=== pier ===",
      "-> END",
    ].join("\n") + "\n";
  await opener.open([
    {
      name: "The Keeper's Logbook.ink",
      bytes: new TextEncoder().encode(inkText),
    },
  ]);
  expect(navigated).toEqual(["/s/doc-1"]);
  expect(messages.current()?.text).toBe(
    "Imported 'The Keeper's Logbook': 6 lines, 2 knots.",
  );
  expect(created[0]?.title).toBe("The Keeper's Logbook");
  expect(created[0]?.blocks.length).toBe(6);

  // 2. Valid .ink with 0 knots omits knot count.
  messages.dismiss("import_summary");
  await opener.open([
    { name: "Notes.ink", bytes: new TextEncoder().encode("Just a note.\n") },
  ]);
  expect(messages.current()?.text).toBe("Imported 'Notes': 1 line.");

  // 3. Invalid UTF-8 bytes refused with S4-IK-33.
  messages.dismiss("import_summary");
  await opener.open([
    { name: "logbook.ink", bytes: new Uint8Array([0xff, 0xfe, 0x80]) },
  ]);
  expect(messages.current()?.text).toBe(
    "Couldn't open 'logbook.ink': it isn't saved as UTF-8 text.",
  );
});

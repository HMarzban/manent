import { afterEach, expect, test } from "bun:test";
import { createDoc, scriptDocFromJSON } from "@manent/crdt";
import type { BlockJSON, BlockType, DocJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import { createValue } from "@manent/ui";
import { archiveSource } from "../src/archive/archive-source.ts";
import { snapshotChecksContext } from "../src/checks/checks-context.ts";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import { timingEditorPlugin } from "../src/editor-host/timing.ts";
import type { PersonServices, ProjectKind } from "../src/services/ports.ts";
import { bracketTimeCheck } from "../src/timing/checks.ts";
import { publishTimingFacts } from "../src/timing/timing-facts.ts";
import { testEnvironment, testServices } from "./services.fixtures.ts";

const cleanups: (() => void)[] = [];
const initialArchive = archiveSource.get();

function restoreArchive(value: PersonServices | null): void {
  (archiveSource.set as (services: PersonServices | null) => void)(value);
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 6; i++) await Promise.resolve();
}

afterEach(() => {
  for (const stop of cleanups.splice(0).toReversed()) stop();
  restoreArchive(initialArchive);
});

function block(id: string, type: BlockType, text: string): BlockJSON {
  return {
    type: "block",
    attrs: { id, type },
    content: [{ type: "text", text }],
  };
}

function makeVarietyServices(options: {
  docId: string;
  kind?: ProjectKind | null;
  documentBlocks?: () => Promise<readonly BlockJSON[] | null>;
  openHandle?: () => Promise<DocHandle>;
}): {
  services: PersonServices;
  kindSlot: ReturnType<typeof createValue<ProjectKind | null>>;
} {
  const base = testServices({ userId: "dana", environment: testEnvironment() });
  const store = base.openScriptStore(options.docId);
  store.set("script.format", "variety");
  const kindSlot = createValue<ProjectKind | null>(options.kind ?? "show");
  const services: PersonServices = {
    ...base,
    library: {
      ...base.library,
      documentKind: (id) =>
        id === options.docId ? kindSlot : base.library.documentKind(id),
    },
    documentBlocks: options.documentBlocks ?? ((id) => base.documentBlocks(id)),
    openHandle: options.openHandle ?? ((id) => base.openHandle(id)),
  };
  return { services, kindSlot };
}

test("bracket-time check reads stored blocks when no live editor is mounted", async () => {
  const docId = "cold-export-blocks";
  const blocks: readonly BlockJSON[] = [
    block("b1", "slug", "MONOLOGUE"),
    block("b2", "bracket", "[VT T=2:7]"),
  ];
  const { services } = makeVarietyServices({
    docId,
    kind: "show",
    documentBlocks: async () => blocks,
  });
  archiveSource.set(services);
  publishTimingFacts(docId, null);

  const versionBefore = snapshotChecksContext(docId, services).version;
  expect(bracketTimeCheck.find(docId)).toEqual([]);
  await flushMicrotasks();

  const found = bracketTimeCheck.find(docId);
  expect([
    snapshotChecksContext(docId, services).version,
    found.map((entry) => [entry.id, entry.sentence, entry.action.label]),
  ]).toEqual([
    versionBefore + 1,
    [
      [
        "b2:4:9",
        'MONOLOGUE · "T=2:7" sets no time — write minutes and two-digit seconds, as T=2:07',
        "See Bracket",
      ],
    ],
  ]);
});

test("bracket-time check falls back to opening the document handle and closes it after reading", async () => {
  const docId = "cold-export-handle";
  const json: DocJSON = {
    type: "doc",
    content: [
      {
        type: "section",
        content: [
          block("s1", "slug", "COLD OPEN"),
          block("c1", "bracket", "[SFX T=0:10 T=0:20]"),
        ],
      },
    ],
  };
  const doc = scriptDocFromJSON(json);
  let closed = false;
  const fakeHandle = {
    doc: () => doc,
    readOnly: createValue(null),
    close: async () => {
      closed = true;
    },
  } as unknown as DocHandle;
  const { services } = makeVarietyServices({
    docId,
    kind: "podcast",
    documentBlocks: async () => null,
    openHandle: async () => fakeHandle,
  });
  archiveSource.set(services);
  publishTimingFacts(docId, null);

  expect(bracketTimeCheck.find(docId)).toEqual([]);
  await flushMicrotasks();

  const found = bracketTimeCheck.find(docId);
  expect([
    closed,
    found.map((entry) => [entry.id, entry.sentence, entry.action.label]),
  ]).toEqual([
    true,
    [
      [
        "c1:12:18",
        'COLD OPEN · "T=0:20" is a second time in this Cue; only the first counts',
        "See Cue",
      ],
    ],
  ]);
});

test("bracket-time fallback cache evicts its document snapshot when the live editor closes", () => {
  const docId = "evict-on-close";
  const { services } = makeVarietyServices({ docId, kind: "show" });
  archiveSource.set(services);
  publishTimingFacts(docId, null);

  let scans = 0;
  const pmDoc = {
    descendants(
      visit: (node: {
        type: { name: string };
        attrs: Record<string, unknown>;
        textContent: string;
      }) => boolean,
    ) {
      scans += 1;
      visit({
        type: { name: "block" },
        attrs: { id: "b1", type: "bracket" },
        textContent: "[VT T=2:7]",
      });
    },
  };
  const editor = {
    docId,
    doc: createDoc(),
    view: { state: { doc: pmDoc } },
    scaffold: null,
    presence: {} as LiveEditor["presence"],
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  } as unknown as LiveEditor;

  const stopFirst = registerLiveEditor(editor);
  expect(bracketTimeCheck.find(docId).length).toBe(1);
  expect(bracketTimeCheck.find(docId).length).toBe(1);
  expect(scans).toBe(1);

  stopFirst();
  const stopSecond = registerLiveEditor(editor);
  cleanups.push(stopSecond);
  expect(bracketTimeCheck.find(docId).length).toBe(1);
  expect(scans).toBe(2);
});

test("timing editor plugin refreshes decorations when a cold Podcast kind resolves", () => {
  const docId = "cold-podcast-kind";
  const { services, kindSlot } = makeVarietyServices({ docId, kind: null });
  const dispatched: { key: unknown; value: unknown }[][] = [];
  const fakeView = {
    isDestroyed: false,
    state: {
      get tr() {
        const entries: { key: unknown; value: unknown }[] = [];
        const tr = {
          setMeta(key: unknown, value: unknown) {
            entries.push({ key, value });
            return tr;
          },
          entries,
        };
        return tr;
      },
    },
    dispatch(tr: { entries: { key: unknown; value: unknown }[] }) {
      dispatched.push(tr.entries);
    },
  };
  const editor = {
    docId,
    doc: createDoc(),
    view: fakeView,
    scaffold: null,
    presence: {} as LiveEditor["presence"],
    editable: true,
    pagination: () => null,
    zoom: () => 1,
    frontPages: () => null,
  } as unknown as LiveEditor;

  timingEditorPlugin({
    docId,
    services,
    frames: { request: () => () => {} },
  } as unknown as Parameters<typeof timingEditorPlugin>[0]);

  const stopEditor = registerLiveEditor(editor);
  cleanups.push(stopEditor);
  expect(dispatched).toEqual([]);

  kindSlot.set("podcast");
  expect(
    dispatched.map((entries) => entries.map((entry) => entry.value)),
  ).toEqual([
    [false, false],
    [true, false],
  ]);

  dispatched.length = 0;
  kindSlot.set("show");
  expect(
    dispatched.map((entries) => entries.map((entry) => entry.value)),
  ).toEqual([
    [false, false],
    [true, false],
  ]);

  dispatched.length = 0;
  kindSlot.set("film");
  expect(dispatched).toEqual([]);

  stopEditor();
  kindSlot.set("podcast");
  expect(dispatched).toEqual([]);
});

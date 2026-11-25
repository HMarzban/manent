import { afterEach, expect, spyOn, test } from "bun:test";
import * as formats from "@manent/formats";
import { paginate, profileFor } from "@manent/pagination";
import type { Pagination } from "@manent/pagination";
import { block } from "@manent/pagination/testing";
import type { DocEvent, DocHandle } from "@manent/sync-client";
import type { DraftSendItem } from "@manent/sync-protocol";
import { createValue } from "@manent/ui";
import { registerLiveEditor } from "../src/editor-host/live-editor.ts";
import type { LiveEditor } from "../src/editor-host/live-editor.ts";
import type { HistoryRow } from "../src/history/history-rows.ts";
import { createVersionLists } from "../src/history/version-list.ts";
import {
  downloadDraftFiles,
  parseWhat,
  selectPageIndexes,
} from "../src/send-draft/draft-output.ts";
import { proposedDraftName } from "../src/send-draft/draft-state.ts";
import {
  clearSidesRange,
  setSidesRange,
  sidesPagesOf,
  sidesSelectionFor,
} from "../src/send/sides-file.tsx";
import { SYNCED_STATUS } from "./sync.fixtures.ts";

const SCREENPLAY = profileFor("screenplay");
if (SCREENPLAY === null) throw new TypeError("no screenplay profile");
const noop = (): void => {};
const restores: (() => void)[] = [];

afterEach(() => {
  for (const restore of restores.splice(0).toReversed()) restore();
});

function sampleSend(overrides: Partial<DraftSendItem> = {}): DraftSendItem {
  return {
    sendId: "send-1",
    versionId: "ver-1",
    name: "Draft 1",
    what: "whole_script",
    againstVersionId: null,
    files: ["pdf"],
    groups: [],
    recipientCount: 1,
    openedCount: 0,
    openerUserIds: [],
    openerNames: [],
    totalOpens: 0,
    hasLink: false,
    watermarked: false,
    sentByUserId: "dana",
    sentAt: 1000,
    ...overrides,
  };
}

function sampleHistoryRow(id: string, name: string): HistoryRow {
  return {
    item: {
      id,
      kind: "sent",
      name,
      createdAt: 1000,
      createdByUserId: "dana",
      position: { generation: 1, seq: 1 },
      engineVersion: 1,
      summary: null,
      onDevice: false,
    },
    day: "Today",
    time: "10:00",
    title: name,
    local: null,
  };
}

test("proposedDraftName deduplicates historyRows and sends by versionId on non-ladder scripts", () => {
  const sends = [sampleSend({ versionId: "ver-1", name: "First draft" })];
  const rows = [sampleHistoryRow("ver-1", "First draft")];
  expect(proposedDraftName(sends, rows, [])).toBe("Second draft");
});

test("parseWhat and selectPageIndexes support sides_scenes and letter-prefixed locked pages like A12A", () => {
  const parsed = parseWhat("sides_scenes", { pageCount: 10, sceneCount: 4 });
  expect(parsed.id).toBe("sides_scenes");

  const blocks = [
    block("scene_heading", "INT. HALL - DAY", { id: "h1", num: "1" }),
    block("action", "First scene action.", { id: "a1" }),
    block("page_break", "", { id: "pb1" }),
    block("scene_heading", "EXT. YARD - NIGHT", { id: "h2", num: "2" }),
    block("action", "Second scene action.", { id: "a2" }),
  ];
  const base = paginate(blocks, SCREENPLAY);
  const customPages: Pagination = {
    ...base,
    pages: [
      { ...base.pages[0]!, label: "A12A" },
      { ...base.pages[1]!, label: "15" },
    ],
  };

  expect(
    selectPageIndexes(
      "doc-1",
      customPages,
      {
        id: "pages",
        firstPage: 12,
        lastPage: 12,
        firstScene: 1,
        lastScene: 2,
      },
      null,
    ),
  ).toEqual([0]);

  setSidesRange("doc-1", "h2", "h2");
  expect(
    selectPageIndexes(
      "doc-1",
      base,
      {
        id: "sides_scenes",
        firstPage: 1,
        lastPage: 2,
        firstScene: 1,
        lastScene: 2,
      },
      null,
    ),
  ).toEqual([1]);

  clearSidesRange("doc-1");
  expect(sidesSelectionFor("doc-1", base)?.first.blockId).toBe("h1");
  expect(sidesSelectionFor("doc-1", base)?.last.blockId).toBe("h2");
  expect(sidesPagesOf(base)).toEqual([0, 1]);
});

test("downloadDraftFiles forwards liveFurniture, watermarkName for sides, sanitizes draftName, and downloads multiple files sequentially", async () => {
  const blocks = [
    block("scene_heading", "INT. HALL - DAY", { id: "h1", num: "1" }),
    block("action", "Action line.", { id: "a1" }),
  ];
  const pagination = paginate(blocks, SCREENPLAY);
  const customHeader = {
    left: { kind: "custom" as const, text: "CONFIDENTIAL" },
    center: { kind: "none" as const },
    right: { kind: "page_number" as const },
    firstPage: true,
    rule: false,
  };

  const editor: LiveEditor = {
    docId: "doc-dl",
    doc: {} as LiveEditor["doc"],
    view: {} as LiveEditor["view"],
    scaffold: null,
    presence: {
      publish: noop,
      subscribe: () => noop,
      subscribePeople: () => noop,
    },
    editable: true,
    pagination: () => pagination,
    zoom: () => 1,
    frontPages: () => null,
    furniture: () => ({ header: customHeader }),
  };
  restores.push(registerLiveEditor(editor));

  const seenPdfCalls: Parameters<typeof formats.writePdf>[1][] = [];
  const pdfSpy = spyOn(formats, "writePdf").mockImplementation(
    async (_p, options) => {
      seenPdfCalls.push(options);
      return new Uint8Array([37, 80, 68, 70, 45]);
    },
  );
  restores.push(() => pdfSpy.mockRestore());

  const prevFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) =>
    new Response(await Bun.file(String(input)).bytes())) as typeof fetch;
  restores.push(() => {
    globalThis.fetch = prevFetch;
  });

  const savedNames: string[] = [];
  const prevCreate = URL.createObjectURL;
  const prevRevoke = URL.revokeObjectURL;
  const prevDoc = globalThis.document;
  URL.createObjectURL = () => "blob:test";
  URL.revokeObjectURL = noop;
  (globalThis as { document?: unknown }).document = {
    createElement: () => ({
      href: "",
      download: "",
      click() {
        savedNames.push(this.download);
      },
    }),
  };
  restores.push(() => {
    URL.createObjectURL = prevCreate;
    URL.revokeObjectURL = prevRevoke;
    (globalThis as { document?: unknown }).document = prevDoc;
  });

  await downloadDraftFiles({
    docId: "doc-dl",
    title: "The Long Night",
    draftName: "Act 1/2: Network*",
    pagination,
    pageIndexes: [0],
    selectedFileIds: ["pdf", "sides"],
    offeredTypes: [],
    changedLines: null,
    watermarkRequired: true,
    watermarkName: "Leo Marsh",
    now: () => Date.UTC(2026, 10, 16),
  });

  expect(savedNames).toEqual([
    "The Long Night - Act 1-2- Network-.pdf",
    "The Long Night — Act 1-2- Network- — Sides 1.pdf",
  ]);
  expect(seenPdfCalls.length).toBe(2);
  expect(seenPdfCalls[0]?.header).toEqual(customHeader);
  expect(seenPdfCalls[0]?.watermark).toBe("Leo Marsh");
  expect(seenPdfCalls[1]?.watermark).toBe("Leo Marsh");
});

test("createVersionLists refreshes live when a draft_sent control arrives", async () => {
  let getCalls = 0;
  const listeners = new Set<(event: DocEvent) => void>();
  const status = createValue({ ...SYNCED_STATUS });
  const handle = {
    status,
    on(listener: (event: DocEvent) => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    deviceVersions: async () => [],
    lastServerSeq: () => 1,
    close: async () => {},
  } as unknown as DocHandle;

  const lists = createVersionLists({
    http: {
      get: async () => {
        getCalls += 1;
        return new Response(
          JSON.stringify({
            versions: [],
            next: null,
            head: { generation: 1, seq: getCalls },
            othersCanOpen: false,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
      post: async () => new Response("{}", { status: 200 }),
    },
    open: async () => handle,
    userId: "dana",
    now: () => 1000,
    opened: () => false,
  });

  const unsub = lists.rows("doc-v").subscribe(noop);
  await new Promise((r) => setTimeout(r, 10));
  expect(getCalls).toBe(1);

  for (const listener of listeners) {
    listener({
      type: "control",
      kind: "draft_sent",
      data: new Uint8Array(),
    });
  }
  await new Promise((r) => setTimeout(r, 10));
  expect(getCalls).toBe(2);
  unsub();
});

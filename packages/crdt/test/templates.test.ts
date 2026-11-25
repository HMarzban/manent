import { expect, test } from "bun:test";
import { SHOW_COLUMNS, validateBlocks } from "@manent/schema";
import type { BlockJSON, DocJSON, RundownJSON } from "@manent/schema";
import {
  PROJECT_RUNDOWN_SKELETON_KEY,
  PROJECT_SCRIPT_SKELETON_KEY,
  TEMPLATE_MAX_BLOCKS,
  TEMPLATE_MAX_BYTES,
  createDoc,
  mintRundownFromTemplate,
  mintScriptFromTemplate,
  readRundownTemplateSkeleton,
  readScriptTemplateSkeleton,
  readWorkspaceTemplate,
  readWorkspaceTemplates,
  stripRundownForTemplate,
  stripScriptForTemplate,
  writeWorkspaceTemplate,
} from "../src/index.ts";
import type { WorkspaceTemplateEntry } from "../src/index.ts";

const BASE62 = /^[0-9A-Za-z]+$/;

const SAMPLE_SCRIPT: DocJSON = {
  type: "doc",
  content: [
    {
      type: "section",
      content: [
        {
          type: "block",
          attrs: {
            id: "orig-blk-0000001",
            type: "scene_heading",
            num: "12A",
            from: "parent-blk:1",
            omitted: true,
            synopsis: "Cold open",
            writerUserId: "sam",
            suggest: "action",
            suggestId: "sug-1",
            suggestAuthorUserId: "dana",
            suggestAt: 1000,
          },
          content: [
            {
              type: "text",
              text: "INT. ",
              marks: [
                { type: "bold" },
                {
                  type: "suggest_insert",
                  attrs: { id: "s1", authorUserId: "dana", at: 1000 },
                },
              ],
            },
            {
              type: "text",
              text: "STUDIO - NIGHT",
              marks: [
                { type: "bold" },
                {
                  type: "suggest_delete",
                  attrs: { id: "s2", authorUserId: "sam", at: 1001 },
                },
              ],
            },
          ],
        },
        {
          type: "block",
          attrs: {
            id: "orig-blk-0000002",
            type: "general",
            align: "center",
            tags: ["open"],
            linkTo: { kind: "scene", blockId: "orig-blk-0000001" },
          },
          content: [{ type: "text", text: "Anchor enters." }],
        },
      ],
    },
  ],
};

const SAMPLE_RUNDOWN: RundownJSON = {
  rundown: {
    airDate: "2026-11-25",
    airAt: 1_800_000_000_000,
    windowLeadMs: 3_600_000,
    targetMs: 1_800_000,
  },
  columns: [...SHOW_COLUMNS],
  rows: [
    {
      id: "orig-row-0000002",
      order: "M",
      kind: "script",
      cells: {
        segment: {
          value: "Top Story",
          userId: "sam",
          setAt: 5000,
          previous: { value: "Old Title", userId: "dana", setAt: 4000 },
        },
        writer: {
          value: "sam",
          userId: "sam",
          setAt: 5000,
          previous: null,
        },
        dur: {
          value: 90_000,
          userId: "sam",
          setAt: 5000,
          previous: { value: 60_000, userId: "dana", setAt: 4000 },
        },
      },
      docId: "11111111-1111-7111-8111-111111111111",
      blockId: "orig-blk-0000001",
      durationMs: 85_000,
      prompter: {
        state: "on",
        versionId: "v-1",
        sentAt: 5500,
        sentByUserId: "sam",
      },
      unnumbered: false,
    },
    {
      id: "orig-row-0000001",
      order: "B",
      kind: "header",
      cells: {
        segment: {
          value: "A-BLOCK",
          userId: "sam",
          setAt: 4000,
          previous: null,
        },
      },
      docId: null,
      blockId: null,
      durationMs: null,
      prompter: null,
      unnumbered: true,
    },
  ],
};

test("stripScriptForTemplate strips IDs, provenance, suggestions and links while keeping structure and formatting", () => {
  const skeleton = stripScriptForTemplate(SAMPLE_SCRIPT);
  expect(skeleton).toEqual({
    v: 1,
    kind: "script",
    blocks: [
      {
        type: "block",
        attrs: { type: "scene_heading", synopsis: "Cold open" },
        content: [
          {
            type: "text",
            text: "INT. STUDIO - NIGHT",
            marks: [{ type: "bold" }],
          },
        ],
      },
      {
        type: "block",
        attrs: { type: "general", align: "center", tags: ["open"] },
        content: [{ type: "text", text: "Anchor enters." }],
      },
    ],
  });
  expect(readScriptTemplateSkeleton(skeleton)).toEqual(skeleton);
});

test("mintScriptFromTemplate mints fresh distinct IDs and valid schema blocks", () => {
  const skeleton = stripScriptForTemplate(SAMPLE_SCRIPT);
  let seq = 0;
  const newId = (): string => `mint-blk-${String(++seq).padStart(7, "0")}`;

  const first = mintScriptFromTemplate(skeleton, { newId });
  const second = mintScriptFromTemplate(skeleton, { newId });
  const firstBlocks = (first.content ?? []).flatMap((s) => s.content ?? []);
  const secondBlocks = (second.content ?? []).flatMap((s) => s.content ?? []);

  expect(firstBlocks.map((b) => b.attrs?.id)).toEqual([
    "mint-blk-0000001",
    "mint-blk-0000002",
  ]);
  expect(secondBlocks.map((b) => b.attrs?.id)).toEqual([
    "mint-blk-0000003",
    "mint-blk-0000004",
  ]);
  expect(validateBlocks(firstBlocks, { isIdTaken: () => false })).toEqual([]);
  expect(firstBlocks[0]!.attrs).toMatchObject({
    id: "mint-blk-0000001",
    type: "scene_heading",
    synopsis: "Cold open",
  });
  expect(firstBlocks[0]!.attrs?.num).toBeUndefined();
  expect(firstBlocks[0]!.attrs?.from).toBeUndefined();
  expect(firstBlocks[0]!.attrs?.omitted).toBeUndefined();
});

test("stripRundownForTemplate clears dates, timings, IDs, links, previous values and server-only fields", () => {
  const skeleton = stripRundownForTemplate(SAMPLE_RUNDOWN);
  expect(skeleton).toEqual({
    v: 1,
    kind: "rundown",
    rundown: {
      windowLeadMs: 3_600_000,
      targetMs: 1_800_000,
    },
    columns: [...SHOW_COLUMNS],
    rows: [
      {
        kind: "header",
        cells: { segment: "A-BLOCK" },
        unnumbered: true,
      },
      {
        kind: "script",
        cells: { segment: "Top Story", writer: "sam" },
        unnumbered: false,
      },
    ],
  });
  expect(readRundownTemplateSkeleton(skeleton)).toEqual(skeleton);
});

test("mintRundownFromTemplate mints fresh row IDs, evenly spaced base-62 order keys and clean cells", () => {
  const skeleton = stripRundownForTemplate(SAMPLE_RUNDOWN);
  let seq = 0;
  const newId = (): string => `mint-row-${String(++seq).padStart(7, "0")}`;

  const minted = mintRundownFromTemplate(skeleton, {
    newId,
    userId: "ana",
    now: () => 9_000,
  });

  expect(minted.rundown).toEqual({
    airDate: "",
    airAt: null,
    windowLeadMs: 3_600_000,
    targetMs: 1_800_000,
  });
  expect(minted.columns).toEqual([...SHOW_COLUMNS]);
  expect(minted.rows).toHaveLength(2);
  expect(minted.rows.map((r) => r.id)).toEqual([
    "mint-row-0000001",
    "mint-row-0000002",
  ]);
  for (const r of minted.rows) {
    expect(BASE62.test(r.order)).toBe(true);
    expect(r.docId).toBeNull();
    expect(r.blockId).toBeNull();
    expect(r.durationMs).toBeNull();
    expect(r.prompter).toBeNull();
    expect(r.cells.dur).toBeUndefined();
  }
  expect(minted.rows[0]!.order < minted.rows[1]!.order).toBe(true);
  expect(minted.rows[0]!.unnumbered).toBe(true);
  expect(minted.rows[1]!.cells.segment).toEqual({
    value: "Top Story",
    userId: "ana",
    setAt: 9_000,
    previous: null,
  });
});

test("workspace template helpers round-trip and enforce shape, block-count and byte bounds", () => {
  expect(PROJECT_SCRIPT_SKELETON_KEY).toBe("project.scriptSkeleton");
  expect(PROJECT_RUNDOWN_SKELETON_KEY).toBe("project.rundownSkeleton");
  expect(TEMPLATE_MAX_BYTES).toBe(128 * 1024);
  expect(TEMPLATE_MAX_BLOCKS).toBe(500);

  const doc = createDoc({ clientId: 1 });
  const entry: WorkspaceTemplateEntry = {
    id: "tpl-news-1",
    name: "Evening Bulletin",
    kind: "rundown",
    createdAt: 1000,
    createdByUserId: "sam",
    updatedAt: 1000,
    skeleton: stripRundownForTemplate(SAMPLE_RUNDOWN),
  };
  writeWorkspaceTemplate(doc, entry);
  expect(readWorkspaceTemplates(doc).get("tpl-news-1")).toEqual(entry);

  // Rejects mismatched kind, >500 blocks, >128 KB, and unstripped IDs/suggestion marks
  expect(
    readWorkspaceTemplate({
      ...entry,
      kind: "script",
    }),
  ).toBeNull();

  const tooManyBlocks: BlockJSON[] = Array.from(
    { length: TEMPLATE_MAX_BLOCKS + 1 },
    () => ({
      type: "block",
      attrs: { type: "action" },
      content: [{ type: "text", text: "x" }],
    }),
  );
  expect(
    readWorkspaceTemplate({
      ...entry,
      kind: "script",
      skeleton: { v: 1, kind: "script", blocks: tooManyBlocks },
    }),
  ).toBeNull();

  expect(
    readWorkspaceTemplate({
      ...entry,
      kind: "script",
      skeleton: {
        v: 1,
        kind: "script",
        blocks: [
          {
            type: "block",
            attrs: { type: "action" },
            content: [{ type: "text", text: "a".repeat(TEMPLATE_MAX_BYTES) }],
          },
        ],
      },
    }),
  ).toBeNull();

  expect(
    readScriptTemplateSkeleton({
      v: 1,
      kind: "script",
      blocks: [{ type: "block", attrs: { id: "leaked-id", type: "action" } }],
    }),
  ).toBeNull();

  expect(
    readScriptTemplateSkeleton({
      v: 1,
      kind: "script",
      blocks: [
        {
          type: "block",
          attrs: { type: "action" },
          content: [
            {
              type: "text",
              text: "hi",
              marks: [{ type: "suggest_insert" }],
            },
          ],
        },
      ],
    }),
  ).toBeNull();

  doc.destroy();
});

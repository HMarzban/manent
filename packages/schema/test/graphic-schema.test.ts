import { expect, test } from "bun:test";
import {
  GRAPHIC_ATTR_KEYS,
  GRAPHIC_KINDS,
  GRAPHIC_MAX_ALT_LENGTH,
  GRAPHIC_MAX_DIMENSION_PX,
  GRAPHIC_MAX_HEIGHT_LINES,
  GRAPHIC_MAX_LABEL_LENGTH,
  GRAPHIC_MIN_HEIGHT_LINES,
  canonicalBlock,
  canonicalDoc,
  formatPrompterStory,
  isBlockType,
  isGraphicAttrs,
  minSchemaVersionOf,
  parseDoc,
  prompterBlocks,
  renderedType,
  schema,
  sectionize,
  validateDoc,
} from "../src/index.ts";
import type { BlockJSON, GraphicAttrs } from "../src/index.ts";
import { ID, docWith } from "./helpers.ts";

const VALID_SHA = "a".repeat(64);

function sampleGraphic(overrides: Partial<GraphicAttrs> = {}): GraphicAttrs {
  return {
    kind: "image",
    assetId: VALID_SHA,
    heightLines: 6,
    label: "Cue 1",
    alt: "Studio skyline at dusk",
    aspectWidth: 1920,
    aspectHeight: 1080,
    ...overrides,
  };
}

test("graphic is a known block type that renders as graphic", () => {
  expect(isBlockType("graphic")).toBe(true);
  expect(renderedType("graphic")).toBe("graphic");
});

test("all four graphic kinds validate with flat seven-primitive attrs", () => {
  for (const kind of GRAPHIC_KINDS) {
    const graphic = sampleGraphic({
      kind,
      assetId: kind === "image" ? VALID_SHA : null,
      aspectWidth: kind === "image" ? 1280 : null,
      aspectHeight: kind === "image" ? 720 : null,
    });
    expect(isGraphicAttrs(graphic)).toBe(true);
    const doc = docWith(
      { id: ID, type: "graphic", graphic },
      "ALEX RIVERA — Live from Parliament Square",
    );
    expect(validateDoc(doc)).toEqual([]);
  }
});

test("malformed graphic attrs are rejected with bad_attr", () => {
  const base = sampleGraphic();
  const invalid: [label: string, value: unknown][] = [
    ["primitive instead of object", "image"],
    ["array instead of object", []],
    ["missing a required key", { ...base, alt: undefined }],
    ["extra unknown key", { ...base, extra: true }],
    ["unknown kind", { ...base, kind: "video" }],
    ["short assetId", { ...base, assetId: "abc" }],
    ["uppercase hex assetId", { ...base, assetId: "A".repeat(64) }],
    ["non-hex assetId", { ...base, assetId: "g".repeat(64) }],
    [
      "heightLines below minimum",
      { ...base, heightLines: GRAPHIC_MIN_HEIGHT_LINES - 1 },
    ],
    [
      "heightLines above maximum",
      { ...base, heightLines: GRAPHIC_MAX_HEIGHT_LINES + 1 },
    ],
    ["fractional heightLines", { ...base, heightLines: 4.5 }],
    [
      "label over 120 chars",
      { ...base, label: "x".repeat(GRAPHIC_MAX_LABEL_LENGTH + 1) },
    ],
    [
      "alt over 400 chars",
      { ...base, alt: "x".repeat(GRAPHIC_MAX_ALT_LENGTH + 1) },
    ],
    ["zero aspectWidth", { ...base, aspectWidth: 0 }],
    [
      "aspectHeight above 4096",
      { ...base, aspectHeight: GRAPHIC_MAX_DIMENSION_PX + 1 },
    ],
    ["fractional aspectWidth", { ...base, aspectWidth: 100.5 }],
    ["nested object inside field", { ...base, label: { nested: true } }],
  ];
  for (const [label, value] of invalid) {
    expect({ label, ok: isGraphicAttrs(value) }).toEqual({ label, ok: false });
    const issues = validateDoc(
      docWith({ id: ID, type: "graphic", graphic: value as never }, "Caption"),
    );
    expect({
      label,
      codes: issues.map((i) => [i.code, i.severity, i.path]),
    }).toEqual({
      label,
      codes: [["bad_attr", "reject", "content[0].content[0].attrs.graphic"]],
    });
  }
});

test("canonicalBlock orders attrs.graphic keys deterministically and omits graphic when null", () => {
  const reversed = {
    aspectHeight: 720,
    aspectWidth: 1280,
    alt: "Desk graphic",
    label: "GFX 1",
    heightLines: 8,
    assetId: VALID_SHA,
    kind: "lower_third",
  } as unknown as GraphicAttrs;
  const blockA = canonicalBlock({
    type: "block",
    attrs: { id: ID, type: "graphic", graphic: reversed },
    content: [{ type: "text", text: "Headline" }],
  });
  const blockB = canonicalBlock({
    type: "block",
    attrs: { id: ID, type: "graphic", graphic: sampleGraphic(reversed) },
    content: [{ type: "text", text: "Headline" }],
  });
  expect(Object.keys(blockA.attrs!.graphic as object)).toEqual([
    ...GRAPHIC_ATTR_KEYS,
  ]);
  expect(JSON.stringify(blockA)).toBe(JSON.stringify(blockB));
  expect(
    JSON.stringify(canonicalDoc(docWith({ id: ID, type: "action" }, "x"))),
  ).not.toContain('"graphic"');
});

test("graphic block toDOM emits class, data-type and graphic data attributes with spellcheck enabled", () => {
  const doc = parseDoc(
    docWith(
      {
        id: ID,
        type: "graphic",
        graphic: sampleGraphic({ kind: "ots", heightLines: 10 }),
      },
      "Breaking news",
    ),
  );
  const node = doc.firstChild!.firstChild!;
  expect(schema.nodes.block.spec.toDOM!(node)).toEqual([
    "p",
    {
      class: "el el-graphic",
      "data-type": "graphic",
      "data-id": ID,
      "data-graphic-kind": "ots",
      "data-graphic-lines": "10",
    },
    0,
  ]);
});

test("minSchemaVersionOf returns 1 for plain scripts, 2 for tags/linkTo, and 3 only when a graphic is present", () => {
  const v1Doc = docWith({ id: ID, type: "action" }, "Rain falls.");
  const v2TagsDoc = docWith(
    { id: ID, type: "general", tags: ["act-one"] },
    "Beat",
  );
  const v2LinkDoc = docWith(
    {
      id: ID,
      type: "general",
      linkTo: { kind: "scene", blockId: "b000000000000009" },
    },
    "Beat",
  );
  const v3TypeDoc = docWith({ id: ID, type: "graphic" }, "Caption");
  const v3AttrsDoc = docWith(
    { id: ID, type: "action", graphic: sampleGraphic() },
    "Caption",
  );

  expect(minSchemaVersionOf(v1Doc)).toBe(1);
  expect(minSchemaVersionOf(v2TagsDoc)).toBe(2);
  expect(minSchemaVersionOf(v2LinkDoc)).toBe(2);
  expect(minSchemaVersionOf(v3TypeDoc)).toBe(3);
  expect(minSchemaVersionOf(v3AttrsDoc)).toBe(3);

  // Touched block arrays (as passed by server write-path schemaFloor)
  expect(minSchemaVersionOf([])).toBe(1);
  expect(minSchemaVersionOf([v1Doc.content![0]!.content![0]!])).toBe(1);
  expect(minSchemaVersionOf([v2TagsDoc.content![0]!.content![0]!])).toBe(2);
  expect(
    minSchemaVersionOf([
      v1Doc.content![0]!.content![0]!,
      v3TypeDoc.content![0]!.content![0]!,
    ]),
  ).toBe(3);
});

test("prompterBlocks and formatPrompterStory exclude graphic blocks completely", () => {
  const blocks: BlockJSON[] = [
    {
      type: "block",
      attrs: {
        id: "b000000000000001",
        type: "graphic",
        graphic: sampleGraphic({ kind: "lower_third", assetId: null }),
      },
      content: [{ type: "text", text: "DANA CHEN — Studio Anchor" }],
    },
    {
      type: "block",
      attrs: { id: "b000000000000002", type: "character" },
      content: [{ type: "text", text: "Dana" }],
    },
    {
      type: "block",
      attrs: { id: "b000000000000003", type: "dialogue" },
      content: [{ type: "text", text: "Good evening from the studio." }],
    },
    {
      type: "block",
      attrs: {
        id: "b000000000000004",
        type: "graphic",
        graphic: sampleGraphic({ kind: "image" }),
      },
      content: [{ type: "text", text: "Skyline still frame" }],
    },
  ];
  const shown = prompterBlocks(blocks);
  expect(shown).toEqual([
    {
      type: "block",
      attrs: { id: "b000000000000002", type: "character", dual: null },
      content: [{ type: "text", text: "Dana" }],
    },
    {
      type: "block",
      attrs: { id: "b000000000000003", type: "dialogue", dual: null },
      content: [{ type: "text", text: "Good evening from the studio." }],
    },
  ]);
  expect(formatPrompterStory(shown)).toBe(
    "DANA\nGood evening from the studio.",
  );
  // Document with graphics + spoken blocks still validates cleanly
  expect(validateDoc(sectionize(blocks))).toEqual([]);
});

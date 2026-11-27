import { expect, test } from "bun:test";
import { FORMATS } from "@manent/schema";
import { parseSeedText } from "../src/content/markup.ts";
import {
  HARBOUR_TAPE_EP1,
  HARBOUR_TAPE_EP1_PRODUCER_NOTE,
  HARBOUR_TAPE_EP2,
  PIER_FOUR_FRONT,
  PIER_FOUR_POLISHED_LINE,
  PIER_FOUR_REHEARSAL,
  SALT_ALMANAC_FIRST_DRAFT,
  SALT_ALMANAC_REVISED_OPENING,
} from "../src/content/medium/writers-room-showcase.ts";
import {
  PLATFORM_TWO_101_RUNTHROUGH_LINE,
  PLATFORM_TWO_101_TABLE,
  PLATFORM_TWO_102,
  PLATFORM_TWO_103_OUTLINE,
  PLATFORM_TWO_EARLY_PITCH,
  TIN_BOAT_101_PICKUP_REWRITES,
  TIN_BOAT_101_RECORD,
  TIN_BOAT_102,
} from "../src/content/medium/writers-room-series.ts";
import { SEED_DOCS, SEED_PROJECTS } from "../src/index.ts";
import {
  makeStormCardPng,
  makeStoryboardPng,
  makeTidePlatePng,
} from "../src/seed/png.ts";

const BANNED_VISIBLE_WORDS = /\b(generation|rebuild|conflict|error|failed)\b/i;

const ALL_PROJECT_KINDS = [
  "book",
  "film",
  "game",
  "news",
  "podcast",
  "series",
  "show",
  "stage_play",
] as const;

test("Writers' room (medium) foreground catalogue covers all eight project kinds and all eight formats", () => {
  const mediumProjects = SEED_PROJECTS.filter(
    (p) => p.workspaceId === "medium",
  );
  const kinds = [...new Set(mediumProjects.map((p) => p.kind))].toSorted();
  expect(kinds).toEqual([...ALL_PROJECT_KINDS]);

  const mediumKeys = new Set(mediumProjects.map((p) => p.key));
  const mediumDocs = SEED_DOCS.filter((d) => mediumKeys.has(d.projectKey));
  const formats = [...new Set(mediumDocs.map((d) => d.format))].toSorted();
  expect(formats).toEqual([...FORMATS].toSorted());
});

test("Lanternfield Studios (heavy) catalogue also covers all eight project kinds and all eight formats", () => {
  const heavyProjects = SEED_PROJECTS.filter((p) => p.workspaceId === "heavy");
  const kinds = [...new Set(heavyProjects.map((p) => p.kind))].toSorted();
  expect(kinds).toEqual([...ALL_PROJECT_KINDS]);

  const heavyKeys = new Set(heavyProjects.map((p) => p.key));
  const heavyDocs = SEED_DOCS.filter((d) => heavyKeys.has(d.projectKey));
  const formats = [...new Set(heavyDocs.map((d) => d.format))].toSorted();
  expect(formats).toEqual([...FORMATS].toSorted());
});

test("Writers' room showcase passages parse cleanly and contain no prohibited visible words", () => {
  const passages = [
    SALT_ALMANAC_FIRST_DRAFT,
    PIER_FOUR_REHEARSAL,
    PLATFORM_TWO_101_TABLE,
    PLATFORM_TWO_102,
    PLATFORM_TWO_103_OUTLINE,
    PLATFORM_TWO_EARLY_PITCH,
    TIN_BOAT_101_RECORD,
    TIN_BOAT_102,
    HARBOUR_TAPE_EP1,
    HARBOUR_TAPE_EP2,
  ];
  for (const source of passages) {
    const parsed = parseSeedText(source);
    expect(parsed.blocks.length).toBeGreaterThanOrEqual(3);
    for (const block of parsed.blocks)
      expect(block.text).not.toMatch(BANNED_VISIBLE_WORDS);
  }
  for (const frontPage of PIER_FOUR_FRONT.trim().split("\n\n")) {
    const parsed = parseSeedText(frontPage);
    expect(parsed.blocks.length).toBeGreaterThanOrEqual(2);
    for (const block of parsed.blocks)
      expect(block.text).not.toMatch(BANNED_VISIBLE_WORDS);
  }
  const extraLines = [
    SALT_ALMANAC_REVISED_OPENING,
    PIER_FOUR_POLISHED_LINE,
    PLATFORM_TWO_101_RUNTHROUGH_LINE,
    HARBOUR_TAPE_EP1_PRODUCER_NOTE,
    ...Object.values(TIN_BOAT_101_PICKUP_REWRITES),
  ];
  for (const line of extraLines) expect(line).not.toMatch(BANNED_VISIBLE_WORDS);
});

test("deterministic seed PNG builders produce valid 160x90 RGB PNG files", () => {
  const builders = [makeTidePlatePng, makeStoryboardPng, makeStormCardPng];
  const hashes = new Set<string>();
  for (const build of builders) {
    const png = build();
    // PNG magic signature
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    // IHDR chunk (length 13, width 160, height 90, 8-bit RGB)
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(8)).toBe(13);
    expect(String.fromCharCode(...png.subarray(12, 16))).toBe("IHDR");
    expect(view.getUint32(16)).toBe(160);
    expect(view.getUint32(20)).toBe(90);
    expect(png[24]).toBe(8);
    expect(png[25]).toBe(2);
    // Ends with IEND chunk
    expect(
      String.fromCharCode(
        ...png.subarray(png.byteLength - 8, png.byteLength - 4),
      ),
    ).toBe("IEND");
    // Deterministic repeat
    expect(build()).toEqual(png);
    hashes.add(Buffer.from(png).toString("base64"));
  }
  expect(hashes.size).toBe(3);
});

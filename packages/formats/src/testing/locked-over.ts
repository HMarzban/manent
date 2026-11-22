// A locked Final Draft file whose second page holds more than fits, for the tests of imported page starts.
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  UNITS_PER_LINE,
  engineFor,
  profileFromSettings,
  toLockTable,
} from "@manent/pagination";
import type { LockAnchorRecord } from "@manent/pagination";
import { blocksOf, canonicalBlock } from "@manent/schema";
import type { BlockJSON } from "@manent/schema";
import { writeFdx } from "../fdx/write.ts";
import { counter } from "./fixtures.ts";

// 59 characters: one line of action, and n of them joined by spaces n lines
const ROW = "The beam crosses the water and the gulls lift off the rocks";

function lockedScript(rows: number, lines: number): BlockJSON[] {
  const ids = counter();
  const block = (type: string, text: string): BlockJSON =>
    canonicalBlock({
      type: "block",
      attrs: { id: ids(), type },
      content: [{ type: "text", text }],
    });
  const over = Array.from({ length: lines }, () => ROW).join(" ");
  return [
    block("scene_heading", "INT. LAMP ROOM - NIGHT"),
    block("action", "Dana Reyes trims the wick."),
    block("scene_heading", "EXT. GALLERY - NIGHT"),
    ...Array.from({ length: rows }, (_, i) =>
      block("action", `Gull ${i + 1} turns on the wind.`),
    ),
    ...(lines === 0 ? [] : [block("action", over)]),
    block("scene_heading", "INT. STAIRS - NIGHT"),
    block("action", "Sam Okafor climbs."),
  ];
}

function anchorAt(block: BlockJSON, label: string): LockAnchorRecord {
  return {
    level: 1,
    order: Number(label),
    label,
    blockId: block.attrs?.id ?? "",
    offset: 0,
    quote: "",
    fallbackIds: [],
    source: "import",
  };
}

/**
 * The file writeFdx writes for a three-page script of The Lamp Room locked at pages 1, 2 and 3, whose page 2
 * holds `lines` lines more than fits under the default US Letter screenplay profile of ENGINE_VERSION's
 * engine: paged by that engine over those starts, page 2's overflow page holds exactly `lines` lines. Throws
 * a RangeError when the engine does not page it so (`lines` more than one page holds, or not a count).
 */
export function lockedOver(lines: number): Uint8Array {
  const engine = engineFor(ENGINE_VERSION);
  const profile =
    engine === null
      ? null
      : profileFromSettings(engine, DEFAULT_LAYOUT_SETTINGS);
  if (engine === null || profile === null)
    throw new RangeError(`no screenplay profile for engine ${ENGINE_VERSION}`);
  // page 2's heading, then one-line actions, each a blank line and its line, until less than two lines are left
  const rows = Math.floor((profile.linesPerPage - 1) / 2);
  const blocks = lockedScript(rows, lines);
  const anchors = [
    anchorAt(blocks[0]!, "1"),
    anchorAt(blocks[2]!, "2"),
    anchorAt(blocks.at(-2)!, "3"),
  ];
  const pages = engine.paginate(
    engine.toLayoutBlocks(
      blocksOf({
        type: "doc",
        content: [{ type: "section", content: blocks }],
      }),
    ),
    profile,
    toLockTable(anchors),
  ).pages;
  const overflow = pages.filter((page) => !page.locked);
  const held = overflow.map((page) => page.usedUnits - page.topUnits);
  const expected = lines === 0 ? [] : [lines * UNITS_PER_LINE];
  if (held.length !== expected.length || held[0] !== expected[0])
    throw new RangeError(
      `page 2 can hold 0 to ${profile.linesPerPage} lines more than fits, not ${lines}`,
    );
  const text = writeFdx({
    title: "The Lamp Room",
    format: "screenplay",
    blocks,
    notes: [],
    record: null,
    production: {
      anchors,
      numbers: new Map(),
      numbering: "suffix",
      sources: [],
    },
  }).text;
  return new TextEncoder().encode(text);
}

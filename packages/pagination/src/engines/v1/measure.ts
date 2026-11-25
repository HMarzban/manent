// How a block is laid out and how many lines it takes, from its own values and the profile.
import type { LayoutBlock } from "../../layout-block.ts";
import type { ElementSpec, PageProfile } from "../../page-profile.ts";
import type { BlockMetrics } from "../../pages.ts";
import { castListOf, isSceneBoundary, speakerName } from "./cast.ts";
import { clusterCells, upperCase } from "./cells.ts";
import { isInRun } from "./dual.ts";
import { measureGraphic } from "./graphics.ts";
import { keyAt } from "./keep.ts";
import { specKey } from "./profile.ts";
import { wrap } from "./wrap.ts";

/** The most blank lines a block's own space before may ask for. */
const MAX_SPACE_BEFORE = 10;

function isDualKey(
  profile: PageProfile,
  key: string,
): key is keyof PageProfile["dual"] {
  return Object.hasOwn(profile.dual, key);
}

/** A stored override, floored; the default when it is not a finite number. */
function overrideOr(value: number | null, fallback: number): number {
  return value !== null && Number.isFinite(value)
    ? Math.floor(value)
    : fallback;
}

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value));

/** The profile's spec with the dual column and the block's overrides applied, clamped to the column. */
export function resolveSpec(
  profile: PageProfile,
  block: LayoutBlock,
): ElementSpec {
  const key = specKey(block.type, block.kind);
  const base = profile.elements[key];
  const dual =
    block.dual !== null && isDualKey(profile, key) ? profile.dual[key] : null;
  const column = dual ?? base;
  const shift =
    dual !== null && block.dual === "right" ? profile.dualRightOffset : 0;
  const indent = clamp(
    overrideOr(block.indent, column.indent + shift),
    0,
    profile.columnCells - 1,
  );
  const width = clamp(
    overrideOr(block.width, column.width),
    1,
    profile.columnCells - indent,
  );
  const spaceBefore = clamp(
    overrideOr(block.spaceBefore, base.spaceBefore),
    0,
    MAX_SPACE_BEFORE,
  );
  const align = block.align ?? base.align;
  if (
    indent === base.indent &&
    width === base.width &&
    spaceBefore === base.spaceBefore &&
    align === base.align
  )
    return base;
  return Object.freeze({ ...base, indent, width, spaceBefore, align });
}

/**
 * The block's lines as `wrap` breaks them, with `suffix` after its text and its enclosure around it;
 * a line starts at each `forced` offset. Nothing is cached.
 */
export function measure(
  block: LayoutBlock,
  profile: PageProfile,
  context: { suffix?: string; forced?: readonly number[] } = {},
): BlockMetrics {
  const spec = resolveSpec(profile, block);
  if (!spec.printed)
    return Object.freeze({ lines: 0, starts: new Int32Array(0), spec });
  if (block.type === "graphic")
    return measureGraphic(block, spec, context.forced ?? []);
  const [open, close] = spec.enclosure ?? ["", ""];
  const starts = wrap(block.text + (context.suffix ?? "") + close, spec.width, {
    firstLineIndent:
      spec.firstLineIndent + clusterCells(open, 0, open.length, false),
    capitalized: spec.capitalized,
    styles: block.styles,
    forced: context.forced ?? [],
  });
  return Object.freeze({ lines: starts.length, starts, spec });
}

/**
 * Cue i is shown with the same-speaker suffix: the nearest earlier cue in its scene has its name, and
 * neither the profile, the cue's `noContd` nor its own text already ending in the suffix says no.
 * A cue in a dual run neither takes the suffix nor counts as the earlier cue.
 */
export function hasSpeakerSuffix(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): boolean {
  const { furniture } = profile;
  const cue = blocks[i]!;
  if (
    !furniture.speakerContinued ||
    cue.noContd ||
    keyAt(blocks, i) !== "character" ||
    upperCase(cue.text).trimEnd().endsWith(furniture.contdText.trim()) ||
    isInRun(blocks, profile, i)
  )
    return false;
  const name = speakerName(cue.text);
  if (name === "") return false;
  for (let j = i - 1; j >= 0; j--) {
    const key = keyAt(blocks, j);
    if (isSceneBoundary(key)) return false;
    if (key === "character" && !isInRun(blocks, profile, j))
      return speakerName(blocks[j]!.text) === name;
  }
  return false;
}

/**
 * What block i is drawn with after its text, and the offsets where that starts a line: a cue's same-speaker
 * suffix, or a scene heading's cast list on lines of its own.
 */
export function suffixOf(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
): { readonly text: string; readonly forced: readonly number[] } {
  if (hasSpeakerSuffix(blocks, profile, i))
    return { text: profile.furniture.contdText, forced: [] };
  const cast = castListOf(blocks, profile, i);
  return cast === null
    ? { text: "", forced: [] }
    : { text: cast, forced: [blocks[i]!.text.length] };
}

/** Block i measured as the page shows it: with its suffix, and a line starting at each forced offset and each the suffix asks for. */
export function measureAt(
  blocks: readonly LayoutBlock[],
  profile: PageProfile,
  i: number,
  forced: readonly number[],
): BlockMetrics {
  const suffix = suffixOf(blocks, profile, i);
  return measure(blocks[i]!, profile, {
    suffix: suffix.text,
    forced:
      suffix.forced.length === 0
        ? forced
        : [...new Set([...forced, ...suffix.forced])].toSorted((a, b) => a - b),
  });
}

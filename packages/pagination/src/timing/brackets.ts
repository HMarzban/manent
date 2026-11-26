// The `T=` time forms in a bracket's text: `T=m:ss` or `T=mm:ss`, the first well-formed one per bracket,
// plus structured cue rows for inline `"graphic"` blocks.
import type { GraphicAttrs, GraphicKind } from "@manent/schema";

export const BRACKET_TIME_CODES = ["malformed", "repeated"] as const;
export type BracketTimeCode = (typeof BRACKET_TIME_CODES)[number];
/** One `T=` form; `from` and `to` are UTF-16 offsets of the form in the block's text, `to` exclusive. */
export type BracketTime =
  | { ok: true; ms: number; from: number; to: number }
  | { ok: false; code: BracketTimeCode; from: number; to: number };

const WELL_FORMED = /^T=(\d{1,2}):([0-5]\d)$/;

const isFormStart = (text: string, at: number): boolean =>
  at === 0 || text[at - 1] === " " || text[at - 1] === "[";

function formEnd(text: string, from: number): number {
  for (let at = from; at < text.length; at += 1)
    if (text[at] === " " || text[at] === "]") return at;
  return text.length;
}

/**
 * Every `T=` form in a bracket's text, in order. A form starts at `T=` at the start of the text or
 * after a space or `[`, and runs to the next space, `]` or the end. The first well-formed form is
 * `ok`; a form before it is `malformed`, and every form after it is `repeated`.
 */
export function findBracketTimes(text: string): BracketTime[] {
  const times: BracketTime[] = [];
  let counted = false;
  for (let from = text.indexOf("T="); from !== -1;) {
    if (!isFormStart(text, from)) {
      from = text.indexOf("T=", from + 1);
      continue;
    }
    const to = formEnd(text, from + 2);
    const form = WELL_FORMED.exec(text.slice(from, to));
    if (counted) times.push({ ok: false, code: "repeated", from, to });
    else if (form === null)
      times.push({ ok: false, code: "malformed", from, to });
    else {
      counted = true;
      times.push({
        ok: true,
        ms: (Number(form[1]) * 60 + Number(form[2])) * 1000,
        from,
        to,
      });
    }
    from = text.indexOf("T=", to);
  }
  return times;
}

export type GraphicCueTag = "IMAGE" | "LOWER THIRD" | "OTS" | "FULL SCREEN";

const GRAPHIC_CUE_TAGS: Readonly<Record<GraphicKind, GraphicCueTag>> =
  Object.freeze({
    image: "IMAGE",
    lower_third: "LOWER THIRD",
    ots: "OTS",
    full_screen: "FULL SCREEN",
  });

/** Short uppercase broadcast badge for a graphic kind. */
export function graphicCueTag(kind: GraphicKind): GraphicCueTag {
  return GRAPHIC_CUE_TAGS[kind];
}

export interface GraphicCueInput {
  readonly id: string;
  readonly type: string;
  readonly text: string;
  readonly graphic?: GraphicAttrs | null;
  readonly omitted?: boolean;
}

/** Structured cue row emitted for a `"graphic"` block in Brackets / cues lists (always 0 ms spoken duration). */
export interface GraphicCueRow {
  readonly blockId: string;
  readonly kind: GraphicKind;
  readonly tag: GraphicCueTag;
  readonly label: string;
  readonly caption: string;
  /** Formatted cue line: `[LOWER THIRD] Cue 1 — Caption` (or `[IMAGE] Caption` etc.). */
  readonly text: string;
  readonly durationMs: 0;
}

/** Formats a `"graphic"` block as a structured Brackets cue row; null for non-graphic or omitted blocks. */
export function formatGraphicCue(block: GraphicCueInput): GraphicCueRow | null {
  if (block.type !== "graphic" || block.omitted === true) return null;
  const kind: GraphicKind = block.graphic?.kind ?? "image";
  const tag = graphicCueTag(kind);
  const label = (block.graphic?.label ?? "").trim();
  const caption = block.text.trim();
  const detail =
    label !== "" && caption !== ""
      ? `${label} — ${caption}`
      : label !== ""
        ? label
        : caption;
  const text = detail === "" ? `[${tag}]` : `[${tag}] ${detail}`;
  return {
    blockId: block.id,
    kind,
    tag,
    label,
    caption,
    text,
    durationMs: 0,
  };
}

/** Plain-text bracketed cue fallback for text-only script exports (FDX / Fountain). */
export function formatGraphicExportCue(
  graphic: GraphicAttrs | null | undefined,
  captionText: string,
): string {
  const kind: GraphicKind = graphic?.kind ?? "image";
  const tag = graphicCueTag(kind);
  const label = (graphic?.label ?? "").trim();
  const caption = captionText.trim();
  const detail =
    label !== "" && caption !== ""
      ? `${label} — ${caption}`
      : label !== ""
        ? label
        : caption !== ""
          ? caption
          : tag;
  return `[GRAPHIC: ${detail}]`;
}

/** All non-omitted `"graphic"` blocks in document order as structured cue rows. */
export function graphicCueRows(
  blocks: readonly GraphicCueInput[],
): GraphicCueRow[] {
  const rows: GraphicCueRow[] = [];
  for (const block of blocks) {
    const row = formatGraphicCue(block);
    if (row !== null) rows.push(row);
  }
  return rows;
}

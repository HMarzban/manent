// Per-block and per-section timing summaries, and combining sections into script slugs and unread forms.
import { timeBlock } from "@manent/pagination";
import type { BracketTime, SlugTime, TimeTotal } from "@manent/pagination";
import type { Node } from "prosemirror-model";
import type { UnreadBracketTime } from "./decorations.ts";

/** One unread `T=` form in a bracket, with its block and nearest slug before it. */
export interface TimingUnread {
  readonly blockId: string;
  readonly slugId: string | null;
  readonly time: UnreadBracketTime;
}

export interface BlockTiming {
  readonly node: Node;
  readonly id: string;
  readonly type: string;
  readonly noTiming: boolean;
  readonly dialogueChars: number;
  readonly bracketMs: number;
  readonly brackets: readonly BracketTime[];
  readonly unread: readonly UnreadBracketTime[];
}

export interface SectionUnread {
  readonly blockId: string;
  /** Nearest slug inside this section before the block, or null if before this section's first slug. */
  readonly localSlugId: string | null;
  readonly time: UnreadBracketTime;
}

export interface SectionTiming {
  readonly node: Node;
  readonly blocks: readonly BlockTiming[];
  readonly total: TimeTotal;
  readonly hasLeading: boolean;
  readonly leading: TimeTotal;
  readonly slugs: readonly SlugTime[];
  readonly unread: readonly SectionUnread[];
}

export const NOTHING: TimeTotal = Object.freeze({
  dialogueChars: 0,
  bracketMs: 0,
});

const isUnread = (time: BracketTime): time is UnreadBracketTime => !time.ok;

export const addTotal = (a: TimeTotal, b: TimeTotal): TimeTotal => ({
  dialogueChars: a.dialogueChars + b.dialogueChars,
  bracketMs: a.bracketMs + b.bracketMs,
});

export const isSameTotal = (a: TimeTotal, b: TimeTotal): boolean =>
  a.dialogueChars === b.dialogueChars && a.bracketMs === b.bracketMs;

export function computeBlock(node: Node): BlockTiming {
  const id = typeof node.attrs["id"] === "string" ? node.attrs["id"] : "";
  const type =
    typeof node.attrs["type"] === "string" ? node.attrs["type"] : "general";
  const noTiming = node.attrs["noTiming"] === true;
  const timed = timeBlock({ id, type, text: node.textContent, noTiming });
  return {
    node,
    id,
    type,
    noTiming,
    dialogueChars: timed.dialogueChars,
    bracketMs: timed.bracketMs,
    brackets: timed.brackets,
    unread: timed.brackets.filter(isUnread),
  };
}

export function summarizeSection(
  node: Node,
  blocks: readonly BlockTiming[],
): SectionTiming {
  let dialogueChars = 0;
  let bracketMs = 0;
  let hasLeading = false;
  let leadingChars = 0;
  let leadingMs = 0;
  let currentSlugId: string | null = null;
  const slugs: SlugTime[] = [];
  const unread: SectionUnread[] = [];
  for (const block of blocks) {
    dialogueChars += block.dialogueChars;
    bracketMs += block.bracketMs;
    if (block.type === "slug") {
      currentSlugId = block.id;
      slugs.push({
        slugId: block.id,
        total: {
          dialogueChars: block.dialogueChars,
          bracketMs: block.bracketMs,
        },
      });
    } else if (slugs.length === 0) {
      hasLeading = true;
      leadingChars += block.dialogueChars;
      leadingMs += block.bracketMs;
    } else {
      const last = slugs.length - 1;
      slugs[last] = {
        slugId: slugs[last]!.slugId,
        total: addTotal(slugs[last]!.total, block),
      };
    }
    for (const time of block.unread)
      unread.push({ blockId: block.id, localSlugId: currentSlugId, time });
  }
  return {
    node,
    blocks,
    total: { dialogueChars, bracketMs },
    hasLeading,
    leading: { dialogueChars: leadingChars, bracketMs: leadingMs },
    slugs,
    unread,
  };
}

export function isSameSectionSummary(
  a: SectionTiming,
  b: SectionTiming,
): boolean {
  if (
    !isSameTotal(a.total, b.total) ||
    a.hasLeading !== b.hasLeading ||
    !isSameTotal(a.leading, b.leading) ||
    a.slugs.length !== b.slugs.length ||
    a.unread.length !== b.unread.length
  )
    return false;
  const sameSlugs = a.slugs.every(
    (slug, i) =>
      slug.slugId === b.slugs[i]!.slugId &&
      isSameTotal(slug.total, b.slugs[i]!.total),
  );
  if (!sameSlugs) return false;
  return a.unread.every((entry, i) => {
    const other = b.unread[i]!;
    return (
      entry.blockId === other.blockId &&
      entry.localSlugId === other.localSlugId &&
      entry.time.code === other.time.code &&
      entry.time.from === other.time.from &&
      entry.time.to === other.time.to
    );
  });
}

/** Combines cached per-section summaries into the document's slug totals and unread bracket list. */
export function combineSections(sections: readonly SectionTiming[]): {
  readonly slugs: readonly SlugTime[];
  readonly unread: readonly TimingUnread[];
} {
  const slugs: SlugTime[] = [];
  const unread: TimingUnread[] = [];
  let currentSlugId: string | null = null;
  for (const section of sections) {
    if (section.hasLeading) {
      if (slugs.length === 0)
        slugs.push({ slugId: null, total: section.leading });
      else {
        const last = slugs.length - 1;
        slugs[last] = {
          slugId: slugs[last]!.slugId,
          total: addTotal(slugs[last]!.total, section.leading),
        };
      }
    }
    for (const entry of section.unread)
      unread.push({
        blockId: entry.blockId,
        slugId: entry.localSlugId ?? currentSlugId,
        time: entry.time,
      });
    for (const slug of section.slugs) {
      slugs.push(slug);
      currentSlugId = slug.slugId;
    }
  }
  return { slugs, unread };
}

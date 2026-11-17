// The repairs every client may make on its own, and cutting blocks into sections.
import { DEFAULT_BLOCK_ATTRS } from "./attrs.ts";
import type { IdSource } from "./identity.ts";
import type {
  BlockJSON,
  DocJSON,
  MarkJSON,
  SectionJSON,
  TextJSON,
} from "./json.ts";
import { isSafeHref } from "./marks.ts";
import { SECTION_TARGET_BLOCKS } from "./schema.ts";

const isUnsafeLink = (mark: MarkJSON) =>
  mark.type === "link" &&
  !(typeof mark.attrs?.href === "string" && isSafeHref(mark.attrs.href));

function withoutUnsafeLinks(text: TextJSON): TextJSON {
  return text.marks === undefined
    ? text
    : { ...text, marks: text.marks.filter((mark) => !isUnsafeLink(mark)) };
}

/**
 * Exactly three repairs: empty sections are dropped; an empty doc gets one
 * section with one empty action block, its ID from `ids`; link marks that
 * fail isSafeHref are removed, keeping the text and its other marks. Nothing
 * else changes: no other ID is assigned and no default is filled.
 */
export function normalizeDoc(json: DocJSON, ids: IdSource): DocJSON {
  const sections = (json.content ?? [])
    .filter((section) => (section.content ?? []).length > 0)
    .map((section) => ({
      ...section,
      content: section.content!.map((block): BlockJSON =>
        block.content === undefined
          ? block
          : { ...block, content: block.content.map(withoutUnsafeLinks) },
      ),
    }));
  if (sections.length > 0) return { ...json, content: sections };
  return {
    ...json,
    content: [
      {
        type: "section",
        content: [
          { type: "block", attrs: { ...DEFAULT_BLOCK_ATTRS, id: ids() } },
        ],
      },
    ],
  };
}

/** A doc of even sections of at most `target` blocks each, in order. */
export function sectionize(
  blocks: readonly BlockJSON[],
  target: number = SECTION_TARGET_BLOCKS,
): DocJSON {
  if (!Number.isInteger(target) || target < 1)
    throw new RangeError(
      `a section target must be a positive integer, not ${target}`,
    );
  const count = Math.ceil(blocks.length / target);
  const content: SectionJSON[] = [];
  let start = 0;
  for (let i = 0; i < count; i++) {
    const size =
      Math.floor(blocks.length / count) + (i < blocks.length % count ? 1 : 0);
    content.push({
      type: "section",
      content: blocks.slice(start, start + size),
    });
    start += size;
  }
  return { type: "doc", content };
}

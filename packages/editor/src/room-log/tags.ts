// Room log tags and block-level helpers: parsing /tag prefixes, toggling tags and reading/writing linkTo.
import { schema } from "@manent/schema";
import type { BlockAttrs } from "@manent/schema";
import type { Node } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/** The closed list of tags a room log line may carry. */
export const ROOM_LOG_TAGS = [
  "landed",
  "showrunner",
  "joke",
  "future",
] as const;

export type RoomLogTag = (typeof ROOM_LOG_TAGS)[number];

/** A link from a room log line to an episode script's scene heading or outline beat. */
export type RoomLogLink = NonNullable<BlockAttrs["linkTo"]>;

const isLinkKind = (value: unknown): value is RoomLogLink["kind"] =>
  value === "beat" || value === "scene";

/** What the interface needs to know about the caret's current room log line. */
export interface RoomLogLineState {
  readonly onLine: boolean;
  readonly editable: boolean;
  readonly tags: readonly RoomLogTag[];
  readonly linkTo: RoomLogLink | null;
}

/** The block holding the caret, with its document position and room log attributes. */
export interface CaretBlock {
  readonly pos: number;
  readonly node: Node;
  readonly blockId: string | null;
  readonly tags: readonly RoomLogTag[];
  readonly linkTo: RoomLogLink | null;
}

const SLASH_TAG = /^\/(landed|showrunner|joke|future)$/;

/** True when `value` is one of ROOM_LOG_TAGS. */
export function isRoomLogTag(value: unknown): value is RoomLogTag {
  return typeof value === "string" && ROOM_LOG_TAGS.some((t) => t === value);
}

/** The tag named by `/landed`, `/showrunner`, `/joke` or `/future` at a line's start; null otherwise. */
export function parseSlashTag(textBeforeCaret: string): RoomLogTag | null {
  const match = SLASH_TAG.exec(textBeforeCaret);
  const tag = match?.[1];
  return isRoomLogTag(tag) ? tag : null;
}

/** Adds `tag` once; leaves `tags` unchanged when `tag` is already present. */
export function addRoomLogTag(
  tags: readonly string[],
  tag: RoomLogTag,
): readonly string[] {
  return tags.includes(tag) ? tags : [...tags, tag];
}

/** Toggles `tag` in `tags`, keeping the remaining order intact. */
export function toggleTagValue(
  tags: readonly string[],
  tag: RoomLogTag,
): readonly string[] {
  return tags.includes(tag)
    ? tags.filter((existing) => existing !== tag)
    : [...tags, tag];
}

/** The valid room log tags stored on `node`, deduplicated in order. */
export function readBlockTags(node: Node): readonly RoomLogTag[] {
  const raw: unknown = node.attrs.tags;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<RoomLogTag>();
  const result: RoomLogTag[] = [];
  for (const item of raw) {
    if (isRoomLogTag(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item);
    }
  }
  return result;
}

/** The raw string tags list stored on `node` (preserving any unknown tags from newer builds). */
export function readRawTags(node: Node): readonly string[] {
  const raw: unknown = node.attrs.tags;
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string");
}

/** The validated `linkTo` stored on `node`; null when absent or malformed. */
export function readBlockLink(node: Node): RoomLogLink | null {
  const raw: unknown = node.attrs.linkTo;
  if (typeof raw !== "object" || raw === null) return null;
  const kind: unknown = Reflect.get(raw, "kind");
  const blockId: unknown = Reflect.get(raw, "blockId");
  if (!isLinkKind(kind) || typeof blockId !== "string" || blockId === "")
    return null;
  return { kind, blockId };
}

/** The block holding the caret head; null when the selection head is not inside a block. */
export function caretBlockOf(state: EditorState): CaretBlock | null {
  const { $head } = state.selection;
  const block = $head.parent;
  if (block.type !== schema.nodes.block) return null;
  const id: unknown = block.attrs.id;
  return {
    pos: $head.before(),
    node: block,
    blockId: typeof id === "string" && id !== "" ? id : null,
    tags: readBlockTags(block),
    linkTo: readBlockLink(block),
  };
}

/** The line state of the caret in `state` for `editable`. */
export function roomLogLineState(
  state: EditorState,
  editable: boolean,
): RoomLogLineState {
  const block = caretBlockOf(state);
  if (block === null)
    return { onLine: false, editable, tags: [], linkTo: null };
  return {
    onLine: true,
    editable,
    tags: block.tags,
    linkTo: block.linkTo,
  };
}

/** Toggles `tag` on the caret's block; false when read-only or not on a line. */
export function toggleRoomLogTag(view: EditorView, tag: RoomLogTag): boolean {
  if (!view.editable) return false;
  const block = caretBlockOf(view.state);
  if (block === null) return false;
  const next = toggleTagValue(readRawTags(block.node), tag);
  view.dispatch(
    view.state.tr.setNodeAttribute(block.pos, "tags", next).scrollIntoView(),
  );
  return true;
}

/** Sets or clears `linkTo` on the caret's block; false when read-only or not on a line. */
export function setRoomLogLink(
  view: EditorView,
  linkTo: RoomLogLink | null,
): boolean {
  if (!view.editable) return false;
  const block = caretBlockOf(view.state);
  if (block === null) return false;
  view.dispatch(
    view.state.tr
      .setNodeAttribute(block.pos, "linkTo", linkTo)
      .scrollIntoView(),
  );
  return true;
}

/** True when the document is a single empty block with no tags and no link. */
export function isEmptyRoomLog(state: EditorState): boolean {
  const { doc } = state;
  if (doc.childCount !== 1) return false;
  const section = doc.firstChild;
  if (section === null || section.childCount !== 1) return false;
  const block = section.firstChild;
  if (block === null || block.type !== schema.nodes.block) return false;
  return (
    block.content.size === 0 &&
    readBlockTags(block).length === 0 &&
    readBlockLink(block) === null
  );
}

/**
 * Strips `/landed `, `/showrunner `, `/joke ` or `/future ` after a space is typed at a line's start, adding the tag
 * once. Returns null when the transition is not a single-space completion of a slash tag at line start.
 */
export function slashTagTransaction(
  oldState: EditorState,
  newState: EditorState,
): Transaction | null {
  if (!newState.selection.empty || !oldState.selection.empty) return null;
  const $new = newState.selection.$head;
  const $old = oldState.selection.$head;
  const block = $new.parent;
  const oldBlock = $old.parent;
  if (block.type !== schema.nodes.block || oldBlock.type !== schema.nodes.block)
    return null;
  const beforeNew = block.textBetween(0, $new.parentOffset);
  if (!beforeNew.endsWith(" ") && !beforeNew.endsWith("\u00A0")) return null;
  const prefix = beforeNew.slice(0, -1);
  const tag = parseSlashTag(prefix);
  if (tag === null) return null;
  if (oldBlock.textBetween(0, $old.parentOffset) !== prefix) return null;
  const nextTags = addRoomLogTag(readRawTags(block), tag);
  return newState.tr
    .delete($new.start(), $new.pos)
    .setNodeAttribute($new.before(), "tags", nextTags)
    .scrollIntoView();
}

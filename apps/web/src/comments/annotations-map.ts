// Pure annotation projection and pagination-to-block scene mapping helpers.
import type { Annotation } from "@manent/editor";
import type { Pagination } from "@manent/pagination";
import type { SceneBlockInfo, ScriptCommentsState } from "./comments-types.ts";

const SCENE_TYPES = new Set(["scene_heading", "slug", "chapter"]);

interface BlockLike {
  readonly type: { readonly name: string };
  readonly attrs: Readonly<Record<string, unknown>>;
  readonly textContent: string;
}

interface DocLike {
  descendants(fn: (node: BlockLike, pos: number) => boolean | void): void;
}

export const EMPTY_BLOCK_SCENES: ReadonlyMap<string, SceneBlockInfo> =
  new Map();

export function isSameIdSet(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): boolean {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function sceneHeadingBefore(doc: DocLike, pos: number): string | null {
  let sceneId: string | null = null;
  doc.descendants((node, nodePos) => {
    if (nodePos > pos) return false;
    if (node.type.name !== "block") return true;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    const kind = typeof node.attrs.type === "string" ? node.attrs.type : "";
    if (SCENE_TYPES.has(kind) && id !== "") sceneId = id;
    return false;
  });
  return sceneId;
}

/** The block ids currently referenced by any anchored thread or writer note in `state`. */
export function anchoredBlockIds(
  state: ScriptCommentsState,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const thread of Object.values(state.threads)) {
    if (thread.anchor !== null) ids.add(thread.anchor.blockId);
  }
  for (const entry of state.notes) {
    if (entry.note.anchor !== null) ids.add(entry.note.anchor.blockId);
  }
  return ids;
}

function isSameSceneInfo(
  a: SceneBlockInfo | undefined,
  b: SceneBlockInfo | undefined,
): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  return (
    a.sceneBlockId === b.sceneBlockId &&
    a.sceneNumber === b.sceneNumber &&
    a.heading === b.heading &&
    a.pageLabel === b.pageLabel
  );
}

/** True when `a` and `b` map every relevant block id to the same scene and page info. */
export function isSameBlockScenes(
  a: ReadonlyMap<string, SceneBlockInfo>,
  b: ReadonlyMap<string, SceneBlockInfo>,
  onlyIds?: ReadonlySet<string>,
): boolean {
  if (a === b) return true;
  if (onlyIds !== undefined) {
    for (const id of onlyIds) {
      if (!isSameSceneInfo(a.get(id), b.get(id))) return false;
    }
    return true;
  }
  if (a.size !== b.size) return false;
  for (const [id, info] of a) {
    if (!isSameSceneInfo(info, b.get(id))) return false;
  }
  return true;
}

export function pageLabelsByBlock(
  pagination: Pagination | null,
  onlyIds?: ReadonlySet<string>,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (pagination === null || (onlyIds !== undefined && onlyIds.size === 0))
    return map;
  const { pages, blocks } = pagination;
  for (let p = 0; p < pages.length; p++) {
    const start = pages[p]!.block;
    const end = p + 1 < pages.length ? pages[p + 1]!.block : blocks.length;
    const label = pages[p]!.label;
    for (let i = start; i < end && i < blocks.length; i++) {
      const id = blocks[i]!.id;
      if (onlyIds !== undefined && !onlyIds.has(id)) continue;
      if (!map.has(id)) {
        map.set(id, label);
        if (onlyIds !== undefined && map.size === onlyIds.size) return map;
      }
    }
  }
  return map;
}

export function scanBlockScenes(
  doc: DocLike,
  pagination: Pagination | null,
  onlyIds?: ReadonlySet<string>,
): ReadonlyMap<string, SceneBlockInfo> {
  if (onlyIds !== undefined && onlyIds.size === 0) return EMPTY_BLOCK_SCENES;
  const map = new Map<string, SceneBlockInfo>();
  const pageByBlock = pageLabelsByBlock(pagination, onlyIds);
  let sceneBlockId = "";
  let sceneNumber: string | null = null;
  let sceneCount = 0;
  let heading = "";
  doc.descendants((node) => {
    if (onlyIds !== undefined && map.size === onlyIds.size) return false;
    if (node.type.name !== "block") return true;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    const kind = typeof node.attrs.type === "string" ? node.attrs.type : "";
    if (SCENE_TYPES.has(kind) && id !== "") {
      sceneBlockId = id;
      const rawNum = node.attrs.num;
      const explicit =
        typeof rawNum === "string" && rawNum.trim() !== ""
          ? rawNum.trim()
          : null;
      if (kind === "chapter") {
        sceneNumber = explicit;
      } else {
        sceneCount += 1;
        sceneNumber = explicit ?? String(sceneCount);
      }
      heading = node.textContent;
    }
    if (id !== "" && (onlyIds === undefined || onlyIds.has(id))) {
      map.set(id, {
        sceneBlockId,
        sceneNumber,
        heading,
        pageLabel: pageByBlock.get(id) ?? null,
      });
    }
    return false;
  });
  return map;
}

export function annotationsFor(
  state: ScriptCommentsState,
  activeId: string | null = null,
): readonly Annotation[] {
  const list: Annotation[] = [];
  for (const [id, thread] of Object.entries(state.threads)) {
    if (thread.state.kind !== "open" && id !== activeId) continue;
    list.push({
      id,
      kind: "comment",
      anchor: thread.anchor,
      open: id === activeId,
    });
  }
  if (state.canEdit) {
    for (const entry of state.notes) {
      list.push({
        id: entry.id,
        kind: "note",
        anchor: entry.note.anchor,
        open: entry.id === activeId,
      });
    }
  }
  return list;
}

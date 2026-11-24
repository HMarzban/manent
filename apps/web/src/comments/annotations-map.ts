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

export function pageLabelsByBlock(
  pagination: Pagination | null,
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  if (pagination === null) return map;
  const { pages, blocks } = pagination;
  for (let p = 0; p < pages.length; p++) {
    const start = pages[p]!.block;
    const end = p + 1 < pages.length ? pages[p + 1]!.block : blocks.length;
    const label = pages[p]!.label;
    for (let i = start; i < end && i < blocks.length; i++) {
      const id = blocks[i]!.id;
      if (!map.has(id)) map.set(id, label);
    }
  }
  return map;
}

export function scanBlockScenes(
  doc: DocLike,
  pagination: Pagination | null,
): ReadonlyMap<string, SceneBlockInfo> {
  const map = new Map<string, SceneBlockInfo>();
  const pageByBlock = pageLabelsByBlock(pagination);
  let sceneBlockId = "";
  let sceneNumber: string | null = null;
  let sceneCount = 0;
  let heading = "";
  doc.descendants((node) => {
    if (node.type.name !== "block") return true;
    const id = typeof node.attrs.id === "string" ? node.attrs.id : "";
    const kind = typeof node.attrs.type === "string" ? node.attrs.type : "";
    if (SCENE_TYPES.has(kind) && id !== "") {
      sceneBlockId = id;
      sceneCount += 1;
      const rawNum = node.attrs.sceneNumber;
      sceneNumber =
        typeof rawNum === "string" && rawNum.trim() !== ""
          ? rawNum.trim()
          : String(sceneCount);
      heading = node.textContent;
    }
    if (id !== "") {
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
): readonly Annotation[] {
  const list: Annotation[] = Object.entries(state.threads).map(
    ([id, thread]) => ({
      id,
      kind: "comment",
      anchor: thread.anchor,
      open: thread.state.kind === "open",
    }),
  );
  if (state.canEdit) {
    for (const entry of state.notes) {
      list.push({
        id: entry.id,
        kind: "note",
        anchor: entry.note.anchor,
        open: true,
      });
    }
  }
  return list;
}

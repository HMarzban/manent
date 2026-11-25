// Reads and paginates one story document without an editor from its DocHandle.
import { scriptBody } from "@manent/crdt";
import type { RundownExportStory } from "@manent/formats";
import {
  ENGINE_VERSION,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
} from "@manent/pagination";
import { blocksOf } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { DocHandle, SideState, ViewHandle } from "@manent/sync-client";

const SYNC_WAIT_MS = 5_000;
const READER_SIDES: readonly SideState[] = ["read_only", "view_only"];

export type StoryReading =
  | { readonly kind: "doc" }
  | { readonly kind: "view"; readonly blocks: readonly BlockJSON[] }
  | { readonly kind: "waiting" }
  | { readonly kind: "unreadable" };

/** Current readability of `handle` for export without opening an editor. */
export function readingOfStory(handle: DocHandle): StoryReading {
  const status = handle.status.get();
  if (status.side.some((side) => !READER_SIDES.includes(side)))
    return { kind: "unreadable" };
  const view = handle.readOnly.get();
  if (view !== null) {
    const { live, link } = view.status.get();
    if (live) return { kind: "view", blocks: view.blocks.get() };
    return { kind: link === "offline" ? "unreadable" : "waiting" };
  }
  if (status.side.length > 0) return { kind: "unreadable" };
  if (status.docSync === "synced") return { kind: "doc" };
  if (status.link !== "offline") return { kind: "waiting" };
  return {
    kind: status.neverSynced && status.waiting === 0 ? "unreadable" : "doc",
  };
}

/** Resolves once `handle` has readable content or proves unreadable (within `SYNC_WAIT_MS`). */
export function settledStoryReading(
  handle: DocHandle,
  schedule: (fn: () => void, delayMs: number) => () => void,
): Promise<Exclude<StoryReading, { readonly kind: "waiting" }>> {
  return new Promise((resolve) => {
    const stops: (() => void)[] = [];
    let watched: ViewHandle | null = null;
    let settled = false;
    const finish = (
      result: Exclude<StoryReading, { readonly kind: "waiting" }>,
    ): void => {
      if (settled) return;
      settled = true;
      for (const stop of stops.splice(0)) stop();
      resolve(result);
    };
    const read = (): void => {
      if (settled) return;
      const view = handle.readOnly.get();
      if (view !== null && view !== watched) {
        watched = view;
        stops.push(view.status.subscribe(check));
      }
      const reading = readingOfStory(handle);
      if (reading.kind !== "waiting") finish(reading);
    };
    const check = (): void => queueMicrotask(read);
    stops.push(
      handle.status.subscribe(check),
      handle.readOnly.subscribe(check),
      schedule(() => {
        const current = readingOfStory(handle);
        finish(current.kind === "waiting" ? { kind: "unreadable" } : current);
      }, SYNC_WAIT_MS),
    );
    check();
  });
}

function paginateStory(
  title: string,
  docJson: DocJSON,
  blocks: readonly BlockJSON[],
  settings: Readonly<Record<string, unknown>>,
): RundownExportStory | null {
  const rawEngine =
    settings["script.engine"] ?? settings["script.engineVersion"];
  const version =
    typeof rawEngine === "number" && Number.isInteger(rawEngine)
      ? rawEngine
      : ENGINE_VERSION;
  const engine = engineFor(version) ?? engineFor(ENGINE_VERSION);
  if (engine === null) return null;
  const layout = readLayoutSettings((key) => settings[key]);
  const profile =
    profileFromSettings(engine, layout) ??
    profileFromSettings(engine, { ...layout, format: "variety" }) ??
    profileFromSettings(engine, { ...layout, format: "screenplay" });
  if (profile === null) return null;
  const pages = engine.paginate(
    engine.toLayoutBlocks(blocksOf(docJson)),
    profile,
  );
  return { title, blocks, pages };
}

/** Materialises and paginates `handle` with its own engine and settings; null when pagination is unavailable. */
export function storyFromHandle(
  handle: DocHandle,
  title: string,
  reading: Exclude<
    StoryReading,
    { readonly kind: "waiting" } | { readonly kind: "unreadable" }
  >,
): RundownExportStory | null {
  const docJson: DocJSON =
    reading.kind === "view"
      ? {
          type: "doc",
          content: [{ type: "section", content: [...reading.blocks] }],
        }
      : scriptBody(handle.doc()).materialize();
  const blocks: readonly BlockJSON[] =
    reading.kind === "view"
      ? reading.blocks
      : (docJson.content ?? []).flatMap((section) => section.content ?? []);
  return paginateStory(title, docJson, blocks, handle.settings.get());
}

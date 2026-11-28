// Read-only script view mounter for the dedicated Version history page (/s/$docId/history): editing is always blocked.
import {
  changeMarksPlugin,
  changesPlugin,
  mountPageView,
  setChanges,
} from "@manent/editor";
import type { ChangesDisplay, PageViewPorts } from "@manent/editor";
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
  engineFor,
  profileFromSettings,
  readLayoutSettings,
  toLockTable,
} from "@manent/pagination";
import type { Engine, PageProfile } from "@manent/pagination";
import { createComparisonBuilder } from "@manent/revisions";
import type { BlockEntry, Comparison } from "@manent/revisions";
import { parseDoc, sectionize } from "@manent/schema";
import type { BlockJSON, DocJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { docOfContent } from "../history/content-doc.ts";
import { VERSION_LAYOUTS } from "../history/version-layouts.ts";
import { liveEditor, livePagination } from "./live-editor.ts";

export interface HistoryReadOnlyView {
  destroy(): void;
  scrollToBlock(blockId: string): void;
}

export interface WorkingSnapshot {
  readonly doc: DocJSON;
  readonly engineVersion: number;
  readonly settings: Readonly<Record<string, unknown>>;
}

/** Reads a read-only snapshot of the currently mounted Working editor for `docId`, or null if not yet mounted. */
export function readWorkingSnapshot(
  docId: string,
  readSetting: (key: string) => unknown,
): WorkingSnapshot | null {
  const live = liveEditor(docId);
  if (live === null) return null;
  const settings: Record<string, unknown> = {};
  for (const key of [
    "script.format",
    "script.paper",
    "script.lineSpacing",
    "script.mirrorMargins",
    "script.linesPerPage",
    "script.moresAtBreaks",
    "script.sameSpeakerContd",
    "script.sceneContinued",
    "script.sceneNumbers",
    "script.numbering",
  ]) {
    const val = readSetting(key);
    if (val !== undefined) settings[key] = val;
  }
  return {
    doc: live.view.state.doc.toJSON() as DocJSON,
    engineVersion: livePagination(docId)?.engineVersion ?? ENGINE_VERSION,
    settings,
  };
}

function resolveEngine(version: number): Engine {
  const engine = engineFor(version) ?? engineFor(ENGINE_VERSION);
  if (engine === null)
    throw new RangeError(`this build carries no engine ${ENGINE_VERSION}`);
  return engine;
}

function resolveProfile(
  settingsRecord: Readonly<Record<string, unknown>>,
  scenesNumbered: boolean,
  engine: Engine,
): PageProfile {
  const settings = {
    ...readLayoutSettings((key) => settingsRecord[key]),
    scenesNumbered,
  };
  const profile =
    profileFromSettings(engine, settings) ??
    profileFromSettings(engine, {
      ...settings,
      format: DEFAULT_LAYOUT_SETTINGS.format,
    });
  if (profile === null)
    throw new RangeError(`engine ${engine.version} lays out no default format`);
  return profile;
}

function reversedEntry(
  entry: BlockEntry,
  own: BlockJSON | null,
  index: number,
): BlockEntry | null {
  if (entry.older === null || (entry.kind === "changed" && own !== entry.older))
    return null;
  return Object.freeze({
    ...entry,
    kind: own === null ? "added" : "unchanged",
    older: own,
    newer: entry.older,
    joinedInto: null,
    after: null,
    olderIndex: own === null ? null : index,
  });
}

function olderComparisonMarks(
  comparison: Comparison,
  sceneIds: readonly string[] | null,
): { baseline: DocJSON; comparison: Comparison } {
  const scope = sceneIds === null ? null : new Set(sceneIds);
  const blocks: BlockJSON[] = [];
  const builder = createComparisonBuilder({ mode: comparison.mode });
  for (const entry of comparison.entries) {
    const marked =
      scope === null || (entry.sceneId !== null && scope.has(entry.sceneId));
    const own = marked ? entry.newer : entry.older;
    if (own !== null) blocks.push(own);
    const back = reversedEntry(entry, own, blocks.length - 1);
    if (back !== null) builder.add(back);
  }
  return { baseline: sectionize(blocks), comparison: builder.comparison() };
}

const SHEET_WIDTH_PX = 816;
const SHEET_MARGIN_PX = 24;

/** Auto-scales `scaffold` to fit `place` cleanly whenever the History pane resizes (never exceeding 100%). */
function attachAutoFitZoom(
  place: HTMLElement,
  applyZoom: (percent: number) => void,
): () => void {
  let last = 100;
  const fit = (): void => {
    const avail = place.clientWidth - SHEET_MARGIN_PX;
    if (avail <= 0) return;
    const next = Math.min(
      100,
      Math.max(40, Math.floor((avail / SHEET_WIDTH_PX) * 100)),
    );
    if (next === last) return;
    last = next;
    applyZoom(next);
    place.style.setProperty("--page-zoom", String(next / 100));
  };
  fit();
  if (typeof ResizeObserver === "undefined") return () => {};
  const observer = new ResizeObserver(fit);
  observer.observe(place);
  return () => observer.disconnect();
}

/**
 * Mounts a strictly read-only (`editable: () => false`) view of Working on `/s/$docId/history`, optionally
 * decorating inline diffs (`page` or `asterisks`) against `baseline`.
 */
export function mountHistoryWorkingView(options: {
  place: HTMLElement;
  snapshot: WorkingSnapshot;
  ports: PageViewPorts;
  offFontNote: string;
  changes: {
    baseline: VersionContent;
    comparison: Comparison;
    display: ChangesDisplay;
  } | null;
}): HistoryReadOnlyView {
  const { place, snapshot, ports, offFontNote, changes } = options;
  const engine = resolveEngine(snapshot.engineVersion);
  const profile = resolveProfile(snapshot.settings, false, engine);
  const baselineDoc = changes === null ? null : docOfContent(changes.baseline);
  const hasMarks = changes !== null && baselineDoc !== null;
  const page = mountPageView({
    place,
    doc: parseDoc(snapshot.doc),
    ports,
    offFontNote,
    layoutEngine: engine,
    profile,
    locks: toLockTable([]),
    layout: null,
    editable: () => false,
    plugins: hasMarks ? [changesPlugin(), changeMarksPlugin()] : [],
  });
  if (hasMarks) {
    page.view.dispatch(
      setChanges(page.view.state.tr, {
        baseline: baselineDoc,
        comparison: changes.comparison,
        display: changes.display,
      }).setMeta("addToHistory", false),
    );
  }
  const stopZoom = attachAutoFitZoom(place, (pct) =>
    page.scaffold.applyZoom(pct),
  );
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopZoom();
      page.destroy();
    },
    scrollToBlock(blockId) {
      page.view.dom
        .querySelector(`[data-id=${JSON.stringify(blockId)}]`)
        ?.scrollIntoView({ block: "start" });
    },
  };
}

/**
 * Mounts a strictly read-only (`editable: () => false`) view of a historical `VersionContent` on `/s/$docId/history`
 * without clobbering a sibling Working pane in Side-by-side mode.
 */
export function mountHistorySnapshotView(options: {
  place: HTMLElement;
  content: VersionContent;
  ports: PageViewPorts;
  offFontNote: string;
  comparison: Comparison | null;
  sceneIds: readonly string[] | null;
}): HistoryReadOnlyView {
  const { place, content, ports, offFontNote, comparison, sceneIds } = options;
  const json = docOfContent(content);
  if (json === null)
    throw new TypeError("a version the schema refuses cannot be drawn");
  const engine = resolveEngine(content.engineVersion ?? ENGINE_VERSION);
  const page = mountPageView({
    place,
    doc: parseDoc(json),
    ports,
    offFontNote,
    layoutEngine: engine,
    profile: resolveProfile(content.settings, content.locks !== null, engine),
    locks: toLockTable(content.locks ?? []),
    layout:
      VERSION_LAYOUTS.map((layoutOf) => layoutOf(content)).find(
        (layout) => layout !== null,
      ) ?? null,
    editable: () => false,
    plugins: comparison === null ? [] : [changesPlugin()],
  });
  if (comparison !== null) {
    const marks = olderComparisonMarks(comparison, sceneIds);
    page.view.dispatch(
      setChanges(page.view.state.tr, {
        ...marks,
        display: "page",
      }).setMeta("addToHistory", false),
    );
  }
  const stopZoom = attachAutoFitZoom(place, (pct) =>
    page.scaffold.applyZoom(pct),
  );
  let destroyed = false;
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      stopZoom();
      page.destroy();
    },
    scrollToBlock(blockId) {
      page.view.dom
        .querySelector(`[data-id=${JSON.stringify(blockId)}]`)
        ?.scrollIntoView({ block: "start" });
    },
  };
}

/** Finds the first block element whose bottom edge sits inside the visible scroll container. */
export function visibleBlockAtTop(scroller: Element): string | null {
  const top = scroller.getBoundingClientRect().top + 24;
  const blocks = scroller.querySelectorAll("[data-id]:not(.el-hidden)");
  let low = 0;
  let high = blocks.length - 1;
  let found: Element | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const block = blocks[mid]!;
    if (block.getBoundingClientRect().bottom > top) {
      found = block;
      high = mid - 1;
    } else low = mid + 1;
  }
  return found?.getAttribute("data-id") ?? null;
}

/** Scrolls `scroller` so `blockId` lands comfortably in the upper third of the review viewport. */
export function scrollCanvasToBlock(
  scroller: HTMLElement,
  blockId: string,
): boolean {
  const target = scroller.querySelector<HTMLElement>(
    `[data-id=${JSON.stringify(blockId)}]`,
  );
  if (target === null) return false;
  scroller.scrollTop +=
    target.getBoundingClientRect().top -
    scroller.getBoundingClientRect().top -
    scroller.clientHeight / 4;
  return true;
}

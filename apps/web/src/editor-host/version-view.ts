// The only place a version is drawn: a second, read-only page view of its content, laid out by its own engine.
import { changesPlugin, mountPageView, setChanges } from "@manent/editor";
import type { PageViewPorts } from "@manent/editor";
import {
  DEFAULT_LAYOUT_SETTINGS,
  ENGINE_VERSION,
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

export interface VersionView {
  destroy(): void;
  scrollToBlock(blockId: string): void;
}

// at most one version is drawn in a window, so the live script and one version are the only documents held
let shown: VersionView | null = null;

/** The version's engine, or the current one when this build lacks it. Throws a RangeError when it has neither. */
function engineOf(
  content: VersionContent,
  engineFor: (version: number) => Engine | null,
): Engine {
  const engine =
    engineFor(content.engineVersion ?? ENGINE_VERSION) ??
    engineFor(ENGINE_VERSION);
  if (engine === null)
    throw new RangeError(`this build carries no engine ${ENGINE_VERSION}`);
  return engine;
}

/** The version's page, from its own settings; a format the engine does not know lays out as the default one. */
function profileOf(content: VersionContent, engine: Engine): PageProfile {
  const settings = {
    ...readLayoutSettings((key) => content.settings[key]),
    scenesNumbered: content.locks !== null,
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

/**
 * The version's entry for `entry`, an entry of the comparison from the version to Working, whose baseline block is
 * `own` at `index`; null for a block the version lacks, or one whose change the changes plugin works out itself.
 */
function reversed(
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

/**
 * The comparison from the version's side: `comparison` runs from the version to Working, so Working is the baseline
 * and what the version holds that Working lacks is marked on the version's page. A block outside `sceneIds` (null:
 * every scene) is its own baseline, so it carries no mark.
 */
function olderSide(
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
    const back = reversed(entry, own, blocks.length - 1);
    if (back !== null) builder.add(back);
  }
  return { baseline: sectionize(blocks), comparison: builder.comparison() };
}

/**
 * Draws `content` read-only in `place`, destroying the version drawn before. Every engine function is `engineFor`'s
 * engine of the version's own engine version. Throws a TypeError for content the schema refuses.
 */
export function mountVersionView(options: {
  place: HTMLElement;
  content: VersionContent;
  ports: PageViewPorts;
  offFontNote: string;
  /** From the version to Working, unfiltered; its marks are drawn on the version's page for `sceneIds` only. */
  comparison: Comparison | null;
  sceneIds: readonly string[] | null;
  engineFor: (version: number) => Engine | null;
  watermark?: string | null;
}): VersionView {
  const { content, comparison } = options;
  shown?.destroy();
  const json = docOfContent(content);
  if (json === null)
    throw new TypeError("a version the schema refuses cannot be drawn");
  const engine = engineOf(content, options.engineFor);
  const page = mountPageView({
    place: options.place,
    doc: parseDoc(json),
    ports: options.ports,
    offFontNote: options.offFontNote,
    layoutEngine: engine,
    profile: profileOf(content, engine),
    locks: toLockTable(content.locks ?? []),
    layout:
      VERSION_LAYOUTS.map((layoutOf) => layoutOf(content)).find(
        (layout) => layout !== null,
      ) ?? null,
    editable: () => false,
    plugins: comparison === null ? [] : [changesPlugin()],
    furniture:
      options.watermark === undefined
        ? undefined
        : { watermark: options.watermark },
  });
  if (comparison !== null) {
    const { view } = page;
    view.dispatch(
      setChanges(view.state.tr, {
        ...olderSide(comparison, options.sceneIds),
        display: "page",
      }).setMeta("addToHistory", false),
    );
  }
  let destroyed = false;
  const drawn: VersionView = {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (shown === drawn) shown = null;
      page.destroy();
    },
    scrollToBlock(blockId) {
      page.view.dom
        .querySelector(`[data-id=${JSON.stringify(blockId)}]`)
        ?.scrollIntoView({ block: "start" });
    },
  };
  shown = drawn;
  return drawn;
}

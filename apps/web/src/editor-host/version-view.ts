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
import { compareDocs } from "@manent/revisions";
import type { Comparison } from "@manent/revisions";
import { parseDoc, sectionize } from "@manent/schema";
import type { DocJSON } from "@manent/schema";
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
 * The comparison from Working's side: `comparison` runs from the version to Working, so its newer blocks are
 * Working's, and what the version holds that Working lacks is marked on the version's page.
 */
function fromWorking(
  version: DocJSON,
  comparison: Comparison,
): { baseline: DocJSON; comparison: Comparison } {
  const working = sectionize(
    comparison.entries.flatMap((entry) =>
      entry.newer === null ? [] : [entry.newer],
    ),
  );
  return {
    baseline: working,
    comparison: compareDocs(working, version, { mode: comparison.mode }),
  };
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
  comparison: Comparison | null;
  engineFor: (version: number) => Engine | null;
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
  });
  if (comparison !== null) {
    const { view } = page;
    view.dispatch(
      setChanges(view.state.tr, {
        ...fromWorking(json, comparison),
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

// Live editor wiring for Variety timing: feeds timing-facts and runs Exclude / Include from timing.
import {
  excludeFromTiming,
  includeInTiming,
  setTimingEnabled,
  timingPlugin,
} from "@manent/editor";
import type { Plugin, TimingFacts } from "@manent/editor";
import { TIMING_WORDS } from "@manent/ui";
import { publishTimingFacts } from "../timing/timing-facts.ts";
import { liveEditor, subscribeLiveEditors } from "./live-editor.ts";
import type { EditorPluginContext } from "./plugins.ts";

const activeCleanup = new Map<string, () => void>();

/** Feeds `timingFactsOf(context.docId)` while the script's format is Variety and clears it when leaving. */
export function timingEditorPlugin(context: EditorPluginContext): Plugin {
  const { docId, services, frames } = context;
  activeCleanup.get(docId)?.();
  const script = services.openScriptStore(docId);
  const kind = services.library.documentKind(docId);
  let latest: TimingFacts | null = null;
  const initialVariety = script.get("script.format") === "variety";
  let enabledInView = initialVariety;
  let appliedPodcast = kind.get() === "podcast";

  const syncKind = (): void => {
    const nextPodcast = kind.get() === "podcast";
    if (nextPodcast === appliedPodcast) return;
    const view = liveEditor(docId)?.view;
    if (view === undefined || view.isDestroyed) return;
    appliedPodcast = nextPodcast;
    if (!enabledInView) return;
    // Toggle off then on so timingPlugin rebuilds unread T= decorations with Cue or Bracket wording.
    view.dispatch(
      setTimingEnabled(view.state.tr, false).setMeta("addToHistory", false),
    );
    view.dispatch(
      setTimingEnabled(view.state.tr, true).setMeta("addToHistory", false),
    );
  };

  const syncEnabled = (): void => {
    const isVariety = script.get("script.format") === "variety";
    if (!isVariety) {
      latest = null;
      publishTimingFacts(docId, null);
    } else if (latest !== null) {
      publishTimingFacts(docId, latest);
    }
    const view = liveEditor(docId)?.view;
    if (view === undefined || view.isDestroyed) return;
    if (enabledInView === isVariety) return;
    enabledInView = isVariety;
    if (isVariety) appliedPodcast = kind.get() === "podcast";
    view.dispatch(
      setTimingEnabled(view.state.tr, isVariety).setMeta("addToHistory", false),
    );
  };

  const stopFormat = script.subscribe("script.format", syncEnabled);
  const stopKind = kind.subscribe(syncKind);
  let seenLive = false;
  const stopLive = subscribeLiveEditors(() => {
    if (liveEditor(docId) !== null) {
      seenLive = true;
      syncEnabled();
      syncKind();
      return;
    }
    if (seenLive) cleanup();
  });
  const cleanup = (): void => {
    stopFormat();
    stopKind();
    stopLive();
    activeCleanup.delete(docId);
    publishTimingFacts(docId, null);
  };
  activeCleanup.set(docId, cleanup);
  if (!initialVariety) publishTimingFacts(docId, null);
  return timingPlugin({
    enabled: initialVariety,
    sink: {
      publish(facts) {
        latest = facts;
        if (script.get("script.format") === "variety")
          publishTimingFacts(docId, facts);
      },
    },
    words: {
      unreadTime: (form, code) =>
        TIMING_WORDS.unreadTime(form, code, kind.get() === "podcast"),
    },
    frames,
  });
}

/** Excludes or includes every block the selection touches in `docId`'s open editor. */
export function setTimingExcluded(docId: string, excluded: boolean): void {
  const view = liveEditor(docId)?.view;
  if (view === undefined || !view.editable) return;
  const command = excluded ? excludeFromTiming : includeInTiming;
  command(view.state, view.dispatch, view);
}

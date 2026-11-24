// Live editor wiring for Variety timing: feeds timing-facts and runs Exclude / Include from timing.
import {
  excludeFromTiming,
  includeInTiming,
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
  const emit = (): void =>
    publishTimingFacts(
      docId,
      script.get("script.format") === "variety" ? latest : null,
    );
  const stopFormat = script.subscribe("script.format", emit);
  let seenLive = false;
  const stopLive = subscribeLiveEditors(() => {
    if (liveEditor(docId) !== null) {
      seenLive = true;
      return;
    }
    if (seenLive) cleanup();
  });
  const cleanup = (): void => {
    stopFormat();
    stopLive();
    activeCleanup.delete(docId);
    publishTimingFacts(docId, null);
  };
  activeCleanup.set(docId, cleanup);
  return timingPlugin({
    sink: {
      publish(facts) {
        latest = facts;
        emit();
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

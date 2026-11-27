// The outline document beside the page: the script editor unchanged, with its empty-state line and Open beside entry.
import type { CrdtDoc } from "@manent/crdt";
import { OUTLINE_WORDS, useSubscribable } from "@manent/ui";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { BesideChoice, BesideHere, BesideKind } from "../beside/kinds.ts";
import { ScriptBeside } from "../beside/script-beside.tsx";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../services/context.tsx";
import { outlineStartActions } from "../state/outline-start.store.ts";
import { isDocEmpty } from "./beats.ts";
import { openOrCreateOutline } from "./create-outline.ts";
import {
  cachedOutlineLink,
  scriptDocIdOfOutline,
  subscribeOutlineLinks,
  supportsOutline,
} from "./outline-link.ts";

/** True once `docId` has been read and holds no text or synopsis. */
function useOutlineEmpty(docId: string): boolean {
  const services = useServices();
  const [empty, setEmpty] = useState(false);
  useEffect(() => {
    let stopped = false;
    const stops: (() => void)[] = [];
    const read = (doc: CrdtDoc): void => {
      if (!stopped) setEmpty(isDocEmpty(doc));
    };
    let stopLive = (): void => {};
    let watchedDoc: CrdtDoc | null = null;
    const followLive = (): void => {
      const doc = liveEditor(docId)?.doc ?? null;
      if (doc === watchedDoc) return;
      stopLive();
      watchedDoc = doc;
      if (doc !== null) {
        read(doc);
        stopLive = doc.subscribe(() => read(doc));
      } else {
        stopLive = (): void => {};
      }
    };
    followLive();
    stops.push(subscribeLiveEditors(followLive));
    void services
      .openHandle(docId)
      .then((handle) => {
        if (stopped) return;
        let stopDoc = handle.doc().subscribe(() => read(handle.doc()));
        read(handle.doc());
        const stopReplaced = handle.on((event) => {
          if (event.type !== "replaced") return;
          stopDoc();
          stopDoc = handle.doc().subscribe(() => read(handle.doc()));
          read(handle.doc());
        });
        stops.push(() => {
          stopDoc();
          stopReplaced();
        });
      })
      .catch(() => {
        // sync unavailable; keep empty false until editor mounts
      });
    return () => {
      stopped = true;
      stopLive();
      for (const stop of stops) stop();
    };
  }, [services, docId]);
  return empty;
}

/** Header title of an outline open beside its script: `{scriptTitle} · Outline`. */
export function useOutlineBesideTitle(outlineDocId: string): string {
  const { library } = useServices();
  const { shellState } = useEnvironment();
  const shown = useSubscribable(shellState);
  const linkedScriptId = useSyncExternalStore(
    subscribeOutlineLinks,
    () => scriptDocIdOfOutline(outlineDocId),
    () => scriptDocIdOfOutline(outlineDocId),
  );
  const scriptId =
    linkedScriptId ?? (shown.docId !== outlineDocId ? shown.docId : null);
  const scriptTitle = useDocumentTitle(scriptId ?? outlineDocId);
  const ownTitleSource = useMemo(
    () => library.documentTitle(outlineDocId),
    [library, outlineDocId],
  );
  const ownTitle = useSubscribable(ownTitleSource);
  if (scriptId !== null) return OUTLINE_WORDS.besideTitle(scriptTitle);
  const suffix = ` · ${OUTLINE_WORDS.outline}`;
  if (ownTitle !== null)
    return ownTitle.endsWith(suffix)
      ? ownTitle
      : OUTLINE_WORDS.besideTitle(ownTitle);
  return OUTLINE_WORDS.outline;
}

/** The outline beside the page: empty-state guidance until text is written, over the unchanged script editor. */
export function OutlineBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const empty = useOutlineEmpty(props.docId);
  return (
    <>
      {empty ? (
        <p className="shrink-0 border-b border-line bg-subtle px-3 py-2 text-meta text-fg-muted">
          {OUTLINE_WORDS.empty}
        </p>
      ) : null}
      <ScriptBeside docId={props.docId} at={props.at} />
    </>
  );
}

/**
 * Offers `Outline` in Title ▾ → Open beside when the open script belongs to a series, film or stage play: opens an
 * existing outline for any reader/editor, or creates one on first open only when the person has write access.
 */
export function outlineChoices(here: BesideHere): readonly BesideChoice[] {
  const { docId, services } = here;
  const docKind = services.library.docKindOf(docId).get();
  if (docKind !== null && docKind !== "script") return [];
  const projectKind = services.library.documentKind(docId).get();
  if (projectKind !== null && !supportsOutline(projectKind)) return [];

  const link = cachedOutlineLink(docId);
  if (link.outlineDocId !== null) {
    return [{ docId: link.outlineDocId, label: OUTLINE_WORDS.outline }];
  }
  const canEdit = outlineStartActions.entryOf(docId)?.canEdit ?? false;
  if (!canEdit || !link.canCreate) return [];
  return [{ label: OUTLINE_WORDS.outline, open: openOrCreateOutline }];
}

export const outlineBesideKind: BesideKind = {
  id: "outline",
  title: useOutlineBesideTitle,
  hasStatus: true,
  Body: OutlineBeside,
  choices: outlineChoices,
};

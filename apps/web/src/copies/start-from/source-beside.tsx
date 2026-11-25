// A source script or book open read-only beside its adaptation, turning to the current scene's chapter.
import {
  BESIDE_WORDS,
  COPIES_WORDS,
  LIBRARY_WORDS,
  StateBar,
  useSubscribable,
} from "@manent/ui";
import type { StateLine } from "@manent/ui";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { registerBesideFacts } from "../../beside/beside-facts.ts";
import type {
  BesideChoice,
  BesideHere,
  BesideKind,
} from "../../beside/kinds.ts";
import { mountBesideEditor } from "../../editor-host/beside-editor.ts";
import { ScriptPageSkeleton } from "../../editor-host/script-page-skeleton.tsx";
import { useDocumentTitle } from "../../screens/document/title-bar.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import { createFactsStore, useEditorFact } from "../../state/facts.store.ts";
import { createOutlineStore } from "../../state/outline.store.ts";
import { loadSourceFor, peekSource, useSourceEntry } from "./source-cache.ts";

const NO_ACTION = (): boolean => false;
const NO_RUN = (): void => {};
const SCROLL_MARGIN_PX = 24;

const READ_ONLY_LINE: StateLine = Object.freeze({
  sentence: COPIES_WORDS.sourceReadOnly,
  chip: null,
  actions: [],
  dismiss: null,
  attention: false,
});

/** Scrolls `scroller` so `blockId` sits near its top without moving focus away from the main editor. */
function scrollToBlock(
  scroller: HTMLElement,
  place: HTMLElement,
  blockId: string,
): boolean {
  const block = place.querySelector<HTMLElement>(
    `[data-id=${JSON.stringify(blockId)}]`,
  );
  if (block === null) return false;
  const scrollerRect = scroller.getBoundingClientRect();
  const blockRect = block.getBoundingClientRect();
  scroller.scrollTop = Math.max(
    0,
    blockRect.top - scrollerRect.top + scroller.scrollTop - SCROLL_MARGIN_PX,
  );
  return true;
}

/** Keeps `scroller` turned to `blockId` once that block is drawn; null leaves the scroll position unchanged. */
function useFollowChapter(
  scrollerRef: RefObject<HTMLDivElement | null>,
  placeRef: RefObject<HTMLDivElement | null>,
  blockId: string | null,
  frame: (fn: () => void) => () => void,
): void {
  useEffect(() => {
    const scroller = scrollerRef.current;
    const place = placeRef.current;
    if (scroller === null || place === null || blockId === null)
      return undefined;
    let cancelFrame = NO_RUN;
    const settle = (): void => {
      cancelFrame();
      cancelFrame = frame(() => {
        scrollToBlock(scroller, place, blockId);
      });
    };
    if (scrollToBlock(scroller, place, blockId)) {
      settle();
      return () => cancelFrame();
    }
    const observer = new MutationObserver(() => {
      if (!scrollToBlock(scroller, place, blockId)) return;
      observer.disconnect();
      settle();
    });
    observer.observe(place, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      cancelFrame();
    };
  }, [scrollerRef, placeRef, blockId, frame]);
}

type SourceAccess = "checking" | "allowed" | "denied";

/** Enforces server-authoritative read access on `docId` before mounting the source document beside the page. */
function useSourceAccess(docId: string): SourceAccess {
  const services = useServices();
  const [access, setAccess] = useState<SourceAccess>("checking");
  useEffect(() => {
    let active = true;
    let stopStatus: (() => void) | null = null;
    let opened: Awaited<ReturnType<typeof services.openHandle>> | null = null;
    setAccess("checking");
    void services
      .openHandle(docId)
      .then(async (handle) => {
        if (!active) return handle.close();
        opened = handle;
        const isRevoked = (): boolean => {
          const { side } = handle.status.get();
          return side.includes("access_removed") || side.includes("deleted");
        };
        stopStatus = handle.status.subscribe(() => {
          if (active && isRevoked()) setAccess("denied");
        });
        if (isRevoked()) {
          setAccess("denied");
          return;
        }
        const { link, neverSynced } = handle.status.get();
        if (link !== "offline" && !neverSynced) {
          const me = await services.api.me();
          if (!active) return;
          if (me.ok) {
            const role = await services.api.role(docId);
            if (!active) return;
            setAccess(role === null ? "denied" : "allowed");
            return;
          }
        }
        if (active) setAccess(isRevoked() ? "denied" : "allowed");
      })
      .catch(() => {
        // fail closed when the source handle cannot be opened
        if (active) setAccess("denied");
      });
    return () => {
      active = false;
      stopStatus?.();
      void opened?.close();
    };
  }, [services, docId]);
  return access;
}

/**
 * The source document open read-only beside the page, with its own read-only state bar. When the main document
 * records `chapters` for this source, moving the caret in the main editor scrolls here to that scene's chapter.
 */
function SourceBeside(props: {
  docId: string;
  at: { blockId: string } | null;
}): ReactNode {
  const { docId, at } = props;
  const services = useServices();
  const { guard, frame, schedule, shellState } = useEnvironment();
  const access = useSourceAccess(docId);
  const mainDocId = useSubscribable(shellState).docId;
  const sceneId = useEditorFact("sceneId");
  const source = useSourceEntry(mainDocId);
  const chapterId =
    source !== null && source.docId === docId && sceneId !== null
      ? (source.chapters?.[sceneId] ?? null)
      : null;
  // a heading without a recorded chapter leaves the view where it is; `at` applies only before a scene is reported
  const targetBlockId =
    chapterId ?? (sceneId === null ? (at?.blockId ?? null) : null);
  const [stores] = useState(() => ({
    facts: createFactsStore({ guard, frame }),
    outline: createOutlineStore({ guard, schedule, composing: () => false }),
  }));
  const scroller = useRef<HTMLDivElement>(null);
  const place = useRef<HTMLDivElement>(null);
  useEffect(
    () => registerBesideFacts(docId, stores.facts.selectors),
    [docId, stores],
  );
  useEffect(() => {
    if (access !== "allowed") return undefined;
    const element = place.current;
    if (element === null) return undefined;
    return mountBesideEditor({
      services,
      element,
      docId,
      at: null,
      bare: true,
      facts: stores.facts.writer,
      outline: stores.outline.writer,
      settings: services.openScriptStore(docId),
      guard,
    });
  }, [access, services, docId, stores, guard]);
  useFollowChapter(
    scroller,
    place,
    access === "allowed" ? targetBlockId : null,
    frame,
  );
  if (access === "denied")
    return <p className="p-12 text-ui">{BESIDE_WORDS.noAccess}</p>;
  return (
    <>
      <div className="shrink-0 border-t border-line">
        <StateBar
          left={READ_ONLY_LINE}
          right={null}
          run={NO_RUN}
          registered={NO_ACTION}
        />
      </div>
      {access === "checking" ? (
        <ScriptPageSkeleton />
      ) : (
        <div ref={scroller} className="min-h-0 flex-1 overflow-auto">
          <div
            ref={place}
            className="mn-desk min-h-full [--page-zoom:1] [&>.mn-zoom]:mx-auto"
          />
        </div>
      )}
    </>
  );
}

/** Offers the open document's recorded source in Open beside; warms the cache on first ask if not yet read. */
function sourceChoices(here: BesideHere): readonly BesideChoice[] {
  const cached = peekSource(here.docId);
  if (cached === undefined) {
    void loadSourceFor(here.services, here.docId);
    return [];
  }
  if (cached === null) return [];
  const label =
    here.services.library.documentTitle(cached.docId).get() ??
    LIBRARY_WORDS.untitledScript;
  return [{ docId: cached.docId, label }];
}

export const SOURCE_BESIDE: BesideKind = {
  id: "source",
  title: useDocumentTitle,
  hasStatus: true,
  Body: SourceBeside,
  choices: sourceChoices,
};

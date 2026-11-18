// The document screen: its frame drawn in the shell's areas around the page, which the shell keeps mounted.
import { DOCUMENT_WORDS, createValue, useSubscribable } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { getRouteApi } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import { focusHeading } from "../../focus.ts";
import { useEnvironment } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { panelsActions, usePanel } from "../../state/panels.store.ts";
import { DocumentStateBar } from "./document-state-bar.tsx";
import { LeftPanel } from "./left-panel.tsx";
import { fitPanels } from "./narrow-window.ts";
import { useOpenDocument } from "./open-document.ts";
import { useRemoteSettingMessages } from "./setting-messages.ts";
import { SidePanel } from "./side-panel.tsx";
import { StatusBar } from "./status-bar.tsx";
import { TitleBar } from "./title-bar.tsx";

const route = getRouteApi("/s/$docId");

// drawn over the page, which stays mounted under it
const PAGE_AREA = Object.freeze({ gridArea: "page" });
// the sheet at 100 % zoom and its desk padding
const PAGE_PX = 816 + 2 * 32;
const PAGE_REGION = "[data-region='page']";

function subscribeToResize(listener: () => void): () => void {
  window.addEventListener("resize", listener);
  return () => window.removeEventListener("resize", listener);
}

/**
 * True while an open panel does not fit beside the page: it is then drawn over the page and closes when focus returns
 * to the page. Opening one panel closes the other when both do not fit, and a panel that closes with focus lost to the
 * body sends focus to the page.
 */
function usePanelsOverPage(): boolean {
  const { dom } = useEnvironment();
  const frameWidthPx = useSyncExternalStore(
    subscribeToResize,
    () => window.innerWidth,
  );
  const left = usePanel("left");
  const side = usePanel("side");
  const fit = fitPanels({
    frameWidthPx,
    pagePx: PAGE_PX,
    leftPx: left.tab === null ? null : left.widthPx,
    sidePx: side.tab === null ? null : side.widthPx,
  });
  const before = useRef({ left: left.tab, side: side.tab });
  useLayoutEffect(() => {
    const was = before.current;
    before.current = { left: left.tab, side: side.tab };
    const closed =
      (was.left !== null && left.tab === null) ||
      (was.side !== null && side.tab === null);
    if (closed && document.activeElement === document.body) dom.focusPage();
    // the panel open before gives way to the one just opened
    if (fit !== "both" && left.tab !== null && side.tab !== null)
      panelsActions.close(was.left === null ? "side" : "left");
  }, [dom, fit, left.tab, side.tab]);
  const over = fit === "overlay";
  useEffect(() => {
    if (!over) return;
    const onFocusIn = (event: FocusEvent): void => {
      if (!(event.target instanceof Element)) return;
      if (event.target.closest(PAGE_REGION) === null) return;
      panelsActions.close("left");
      panelsActions.close("side");
    };
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [over]);
  return over;
}

/** In the test build, `window.__manent.setStatus(facts)` lays facts over the source's status, so the end-to-end tests can show any. */
function useTestStatus(
  source: Subscribable<StatusFacts>,
): Subscribable<StatusFacts> {
  const { flavour } = useEnvironment();
  const [status] = useState(() =>
    flavour === "test" ? createValue(source.get()) : null,
  );
  useEffect(() => {
    if (status === null) return;
    const stop = source.subscribe(status.set);
    const hook: unknown = Reflect.get(window, "__manent");
    if (typeof hook !== "object" || hook === null) return stop;
    Reflect.set(hook, "setStatus", (facts: Partial<StatusFacts>) =>
      status.set({ ...status.get(), ...facts }),
    );
    return () => {
      stop();
      Reflect.deleteProperty(hook, "setStatus");
    };
  }, [source, status]);
  return status ?? source;
}

/** A person whose access was removed sees why in the page's place. */
function NoAccess(props: { status: Subscribable<StatusFacts> }): ReactNode {
  if (useSubscribable(props.status).server !== "access_removed") return null;
  return (
    <div
      className="z-10 flex items-center justify-center bg-desk text-heading"
      style={PAGE_AREA}
    >
      <p>{DOCUMENT_WORDS.noAccess}</p>
    </div>
  );
}

function Frame(props: { docId: string; doc: DocumentServices }): ReactNode {
  const { docId } = props;
  const status = useTestStatus(props.doc.status);
  const doc = { ...props.doc, status };
  const overPage = usePanelsOverPage();
  useRemoteSettingMessages(props.doc);
  useEffect(() => {
    focusHeading(document);
  }, [docId]);
  return (
    <>
      <TitleBar docId={docId} doc={doc} />
      <DocumentStateBar docId={docId} facts={doc.stateFacts} />
      <LeftPanel docId={docId} overlay={overPage} />
      <NoAccess status={status} />
      <SidePanel docId={docId} overlay={overPage} />
      <StatusBar />
    </>
  );
}

/** The frame of `docId`; the stand-in screen of the test build draws it around the stand-in editor. */
export function DocumentFrame(props: { docId: string }): ReactNode {
  const doc = useOpenDocument(props.docId);
  return doc === null ? null : <Frame docId={props.docId} doc={doc} />;
}

export function DocumentScreen(): ReactNode {
  const { docId }: { docId: string } = route.useParams();
  return <DocumentFrame docId={docId} />;
}

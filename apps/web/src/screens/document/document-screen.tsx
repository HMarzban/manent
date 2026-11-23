// The document screen: the body of the document's kind drawn in the shell's areas around the page, which the shell
// keeps mounted.
import { DEMO_PEOPLE } from "@manent/demo";
import type { DocKind } from "@manent/sync-protocol";
import {
  DOCUMENT_WORDS,
  createValue,
  messageFor,
  useSubscribable,
} from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { getRouteApi } from "@tanstack/react-router";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";
import { focusHeading } from "../../focus.ts";
import { ProductionDialogs } from "../../production/dialogs.tsx";
import { SelectionToolbar } from "../../selection/selection-toolbar.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { ShareDialog } from "../../sharing/share-dialog.tsx";
import { selectors as paletteSelectors } from "../../state/palette.store.ts";
import { panelsActions, usePanel } from "../../state/panels.store.ts";
import { pageTitle } from "../../text.ts";
import { DocumentStateBar } from "./document-state-bar.tsx";
import { FindBarRow } from "./find-bar.tsx";
import { LeftPanel } from "./left-panel.tsx";
import { fitPanels } from "./narrow-window.ts";
import { useOpenDocument } from "./open-document.ts";
import { RulerBar } from "./ruler-bar.tsx";
import { useRemoteSettingMessages } from "./setting-messages.ts";
import { SidePanel } from "./side-panel.tsx";
import { CommandAction, StatusBar } from "./status-bar.tsx";
import { STATUS_READOUTS } from "./status-readouts.ts";
import { TitleBar, useDocumentTitle } from "./title-bar.tsx";
import { RundownScreen } from "../../rundown/screen.tsx";

const route = getRouteApi("/s/$docId");

// drawn over the page, which stays mounted under it
const PAGE_AREA = Object.freeze({ gridArea: "page" });
// the sheet at 100 % zoom and 16 px of desk either side, so that a 1440 px window holds the page and both panels;
// Fit width scales the sheet to the room left
const PAGE_PX = 816 + 2 * 16;
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
  // what the hook laid stays over every later value of the source
  const laid = useRef<Partial<StatusFacts>>({});
  useEffect(() => {
    if (status === null) return;
    const follow = (facts: StatusFacts): void =>
      status.set({ ...facts, ...laid.current });
    // a source given since, as signing in gives one, is followed from its facts now
    follow(source.get());
    const stop = source.subscribe(follow);
    const hook: unknown = Reflect.get(window, "__manent");
    if (typeof hook !== "object" || hook === null) return stop;
    Reflect.set(hook, "setStatus", (patch: Partial<StatusFacts>) => {
      laid.current = { ...laid.current, ...patch };
      status.set({ ...status.get(), ...patch });
    });
    return () => {
      stop();
      Reflect.deleteProperty(hook, "setStatus");
    };
  }, [source, status]);
  return status ?? source;
}

/** A person whose access was removed sees why in the page's place, with what can still be done with the changes not sent. */
function NoAccess(props: {
  docId: string;
  status: Subscribable<StatusFacts>;
}): ReactNode {
  const facts = useSubscribable(props.status);
  const title = useDocumentTitle(props.docId);
  if (facts.server !== "access_removed") return null;
  const { actions } = messageFor({
    kind: "access_removed",
    title,
    notSent: facts.notSent,
  });
  return (
    <div
      className="z-10 flex flex-col items-start gap-2 bg-desk p-12 text-ui"
      style={PAGE_AREA}
    >
      <p>{DOCUMENT_WORDS.noAccess}</p>
      {actions.map((action) => (
        <CommandAction
          key={action.commandId}
          commandId={action.commandId}
          label={action.label}
        />
      ))}
    </div>
  );
}

/** The tab's title: the document's title, and the person. */
function useTabTitle(docId: string): void {
  const { userId } = useServices();
  const title = useDocumentTitle(docId);
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(title, person?.name ?? null);
  }, [userId, title]);
}

/** What a document of `kind` draws around the page. */
export interface DocumentBody {
  readonly kind: DocKind;
  readonly Body: ComponentType<{
    docId: string;
    kind: DocKind;
    doc: DocumentServices;
  }>;
}

/** The kind of the document `docId`: every document the shell opens is a script while no other kind has a screen. */
export function useDocKind(_docId: string | null): DocKind {
  return "script";
}

/** A script's body: its title, state, find and ruler bars, its panels and its status bar. */
function Frame(props: {
  docId: string;
  kind: DocKind;
  doc: DocumentServices;
}): ReactNode {
  const { docId } = props;
  const status = useTestStatus(props.doc.status);
  const doc = { ...props.doc, status };
  const overPage = usePanelsOverPage();
  useRemoteSettingMessages(props.doc);
  useTabTitle(docId);
  const { dom } = useEnvironment();
  const title = useDocumentTitle(docId);
  useEffect(() => {
    // the page takes focus, else its region until the page is shown, and the title is read
    if (!paletteSelectors.isOpen() && !dom.focusPage()) focusHeading(document);
    dom.announce(title);
  }, [docId]);
  return (
    <>
      <TitleBar docId={docId} doc={doc} />
      <DocumentStateBar docId={docId} facts={doc.stateFacts} />
      <FindBarRow docId={docId} />
      <RulerBar docId={docId} />
      <SelectionToolbar docId={docId} />
      <LeftPanel docId={docId} overlay={overPage} />
      <NoAccess docId={docId} status={status} />
      <SidePanel docId={docId} overlay={overPage} />
      <StatusBar
        readouts={STATUS_READOUTS.flatMap(({ id, kinds, Readout }) =>
          kinds.includes(props.kind)
            ? [<Readout key={id} docId={docId} />]
            : [],
        )}
      />
      <ProductionDialogs docId={docId} />
      <ShareDialog docId={docId} doc={doc} />
    </>
  );
}

const SCRIPT_BODY: DocumentBody = { kind: "script", Body: Frame };

/** A kind with no line gets the script's body. */
export const DOCUMENT_BODIES: readonly DocumentBody[] = [
  SCRIPT_BODY,
  { kind: "rundown", Body: RundownScreen },
];

/** The body of `docId`'s kind; the stand-in screen of the test build draws it around the stand-in editor. */
export function DocumentFrame(props: { docId: string }): ReactNode {
  const doc = useOpenDocument(props.docId);
  const kind = useDocKind(props.docId);
  const { Body } =
    DOCUMENT_BODIES.find((body) => body.kind === kind) ?? SCRIPT_BODY;
  return doc === null ? null : (
    <Body docId={props.docId} kind={kind} doc={doc} />
  );
}

export function DocumentScreen(): ReactNode {
  const { docId }: { docId: string } = route.useParams();
  return <DocumentFrame docId={docId} />;
}

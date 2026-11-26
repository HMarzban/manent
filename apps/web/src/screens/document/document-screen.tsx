// The document screen: the body of the document's kind drawn in the shell's areas around the page, which the shell
// keeps mounted.
import { DEMO_PEOPLE } from "@manent/demo";
import type { DocKind } from "@manent/sync-protocol";
import {
  Button,
  DOCUMENT_WORDS,
  LIBRARY_WORDS,
  WRITING_WORDS,
  createValue,
  messageFor,
  useSubscribable,
} from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { getRouteApi, useRouter } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import {
  Suspense,
  lazy,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentType, ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { focusHeading } from "../../focus.ts";
import { ProductionDialogs } from "../../production/dialogs.tsx";
import { SelectionToolbar } from "../../selection/selection-toolbar.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { chooseUrl, readPerson } from "../../session.ts";
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

const RundownScreen = lazy(async () => ({
  default: (await import("../../rundown/screen.tsx")).RundownScreen,
}));

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

/** Whether `target` lies in the page. */
function isInPage(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(PAGE_REGION) !== null;
}

/** A key that writes, as against a chord, a caret move or a key that moves focus. */
function isTyping(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  return (
    event.key.length === 1 ||
    event.key === "Enter" ||
    event.key === "Backspace" ||
    event.key === "Delete"
  );
}

/**
 * True while an open panel does not fit beside the page: it is then drawn over the page and closes when the person
 * clicks or types in the page or focus returns to it; a window narrowed under open panels while focus is in the page
 * closes them, so they never cover the line being written. Opening one panel closes the other when both do not fit,
 * except that Scenes a script opened close themselves, and a panel that closes with focus lost to the body sends focus
 * to the page.
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
  const over = fit === "overlay";
  const before = useRef({ left: left.tab, side: side.tab, over });
  useLayoutEffect(() => {
    const was = before.current;
    before.current = { left: left.tab, side: side.tab, over };
    const closed =
      (was.left !== null && left.tab === null) ||
      (was.side !== null && side.tab === null);
    if (closed && document.activeElement === document.body) dom.focusPage();
    // a window narrowed under open panels while the person writes: they would cover the line being written
    const narrowed =
      over && !was.over && was.left === left.tab && was.side === side.tab;
    if (narrowed && dom.pageFocused()) {
      panelsActions.close("left");
      panelsActions.close("side");
      return;
    }
    // the panel open before gives way to the one just opened; Scenes a script opened give way to the person's panel
    if (fit !== "both" && left.tab !== null && side.tab !== null)
      panelsActions.close(
        was.left === null && !panelsActions.scenesUnchosen() ? "side" : "left",
      );
  }, [dom, fit, over, left.tab, side.tab]);
  useEffect(() => {
    if (!over) return;
    // focus may already be in the page, so a press or a key there closes the panel too
    const onPage = (event: Event): void => {
      if (!isInPage(event.target)) return;
      panelsActions.close("left");
      panelsActions.close("side");
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (isTyping(event)) onPage(event);
    };
    document.addEventListener("focusin", onPage);
    document.addEventListener("pointerdown", onPage);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("focusin", onPage);
      document.removeEventListener("pointerdown", onPage);
      document.removeEventListener("keydown", onKeyDown);
    };
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

/** A person whose access was removed — or a browser-only session opening an absent doc — sees why in the page's place. */
function NoAccess(props: {
  docId: string;
  status: Subscribable<StatusFacts>;
}): ReactNode {
  const { docId } = props;
  const facts = useSubscribable(props.status);
  const title = useDocumentTitle(docId);
  const router = useRouter();
  const { tabStorage } = useEnvironment();
  const { library, ready } = useServices();
  const [libraryReady, setLibraryReady] = useState(false);
  useEffect(() => {
    let live = true;
    void ready.then(() => {
      if (live) setLibraryReady(true);
    });
    return () => {
      live = false;
    };
  }, [ready]);
  const titleSource = useMemo(
    () => library.documentTitle(docId),
    [library, docId],
  );
  const kindSource = useMemo(() => library.docKindOf(docId), [library, docId]);
  const indexedTitle = useSubscribable(titleSource);
  const indexedKind = useSubscribable(kindSource);
  const person = readPerson(tabStorage);
  const missingLocal =
    libraryReady &&
    person !== null &&
    person.token === null &&
    facts.neverSynced &&
    indexedTitle === null &&
    indexedKind === null;

  if (facts.server !== "access_removed" && !missingLocal) return null;

  if (missingLocal) {
    return (
      <div
        className="z-10 flex min-h-0 flex-1 overflow-y-auto bg-desk p-6 text-ui"
        style={PAGE_AREA}
      >
        <div className="flex min-h-full w-full flex-col items-center justify-center">
          <EmptyHeroCard
            icon={<LockIcon aria-hidden="true" className="size-5" />}
            title={LIBRARY_WORDS.notOnDevice}
            description={WRITING_WORDS.notOnDeviceBody}
            actions={
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Button
                  variant="default"
                  onClick={() =>
                    void router.navigate({ href: chooseUrl(`/s/${docId}`) })
                  }
                >
                  {WRITING_WORDS.choosePerson}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => void router.navigate({ href: "/" })}
                >
                  {WRITING_WORDS.backToLibrary}
                </Button>
              </div>
            }
          />
        </div>
      </div>
    );
  }

  const { actions } = messageFor({
    kind: "access_removed",
    title,
    notSent: facts.notSent,
  });
  return (
    <div
      className="z-10 flex min-h-0 flex-1 overflow-y-auto bg-desk p-6 text-ui"
      style={PAGE_AREA}
    >
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        <div className="flex w-full max-w-sm flex-col items-center gap-3 rounded-surface border border-line bg-raised p-6 text-center">
          <span
            aria-hidden="true"
            className="flex size-12 shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-fg-muted"
          >
            <LockIcon className="size-5" />
          </span>
          <p className="text-section font-medium text-fg">
            {DOCUMENT_WORDS.noAccess}
          </p>
          {actions.map((action) => (
            <CommandAction
              key={action.commandId}
              commandId={action.commandId}
              label={action.label}
            />
          ))}
        </div>
      </div>
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

const NO_DOC_KIND: Subscribable<DocKind | null> = createValue(null);

/** The kind of `docId` as the Library holds it; defaults to "script" while unknown. */
export function useDocKind(docId: string | null): DocKind {
  const { library } = useServices();
  const source = useMemo(
    () => (docId === null ? NO_DOC_KIND : library.docKindOf(docId)),
    [library, docId],
  );
  return useSubscribable(source) ?? "script";
}

/** A script's body: its title, state, find and ruler bars, its panels and its status bar. */
function Frame(props: {
  docId: string;
  kind: DocKind;
  doc: DocumentServices;
}): ReactNode {
  const { docId } = props;
  const status = useTestStatus(props.doc.status);
  const doc = useMemo(() => ({ ...props.doc, status }), [props.doc, status]);
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
    <Suspense fallback={null}>
      <Body docId={props.docId} kind={kind} doc={doc} />
    </Suspense>
  );
}

export function DocumentScreen(): ReactNode {
  const { docId }: { docId: string } = route.useParams();
  return <DocumentFrame docId={docId} />;
}

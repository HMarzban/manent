// The reader frame (`/r/$token`): whole window, true pages, watermark, phone scaling, Changes since you last read and tap-to-comment.
import { COMMANDS } from "@manent/commands";
import type { SideTab } from "@manent/commands";
import { textAnchorAt } from "@manent/schema";
import {
  MessageSlot,
  READER_WORDS,
  Skeleton,
  StateBar,
  createMessageQueue,
  stateBarLines,
  useSubscribable,
} from "@manent/ui";
import type { MessageQueue, StateLine } from "@manent/ui";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { Api } from "../../api.ts";
import { tourTab } from "../../demo/tour-tab.tsx";
import { browserPagePorts } from "../../editor-host/page-ports.ts";
import { focusHeading } from "../../focus.ts";
import { createReaderCommentsSession } from "../../reader/reader-comments.ts";
import type { ReaderCommentsSession } from "../../reader/reader-comments.ts";
import { blockTextOf } from "../../reader/reader-compare.ts";
import {
  formatReaderDayDate,
  readerRefusalText,
  useReaderDraft,
} from "../../reader/use-reader-draft.ts";
import { useEnvironment } from "../../services/context.tsx";
import type { PanelTab } from "../../shell/panel-tab.ts";
import { SidePosition } from "../../shell/side-position.tsx";
import type { PersonStore } from "../../state/person.store.ts";
import { TEXT, pageTitle } from "../../text.ts";
import { ReaderChooser } from "./reader-chooser.tsx";
import { ReaderCommentPopover } from "./reader-comment-popover.tsx";
import type { ReaderPopoverMode } from "./reader-comment-popover.tsx";
import { ReaderPage } from "./reader-page.tsx";
import type { TappedLine } from "./reader-page.tsx";

const READER_SIDE_TABS: readonly PanelTab<SideTab>[] = [tourTab];

const isRegistered = (commandId: string): boolean =>
  COMMANDS.some((command) => command.id === commandId);

function useQueueMessage(queue: MessageQueue): boolean {
  const subscribe = useCallback(
    (listener: () => void) => queue.subscribe(listener),
    [queue],
  );
  return (
    useSyncExternalStore(
      subscribe,
      () => queue.current(),
      () => queue.current(),
    ) !== null
  );
}

export function ReaderScreen(props: {
  token: string;
  api: Api;
  fetch: typeof fetch;
  usePerson: PersonStore;
}): ReactNode {
  const { token, api, fetch: fetchFn, usePerson } = props;
  const environment = useEnvironment();
  const person = usePerson((state) => state.person);
  const setPerson = usePerson((state) => state.setPerson);
  const services = useSubscribable(environment.personServices);
  const signedIn = person !== null && person.token !== null;
  const userId = person?.userId ?? null;
  const bearerToken = person?.token ?? null;

  const [choosingToComment, setChoosingToComment] = useState(false);
  const [popover, setPopover] = useState<ReaderPopoverMode | null>(null);
  const pendingTapRef = useRef<TappedLine | null>(null);

  const localMessages = useMemo(
    () =>
      createMessageQueue({
        now: environment.now,
        schedule: environment.schedule,
      }),
    [environment.now, environment.schedule],
  );
  const messageQueue = services?.messages ?? localMessages;
  const hasMessage = useQueueMessage(messageQueue);

  const pagePorts = useMemo(
    () => services?.pagePorts ?? browserPagePorts(environment.userAgent),
    [services, environment.userAgent],
  );

  const { state, comparison, runSinceLastRead, hideComparison } =
    useReaderDraft({
      token,
      fetch: fetchFn,
      usePerson,
      environment,
      messageQueue,
      userId,
      bearerToken,
      signedIn,
    });

  useEffect(() => {
    setPopover(null);
    if (signedIn) setChoosingToComment(false);
  }, [token, userId, bearerToken, signedIn]);

  // Keep comments session strictly on the comments CRDT for signed-in online readers with canComment.
  const readyDraft = state.kind === "ready" ? state.draft : null;
  const offline = state.kind === "ready" && state.offlineOpenedAt !== null;
  const commentsSession = useMemo<ReaderCommentsSession | null>(() => {
    if (
      readyDraft === null ||
      offline ||
      !signedIn ||
      !readyDraft.canComment ||
      services === null
    )
      return null;
    return createReaderCommentsSession({
      docId: readyDraft.docId,
      versionId: readyDraft.versionId,
      services,
      canComment: true,
      now: environment.now,
    });
  }, [readyDraft, offline, signedIn, services, environment.now]);

  useEffect(() => {
    return () => {
      commentsSession?.dispose();
    };
  }, [commentsSession]);

  // Open pending tap-to-comment popover once a reader returns from Choose who you are.
  useEffect(() => {
    const pending = pendingTapRef.current;
    if (
      pending === null ||
      readyDraft === null ||
      offline ||
      !signedIn ||
      !readyDraft.canComment
    )
      return;
    pendingTapRef.current = null;
    const text = blockTextOf(readyDraft.content, pending.blockId);
    if (text === null) return;
    setPopover({
      kind: "comment",
      anchor: textAnchorAt({ id: pending.blockId, text }, 0, text.length),
      place: pending.place,
    });
  }, [readyDraft, offline, signedIn]);

  useEffect(() => {
    if (state.kind === "ready") {
      document.title = pageTitle(state.draft.name, person?.name ?? null);
      focusHeading(document);
    } else if (state.kind === "refused") {
      document.title = pageTitle(TEXT.appName, person?.name ?? null);
      focusHeading(document);
    }
  }, [state, person?.name]);

  const runCommand = useCallback(
    (commandId: string): void => {
      if (commandId === "history.sinceLastRead") {
        if (services !== null)
          services.commands.run("history.sinceLastRead", "control");
        else runSinceLastRead();
        return;
      }
      if (commandId === "history.hideChanges") {
        hideComparison();
        return;
      }
      services?.commands.run(commandId, "control");
    },
    [services, runSinceLastRead, hideComparison],
  );

  const handleTapLine = useCallback(
    (tapped: TappedLine): void => {
      if (state.kind !== "ready" || state.offlineOpenedAt !== null) return;
      if (!signedIn) {
        pendingTapRef.current = tapped;
        setChoosingToComment(true);
        return;
      }
      if (!state.draft.canComment || commentsSession === null) return;
      const text = blockTextOf(state.draft.content, tapped.blockId);
      if (text === null) return;
      const anchor = textAnchorAt({ id: tapped.blockId, text }, 0, text.length);
      setPopover({ kind: "comment", anchor, place: tapped.place });
    },
    [state, signedIn, commentsSession],
  );

  if (state.kind === "needs_sign_in") {
    return (
      <ReaderChooser
        api={api}
        person={person}
        setPerson={setPerson}
        next={`/r/${token}`}
        commentTitle={null}
        onCancel={null}
      />
    );
  }

  if (choosingToComment && state.kind === "ready") {
    return (
      <ReaderChooser
        api={api}
        person={person}
        setPerson={setPerson}
        next={`/r/${token}`}
        commentTitle={state.draft.name}
        onCancel={() => {
          pendingTapRef.current = null;
          setChoosingToComment(false);
        }}
      />
    );
  }

  const frameClass =
    services === null
      ? "z-10 flex h-screen min-h-0 flex-col bg-desk text-fg"
      : "z-10 flex min-h-0 flex-1 flex-col bg-desk text-fg";

  if (state.kind === "refused") {
    return (
      <div
        className={
          services === null
            ? "z-10 flex h-screen flex-col items-start gap-2 bg-chrome p-6 text-fg"
            : "z-10 flex min-h-0 flex-1 flex-col items-start gap-2 bg-chrome p-6 text-fg"
        }
      >
        <h1
          tabIndex={-1}
          role={state.reason === "unreachable" ? "alert" : undefined}
          className="text-ui font-normal text-fg outline-none"
        >
          {readerRefusalText(state.reason)}
        </h1>
      </div>
    );
  }

  if (state.kind === "loading") {
    return (
      <div aria-busy="true" className={frameClass}>
        <div
          aria-hidden="true"
          className="flex h-statebar shrink-0 items-center justify-between border-b border-line bg-chrome px-3"
        >
          <Skeleton className="h-3.5 w-44" />
          <Skeleton className="h-3.5 w-28" />
        </div>
        <div
          aria-hidden="true"
          className="flex min-h-0 flex-1 justify-center overflow-hidden p-8"
        >
          <div className="flex w-full max-w-content flex-col gap-5 border border-line bg-raised p-12">
            <Skeleton className="h-4 w-56" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-11/12" />
              <Skeleton className="h-3.5 w-4/5" />
            </div>
            <div className="mx-auto flex w-3/5 flex-col gap-2 pt-2">
              <Skeleton className="mx-auto h-3.5 w-24" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-5/6" />
            </div>
            <Skeleton className="mt-2 h-4 w-48" />
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-3/4" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  const { draft, offlineOpenedAt } = state;
  const bar = stateBarLines([
    {
      kind: "reader_draft",
      name: draft.name,
      date: formatReaderDayDate(draft.sentAt),
    },
    ...(comparison !== null && comparison.baselineName !== ""
      ? [
          {
            kind: "showing_changes" as const,
            name: comparison.baselineName,
            date: null,
          },
        ]
      : []),
  ]);
  const leftLine = bar.left;

  let rightLine: StateLine | null = bar.right;
  if (rightLine === null && offlineOpenedAt !== null) {
    rightLine = {
      sentence: READER_WORDS.offlineCopy(formatReaderDayDate(offlineOpenedAt)),
      chip: null,
      actions: [],
      dismiss: null,
      attention: false,
    };
  } else if (rightLine === null && signedIn && draft.canComment) {
    rightLine = {
      sentence: READER_WORDS.canComment,
      chip: null,
      actions: [],
      dismiss: null,
      attention: false,
    };
  }

  const tappable = offlineOpenedAt === null && (!signedIn || draft.canComment);

  return (
    <div data-reader-frame="" className={frameClass}>
      <h1 tabIndex={-1} className="sr-only">
        {draft.name}
      </h1>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <StateBar
            left={leftLine}
            right={rightLine}
            run={runCommand}
            registered={isRegistered}
          />
          <ReaderPage
            content={draft.content}
            watermark={draft.watermark}
            comparison={comparison}
            ports={pagePorts}
            title={draft.name}
            tappable={tappable}
            onTapLine={handleTapLine}
          />
          <div
            className={
              hasMessage
                ? "flex h-statusbar items-center border-t border-line bg-chrome px-3 text-ui"
                : "sr-only"
            }
          >
            <MessageSlot
              queue={messageQueue}
              run={runCommand}
              registered={isRegistered}
            />
          </div>
        </div>
        {services !== null ? (
          <SidePosition docId={null} tabs={READER_SIDE_TABS} />
        ) : null}
      </div>
      {popover !== null && commentsSession !== null && userId !== null ? (
        <ReaderCommentPopover
          session={commentsSession}
          mode={popover}
          userId={userId}
          now={environment.now}
          onSwitchMode={setPopover}
          onClose={() => setPopover(null)}
        />
      ) : null}
    </div>
  );
}

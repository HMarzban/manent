// The reader frame (`/r/$token`): whole window, true pages, watermark, phone scaling, Read aloud, Changes since last read and tap-to-comment.
import { COMMANDS } from "@manent/commands";
import type { SideTab } from "@manent/commands";
import { textAnchorAt } from "@manent/schema";
import {
  MessageSlot,
  READER_WORDS,
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
  useState,
  useSyncExternalStore,
} from "react";
import type { ReactNode } from "react";
import type { Api } from "../../api.ts";
import { tourTab } from "../../demo/tour-tab.tsx";
import { browserPagePorts } from "../../editor-host/page-ports.ts";
import { focusHeading } from "../../focus.ts";
import {
  startReaderReadAloud,
  stopReadAloud,
} from "../../read-aloud/runner.ts";
import { useReaderReadAloudFacts } from "../../read-aloud/state-facts.ts";
import { createReaderCommentsSession } from "../../reader/reader-comments.ts";
import type {
  ReaderCommentsSession,
  ReaderCommentsState,
} from "../../reader/reader-comments.ts";
import { blockTextOf } from "../../reader/reader-compare.ts";
import {
  clearPendingTap,
  readPendingTap,
  writePendingTap,
} from "../../reader/reader-storage.ts";
import {
  formatReaderDayDate,
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
import {
  ReaderLoadingView,
  ReaderRefusalView,
  openThreadsByBlock,
  readerInfoLine,
} from "./reader-states.tsx";

const READER_SIDE_TABS: readonly PanelTab<SideTab>[] = [tourTab];
const noop = (): void => {};

const isRegistered = (commandId: string): boolean =>
  COMMANDS.some((command) => command.id === commandId);

function useQueueMessage(queue: MessageQueue): boolean {
  const subscribe = useCallback(
    (fn: () => void) => queue.subscribe(fn),
    [queue],
  );
  const read = (): boolean => queue.current() !== null;
  return useSyncExternalStore(subscribe, read, read);
}

function useSessionState(
  session: ReaderCommentsSession | null,
): ReaderCommentsState | null {
  const subscribe = useCallback(
    (fn: () => void) => (session === null ? noop : session.subscribe(fn)),
    [session],
  );
  const read = (): ReaderCommentsState | null => session?.getState() ?? null;
  return useSyncExternalStore(subscribe, read, read);
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

  const readyDraft = state.kind === "ready" ? state.draft : null;
  const readAloudFacts = useReaderReadAloudFacts(readyDraft?.docId ?? null);
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

  const commentsState = useSessionState(commentsSession);
  const openThreadByBlock = useMemo(
    () => openThreadsByBlock(commentsState),
    [commentsState],
  );
  const commentedBlockIds = useMemo(
    () => new Set(openThreadByBlock.keys()),
    [openThreadByBlock],
  );

  useEffect(() => {
    if (readyDraft === null || offline || !signedIn || !readyDraft.canComment)
      return;
    const pending = readPendingTap(environment.tabStorage, token);
    if (pending === null) return;
    clearPendingTap(environment.tabStorage, token);
    const text = blockTextOf(readyDraft.content, pending.blockId);
    if (text === null) return;
    setPopover({
      kind: "comment",
      anchor: textAnchorAt({ id: pending.blockId, text }, 0, text.length),
      place: pending.place,
    });
  }, [readyDraft, offline, signedIn, environment.tabStorage, token]);

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
      } else if (commandId === "history.hideChanges") {
        hideComparison();
      } else if (commandId === "readAloud.start" && services === null) {
        startReaderReadAloud(messageQueue);
      } else if (commandId === "readAloud.stop" && services === null) {
        stopReadAloud();
      } else {
        services?.commands.run(commandId, "control");
      }
    },
    [services, runSinceLastRead, hideComparison, messageQueue],
  );

  const handleTapLine = useCallback(
    (tapped: TappedLine): void => {
      if (state.kind !== "ready" || state.offlineOpenedAt !== null) return;
      if (!signedIn) {
        writePendingTap(environment.tabStorage, token, tapped);
        setChoosingToComment(true);
        return;
      }
      if (!state.draft.canComment || commentsSession === null) return;
      const text = blockTextOf(state.draft.content, tapped.blockId);
      if (text === null) return;
      const anchor = textAnchorAt({ id: tapped.blockId, text }, 0, text.length);
      const existingThreadId = openThreadByBlock.get(tapped.blockId);
      if (existingThreadId !== undefined) {
        setPopover({
          kind: "thread",
          id: existingThreadId,
          anchor,
          place: tapped.place,
        });
        return;
      }
      setPopover({ kind: "comment", anchor, place: tapped.place });
    },
    [
      state,
      signedIn,
      commentsSession,
      openThreadByBlock,
      environment.tabStorage,
      token,
    ],
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
          clearPendingTap(environment.tabStorage, token);
          setChoosingToComment(false);
        }}
      />
    );
  }

  const frameClass =
    services === null
      ? "z-10 flex h-dvh min-h-0 flex-col bg-desk text-fg"
      : "z-10 flex min-h-0 flex-1 flex-col bg-desk text-fg";

  if (state.kind === "refused") {
    return (
      <ReaderRefusalView reason={state.reason} standalone={services === null} />
    );
  }

  if (state.kind === "loading") {
    return <ReaderLoadingView frameClass={frameClass} />;
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
    ...readAloudFacts,
  ]);
  const leftLine = bar.left;

  let rightLine: StateLine | null = bar.right;
  if (rightLine === null && offlineOpenedAt !== null) {
    rightLine = readerInfoLine(
      READER_WORDS.offlineCopy(formatReaderDayDate(offlineOpenedAt)),
    );
  } else if (rightLine === null && signedIn && draft.canComment) {
    rightLine = readerInfoLine(READER_WORDS.canComment);
  }

  const tappable = offlineOpenedAt === null && (!signedIn || draft.canComment);

  return (
    <div data-reader-frame="" className={frameClass}>
      <h1 tabIndex={-1} className="sr-only">
        {draft.name}
      </h1>
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <div className="max-sm:[&>*>div]:flex-wrap max-sm:[&>*_span]:whitespace-normal">
            <StateBar
              left={leftLine}
              right={rightLine}
              run={runCommand}
              registered={isRegistered}
            />
          </div>
          <ReaderPage
            content={draft.content}
            watermark={draft.watermark}
            comparison={comparison}
            commentedBlockIds={commentedBlockIds}
            ports={pagePorts}
            title={draft.name}
            tappable={tappable}
            onTapLine={handleTapLine}
          />
          <div
            className={
              hasMessage
                ? "flex h-statusbar items-center border-t border-line bg-chrome px-3 text-ui text-fg"
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

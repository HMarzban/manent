// The room window: the document's page held read-only, following the driver's caret with no selections or marks.
import { DEMO_PEOPLE } from "@manent/demo";
import type { Identity } from "@manent/sync-protocol";
import { Avatar, Button, DOCUMENT_WORDS, PRESENT_WORDS } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, LockIcon } from "lucide-react";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../../editor-host/live-editor.ts";
import { EmptyHeroCard } from "../../../empty-hero-card.tsx";
import { focusHeading } from "../../../focus.ts";
import { initialsOf } from "../../../initials.ts";
import { startRoomFollow } from "../../../room/driver-room.ts";
import {
  currentDriver,
  firstNameOf,
  subscribeDriver,
} from "../../../room/driver.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { pageTitle } from "../../../text.ts";
import { useOpenDocument } from "../../document/open-document.ts";
import { useDocumentTitle } from "../../document/title-bar.tsx";
import { sceneIndexInfo } from "./minimap-logic.ts";
import { MiniMapToc } from "./minimap-toc.tsx";
import {
  jumpToPresentBlock,
  useActivePresentScene,
  useOutlineRows,
} from "./present-outline.ts";

// laid over the page, which the shell keeps mounted under it; the page below still takes the wheel
const PAGE_AREA = Object.freeze({ gridArea: "page" });
const PAGE_REGION = "[data-region='page']";
const ROOM_CLASS = "mn-room";
const noop = (): void => {};

/** Each editor the shell builds for `docId` takes no input, however often it is built again. */
function useReadOnlyPage(docId: string): void {
  useEffect(() => {
    const hold = (): void => {
      const editor = liveEditor(docId);
      if (editor?.setEditable !== undefined) editor.setEditable(false);
      else editor?.view.setProps({ editable: () => false });
    };
    hold();
    return subscribeLiveEditors(hold);
  }, [docId]);
}

/** Applies `mn-room` to the page region while the room window is mounted. */
function useRoomPageClass(): void {
  useEffect(() => {
    const region = document.querySelector(PAGE_REGION);
    region?.classList.add(ROOM_CLASS);
    return () => {
      region?.classList.remove(ROOM_CLASS);
    };
  }, []);
}

/** The tab's title: the room window's, and the person. */
function useWindowTitle(title: string): void {
  const { userId } = useServices();
  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(
      PRESENT_WORDS.roomWindowTitle(title),
      person?.name ?? null,
    );
  }, [userId, title]);
}

/** True once the document's server status reports that access was removed. */
function useNoAccess(status: Subscribable<StatusFacts> | null): boolean {
  return useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        status === null ? noop : status.subscribe(notify),
      [status],
    ),
    () => status?.get().server === "access_removed",
    () => false,
  );
}

/** The current driver for `docId`, updated live from the driver store. */
function useDriver(userId: string, docId: string): Identity | null {
  return useSyncExternalStore(
    useCallback(
      (notify: () => void) => subscribeDriver(userId, docId, notify),
      [userId, docId],
    ),
    () => currentDriver(userId, docId),
    () => null,
  );
}

/** A document the person cannot open says so in the page's place. */
function NoAccess(props: { title: string }): ReactNode {
  return (
    <div className="pointer-events-auto h-full overflow-y-auto bg-desk">
      <div className="flex min-h-full flex-col items-center justify-center p-6">
        <EmptyHeroCard
          icon={<LockIcon aria-hidden="true" className="size-5" />}
          title={PRESENT_WORDS.roomWindowTitle(props.title)}
          description={DOCUMENT_WORDS.noAccess}
        />
      </div>
    </div>
  );
}

/** Floating top HUD pill: back to script, document title, driver badge and scene progress. */
function PresentHud(props: {
  docId: string;
  title: string;
  driver: Identity | null;
  currentScene: number;
  totalScenes: number;
}): ReactNode {
  const { docId, title, driver, currentScene, totalScenes } = props;
  const navigate = useNavigate();
  return (
    <div className="mn-present-hud pointer-events-auto fixed left-1/2 top-3 z-20 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-full px-2.5 py-1 text-ui opacity-85 hover:opacity-100 focus-within:opacity-100">
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={PRESENT_WORDS.backToScript}
        onClick={() => void navigate({ href: `/s/${docId}` })}
      >
        <ArrowLeftIcon
          aria-hidden="true"
          className="size-icon text-fg-muted group-hover/button:text-fg"
        />
      </Button>
      <span className="max-w-48 truncate font-medium text-fg" title={title}>
        {title}
      </span>
      <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-line" />
      {driver === null ? (
        <span className="whitespace-nowrap text-meta text-fg-muted">
          {PRESENT_WORDS.roomView}
        </span>
      ) : (
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar
            name={driver.name}
            initials={initialsOf(driver.name)}
            colour={null}
            size="sm"
            decorative
          />
          <span className="truncate text-meta text-fg-muted">
            {PRESENT_WORDS.following(firstNameOf(driver.name))}
          </span>
        </span>
      )}
      {totalScenes > 0 ? (
        <>
          <span aria-hidden="true" className="h-3.5 w-px shrink-0 bg-line" />
          <span className="shrink-0 text-meta tabular-nums text-fg-muted">
            {PRESENT_WORDS.sceneProgress(currentScene, totalScenes)}
          </span>
        </>
      ) : null}
    </div>
  );
}

export function RoomMode(props: { docId: string }): ReactNode {
  const { docId } = props;
  const doc = useOpenDocument(docId);
  const title = useDocumentTitle(docId);
  const services = useServices();
  const { frame } = useEnvironment();
  const noAccess = useNoAccess(doc?.status ?? null);
  const driver = useDriver(services.userId, docId);
  const rows = useOutlineRows();
  const { activeBlockId, progress } = useActivePresentScene(rows);
  const { currentScene, totalScenes } = sceneIndexInfo(rows, activeBlockId);
  const onJump = useCallback(
    (blockId: string) => {
      jumpToPresentBlock(blockId, (command) => {
        void services.editor.run(command);
      });
    },
    [services],
  );
  useReadOnlyPage(docId);
  useRoomPageClass();
  useWindowTitle(title);
  useEffect(
    () => startRoomFollow({ docId, services, frame }),
    [docId, services, frame],
  );
  useEffect(() => {
    focusHeading(document);
  }, [docId]);
  return (
    <div
      data-tour="present_window"
      className="pointer-events-none z-10 min-h-0"
      style={PAGE_AREA}
    >
      <h1 tabIndex={-1} className="sr-only">
        {PRESENT_WORDS.roomWindowTitle(title)}
      </h1>
      {noAccess ? (
        <NoAccess title={title} />
      ) : (
        <>
          <PresentHud
            docId={docId}
            title={title}
            driver={driver}
            currentScene={currentScene}
            totalScenes={totalScenes}
          />
          <MiniMapToc
            docId={docId}
            rows={rows}
            activeBlockId={activeBlockId}
            progress={progress}
            onJump={onJump}
          />
        </>
      )}
    </div>
  );
}

// The room window: the document's page held read-only, following the driver's caret with no selections or marks.
import { DEMO_PEOPLE } from "@manent/demo";
import type { Identity } from "@manent/sync-protocol";
import { Button, DOCUMENT_WORDS, PRESENT_WORDS } from "@manent/ui";
import type { StatusFacts, Subscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { LockIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../../../editor-host/live-editor.ts";
import { EmptyHeroCard } from "../../../empty-hero-card.tsx";
import { focusHeading } from "../../../focus.ts";
import { startRoomFollow } from "../../../room/driver-room.ts";
import { currentDriver, subscribeDriver } from "../../../room/driver.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import type { PersonPresent } from "../../../state/people.store.ts";
import { pageTitle } from "../../../text.ts";
import { useOpenDocument } from "../../document/open-document.ts";
import { useDocumentTitle } from "../../document/title-bar.tsx";
import { sceneIndexInfo } from "./minimap-logic.ts";
import { MiniMapToc } from "./minimap-toc.tsx";
import { PresentHud } from "./present-hud.tsx";
import {
  jumpToPresentBlock,
  useActivePresentScene,
  useOutlineRows,
} from "./present-outline.ts";

// laid over the page, which the shell keeps mounted under it; the page below still takes the wheel
const PAGE_AREA = Object.freeze({ gridArea: "page" });
const PAGE_REGION = "[data-region='page']";
const ROOM_CLASS = "mn-room";
const ROOM_FIT_ATTR = "data-room-fit";
const ROOM_SCALE_VAR = "--room-fit-scale";
const EMPTY_PEOPLE: readonly PersonPresent[] = Object.freeze([]);
const noop = (): void => {};

/** Deterministic collaborator colour index (1–10) for `userId` when live presence has not yet reported one. */
function fallbackCollabColour(userId: string): number {
  let hash = 0;
  for (let i = 0; i < userId.length; i++)
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return (hash % 10) + 1;
}

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

/** True once the document's server status reports that access was removed or the document was deleted. */
function useNoAccess(status: Subscribable<StatusFacts> | null): boolean {
  return useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        status === null ? noop : status.subscribe(notify),
      [status],
    ),
    () => {
      const server = status?.get().server;
      return server === "access_removed" || server === "deleted";
    },
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

/** Scales the read-only screenplay sheet to fit narrow viewports (e.g. 375 px) without horizontal overflow. */
function useFitRoomWidth(): void {
  useEffect(() => {
    const sync = (): void => {
      const region = document.querySelector<HTMLElement>(PAGE_REGION);
      if (region === null) return;
      const desk = region.querySelector<HTMLElement>(".mn-desk");
      const zoom = region.querySelector<HTMLElement>(".mn-zoom");
      if (desk === null || zoom === null) {
        region.removeAttribute(ROOM_FIT_ATTR);
        region.style.removeProperty(ROOM_SCALE_VAR);
        return;
      }
      const style = getComputedStyle(desk);
      const pad =
        (Number.parseFloat(style.paddingLeft) || 0) +
        (Number.parseFloat(style.paddingRight) || 0);
      const available = region.clientWidth - pad;
      const zoomWidth = Number.parseFloat(zoom.style.width) || zoom.offsetWidth;
      if (available > 0 && zoomWidth > available + 1) {
        region.setAttribute(ROOM_FIT_ATTR, "");
        region.style.setProperty(ROOM_SCALE_VAR, String(available / zoomWidth));
      } else {
        region.removeAttribute(ROOM_FIT_ATTR);
        region.style.removeProperty(ROOM_SCALE_VAR);
      }
    };

    let regionObserver: ResizeObserver | null = null;
    let zoomObserver: MutationObserver | null = null;
    const bind = (): void => {
      regionObserver?.disconnect();
      zoomObserver?.disconnect();
      const region = document.querySelector<HTMLElement>(PAGE_REGION);
      if (region === null) return;
      if (typeof ResizeObserver !== "undefined") {
        regionObserver = new ResizeObserver(sync);
        regionObserver.observe(region);
      }
      const zoom = region.querySelector<HTMLElement>(".mn-zoom");
      if (zoom !== null && typeof MutationObserver !== "undefined") {
        zoomObserver = new MutationObserver(sync);
        zoomObserver.observe(zoom, {
          attributes: true,
          attributeFilter: ["style"],
        });
      }
      sync();
    };

    bind();
    window.addEventListener("resize", sync, { passive: true });
    const stopEditors = subscribeLiveEditors(bind);
    return () => {
      window.removeEventListener("resize", sync);
      stopEditors();
      regionObserver?.disconnect();
      zoomObserver?.disconnect();
      const region = document.querySelector<HTMLElement>(PAGE_REGION);
      region?.removeAttribute(ROOM_FIT_ATTR);
      region?.style.removeProperty(ROOM_SCALE_VAR);
    };
  }, []);
}

/** The people currently present on the open script, used to resolve the driver's `--collab-*` colour. */
function usePresentPeople(
  source: Subscribable<readonly PersonPresent[]> | null,
): readonly PersonPresent[] {
  return useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        source === null ? noop : source.subscribe(notify),
      [source],
    ),
    () => source?.get() ?? EMPTY_PEOPLE,
    () => EMPTY_PEOPLE,
  );
}

/** A document the person cannot open says so in the page's place, with a return to the Library. */
function NoAccess(props: { title: string }): ReactNode {
  const navigate = useNavigate();
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const target = rootRef.current?.querySelector<HTMLElement>(
      "[tabindex='-1'], button",
    );
    target?.focus({ preventScroll: true });
  }, []);
  return (
    <div
      ref={rootRef}
      className="pointer-events-auto h-full overflow-y-auto bg-desk"
    >
      <div className="flex min-h-full flex-col items-center justify-center p-6">
        <EmptyHeroCard
          headingAs="h2"
          headingTabIndex={-1}
          icon={<LockIcon aria-hidden="true" className="size-5" />}
          title={PRESENT_WORDS.roomWindowTitle(props.title)}
          description={DOCUMENT_WORDS.noAccess}
          actions={
            <Button
              variant="outline"
              onClick={() => void navigate({ href: "/" })}
            >
              {DOCUMENT_WORDS.back}
            </Button>
          }
        />
      </div>
    </div>
  );
}

export function RoomMode(props: { docId: string }): ReactNode {
  const { docId } = props;
  const doc = useOpenDocument(docId);
  const title = useDocumentTitle(docId);
  const services = useServices();
  const { frame } = useEnvironment();
  const scriptStore = services.openScriptStore(docId);
  const format = useSyncExternalStore(
    useCallback(
      (notify: () => void) => scriptStore.subscribe("script.format", notify),
      [scriptStore],
    ),
    () => scriptStore.get("script.format"),
  );
  const noAccess = useNoAccess(doc?.status ?? null);
  const driver = useDriver(services.userId, docId);
  const people = usePresentPeople(doc?.people ?? null);
  const driverColour =
    driver === null
      ? null
      : (people.find((person) => person.userId === driver.userId)?.colour ??
        fallbackCollabColour(driver.userId));
  const rows = useOutlineRows();
  const { activeBlockId, progress } = useActivePresentScene(rows);
  const { currentScene, totalScenes } = sceneIndexInfo(rows, activeBlockId);
  const scenes = rows.filter((row) => row.kind === "scene");
  const prevScene =
    currentScene > 1 ? (scenes[currentScene - 2] ?? null) : null;
  const nextScene =
    currentScene > 0 && currentScene < scenes.length
      ? (scenes[currentScene] ?? null)
      : null;
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
  useFitRoomWidth();
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
            format={format}
            driver={driver}
            driverColour={driverColour}
            currentScene={currentScene}
            totalScenes={totalScenes}
            onPrevScene={
              prevScene === null ? undefined : () => onJump(prevScene.blockId)
            }
            onNextScene={
              nextScene === null ? undefined : () => onJump(nextScene.blockId)
            }
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

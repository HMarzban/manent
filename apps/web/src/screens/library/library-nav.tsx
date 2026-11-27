// The Library's own navigation, beside the main column: Continue, Favourites, Private, PROJECTS (folders & projects),
// then Trash.
import {
  Button,
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  Row,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  createValue,
  formatCount,
  useSubscribable,
} from "@manent/ui";
import type { Subscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { ClockIcon, LockIcon, StarIcon, Trash2Icon, XIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import type { ProjectItem } from "../../services/ports.ts";
import type { FavouriteEntry } from "../../services/sync/favourites.ts";
import { watchPrivateFolder } from "../../services/sync/private-folder.ts";
import { ShellRegion } from "../../shell/regions.tsx";
import { recordActiveDragWorkspace } from "./folder-dnd.ts";
import { FolderTree } from "./folder-tree.tsx";
import {
  CONTINUE_VIEW_ID,
  libraryHref,
  useLibraryAddress,
} from "./library-address.ts";

interface NavEntry {
  readonly view: string;
  readonly label: string;
  readonly hint: string;
  readonly icon: LucideIcon;
  readonly tour?: string;
}

const VIEWS_ABOVE: readonly NavEntry[] = [
  {
    view: CONTINUE_VIEW_ID,
    label: LIBRARY_FILES_WORDS.continueHeading,
    hint: LIBRARY_FILES_WORDS.continueHint,
    icon: ClockIcon,
  },
  {
    view: "favourites",
    label: LIBRARY_FILES_WORDS.favouritesHeading,
    hint: LIBRARY_FILES_WORDS.favouritesHint,
    icon: StarIcon,
    tour: "library:favourites",
  },
  {
    view: "private",
    label: LIBRARY_FILES_WORDS.privateHeading,
    hint: LIBRARY_FILES_WORDS.privateHint,
    icon: LockIcon,
    tour: "library:private",
  },
];

const VIEWS_BELOW: readonly NavEntry[] = [
  {
    view: "trash",
    label: LIBRARY_FILES_WORDS.trashHeading,
    hint: LIBRARY_FILES_WORDS.trashHint,
    icon: Trash2Icon,
    tour: "library:trash",
  },
];

const EMPTY_FAVS: Subscribable<readonly FavouriteEntry[]> = createValue([]);

/**
 * The views of `workspaceId` it names, the one shown (`current`, an id of LIBRARY_VIEWS) marked current, and the
 * workspace's folders and projects. A window too narrow for it and the main column side by side has no room for it.
 */
export function LibraryNav(props: {
  workspaceId: string | null;
  current: string;
  projects: readonly ProjectItem[];
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
  drawerId?: string;
}): ReactNode {
  const {
    workspaceId,
    current,
    projects,
    mobileOpen = false,
    onCloseMobile,
    drawerId,
  } = props;
  const { userId, favourites } = useServices();
  const navigate = useNavigate();
  const address = useLibraryAddress();
  const activeFolderId = current === "folder" ? address.folder : null;
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);

  const favSource = useMemo(
    () =>
      workspaceId === null ? EMPTY_FAVS : favourites.list(userId, workspaceId),
    [favourites, userId, workspaceId],
  );
  const privateSource = useMemo(
    () => watchPrivateFolder(favourites.client, userId),
    [favourites.client, userId],
  );
  const favCount = useSubscribable(favSource).length;
  const privateCount = useSubscribable(privateSource).length;

  useEffect(() => {
    recordActiveDragWorkspace(workspaceId);
    return () => recordActiveDragWorkspace(null);
  }, [workspaceId]);

  useEffect(() => {
    if (!mobileOpen || onCloseMobile === undefined) return;
    closeBtnRef.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onCloseMobile();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [mobileOpen, onCloseMobile]);

  const finishNav = (): void => {
    if (mobileOpen) onCloseMobile?.();
  };
  const open = (docId: string): void => {
    finishNav();
    void navigate({ href: `/s/${docId}` });
  };
  const openFolder = (folderId: string): void => {
    finishNav();
    void navigate({
      href: libraryHref({
        workspaceId,
        view: "folder",
        folder: folderId,
        q: null,
      }),
    });
  };
  const countFor = (view: string): number => {
    if (view === "favourites") return favCount;
    if (view === "private") return privateCount;
    return 0;
  };
  const viewRows = (views: readonly NavEntry[]): ReactNode => (
    // the window's edge would cut a ring drawn outside the row, so it is drawn inside, as the projects' rows are
    <div data-ring="inset" className="flex flex-col gap-0.5 px-1.5">
      {views.map(({ view, label, hint, icon: Icon, tour }) => {
        const count = countFor(view);
        return (
          <Tooltip key={view}>
            <TooltipTrigger delay={500} render={<div data-tour={tour} />}>
              <Row
                current={view === current}
                leading={<Icon aria-hidden="true" className="size-icon" />}
                trailing={
                  count > 0
                    ? [
                        <span className="tabular-nums">
                          {formatCount(count)}
                        </span>,
                      ]
                    : []
                }
                onActivate={() => {
                  finishNav();
                  void navigate({
                    href: libraryHref({
                      workspaceId,
                      view,
                      folder: null,
                      q: null,
                    }),
                  });
                }}
              >
                {label}
              </Row>
            </TooltipTrigger>
            <TooltipContent side="right">{hint}</TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
  const content = (
    <>
      {viewRows(VIEWS_ABOVE)}
      <h2 className="mn-group-label px-4!">
        {LIBRARY_FILES_WORDS.projectsHeading}
      </h2>
      <FolderTree
        workspaceId={workspaceId}
        activeFolderId={activeFolderId}
        projects={projects}
        open={open}
        openFolder={openFolder}
      />
      <div className="shrink-0 border-t border-line py-2">
        {viewRows(VIEWS_BELOW)}
      </div>
    </>
  );
  return (
    <>
      <ShellRegion
        region="left_panel"
        className="hidden w-panel-left shrink-0 flex-col border-e border-line bg-chrome pt-2 @3xl:flex"
      >
        {content}
      </ShellRegion>
      {mobileOpen ? (
        <div data-overlay="" className="@3xl:hidden">
          <div
            aria-hidden="true"
            className="fixed inset-0 z-20 bg-scrim animate-in fade-in-0 duration-(--dur-fast) ease-out"
            onClick={onCloseMobile}
          />
          <aside
            id={drawerId}
            data-tour="library:nav-drawer"
            role="dialog"
            aria-modal="true"
            aria-label={LIBRARY_WORDS.navigation}
            className="fixed inset-y-0 start-0 z-30 flex w-panel-left max-w-[85vw] flex-col border-e border-line bg-chrome shadow-overlay animate-in fade-in-0 slide-in-from-start-4 duration-(--dur-base) ease-out"
          >
            <div className="flex min-h-titlebar shrink-0 items-center justify-between border-b border-line px-3">
              <span className="text-ui font-semibold text-fg">
                {LIBRARY_WORDS.title}
              </span>
              <Button
                ref={closeBtnRef}
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={LIBRARY_WORDS.closeNavigation}
                className="cursor-pointer text-fg-muted hover:text-fg"
                onClick={onCloseMobile}
              >
                <XIcon aria-hidden="true" className="size-icon" />
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-2">
              {content}
            </div>
          </aside>
        </div>
      ) : null}
    </>
  );
}

// Loading, empty, no-episodes, filter-empty and no-access hero views for the Board screen.
import {
  BOARD_WORDS,
  Button,
  DOCUMENT_WORDS,
  Skeleton,
  WRITING_WORDS,
} from "@manent/ui";
import {
  ClapperboardIcon,
  Columns3Icon,
  LockIcon,
  PlusIcon,
  SearchIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { BoardStatusBar } from "./board-bars.tsx";
import { BoardGridSkeleton } from "./board-skeleton.tsx";

function BoardCentredNotice(props: {
  readonly label: string;
  readonly tour?: string;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <main
      data-tour={props.tour}
      aria-label={props.label}
      className="flex min-h-0 flex-1 overflow-y-auto bg-desk p-6"
    >
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        {props.children}
      </div>
    </main>
  );
}

export function BoardLoadingScreen(): ReactNode {
  return (
    <div className="flex min-h-0 flex-1 flex-col bg-chrome text-fg">
      <h1 className="sr-only">{BOARD_WORDS.board}</h1>
      <div
        aria-hidden="true"
        className="@container flex min-h-titlebar shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-chrome px-2.5 py-1 text-ui"
      >
        <Skeleton className="h-control-sm w-16" />
        <Skeleton className="h-4 w-44" />
        <Skeleton className="h-control-sm w-24" />
        <Skeleton className="ms-auto h-control-sm w-28" />
      </div>
      <main
        aria-label={BOARD_WORDS.board}
        className="flex min-h-0 flex-1 flex-col bg-desk"
      >
        <BoardGridSkeleton />
      </main>
      <BoardStatusBar />
    </div>
  );
}

export type BoardEmptyKind =
  "access_removed" | "empty" | "no_episodes" | "filter_empty";

export function deriveBoardEmptyKind(state: {
  readonly accessRemoved: boolean;
  readonly boardLoaded: boolean;
  readonly storylineCount: number;
  readonly episodeCount: number;
  readonly addingStoryline: boolean;
  readonly hasActiveFilter: boolean;
  readonly visibleCardCount: number;
}): {
  readonly empty: boolean;
  readonly showToolbar: boolean;
  readonly emptyKind: BoardEmptyKind | null;
} {
  const {
    accessRemoved,
    boardLoaded,
    storylineCount,
    episodeCount,
    addingStoryline,
    hasActiveFilter,
    visibleCardCount,
  } = state;
  const empty = boardLoaded && storylineCount === 0 && !addingStoryline;
  const noEpisodes =
    boardLoaded && !accessRemoved && !empty && episodeCount === 0;
  const showToolbar =
    boardLoaded && !accessRemoved && storylineCount > 0 && episodeCount > 0;
  const filterEmpty =
    showToolbar &&
    hasActiveFilter &&
    visibleCardCount === 0 &&
    !addingStoryline;
  const emptyKind: BoardEmptyKind | null = accessRemoved
    ? "access_removed"
    : empty
      ? "empty"
      : noEpisodes
        ? "no_episodes"
        : filterEmpty
          ? "filter_empty"
          : null;
  return { empty, showToolbar, emptyKind };
}

export function BoardEmptyView(props: {
  readonly kind: BoardEmptyKind;
  readonly label: string;
  readonly canEdit: boolean;
  onBack(): void;
  onAddStoryline(): void;
  onClearFilters(): void;
}): ReactNode {
  const { kind, label, canEdit, onBack, onAddStoryline, onClearFilters } =
    props;
  if (kind === "access_removed") {
    return (
      <BoardCentredNotice label={label}>
        <EmptyHeroCard
          icon={<LockIcon aria-hidden="true" className="size-5" />}
          description={DOCUMENT_WORDS.noAccess}
          actions={
            <Button variant="outline" onClick={onBack}>
              {WRITING_WORDS.backToLibrary}
            </Button>
          }
        />
      </BoardCentredNotice>
    );
  }
  if (kind === "empty") {
    return (
      <BoardCentredNotice label={label} tour="board">
        <EmptyHeroCard
          icon={<Columns3Icon aria-hidden="true" className="size-5" />}
          title={BOARD_WORDS.board}
          description={BOARD_WORDS.empty}
          actions={
            canEdit ? (
              <Button variant="default" onClick={onAddStoryline}>
                <PlusIcon
                  aria-hidden="true"
                  data-icon="inline-start"
                  className="size-icon"
                />
                {BOARD_WORDS.addStoryline}
              </Button>
            ) : null
          }
        />
      </BoardCentredNotice>
    );
  }
  if (kind === "no_episodes") {
    return (
      <BoardCentredNotice label={label} tour="board">
        <EmptyHeroCard
          icon={<ClapperboardIcon aria-hidden="true" className="size-5" />}
          title={BOARD_WORDS.noEpisodesTitle}
          description={BOARD_WORDS.noEpisodesDescription}
          actions={
            <Button variant="outline" onClick={onBack}>
              {WRITING_WORDS.backToLibrary}
            </Button>
          }
        />
      </BoardCentredNotice>
    );
  }
  return (
    <BoardCentredNotice label={label} tour="board">
      <EmptyHeroCard
        icon={<SearchIcon aria-hidden="true" className="size-5" />}
        description={BOARD_WORDS.noFilterMatches}
        actions={
          <Button variant="outline" onClick={onClearFilters}>
            {BOARD_WORDS.clearFilters}
          </Button>
        }
      />
    </BoardCentredNotice>
  );
}

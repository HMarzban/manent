// The Scenes panel's toolbar (full-width filter with clear button, List / Cards switch, live count) and empty-filter state.
import { Button, HISTORY_WORDS, Input, SCENE_MOVE_WORDS } from "@manent/ui";
import type { NEW_PROJECT_CARDS } from "@manent/ui";
import { SearchIcon, XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";

type Kind = (typeof NEW_PROJECT_CARDS)[number]["kind"];

export function ScenesToolbar(props: {
  filter: string;
  onFilterChange(value: string): void;
  viewSwitch: ReactNode;
  shownCount: number;
  totalCount: number;
  format: string;
  kind: Kind | null;
}): ReactNode {
  const {
    filter,
    onFilterChange,
    viewSwitch,
    shownCount,
    totalCount,
    format,
    kind,
  } = props;
  const countText = SCENE_MOVE_WORDS.countLabel(
    shownCount,
    totalCount,
    format,
    kind,
  );
  return (
    <div className="flex flex-col gap-2 border-b border-line px-3 py-2">
      <div className="relative flex items-center">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute start-2.5 size-3.5 text-fg-muted"
        />
        <Input
          type="search"
          aria-label={HISTORY_WORDS.filter}
          placeholder={HISTORY_WORDS.filter}
          value={filter}
          onChange={(event) => onFilterChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== "Escape" || filter === "") return;
            event.preventDefault();
            onFilterChange("");
          }}
          className="h-control w-full ps-8 pe-7 text-ui"
        />
        {filter === "" ? null : (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={SCENE_MOVE_WORDS.clearFilter}
            onClick={() => onFilterChange("")}
            className="absolute end-1 text-fg-muted hover:text-fg"
          >
            <XIcon aria-hidden="true" className="size-3" />
          </Button>
        )}
      </div>
      <div className="flex items-center justify-between gap-2">
        {viewSwitch}
        <span
          aria-live="polite"
          className="ms-auto truncate text-meta text-fg-muted tabular-nums"
        >
          {countText}
        </span>
      </div>
    </div>
  );
}

export function ScenesFilterEmpty(props: {
  format: string;
  kind: Kind | null;
  onClear(): void;
}): ReactNode {
  const { format, kind, onClear } = props;
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto p-3">
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        <EmptyHeroCard
          compact
          icon={<SearchIcon aria-hidden="true" className="size-4" />}
          description={SCENE_MOVE_WORDS.noMatches(format, kind)}
          actions={
            <Button type="button" variant="outline" size="sm" onClick={onClear}>
              {SCENE_MOVE_WORDS.clearFilter}
            </Button>
          }
        />
      </div>
    </div>
  );
}

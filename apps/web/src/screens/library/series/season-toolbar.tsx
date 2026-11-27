// Compact episode filter toolbar for longer seasons: search, Writer filter, Stage filter and Needs attention toggle.
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  SERIES_WORDS,
  formatCount,
} from "@manent/ui";
import {
  AlertCircleIcon,
  ChevronDownIcon,
  SearchIcon,
  UserIcon,
  XIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { SeriesPerson } from "./series-facts.ts";

export interface SeasonToolbarProps {
  readonly query: string;
  readonly writers: readonly SeriesPerson[];
  readonly selectedWriterId: string | null;
  readonly stages: readonly string[];
  readonly selectedStage: string | null;
  readonly attentionOnly: boolean;
  readonly attentionCount: number;
  readonly shownCount: number;
  readonly totalCount: number;
  readonly hasActiveFilter: boolean;
  onQueryChange(next: string): void;
  onSelectWriter(userId: string | null): void;
  onSelectStage(stage: string | null): void;
  onToggleAttention(): void;
  onClearFilters(): void;
}

export function SeasonToolbar(props: SeasonToolbarProps): ReactNode {
  const {
    query,
    writers,
    selectedWriterId,
    stages,
    selectedStage,
    attentionOnly,
    attentionCount,
    shownCount,
    totalCount,
    hasActiveFilter,
    onQueryChange,
    onSelectWriter,
    onSelectStage,
    onToggleAttention,
    onClearFilters,
  } = props;

  const selectedWriterName =
    selectedWriterId === null
      ? SERIES_WORDS.allWriters
      : (writers.find((w) => w.userId === selectedWriterId)?.name ??
        SERIES_WORDS.allWriters);

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-ui">
      <div className="relative w-44 max-w-full shrink-0 @sm:w-52">
        <SearchIcon
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 start-2.5 size-3.5 -translate-y-1/2 text-fg-muted"
        />
        <Input
          type="search"
          value={query}
          aria-label={SERIES_WORDS.filterLabel}
          placeholder={SERIES_WORDS.filterPlaceholder}
          onChange={(e) => onQueryChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && query !== "") {
              e.preventDefault();
              e.stopPropagation();
              onQueryChange("");
            }
          }}
          className="h-control-sm ps-7 pe-7 text-ui"
        />
        {query !== "" ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={SERIES_WORDS.clearFilters}
            onClick={() => onQueryChange("")}
            className="absolute top-1/2 end-0.5 -translate-y-1/2 text-fg-muted hover:text-fg"
          >
            <XIcon aria-hidden="true" className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {writers.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={selectedWriterId !== null ? true : undefined}
                className="max-w-40 cursor-pointer gap-1.5 text-ui"
              />
            }
          >
            <UserIcon aria-hidden="true" className="size-icon shrink-0" />
            <span className="truncate">{selectedWriterName}</span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-fg-muted"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {writers.map((writer) => (
              <DropdownMenuCheckboxItem
                key={writer.userId}
                checked={selectedWriterId === writer.userId}
                onCheckedChange={() =>
                  onSelectWriter(
                    selectedWriterId === writer.userId ? null : writer.userId,
                  )
                }
              >
                <span className="truncate">{writer.name}</span>
              </DropdownMenuCheckboxItem>
            ))}
            {selectedWriterId !== null ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSelectWriter(null)}>
                  <span>{SERIES_WORDS.allWriters}</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {stages.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={selectedStage !== null ? true : undefined}
                className="max-w-40 cursor-pointer gap-1.5 text-ui"
              />
            }
          >
            <span className="truncate">
              {selectedStage ?? SERIES_WORDS.allStages}
            </span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-fg-muted"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {stages.map((stage) => (
              <DropdownMenuCheckboxItem
                key={stage}
                checked={selectedStage === stage}
                onCheckedChange={() =>
                  onSelectStage(selectedStage === stage ? null : stage)
                }
              >
                <span className="truncate">{stage}</span>
              </DropdownMenuCheckboxItem>
            ))}
            {selectedStage !== null ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onSelectStage(null)}>
                  <span>{SERIES_WORDS.allStages}</span>
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      {attentionCount > 0 || attentionOnly ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-pressed={attentionOnly}
          aria-label={SERIES_WORDS.needsAttentionLabel}
          onClick={onToggleAttention}
          className="cursor-pointer gap-1.5 text-ui"
        >
          <AlertCircleIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-attention"
          />
          <span>{SERIES_WORDS.needsAttention}</span>
          {attentionCount > 0 ? (
            <span className="text-micro text-fg-muted tabular-nums">
              {formatCount(attentionCount)}
            </span>
          ) : null}
        </Button>
      ) : null}

      {hasActiveFilter ? (
        <div className="flex items-center gap-1.5">
          <span
            aria-live="polite"
            className="text-meta text-fg-muted tabular-nums"
          >
            {SERIES_WORDS.filterCount(shownCount, totalCount)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClearFilters}
            className="cursor-pointer text-meta text-fg-muted hover:text-fg"
          >
            {SERIES_WORDS.clearFilters}
          </Button>
        </div>
      ) : null}
    </div>
  );
}

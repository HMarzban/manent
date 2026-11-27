// Print-only archival masthead rendered at the top of a printed landscape Season Wall-Board.
import type { SeasonEntry } from "@manent/crdt";
import { BOARD_WORDS } from "@manent/ui";
import type { ReactNode } from "react";

function formatSeasonHeading(season: SeasonEntry | null): string | null {
  if (season === null) return null;
  const title = season.title?.trim() ?? "";
  return title === ""
    ? BOARD_WORDS.seasonOption(season.number)
    : BOARD_WORDS.seasonOptionWithTitle(season.number, title);
}

export function BoardPrintHeader(props: {
  readonly projectTitle: string;
  readonly activeSeason: SeasonEntry | null;
  readonly summary: string | null;
  readonly hasActiveFilter: boolean;
}): ReactNode {
  const { projectTitle, activeSeason, summary, hasActiveFilter } = props;
  const seasonText = formatSeasonHeading(activeSeason);
  const dateText = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  return (
    <header className="mn-board-print-header hidden print:flex print:items-baseline print:justify-between print:gap-4 print:border-b print:border-line print:pb-2 print:mb-3">
      <div className="flex min-w-0 flex-wrap items-baseline gap-2">
        <span className="text-heading font-semibold text-fg">
          {BOARD_WORDS.title(projectTitle)}
        </span>
        {seasonText !== null ? (
          <span className="text-title text-fg-muted">{seasonText}</span>
        ) : null}
        {hasActiveFilter ? (
          <span className="mn-tag">{BOARD_WORDS.printFilteredNote}</span>
        ) : null}
      </div>
      <div className="flex shrink-0 items-baseline gap-3 text-meta text-fg-muted tabular-nums">
        {summary !== null ? <span>{summary}</span> : null}
        <span>{BOARD_WORDS.printedOn(dateText)}</span>
      </div>
    </header>
  );
}

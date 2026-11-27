// The Board's title bar and status bar (with season summary and active studio theme gem).
import type { SeasonEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  Button,
  DOCUMENT_WORDS,
  MessageSlot,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  stateBarLines,
} from "@manent/ui";
import { EyeIcon, PlusIcon, PrinterIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { AppPaletteGem } from "../../shell/app-palette-gem.tsx";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import {
  BackButton,
  TitleBarAccount,
  TitleBarDivider,
} from "../../shell/title-bar-pieces.tsx";
import { useCommandActions } from "../document/status-bar.tsx";

export { BoardToolbar } from "./board-toolbar.tsx";
export type { BoardToolbarProps } from "./board-toolbar.tsx";

const VIEW_ONLY =
  stateBarLines([{ kind: "role_comment" }]).left?.sentence ?? "";

function seasonLabel(season: SeasonEntry): string {
  const title = season.title?.trim() ?? "";
  return title === ""
    ? BOARD_WORDS.seasonOption(season.number)
    : BOARD_WORDS.seasonOptionWithTitle(season.number, title);
}

export interface BoardTitleBarProps {
  readonly projectTitle: string;
  readonly seasons: readonly SeasonEntry[];
  readonly activeSeason: SeasonEntry | null;
  readonly canEdit: boolean;
  readonly showViewOnly: boolean;
  readonly empty?: boolean;
  onBack(): void;
  onSeasonChange(seasonId: string): void;
  onAddStoryline(): void;
  onPrint?(): void;
}

export function BoardTitleBar(props: BoardTitleBarProps): ReactNode {
  const {
    projectTitle,
    seasons,
    activeSeason,
    canEdit,
    showViewOnly,
    empty = false,
    onBack,
    onSeasonChange,
    onAddStoryline,
    onPrint,
  } = props;
  return (
    <ShellRegion
      region="title_bar"
      className="@container flex min-h-titlebar shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-chrome px-2.5 py-1 text-ui print:hidden"
    >
      <BackButton label={DOCUMENT_WORDS.back} onClick={onBack} />
      <TitleBarDivider />
      <h1
        tabIndex={-1}
        className="min-w-0 flex-1 truncate text-title font-semibold outline-none"
      >
        {BOARD_WORDS.title(projectTitle)}
      </h1>
      {seasons.length > 0 && activeSeason !== null ? (
        <div className="flex shrink-0 items-center gap-2 ps-1 @md:ps-2">
          <span className="hidden text-meta text-fg-muted @md:inline">
            {BOARD_WORDS.seasonLabel}
          </span>
          <Select
            value={activeSeason.id}
            onValueChange={(nextSeasonId) => {
              if (typeof nextSeasonId === "string")
                onSeasonChange(nextSeasonId);
            }}
          >
            <SelectTrigger aria-label={BOARD_WORDS.seasonLabel}>
              <SelectValue>{seasonLabel(activeSeason)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.id}>
                  {seasonLabel(season)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}
      {showViewOnly ? (
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line bg-raised px-2 py-0.5 text-meta text-fg-muted">
          <EyeIcon aria-hidden="true" className="size-icon" />
          {VIEW_ONLY}
        </span>
      ) : null}
      {onPrint !== undefined && !empty ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={BOARD_WORDS.printBoard}
          title={BOARD_WORDS.printBoard}
          onClick={onPrint}
          className="cursor-pointer text-fg-muted hover:text-fg"
        >
          <PrinterIcon aria-hidden="true" className="size-icon" />
        </Button>
      ) : null}
      {canEdit && !empty ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="default"
            aria-label={BOARD_WORDS.addStoryline}
            onClick={onAddStoryline}
            className="cursor-pointer gap-1.5 px-2 @sm:px-3"
          >
            <PlusIcon aria-hidden="true" className="size-icon" />
            <span className="hidden @sm:inline">
              {BOARD_WORDS.addStoryline}
            </span>
          </Button>
        </div>
      ) : null}
      <TitleBarAccount />
    </ShellRegion>
  );
}

export interface BoardStatusBarProps {
  readonly summary?: string | null;
}

export function BoardStatusBar(props: BoardStatusBarProps = {}): ReactNode {
  const { summary = null } = props;
  const { messages } = useServices();
  const { run, registered } = useCommandActions();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-1 overflow-x-auto border-t border-line bg-chrome px-2 text-ui print:hidden"
    >
      {summary !== null ? (
        <span className="hidden shrink-0 px-2 text-meta text-fg-muted tabular-nums sm:inline">
          {summary}
        </span>
      ) : null}
      <div
        className={
          summary !== null
            ? "flex min-w-0 flex-1 items-center sm:border-s sm:border-line sm:ps-2"
            : "flex min-w-0 flex-1 items-center"
        }
      >
        <MessageSlot queue={messages} run={run} registered={registered} />
      </div>
      <CommandsButton />
      <AppPaletteGem className="ms-1 max-sm:hidden" />
    </ShellRegion>
  );
}

// The Board's title bar (Back, title, season selector, View only, Add storyline) and status bar.
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
import { EyeIcon, PlusIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { CommandsButton } from "../../shell/commands-button.tsx";
import { ShellRegion } from "../../shell/regions.tsx";
import {
  BackButton,
  TitleBarAccount,
  TitleBarDivider,
} from "../../shell/title-bar-pieces.tsx";
import { useCommandActions } from "../document/status-bar.tsx";

const VIEW_ONLY =
  stateBarLines([{ kind: "role_comment" }]).left?.sentence ?? "";

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
  } = props;
  return (
    <ShellRegion
      region="title_bar"
      className="@container flex min-h-titlebar shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-line bg-chrome px-2.5 py-1 text-ui"
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
        <div className="flex shrink-0 items-center gap-2 ps-1 sm:ps-2">
          <span className="hidden text-meta text-fg-muted sm:inline">
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
              <SelectValue>
                {BOARD_WORDS.seasonOption(activeSeason.number)}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {seasons.map((season) => (
                <SelectItem key={season.id} value={season.id}>
                  {BOARD_WORDS.seasonOption(season.number)}
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
      {canEdit && !empty ? (
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="default"
            aria-label={BOARD_WORDS.addStoryline}
            onClick={onAddStoryline}
            className="cursor-pointer gap-1.5 px-2 sm:px-3"
          >
            <PlusIcon aria-hidden="true" className="size-icon" />
            <span className="hidden sm:inline">{BOARD_WORDS.addStoryline}</span>
          </Button>
        </div>
      ) : null}
      <TitleBarAccount />
    </ShellRegion>
  );
}

export function BoardStatusBar(): ReactNode {
  const { messages } = useServices();
  const { run, registered } = useCommandActions();
  return (
    <ShellRegion
      region="status_bar"
      className="flex h-statusbar shrink-0 items-center gap-1 border-t border-line bg-chrome px-2 text-ui"
    >
      <MessageSlot queue={messages} run={run} registered={registered} />
      <CommandsButton />
    </ShellRegion>
  );
}

// Menu entries shared by a Board card's row handle and right-click context menu.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  PLACE_WORDS,
  PRODUCTION_OUTPUTS_WORDS,
  READOUT_WORDS,
  SERIES_WORDS,
} from "@manent/ui";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ClapperboardIcon,
  CopyIcon,
  EyeIcon,
  FlagIcon,
  LayersIcon,
  Link2Icon,
  PencilIcon,
  Trash2Icon,
  Unlink2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import { requestEpisodeScenes } from "../../board/episode-scenes.ts";
import type { EpisodeScenesState } from "../../board/episode-scenes.ts";
import type {
  BoardCard,
  BoardStoryline,
  StorylineTone,
} from "../../board/model.ts";
import type { PersonServices } from "../../services/ports.ts";

const episodeOptionLabel = (ep: EpisodeEntry): string =>
  `${ep.number} · ${ep.title ?? SERIES_WORDS.untitledEpisode}`;

export function CardMenuItems(props: {
  services: PersonServices;
  card: BoardCard;
  episode: EpisodeEntry;
  storylines: readonly BoardStoryline[];
  laneByStoryline: ReadonlyMap<string, StorylineTone>;
  episodes: readonly EpisodeEntry[];
  scenesState: EpisodeScenesState | undefined;
  onOpen(): void;
  onStartEdit(): void;
  onPreviewScene?(): void;
  onDuplicate?(): void;
  onToggleFlag?(): void;
  onLinkScene(blockId: string | null): void;
  onMoveToEpisode(episodeId: string): void;
  onMoveToStoryline(storylineId: string): void;
  onRemove(): void;
}): ReactNode {
  const {
    services,
    card,
    episode,
    storylines,
    laneByStoryline,
    episodes,
    scenesState,
    onOpen,
    onStartEdit,
    onPreviewScene,
    onDuplicate,
    onToggleFlag,
    onLinkScene,
    onMoveToEpisode,
    onMoveToStoryline,
    onRemove,
  } = props;
  const scriptId = episode.docIds.script;
  const hasScript = scriptId !== null;
  const hasOutline = episode.docIds.outline !== null;
  const canOpen = hasScript || hasOutline;
  const openLabel =
    card.link !== null && hasScript
      ? BOARD_WORDS.openScene
      : hasScript
        ? BOARD_WORDS.openScript
        : BOARD_WORDS.openOutline;
  const loadScenes = (): void => {
    if (scriptId !== null) requestEpisodeScenes(services, scriptId);
  };
  const needsScript = BOARD_WORDS.needsScript(episode.number);
  const scenes = scenesState?.status === "ready" ? scenesState.scenes : [];
  return (
    <>
      {canOpen ? (
        <DropdownMenuItem onClick={onOpen}>
          <ArrowUpRightIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{openLabel}</span>
        </DropdownMenuItem>
      ) : null}
      {card.link !== null && hasScript && onPreviewScene !== undefined ? (
        <DropdownMenuItem onClick={onPreviewScene}>
          <EyeIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{BOARD_WORDS.previewScene}</span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem onClick={onStartEdit}>
        <PencilIcon aria-hidden="true" className="size-icon shrink-0" />
        <span>{BOARD_WORDS.editCard}</span>
      </DropdownMenuItem>
      {onDuplicate !== undefined ? (
        <DropdownMenuItem onClick={onDuplicate}>
          <CopyIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{BOARD_WORDS.duplicateCard}</span>
        </DropdownMenuItem>
      ) : null}
      {onToggleFlag !== undefined ? (
        <DropdownMenuItem onClick={onToggleFlag}>
          <FlagIcon
            aria-hidden="true"
            className={
              card.flagged === true
                ? "size-icon shrink-0 text-attention"
                : "size-icon shrink-0"
            }
          />
          <span>
            {card.flagged === true
              ? BOARD_WORDS.clearFlag
              : BOARD_WORDS.flagCard}
          </span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSeparator />
      {hasScript ? (
        <DropdownMenuSub onOpenChange={(open) => open && loadScenes()}>
          <DropdownMenuSubTrigger
            data-tour="board.linkScene"
            onPointerEnter={loadScenes}
            onFocus={loadScenes}
          >
            <Link2Icon aria-hidden="true" className="size-icon shrink-0" />
            <span>
              {card.link !== null
                ? BOARD_WORDS.changeScene
                : BOARD_WORDS.linkToScene}
            </span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
            {scenesState === undefined || scenesState.status === "loading" ? (
              <DropdownMenuItem disabled>
                <span>{BOARD_WORDS.loadingScenes}</span>
              </DropdownMenuItem>
            ) : scenesState.status === "unavailable" ? (
              <DropdownMenuItem disabled>
                <span>{BOARD_WORDS.scenesUnavailable}</span>
              </DropdownMenuItem>
            ) : scenes.length === 0 ? (
              <DropdownMenuItem disabled>
                <span>{PRODUCTION_OUTPUTS_WORDS.noScenesForSides}</span>
              </DropdownMenuItem>
            ) : (
              scenes.map((scene) => (
                <DropdownMenuItem
                  key={scene.blockId}
                  onClick={() => onLinkScene(scene.blockId)}
                >
                  <span className="flex-1 truncate">
                    {PLACE_WORDS.scene(scene.number, scene.heading)}
                  </span>
                  {card.link?.blockId === scene.blockId ? (
                    <CheckIcon
                      aria-hidden="true"
                      className="size-icon shrink-0 text-fg-accent"
                    />
                  ) : null}
                </DropdownMenuItem>
              ))
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : (
        <DropdownMenuItem
          disabled
          title={READOUT_WORDS.unavailable(
            BOARD_WORDS.linkToScene,
            needsScript,
          )}
        >
          <Link2Icon aria-hidden="true" className="size-icon shrink-0" />
          <span className="flex flex-col">
            <span>{BOARD_WORDS.linkToScene}</span>
            <span className="text-meta text-fg-muted">{needsScript}</span>
          </span>
        </DropdownMenuItem>
      )}
      {card.link !== null ? (
        <DropdownMenuItem onClick={() => onLinkScene(null)}>
          <Unlink2Icon aria-hidden="true" className="size-icon shrink-0" />
          <span>{BOARD_WORDS.removeLink}</span>
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ClapperboardIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{BOARD_WORDS.moveToEpisode}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {episodes.map((ep) => (
            <DropdownMenuItem
              key={ep.id}
              onClick={() => onMoveToEpisode(ep.id)}
            >
              <span className="flex-1 truncate">{episodeOptionLabel(ep)}</span>
              {ep.id === card.episodeId ? (
                <CheckIcon
                  aria-hidden="true"
                  className="size-icon shrink-0 text-fg-accent"
                />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <LayersIcon aria-hidden="true" className="size-icon shrink-0" />
          <span>{BOARD_WORDS.moveToStoryline}</span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {storylines.map((row) => (
            <DropdownMenuItem
              key={row.id}
              onClick={() => onMoveToStoryline(row.id)}
            >
              <span
                aria-hidden="true"
                data-lane={laneByStoryline.get(row.id)}
                className="mn-board-lane-dot"
              />
              <span className="flex-1 truncate">{row.title}</span>
              {row.id === card.storylineId ? (
                <CheckIcon
                  aria-hidden="true"
                  className="size-icon shrink-0 text-fg-accent"
                />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onRemove}>
        <Trash2Icon aria-hidden="true" className="size-icon shrink-0" />
        <span>{BOARD_WORDS.remove}</span>
      </DropdownMenuItem>
    </>
  );
}

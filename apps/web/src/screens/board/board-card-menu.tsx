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
  CheckIcon,
  ClapperboardIcon,
  LayersIcon,
  Link2Icon,
  Trash2Icon,
  Unlink2Icon,
} from "lucide-react";
import type { ReactNode } from "react";
import { requestEpisodeScenes } from "../../board/episode-scenes.ts";
import type { EpisodeScene } from "../../board/episode-scenes.ts";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";
import type { PersonServices } from "../../services/ports.ts";

const episodeOptionLabel = (ep: EpisodeEntry): string =>
  `${ep.number} · ${ep.title ?? SERIES_WORDS.untitledEpisode}`;

export function CardMenuItems(props: {
  services: PersonServices;
  card: BoardCard;
  episode: EpisodeEntry;
  storylines: readonly BoardStoryline[];
  episodes: readonly EpisodeEntry[];
  scenes: readonly EpisodeScene[];
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
    episodes,
    scenes,
    onLinkScene,
    onMoveToEpisode,
    onMoveToStoryline,
    onRemove,
  } = props;
  const scriptId = episode.docIds.script;
  const hasScript = scriptId !== null;
  const loadScenes = (): void => {
    if (scriptId !== null) requestEpisodeScenes(services, scriptId);
  };
  const needsScript = BOARD_WORDS.needsScript(episode.number);
  return (
    <>
      {hasScript ? (
        <DropdownMenuSub onOpenChange={(open) => open && loadScenes()}>
          <DropdownMenuSubTrigger
            data-tour="board.linkScene"
            onPointerEnter={loadScenes}
            onFocus={loadScenes}
          >
            <Link2Icon aria-hidden="true" className="size-icon shrink-0" />
            {BOARD_WORDS.linkToScene}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {scenes.length === 0 ? (
              <DropdownMenuItem disabled>
                {PRODUCTION_OUTPUTS_WORDS.noScenesForSides}
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
                    <CheckIcon aria-hidden="true" className="text-fg-accent" />
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
          {BOARD_WORDS.removeLink}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <ClapperboardIcon aria-hidden="true" className="size-icon shrink-0" />
          {BOARD_WORDS.moveToEpisode}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {episodes.map((ep) => (
            <DropdownMenuItem
              key={ep.id}
              onClick={() => onMoveToEpisode(ep.id)}
            >
              <span className="flex-1 truncate">{episodeOptionLabel(ep)}</span>
              {ep.id === card.episodeId ? (
                <CheckIcon aria-hidden="true" className="text-fg-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <LayersIcon aria-hidden="true" className="size-icon shrink-0" />
          {BOARD_WORDS.moveToStoryline}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {storylines.map((row) => (
            <DropdownMenuItem
              key={row.id}
              onClick={() => onMoveToStoryline(row.id)}
            >
              <span className="flex-1 truncate">{row.title}</span>
              {row.id === card.storylineId ? (
                <CheckIcon aria-hidden="true" className="text-fg-accent" />
              ) : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onRemove}>
        <Trash2Icon aria-hidden="true" className="size-icon shrink-0" />
        {BOARD_WORDS.remove}
      </DropdownMenuItem>
    </>
  );
}

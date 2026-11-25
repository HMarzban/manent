// One card on the Board: accessible name, in-place text edit, linked scene place, row menu and scene picker.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  PLACE_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  READOUT_WORDS,
  SERIES_WORDS,
  Textarea,
} from "@manent/ui";
import { CheckIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { requestEpisodeScenes } from "../../board/episode-scenes.ts";
import type { EpisodeScene } from "../../board/episode-scenes.ts";
import type { BoardCard, BoardStoryline } from "../../board/model.ts";
import { useServices } from "../../services/context.tsx";
import type { PersonServices } from "../../services/ports.ts";
import { RowMenu } from "../library/row-place.tsx";

export interface BoardCardProps {
  readonly card: BoardCard;
  readonly storyline: BoardStoryline;
  readonly episode: EpisodeEntry;
  readonly storylines: readonly BoardStoryline[];
  readonly episodes: readonly EpisodeEntry[];
  readonly scenes: readonly EpisodeScene[];
  readonly selected: boolean;
  readonly canEdit: boolean;
  readonly linkingOpen: boolean;
  onLinkingOpenChange(open: boolean): void;
  onSelect(): void;
  onOpen(): void;
  onEditText(text: string): void;
  onLinkScene(blockId: string | null): void;
  onMoveToEpisode(episodeId: string): void;
  onMoveToStoryline(storylineId: string): void;
  onRemove(): void;
}

const stopEvent = (event: SyntheticEvent): void => event.stopPropagation();

const episodeOptionLabel = (ep: EpisodeEntry): string =>
  `${ep.number} · ${ep.title ?? SERIES_WORDS.untitledEpisode}`;

function CardMenuItems(props: {
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
            {BOARD_WORDS.linkToScene}
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {scenes.map((scene) => (
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
            ))}
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
          <span className="flex flex-col">
            <span>{BOARD_WORDS.linkToScene}</span>
            <span className="text-meta text-fg-muted">{needsScript}</span>
          </span>
        </DropdownMenuItem>
      )}
      {card.link !== null ? (
        <DropdownMenuItem onClick={() => onLinkScene(null)}>
          {BOARD_WORDS.removeLink}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
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
      <DropdownMenuItem onClick={onRemove}>
        {BOARD_WORDS.remove}
      </DropdownMenuItem>
    </>
  );
}

export function BoardCardItem(props: BoardCardProps): ReactNode {
  const {
    card,
    storyline,
    episode,
    storylines,
    episodes,
    scenes,
    selected,
    canEdit,
    linkingOpen,
    onLinkingOpenChange,
    onSelect,
    onOpen,
    onEditText,
    onLinkScene,
    onMoveToEpisode,
    onMoveToStoryline,
    onRemove,
  } = props;
  const services = useServices();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const scriptId = episode.docIds.script;
  const needsScenes = linkingOpen || card.link !== null;
  useEffect(() => {
    if (needsScenes && scriptId !== null)
      requestEpisodeScenes(services, scriptId);
  }, [services, needsScenes, scriptId]);

  const linkedScene =
    card.link === null
      ? null
      : (scenes.find((scene) => scene.blockId === card.link?.blockId) ?? null);
  const cardAriaLabel = BOARD_WORDS.cardLabel(
    card.text,
    episode.number,
    storyline.title,
  );

  const startEdit = (): void => {
    if (!canEdit) return;
    setDraft(card.text);
    setEditing(true);
  };

  const commitEdit = (): void => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== card.text) onEditText(trimmed);
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      commitEdit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      setEditing(false);
    }
  };

  const onCardKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.target !== event.currentTarget) return;
    if (event.key === "Enter") {
      event.preventDefault();
      onOpen();
    } else if (event.key === "F2" && canEdit) {
      event.preventDefault();
      startEdit();
    }
  };

  const menuItems = (
    <CardMenuItems
      services={services}
      card={card}
      episode={episode}
      storylines={storylines}
      episodes={episodes}
      scenes={scenes}
      onLinkScene={onLinkScene}
      onMoveToEpisode={onMoveToEpisode}
      onMoveToStoryline={onMoveToStoryline}
      onRemove={onRemove}
    />
  );

  const surface = (
    <div
      role="group"
      tabIndex={0}
      data-board-card={card.id}
      aria-label={cardAriaLabel}
      aria-current={selected ? "true" : undefined}
      onFocus={onSelect}
      onClick={onSelect}
      onDoubleClick={canEdit ? startEdit : onOpen}
      onKeyDown={onCardKeyDown}
      className="mn-card group/card flex cursor-pointer flex-col gap-1 p-2 text-start text-ui"
    >
      {editing && canEdit ? (
        <div onClick={stopEvent} onKeyDown={stopEvent}>
          <Textarea
            autoFocus
            rows={2}
            aria-label={BOARD_WORDS.cardPlaceholder}
            placeholder={BOARD_WORDS.cardPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={onEditKeyDown}
            className="min-h-0 resize-none p-2 text-ui"
          />
        </div>
      ) : (
        <div className="flex items-start gap-1">
          <span className="min-w-0 flex-1 break-words text-fg">
            {card.text}
          </span>
          {canEdit ? (
            <span className="opacity-0 transition-opacity duration-(--dur-fast) group-hover/card:opacity-100 group-focus-within/card:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
              <RowMenu title={card.text}>{menuItems}</RowMenu>
            </span>
          ) : null}
        </div>
      )}
      {linkedScene !== null ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen();
          }}
          onKeyDown={stopEvent}
          className="cursor-pointer self-start text-meta text-fg-accent tabular-nums hover:underline"
        >
          {BOARD_WORDS.linkedPlace(episode.number, linkedScene.number)}
        </button>
      ) : null}
    </div>
  );

  const onScenePickerKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = [...event.currentTarget.querySelectorAll("button")];
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onLinkingOpenChange(false);
      return;
    }
    if (items.length === 0) return;
    const index = items.findIndex((item) => item === event.target);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[index <= 0 ? items.length - 1 : index - 1]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items.at(-1)?.focus();
    }
  };

  const withScenePicker =
    linkingOpen && canEdit && episode.docIds.script !== null ? (
      <Popover
        open
        onOpenChange={(open) => {
          if (!open) onLinkingOpenChange(false);
        }}
      >
        <PopoverTrigger nativeButton={false} render={surface} />
        <PopoverContent
          align="start"
          className="flex w-auto max-w-menu-max min-w-menu-min flex-col p-1"
          onKeyDown={onScenePickerKeyDown}
        >
          {scenes.map((scene) => (
            <button
              key={scene.blockId}
              type="button"
              onClick={() => {
                onLinkScene(scene.blockId);
                onLinkingOpenChange(false);
              }}
              className="flex min-h-row cursor-pointer items-center gap-2 rounded-control px-2 text-start text-ui text-fg transition-colors hover:bg-subtle active:bg-control"
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
            </button>
          ))}
        </PopoverContent>
      </Popover>
    ) : (
      surface
    );

  if (!canEdit || editing) return withScenePicker;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={withScenePicker} />
      <ContextMenuContent>{menuItems}</ContextMenuContent>
    </ContextMenu>
  );
}

// One card on the Board: lane rail, grip, sibling menu/edit actions, in-place text edit, linked scene preview and scene picker.
import type { EpisodeEntry } from "@manent/crdt";
import {
  BOARD_WORDS,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  Textarea,
} from "@manent/ui";
import {
  FileTextIcon,
  FlagIcon,
  GripVerticalIcon,
  PencilIcon,
  Unlink2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode, SyntheticEvent } from "react";
import { requestEpisodeScenes } from "../../board/episode-scenes.ts";
import type { EpisodeScenesState } from "../../board/episode-scenes.ts";
import type {
  BoardCard,
  BoardStoryline,
  StorylineTone,
} from "../../board/model.ts";
import { useServices } from "../../services/context.tsx";
import { RowMenu } from "../library/row-place.tsx";
import { CardMenuItems } from "./board-card-menu.tsx";
import { BoardScenePeek } from "./board-scene-peek.tsx";
import type { BoardDensity } from "./board-view.ts";
import { ScenePickerPopover } from "./scene-picker-popover.tsx";

export interface BoardCardProps {
  readonly card: BoardCard;
  readonly storyline: BoardStoryline;
  readonly lane: StorylineTone;
  readonly episode: EpisodeEntry;
  readonly storylines: readonly BoardStoryline[];
  readonly laneByStoryline: ReadonlyMap<string, StorylineTone>;
  readonly episodes: readonly EpisodeEntry[];
  readonly scenesState: EpisodeScenesState | undefined;
  readonly density: BoardDensity;
  readonly selected: boolean;
  readonly canEdit: boolean;
  readonly linkingOpen: boolean;
  readonly peekingOpen?: boolean;
  onLinkingOpenChange(open: boolean): void;
  onPeekingOpenChange?(open: boolean): void;
  onSelect(): void;
  onOpen(): void;
  onEditText(text: string): void;
  onLinkScene(blockId: string | null): void;
  onDuplicate?(): void;
  onToggleFlag?(): void;
  onMoveToEpisode(episodeId: string): void;
  onMoveToStoryline(storylineId: string): void;
  onRemove(): void;
}

const stopEvent = (event: SyntheticEvent): void => event.stopPropagation();

export function BoardCardItem(props: BoardCardProps): ReactNode {
  const {
    card,
    storyline,
    lane,
    episode,
    storylines,
    laneByStoryline,
    episodes,
    scenesState,
    density,
    selected,
    canEdit,
    linkingOpen,
    peekingOpen = false,
    onLinkingOpenChange,
    onPeekingOpenChange,
    onSelect,
    onOpen,
    onEditText,
    onLinkScene,
    onDuplicate,
    onToggleFlag,
    onMoveToEpisode,
    onMoveToStoryline,
    onRemove,
  } = props;
  const services = useServices();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const settledEditRef = useRef(false);
  const scriptId = episode.docIds.script;
  const needsScenes = linkingOpen || card.link !== null;

  useEffect(() => {
    if (needsScenes && scriptId !== null)
      requestEpisodeScenes(services, scriptId);
  }, [services, needsScenes, scriptId]);

  const scenes = scenesState?.status === "ready" ? scenesState.scenes : [];
  const linkedScene =
    card.link === null
      ? null
      : (scenes.find((scene) => scene.blockId === card.link?.blockId) ?? null);
  const linkMissing =
    card.link !== null &&
    scenesState?.status === "ready" &&
    linkedScene === null;
  const linkLoading =
    card.link !== null &&
    (scenesState === undefined || scenesState.status === "loading");

  const cardAriaLabel = BOARD_WORDS.cardLabel(
    card.text,
    episode.number,
    storyline.title,
  );

  const restoreCardFocus = (): void => {
    requestAnimationFrame(() => surfaceRef.current?.focus());
  };

  const startEdit = (): void => {
    if (!canEdit) return;
    settledEditRef.current = false;
    setDraft(card.text);
    setEditing(true);
  };

  const commitEdit = (restoreFocus: boolean): void => {
    if (settledEditRef.current) return;
    settledEditRef.current = true;
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== card.text) onEditText(trimmed);
    if (restoreFocus) restoreCardFocus();
  };

  const cancelEdit = (): void => {
    if (settledEditRef.current) return;
    settledEditRef.current = true;
    setEditing(false);
    restoreCardFocus();
  };

  const onEditKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
    event.stopPropagation();
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      commitEdit(true);
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
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
      laneByStoryline={laneByStoryline}
      episodes={episodes}
      scenesState={scenesState}
      onOpen={onOpen}
      onStartEdit={startEdit}
      onPreviewScene={
        onPeekingOpenChange === undefined
          ? undefined
          : () => onPeekingOpenChange(true)
      }
      onDuplicate={onDuplicate}
      onToggleFlag={onToggleFlag}
      onLinkScene={onLinkScene}
      onMoveToEpisode={onMoveToEpisode}
      onMoveToStoryline={onMoveToStoryline}
      onRemove={onRemove}
    />
  );

  const hasOutlineOnly = scriptId === null && episode.docIds.outline !== null;
  const showFooter =
    linkedScene !== null || linkLoading || linkMissing || hasOutlineOnly;
  const isCompact = density === "compact";
  const clampClass =
    density === "compact"
      ? " line-clamp-2"
      : density === "fit"
        ? " line-clamp-3"
        : "";

  const surface = (
    <div
      ref={surfaceRef}
      role="group"
      tabIndex={0}
      data-board-card={card.id}
      data-lane={lane}
      aria-label={cardAriaLabel}
      aria-current={selected ? "true" : undefined}
      onFocus={onSelect}
      onClick={onSelect}
      onDoubleClick={canEdit ? startEdit : onOpen}
      onKeyDown={onCardKeyDown}
      className="mn-card mn-board-card flex w-full cursor-pointer flex-col gap-1.5 text-start text-ui"
    >
      {editing && canEdit ? (
        <div
          onClick={stopEvent}
          onPointerDown={stopEvent}
          onKeyDown={stopEvent}
        >
          <Textarea
            autoFocus
            rows={2}
            aria-label={BOARD_WORDS.cardPlaceholder}
            placeholder={BOARD_WORDS.cardPlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => commitEdit(false)}
            onKeyDown={onEditKeyDown}
            className="min-h-0 resize-none p-2 text-ui"
          />
        </div>
      ) : (
        <div className="flex min-w-0 items-start gap-1.5">
          {canEdit ? (
            <GripVerticalIcon
              aria-hidden="true"
              className="mt-0.5 size-3.5 shrink-0 text-fg-muted opacity-40 transition-opacity duration-(--dur-fast) group-hover/card:opacity-100 group-focus-within/card:opacity-100 print:hidden"
            />
          ) : null}
          <span
            title={density !== "comfortable" ? card.text : undefined}
            className={`mn-board-card-text min-w-0 flex-1 leading-snug break-words text-fg${clampClass}`}
          >
            {card.text}
          </span>
          {card.flagged === true ? (
            <span
              role="img"
              aria-label={BOARD_WORDS.flaggedBadge}
              title={BOARD_WORDS.flaggedBadge}
              className="mt-0.5 shrink-0 text-attention"
            >
              <FlagIcon aria-hidden="true" className="size-3.5" />
            </span>
          ) : null}
        </div>
      )}

      {showFooter && !editing ? (
        <div className="mt-auto flex min-w-0 items-center border-t border-line pt-1.5">
          {linkedScene !== null ? (
            <BoardScenePeek
              open={peekingOpen}
              episode={episode}
              scene={linkedScene}
              compact={isCompact}
              onOpenChange={(next) => onPeekingOpenChange?.(next)}
              onOpenScene={onOpen}
              onRestoreFocus={restoreCardFocus}
            />
          ) : linkLoading ? (
            <button
              type="button"
              onPointerDown={stopEvent}
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              onKeyDown={stopEvent}
              className="mn-board-scene-pill cursor-pointer text-meta text-fg-muted tabular-nums"
            >
              <span>{BOARD_WORDS.openLinkedScene(episode.number)}</span>
            </button>
          ) : linkMissing ? (
            <button
              type="button"
              onPointerDown={stopEvent}
              onClick={(event) => {
                event.stopPropagation();
                if (canEdit) onLinkingOpenChange(true);
                else onOpen();
              }}
              onKeyDown={stopEvent}
              className="-mx-1.5 inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-control px-1.5 text-meta text-attention transition-colors duration-(--dur-fast) hover:bg-subtle"
            >
              <Unlink2Icon aria-hidden="true" className="size-3 shrink-0" />
              <span className="truncate">{BOARD_WORDS.sceneMissing}</span>
            </button>
          ) : hasOutlineOnly ? (
            <button
              type="button"
              onPointerDown={stopEvent}
              onClick={(event) => {
                event.stopPropagation();
                onOpen();
              }}
              onKeyDown={stopEvent}
              className="-mx-1.5 inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-control px-1.5 text-meta text-fg-muted transition-colors duration-(--dur-fast) hover:bg-subtle hover:text-fg"
            >
              <FileTextIcon aria-hidden="true" className="size-3 shrink-0" />
              <span>{BOARD_WORDS.openOutline}</span>
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  const cardSurface =
    !canEdit || editing ? (
      surface
    ) : (
      <ContextMenu>
        <ContextMenuTrigger render={surface} />
        <ContextMenuContent>{menuItems}</ContextMenuContent>
      </ContextMenu>
    );

  return (
    <div data-row-menu className="group/card relative w-full">
      {cardSurface}

      {canEdit && !editing ? (
        <span
          onPointerDown={stopEvent}
          className="mn-board-card-actions absolute top-1 end-1 flex flex-row-reverse items-center gap-0.5"
        >
          <RowMenu title={card.text}>{menuItems}</RowMenu>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={BOARD_WORDS.editCard}
            title={BOARD_WORDS.editCard}
            onClick={(event) => {
              event.stopPropagation();
              startEdit();
            }}
          >
            <PencilIcon aria-hidden="true" className="size-3.5" />
          </Button>
        </span>
      ) : null}

      {canEdit && scriptId !== null ? (
        <ScenePickerPopover
          open={linkingOpen}
          linkedBlockId={card.link?.blockId ?? null}
          scenesState={scenesState}
          onOpenChange={onLinkingOpenChange}
          onSelect={onLinkScene}
          onRestoreFocus={restoreCardFocus}
        />
      ) : null}
    </div>
  );
}

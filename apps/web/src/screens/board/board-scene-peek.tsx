// Linked scene pill and on-demand Scene Preview Peek popover for a Board card.
import type { EpisodeEntry } from "@manent/crdt";
import {
  ASSIGNMENT_WORDS,
  BOARD_WORDS,
  Button,
  PLACE_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@manent/ui";
import { ArrowUpRightIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import type { PointerEvent, ReactNode, SyntheticEvent } from "react";
import type { EpisodeScene } from "../../board/episode-scenes.ts";

const HOVER_INTENT_MS = 300;
const stopEvent = (event: SyntheticEvent): void => event.stopPropagation();

export function BoardScenePeek(props: {
  readonly open: boolean;
  readonly episode: EpisodeEntry;
  readonly scene: EpisodeScene;
  readonly compact: boolean;
  onOpenChange(open: boolean): void;
  onOpenScene(): void;
  onRestoreFocus(): void;
}): ReactNode {
  const {
    open,
    episode,
    scene,
    compact,
    onOpenChange,
    onOpenScene,
    onRestoreFocus,
  } = props;
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current !== null) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  };

  useEffect(() => clearHoverTimer, []);

  const handlePointerEnter = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.pointerType !== "mouse" || event.buttons !== 0) return;
    clearHoverTimer();
    hoverTimerRef.current = setTimeout(() => {
      hoverTimerRef.current = null;
      onOpenChange(true);
    }, HOVER_INTENT_MS);
  };

  const progressLabel =
    scene.progress !== undefined
      ? ASSIGNMENT_WORDS.progressNames[scene.progress]
      : null;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        clearHoverTimer();
        onOpenChange(next);
      }}
    >
      <PopoverTrigger
        render={
          <button
            type="button"
            title={PLACE_WORDS.scene(scene.number, scene.heading)}
            onPointerDown={(event) => {
              clearHoverTimer();
              event.stopPropagation();
            }}
            onPointerEnter={handlePointerEnter}
            onPointerLeave={clearHoverTimer}
            onClick={(event) => {
              clearHoverTimer();
              event.stopPropagation();
              onOpenChange(false);
              onOpenScene();
            }}
            onKeyDown={stopEvent}
            className="mn-board-scene-pill cursor-pointer text-start text-meta tabular-nums"
          />
        }
      >
        <span className="mn-scene-num shrink-0">
          {BOARD_WORDS.linkedPlace(episode.number, scene.number)}
        </span>
        {!compact ? (
          <span className="mn-board-scene-heading min-w-0 truncate text-micro text-fg-muted">
            {scene.heading}
          </span>
        ) : null}
      </PopoverTrigger>
      {open ? (
        <PopoverContent
          align="start"
          aria-label={PLACE_WORDS.scene(scene.number, scene.heading)}
          onClick={stopEvent}
          onPointerDown={stopEvent}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.stopPropagation();
              onOpenChange(false);
              onRestoreFocus();
            }
          }}
          className="flex w-80 max-w-[min(22rem,90vw)] flex-col gap-2 p-3 text-ui"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="flex min-w-0 items-baseline gap-1.5">
              <span className="mn-scene-num shrink-0">
                {BOARD_WORDS.linkedPlace(episode.number, scene.number)}
              </span>
              <span className="min-w-0 font-semibold text-fg leading-snug">
                {scene.heading}
              </span>
            </div>
            {scene.omitted ? (
              <span className="mn-tag shrink-0 text-attention">
                {BOARD_WORDS.sceneOmitted}
              </span>
            ) : progressLabel !== null ? (
              <span className="mn-tag shrink-0">{progressLabel}</span>
            ) : null}
          </div>

          {scene.synopsis !== undefined ? (
            <p className="text-meta text-fg-muted leading-snug">
              {scene.synopsis}
            </p>
          ) : null}

          {scene.excerpt !== undefined && scene.excerpt.length > 0 ? (
            <div className="flex flex-col gap-0.5 rounded-control border border-line bg-well px-2.5 py-2 font-page text-meta leading-snug text-fg">
              {scene.excerpt.map((line, index) => (
                <p key={`${scene.blockId}:${index}`} className="truncate">
                  {line}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-meta text-fg-muted italic">
              {BOARD_WORDS.sceneNoExcerpt}
            </p>
          )}

          {scene.characters !== undefined && scene.characters.length > 0 ? (
            <div
              aria-label={BOARD_WORDS.sceneCharactersLabel}
              className="flex flex-wrap gap-1"
            >
              {scene.characters.map((name) => (
                <span key={name} className="mn-tag">
                  {name}
                </span>
              ))}
            </div>
          ) : null}

          <div className="flex justify-end border-t border-line pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenChange(false);
                onOpenScene();
              }}
              className="cursor-pointer gap-1.5"
            >
              <span>{BOARD_WORDS.openScene}</span>
              <ArrowUpRightIcon aria-hidden="true" className="size-icon" />
            </Button>
          </div>
        </PopoverContent>
      ) : null}
    </Popover>
  );
}

// Searchable Scene Picker popover anchored stably to a Board card without remounting its drag surface.
import {
  BOARD_WORDS,
  Input,
  PRODUCTION_OUTPUTS_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@manent/ui";
import { CheckIcon, Unlink2Icon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import type { EpisodeScenesState } from "../../board/episode-scenes.ts";

const SCENE_FILTER_THRESHOLD = 8;

export function ScenePickerPopover(props: {
  readonly open: boolean;
  readonly linkedBlockId: string | null;
  readonly scenesState: EpisodeScenesState | undefined;
  onOpenChange(open: boolean): void;
  onSelect(blockId: string | null): void;
  onRestoreFocus(): void;
}): ReactNode {
  const {
    open,
    linkedBlockId,
    scenesState,
    onOpenChange,
    onSelect,
    onRestoreFocus,
  } = props;
  const [sceneQuery, setSceneQuery] = useState("");

  useEffect(() => {
    if (!open) setSceneQuery("");
  }, [open]);

  const scenes = scenesState?.status === "ready" ? scenesState.scenes : [];
  const filteredScenes = useMemo(() => {
    const q = sceneQuery.trim().toLowerCase();
    if (q === "") return scenes;
    return scenes.filter(
      (scene) =>
        scene.number.toLowerCase().includes(q) ||
        scene.heading.toLowerCase().includes(q),
    );
  }, [scenes, sceneQuery]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const items = [
      ...event.currentTarget.querySelectorAll<HTMLButtonElement>(
        "button[data-scene-option]",
      ),
    ];
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onOpenChange(false);
      onRestoreFocus();
      return;
    }
    if (items.length === 0) return;
    if (event.target instanceof HTMLInputElement) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        items[0]?.focus();
      }
      return;
    }
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

  if (!open) return null;

  return (
    <Popover
      open
      onOpenChange={(next) => {
        if (!next) onOpenChange(false);
      }}
    >
      <PopoverTrigger
        nativeButton={false}
        render={
          <span
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none absolute inset-0"
          />
        }
      />
      <PopoverContent
        align="start"
        aria-label={BOARD_WORDS.linkToScene}
        className="flex w-72 max-w-[min(22rem,90vw)] flex-col gap-1 p-1.5"
        onKeyDown={onKeyDown}
      >
        <div className="mn-group-label p-0! px-1.5 py-0.5">
          {BOARD_WORDS.linkToScene}
        </div>
        {scenesState?.status === "ready" &&
        scenes.length >= SCENE_FILTER_THRESHOLD ? (
          <div className="px-1 pb-1">
            <Input
              autoFocus
              type="search"
              value={sceneQuery}
              aria-label={BOARD_WORDS.filterScenesPlaceholder}
              placeholder={BOARD_WORDS.filterScenesPlaceholder}
              onChange={(e) => setSceneQuery(e.target.value)}
              className="h-control-sm text-ui"
            />
          </div>
        ) : null}
        <div className="flex max-h-64 flex-col overflow-y-auto">
          {scenesState === undefined || scenesState.status === "loading" ? (
            <p className="px-2 py-2 text-meta text-fg-muted">
              {BOARD_WORDS.loadingScenes}
            </p>
          ) : scenesState.status === "unavailable" ? (
            <p className="px-2 py-2 text-meta text-fg-muted">
              {BOARD_WORDS.scenesUnavailable}
            </p>
          ) : scenes.length === 0 ? (
            <p className="px-2 py-2 text-meta text-fg-muted">
              {PRODUCTION_OUTPUTS_WORDS.noScenesForSides}
            </p>
          ) : filteredScenes.length === 0 ? (
            <p className="px-2 py-2 text-meta text-fg-muted">
              {BOARD_WORDS.noFilterMatches}
            </p>
          ) : (
            filteredScenes.map((scene) => (
              <button
                key={scene.blockId}
                type="button"
                data-scene-option=""
                onClick={() => {
                  onSelect(scene.blockId);
                  onOpenChange(false);
                  onRestoreFocus();
                }}
                className="flex min-h-row cursor-pointer items-center gap-2 rounded-control px-2 text-start text-ui text-fg transition-colors duration-(--dur-fast) hover:bg-subtle active:bg-control"
              >
                <span className="mn-scene-num shrink-0">{scene.number}</span>
                <span className="min-w-0 flex-1 truncate">{scene.heading}</span>
                {linkedBlockId === scene.blockId ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-icon shrink-0 text-fg-accent"
                  />
                ) : null}
              </button>
            ))
          )}
        </div>
        {linkedBlockId !== null ? (
          <div className="border-t border-line pt-1">
            <button
              type="button"
              data-scene-option=""
              onClick={() => {
                onSelect(null);
                onOpenChange(false);
                onRestoreFocus();
              }}
              className="flex min-h-row w-full cursor-pointer items-center gap-2 rounded-control px-2 text-start text-ui text-fg-muted transition-colors duration-(--dur-fast) hover:bg-subtle hover:text-fg"
            >
              <Unlink2Icon aria-hidden="true" className="size-icon shrink-0" />
              <span>{BOARD_WORDS.removeLink}</span>
            </button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}

// Floating top HUD surface for Present room mode: back to script, document title, driver badge and scene stepper.
import type { Identity } from "@manent/sync-protocol";
import { Avatar, Button, PRESENT_WORDS, ROOM_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon, ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ReactNode } from "react";
import { initialsOf } from "../../../initials.ts";
import { firstNameOf } from "../../../room/driver.ts";

export function PresentHud(props: {
  readonly docId: string;
  readonly title: string;
  readonly format?: string;
  readonly driver: Identity | null;
  readonly driverColour: number | null;
  readonly currentScene: number;
  readonly totalScenes: number;
  readonly onPrevScene?: () => void;
  readonly onNextScene?: () => void;
}): ReactNode {
  const {
    docId,
    title,
    format,
    driver,
    driverColour,
    currentScene,
    totalScenes,
    onPrevScene,
    onNextScene,
  } = props;
  const isBook = format === "manuscript";
  const navigate = useNavigate();
  const hasStepper = totalScenes > 1;
  return (
    <header
      aria-label={PRESENT_WORDS.roomWindowTitle(title)}
      className="mn-present-hud pointer-events-auto fixed left-1/2 top-3 z-20 flex max-w-[calc(100vw-2rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-surface px-2 py-1 text-ui"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={
          isBook ? PRESENT_WORDS.backToBook : PRESENT_WORDS.backToScript
        }
        onClick={() => void navigate({ href: `/s/${docId}` })}
      >
        <ArrowLeftIcon
          aria-hidden="true"
          className="size-icon text-fg-muted group-hover/button:text-fg"
        />
      </Button>
      <span className="max-w-48 truncate font-medium text-fg" title={title}>
        {title}
      </span>
      <span aria-hidden="true" className="shrink-0 text-meta text-fg-muted">
        ·
      </span>
      <span aria-live="polite" className="flex min-w-0 items-center gap-2">
        {driver === null ? (
          <span
            title={ROOM_WORDS.noDriverHint}
            className="whitespace-nowrap text-meta text-fg-muted"
          >
            {PRESENT_WORDS.roomView}
          </span>
        ) : (
          <>
            <Avatar
              name={driver.name}
              initials={initialsOf(driver.name)}
              colour={driverColour}
              size="sm"
              decorative
            />
            <span className="truncate text-meta text-fg-muted">
              {PRESENT_WORDS.following(firstNameOf(driver.name))}
            </span>
          </>
        )}
      </span>
      {totalScenes > 0 ? (
        <>
          <span aria-hidden="true" className="shrink-0 text-meta text-fg-muted">
            ·
          </span>
          <div className="flex shrink-0 items-center gap-0.5">
            {hasStepper ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  isBook
                    ? PRESENT_WORDS.previousChapter
                    : PRESENT_WORDS.previousScene
                }
                disabled={onPrevScene === undefined}
                onClick={onPrevScene}
              >
                <ChevronUpIcon
                  aria-hidden="true"
                  className="size-icon text-fg-muted group-hover/button:text-fg"
                />
              </Button>
            ) : null}
            <span
              aria-live="polite"
              className="shrink-0 px-0.5 text-meta tabular-nums text-fg-muted"
            >
              {isBook
                ? PRESENT_WORDS.chapterProgress(currentScene, totalScenes)
                : PRESENT_WORDS.sceneProgress(currentScene, totalScenes)}
            </span>
            {hasStepper ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={
                  isBook ? PRESENT_WORDS.nextChapter : PRESENT_WORDS.nextScene
                }
                disabled={onNextScene === undefined}
                onClick={onNextScene}
              >
                <ChevronDownIcon
                  aria-hidden="true"
                  className="size-icon text-fg-muted group-hover/button:text-fg"
                />
              </Button>
            ) : null}
          </div>
        </>
      ) : null}
    </header>
  );
}

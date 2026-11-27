// The prompter window's top bar (never mirrored): feed status, Follow/Free scroll, operator readout, Text size, Dark and Mirror.
import {
  PROMPTER_DEFAULT_SPEED_LPS,
  PROMPTER_MAX_SPEED_LPS,
  PROMPTER_MIN_SPEED_LPS,
} from "@manent/sync-protocol";
import type {
  PrompterOperator,
  PrompterScrollState,
} from "@manent/sync-protocol";
import {
  Button,
  DOCUMENT_WORDS,
  PROMPTER_CONTROL_WORDS,
  PROMPTER_WINDOW_WORDS,
  Segmented,
  Skeleton,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  formatClockTime,
} from "@manent/ui";
import {
  ArrowLeftIcon,
  MinusIcon,
  PauseIcon,
  PlayIcon,
  PlusIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import type { PrompterFollowMode } from "../../../prompter/remote-scroll.ts";
import { PROMPTER_TEXT_SIZES } from "./prompter-storage.ts";
import type {
  PrompterTextSize,
  PrompterViewState,
} from "./prompter-storage.ts";

export type PrompterBarStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "live" }
  | { readonly kind: "nothing_sent" }
  | { readonly kind: "lost"; readonly lastReceivedAt: number | null }
  | { readonly kind: "refused" };

interface PrompterBarProps {
  readonly status: PrompterBarStatus;
  readonly view: PrompterViewState;
  readonly onBack?: () => void;
  readonly onTextSizeChange: (size: PrompterTextSize) => void;
  readonly onDarkChange: (dark: boolean) => void;
  readonly onMirrorChange: (mirror: boolean) => void;
  readonly operator?: PrompterOperator | null;
  readonly scroll?: PrompterScrollState | null;
  readonly followMode?: PrompterFollowMode;
  readonly onFollowModeChange?: (mode: PrompterFollowMode) => void;
  readonly onTogglePlay?: () => void;
  readonly onStepSpeed?: (delta: number) => void;
}

const MIN_SIZE: PrompterTextSize = PROMPTER_TEXT_SIZES[0];
const MAX_SIZE: PrompterTextSize = PROMPTER_TEXT_SIZES[4];
const SPEED_STEP = 0.5;

const FOLLOW_OPTIONS = Object.freeze([
  { value: "follow" as const, label: PROMPTER_CONTROL_WORDS.follow },
  { value: "free" as const, label: PROMPTER_CONTROL_WORDS.freeScroll },
]);

function FeedStatus(props: {
  readonly status: PrompterBarStatus;
  readonly remotePausedOnLoss: boolean;
}): ReactNode {
  const { status, remotePausedOnLoss } = props;
  switch (status.kind) {
    case "loading":
      return (
        <span aria-busy="true" className="flex items-center gap-2">
          <Skeleton
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
          />
          <Skeleton aria-hidden="true" className="h-4 w-24" />
        </span>
      );
    case "live":
      return (
        <>
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full bg-ok"
          />
          <span className="font-medium text-fg">
            {PROMPTER_WINDOW_WORDS.live}
          </span>
        </>
      );
    case "nothing_sent":
      return (
        <span className="text-fg-muted">
          {PROMPTER_WINDOW_WORDS.nothingSent}
        </span>
      );
    case "lost":
      return (
        <>
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-attention"
          />
          <span className="font-medium text-attention tabular-nums">
            {remotePausedOnLoss
              ? status.lastReceivedAt === null
                ? PROMPTER_CONTROL_WORDS.offlinePaused
                : PROMPTER_CONTROL_WORDS.feedLostPaused(
                    formatClockTime(status.lastReceivedAt),
                  )
              : status.lastReceivedAt === null
                ? PROMPTER_WINDOW_WORDS.feedLostNothing
                : PROMPTER_WINDOW_WORDS.feedLost(
                    formatClockTime(status.lastReceivedAt),
                  )}
          </span>
        </>
      );
    case "refused":
      return (
        <>
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-attention"
          />
          <span className="font-medium text-attention">
            {PROMPTER_WINDOW_WORDS.linkRefused}
          </span>
        </>
      );
    default:
      status satisfies never;
      return null;
  }
}

function StepButton(props: {
  readonly label: string;
  readonly unavailableText: string;
  readonly disabled: boolean;
  readonly icon: ReactNode;
  readonly onClick: () => void;
}): ReactNode {
  const reasonId = useId();
  const { label, unavailableText, disabled, icon, onClick } = props;
  return (
    <>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              variant="outline"
              size="icon-sm"
              aria-label={label}
              aria-disabled={disabled ? true : undefined}
              aria-describedby={disabled ? reasonId : undefined}
              className={
                disabled
                  ? "cursor-not-allowed opacity-50"
                  : "cursor-pointer hover:bg-subtle"
              }
              onClick={disabled ? undefined : onClick}
            />
          }
        >
          {icon}
        </TooltipTrigger>
        <TooltipContent>{disabled ? unavailableText : label}</TooltipContent>
      </Tooltip>
      {disabled ? (
        <span id={reasonId} className="sr-only">
          {unavailableText}
        </span>
      ) : null}
    </>
  );
}

function BarSwitch(props: {
  readonly label: string;
  readonly checked: boolean;
  readonly onCheckedChange: (checked: boolean) => void;
}): ReactNode {
  const switchId = useId();
  return (
    <div className="flex items-center gap-1 rounded-control px-1 py-1 hover:bg-subtle sm:gap-2 sm:px-2">
      <label
        htmlFor={switchId}
        className="cursor-pointer text-ui font-medium text-fg select-none"
      >
        {props.label}
      </label>
      <Switch
        id={switchId}
        checked={props.checked}
        onCheckedChange={props.onCheckedChange}
        className="cursor-pointer"
      />
    </div>
  );
}

export function PrompterBar(props: PrompterBarProps): ReactNode {
  const {
    status,
    view,
    onBack,
    onTextSizeChange,
    onDarkChange,
    onMirrorChange,
    operator = null,
    scroll = null,
    followMode = "follow",
    onFollowModeChange,
    onTogglePlay,
    onStepSpeed,
  } = props;
  const sizeIndex = PROMPTER_TEXT_SIZES.indexOf(view.textSize);
  const atMin = view.textSize === MIN_SIZE;
  const atMax = view.textSize === MAX_SIZE;

  const stepSmaller = (): void => {
    const next = PROMPTER_TEXT_SIZES[sizeIndex - 1];
    if (next !== undefined) onTextSizeChange(next);
  };
  const stepLarger = (): void => {
    const next = PROMPTER_TEXT_SIZES[sizeIndex + 1];
    if (next !== undefined) onTextSizeChange(next);
  };

  const remotePausedOnLoss = status.kind === "lost" && scroll?.playing === true;
  const speed = scroll?.linesPerSecond ?? PROMPTER_DEFAULT_SPEED_LPS;
  const playing = scroll?.playing === true && status.kind === "live";

  return (
    <header
      aria-label={PROMPTER_WINDOW_WORDS.barLabel}
      className="flex min-h-titlebar shrink-0 items-center justify-between gap-2 border-b border-line bg-chrome px-2 py-1 text-ui sm:gap-4 sm:px-4"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
        {onBack !== undefined ? (
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={DOCUMENT_WORDS.back}
            onClick={onBack}
            className="shrink-0 text-fg-muted hover:text-fg"
          >
            <ArrowLeftIcon aria-hidden="true" className="size-icon" />
          </Button>
        ) : null}
        <div
          role="status"
          aria-live="polite"
          data-tour="prompter:feed"
          className="flex min-w-0 items-center gap-2 text-ui"
        >
          <FeedStatus status={status} remotePausedOnLoss={remotePausedOnLoss} />
        </div>
        <span
          role="status"
          aria-live="polite"
          className={
            operator !== null ? "truncate text-meta text-fg-muted" : "sr-only"
          }
        >
          {operator !== null
            ? PROMPTER_CONTROL_WORDS.controlsPrompter(operator.name)
            : null}
        </span>
        {onFollowModeChange !== undefined ? (
          <div data-tour="prompter:follow_switch">
            <Segmented
              label={PROMPTER_CONTROL_WORDS.controlPrompter}
              value={followMode}
              options={FOLLOW_OPTIONS}
              onChange={onFollowModeChange}
            />
          </div>
        ) : null}
        {onTogglePlay !== undefined ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            data-tour="prompter:play"
            className="cursor-pointer gap-1.5"
            onClick={onTogglePlay}
          >
            {playing ? (
              <PauseIcon aria-hidden="true" className="size-icon" />
            ) : (
              <PlayIcon aria-hidden="true" className="size-icon" />
            )}
            <span>
              {playing
                ? PROMPTER_CONTROL_WORDS.pause
                : PROMPTER_CONTROL_WORDS.play}
            </span>
          </Button>
        ) : null}
        {onStepSpeed !== undefined ? (
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={PROMPTER_CONTROL_WORDS.slow}
              disabled={speed <= PROMPTER_MIN_SPEED_LPS}
              className="cursor-pointer"
              onClick={() => onStepSpeed(-SPEED_STEP)}
            >
              <MinusIcon aria-hidden="true" className="size-icon" />
            </Button>
            <span className="min-w-12 text-center text-meta font-medium text-fg tabular-nums">
              {PROMPTER_CONTROL_WORDS.linesPerSecond(speed)}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              aria-label={PROMPTER_CONTROL_WORDS.fast}
              disabled={speed >= PROMPTER_MAX_SPEED_LPS}
              className="cursor-pointer"
              onClick={() => onStepSpeed(SPEED_STEP)}
            >
              <PlusIcon aria-hidden="true" className="size-icon" />
            </Button>
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <div className="flex items-center gap-1 sm:gap-2">
          <span className="hidden text-meta text-fg-muted sm:inline">
            {PROMPTER_WINDOW_WORDS.textSize}
          </span>
          <TooltipProvider>
            <div className="flex items-center gap-1">
              <StepButton
                label={PROMPTER_WINDOW_WORDS.smallerText}
                unavailableText={PROMPTER_WINDOW_WORDS.smallerUnavailable}
                disabled={atMin}
                icon={<MinusIcon aria-hidden="true" className="size-icon" />}
                onClick={stepSmaller}
              />
              <span
                role="status"
                aria-live="polite"
                aria-atomic="true"
                className="min-w-10 text-center text-ui font-medium text-fg tabular-nums sm:min-w-12"
              >
                {PROMPTER_WINDOW_WORDS.textSizeValue(view.textSize)}
              </span>
              <StepButton
                label={PROMPTER_WINDOW_WORDS.largerText}
                unavailableText={PROMPTER_WINDOW_WORDS.largerUnavailable}
                disabled={atMax}
                icon={<PlusIcon aria-hidden="true" className="size-icon" />}
                onClick={stepLarger}
              />
            </div>
          </TooltipProvider>
        </div>
        <BarSwitch
          label={PROMPTER_WINDOW_WORDS.dark}
          checked={view.dark}
          onCheckedChange={onDarkChange}
        />
        <BarSwitch
          label={PROMPTER_WINDOW_WORDS.mirror}
          checked={view.mirror}
          onCheckedChange={onMirrorChange}
        />
      </div>
    </header>
  );
}

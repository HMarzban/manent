// The prompter window's top bar (never mirrored): feed status on the left, Text size, Dark and Mirror on the right.
import {
  Button,
  DOCUMENT_WORDS,
  PROMPTER_WINDOW_WORDS,
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
  PlusIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
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
}

const MIN_SIZE: PrompterTextSize = PROMPTER_TEXT_SIZES[0];
const MAX_SIZE: PrompterTextSize = PROMPTER_TEXT_SIZES[4];

function FeedStatus(props: { readonly status: PrompterBarStatus }): ReactNode {
  const { status } = props;
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
            {status.lastReceivedAt === null
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

  return (
    <header
      aria-label={PROMPTER_WINDOW_WORDS.barLabel}
      className="flex min-h-titlebar shrink-0 items-center justify-between gap-2 border-b border-line bg-chrome px-2 py-1 text-ui sm:gap-4 sm:px-4"
    >
      <div className="flex min-w-0 items-center gap-1 sm:gap-2">
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
          <FeedStatus status={status} />
        </div>
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
              <span className="min-w-10 text-center text-ui font-medium text-fg tabular-nums sm:min-w-12">
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

// Feed status indicator for the prompter window's top bar.
import {
  PROMPTER_CONTROL_WORDS,
  PROMPTER_WINDOW_WORDS,
  Skeleton,
  formatClockTime,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import type { ReactNode } from "react";

export type PrompterBarStatus =
  | { readonly kind: "loading" }
  | { readonly kind: "live" }
  | { readonly kind: "nothing_sent" }
  | { readonly kind: "lost"; readonly lastReceivedAt: number | null }
  | { readonly kind: "refused" };

export function PrompterFeedStatus(props: {
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

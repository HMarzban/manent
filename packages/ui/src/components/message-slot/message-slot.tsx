// The one place that says what just happened, in the status bar of every screen.
import { cn } from "cn";
import { XIcon } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { DOCUMENT_WORDS } from "../../words/document.ts";
import { Button } from "../stock/button.tsx";
import type { MessageQueue } from "./message.ts";

interface MessageSlotProps {
  queue: MessageQueue;
  run(commandId: string): void;
  registered(commandId: string): boolean;
}

/** A polite live region holding the current message; an action is drawn only once its command is registered. */
export function MessageSlot({
  queue,
  run,
  registered,
}: MessageSlotProps): ReactNode {
  const subscribe = useCallback(
    (notify: () => void) => queue.subscribe(notify),
    [queue],
  );
  const message = useSyncExternalStore(subscribe, () => queue.current());
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-w-0 flex-1 items-center text-ui"
    >
      {message === null ? null : (
        <div
          key={message.id}
          className="flex min-w-0 items-center gap-2 duration-150 animate-in fade-in"
        >
          <p
            className={cn(
              "min-w-0",
              message.ownWork ? "line-clamp-2" : "truncate",
            )}
          >
            {message.text}
          </p>
          {message.actions
            .filter((action) => registered(action.commandId))
            .map((action) => (
              <Button
                key={action.commandId}
                variant="link"
                size="sm"
                className="underline"
                onClick={() => run(action.commandId)}
              >
                {action.label}
              </Button>
            ))}
          {message.lifetime === "until_dismissed" ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={DOCUMENT_WORDS.dismiss}
              onClick={() => queue.dismiss(message.id)}
            >
              <XIcon aria-hidden="true" />
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

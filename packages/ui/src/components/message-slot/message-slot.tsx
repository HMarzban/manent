// The one place that says what just happened, in the status bar of every screen.
import { cn } from "cn";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { DOCUMENT_WORDS } from "../../words/document.ts";
import { CloseButton } from "../panel-tabs/close-button.tsx";
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
      data-tour="message_slot"
      className="flex min-w-0 flex-1 items-center text-meta"
    >
      {message === null ? null : (
        <div
          key={message.id}
          className="flex min-w-0 items-center gap-2 duration-(--dur-base) ease-out animate-in fade-in-0"
        >
          {/* own work wraps to two lines inside the bar's one-line height, so a message never moves the page */}
          <p
            title={message.text}
            className={cn(
              "min-w-0",
              message.ownWork ? "line-clamp-2 leading-[1.125]" : "truncate",
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
                data-tour={action.commandId}
                className="underline"
                onClick={() => run(action.commandId)}
              >
                {action.label}
              </Button>
            ))}
          {message.lifetime === "until_dismissed" ? (
            <CloseButton
              label={DOCUMENT_WORDS.dismiss}
              onClick={() => queue.dismiss(message.id)}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

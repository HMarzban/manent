// The words of the question asked before leaving a document this device cannot save.
import { CLOSE_WORDS, formatTime } from "@manent/ui";
import type { ConsequenceDialogProps } from "@manent/ui";

const noop = (): void => {};

/** The question for a document this device has not saved since `since` (milliseconds since the epoch). */
export function closeDialog(since: number): ConsequenceDialogProps {
  return {
    open: true,
    title: CLOSE_WORDS.title,
    body: CLOSE_WORDS.body(formatTime(since)),
    action: CLOSE_WORDS.exportCopy,
    destructive: false,
    alternative: {
      label: CLOSE_WORDS.closeWithout,
      destructive: true,
      onAction: noop,
    },
    busyLabel: null,
    refusal: null,
    onAction: noop,
    onCancel: noop,
  };
}

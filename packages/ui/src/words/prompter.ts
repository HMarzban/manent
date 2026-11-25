// Words of the prompter column, inline Send control, and Send / Send previous messages.
import { formatCount } from "./format.ts";

export const PROMPTER_WORDS = Object.freeze({
  /** Outline button label inside a Changed row's Prompter cell. */
  send: "Send",
  /** Accessible name of a row's inline Send button. */
  sendRowLabel: (title: string): string => `Send to prompter, ${title}`,
  /** Action label in the state bar and after Send previous. */
  sendToPrompter: "Send to prompter",
  /** Action label after Send and after Send previous. */
  sendPrevious: "Send previous",
  /** Retry action label after an uncategorised refusal. */
  tryAgain: "Try again",
  /** Reason while the story still has local changes waiting to sync. */
  waitingChanges: (count: number): string =>
    `Send to prompter needs this device's ${count === 1 ? "1 waiting change" : `${formatCount(count)} waiting changes`} synced first.`,
  /** Prompter cell state when the latest story text is on the prompter. */
  onPrompter: "On prompter",
  /** Prompter cell state when the story changed since last send or was never sent. */
  changed: "Changed — not on prompter",
  /** Prompter cell state on every row while this device is offline. */
  offline: "Offline — not sending",
  /** Prompter cell placeholder for a row with no script. */
  noScript: "—",
  /** Message slot text after Send (`time` from `formatClockTime`). */
  sent: (title: string, time: string): string => `${title} on prompter ${time}`,
  /** Message slot text after Send previous (`time` and `firstSentTime` from `formatClockTime`). */
  sentPrevious: (title: string, time: string, firstSentTime: string): string =>
    `${title} on prompter ${time}, as sent at ${firstSentTime}`,
  /** Refusal message for `forbidden`. */
  refusedForbidden: (title: string): string =>
    `Couldn't send ${title} to the prompter: your access to this rundown no longer includes send to prompter. Ask its owner.`,
  /** Refusal message for `not_in_rundown`. */
  refusedNotInRundown: (title: string): string =>
    `Couldn't send ${title} to the prompter: its row is no longer in this rundown.`,
  /** Refusal message for `cannot_send` on Send. */
  refusedNoScript: (title: string): string =>
    `Couldn't send ${title} to the prompter: its row has no script.`,
  /** Refusal message for `cannot_send` on Send previous. */
  refusedNoPrevious: (title: string): string =>
    `Couldn't send the previous version of ${title}: nothing was sent before it.`,
  /** Refusal message for `deleted`. */
  refusedDeleted: (title: string): string =>
    `Couldn't send ${title} to the prompter: the rundown was deleted.`,
  /** Refusal message while offline. */
  refusedOffline: (title: string): string =>
    `Couldn't send ${title} to the prompter: this device is offline. Send it again once it is back online.`,
  /** Refusal message for any other failure. */
  refusedOther: (title: string): string =>
    `Couldn't send ${title} to the prompter.`,
});

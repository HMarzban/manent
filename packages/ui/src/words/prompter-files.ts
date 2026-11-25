// The words of desktop prompter file output: the dialog, its refusals, and its status messages.
import { formatCount } from "./format.ts";

export const PROMPTER_FILES_WORDS = Object.freeze({
  command: "Prompter files…",
  title: (title: string): string => `Write prompter files for ${title}?`,
  body: "Manent writes a list of this rundown's rows and one text file for each story sent to the prompter, and writes a file again each time its story is sent. Other files there are left alone. It stops when you choose Stop or quit Manent.",
  encodingLabel: "Encoding",
  utf8: "UTF-8",
  windows1252: "Windows-1252",
  windows1252Help:
    "For prompter software that can't read UTF-8. A character Windows-1252 can't hold is written as ?.",
  placeLabel: "Write to",
  choose: "Choose…",
  chooseLabel: "Choose where to write prompter files",
  action: "Write prompter files",
  writingAction: "Writing prompter files…",
  emptyPlaceReason: "needs a place to write to",
  refusedBusy:
    "Couldn't write prompter files: this app is already writing them for another rundown. Stop that first, from its state bar.",
  refusedUnreachable:
    "Couldn't write prompter files: this app isn't syncing with the server. Sign in to sync, then try again.",
  refusedOther: "Couldn't write prompter files. Try again.",
  stoppedMessage: (path: string): string =>
    `Stopped writing prompter files. The files stay in ${path}.`,
  replacedMessage: (count: number): string =>
    count === 1
      ? "Wrote 1 character as ? because Windows-1252 can't hold it."
      : `Wrote ${formatCount(count)} characters as ? because Windows-1252 can't hold them.`,
  unwritableMessage: (path: string): string =>
    `Stopped writing prompter files: Manent couldn't write to ${path}.`,
});

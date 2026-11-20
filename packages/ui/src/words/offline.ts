// The words of To review, of its margin bar, and of closing a script the device cannot save.

import { joinNames } from "./format.ts";

/** `scene` and its " · " lead the row; a block in no scene has neither. */
const inScene = (scene: string | null, text: string): string =>
  scene === null ? text : `${scene} · ${text}`;

export const REVIEW_WORDS = {
  /** Shown in capitals by the stylesheet, with the count. */
  heading: "To review",
  keepAsMerged: "Keep as merged",
  useMine: "Use mine",
  /** One or two other people. */
  useNamed: (names: readonly string[]): string => `Use ${joinNames(names)}'s`,
  /** Three or more other people, or nobody known. */
  useOther: "Use the other wording",
  scene: (n: string): string => `Sc. ${n}`,
  /** One other person. */
  bothChanged: (scene: string | null, name: string): string =>
    inScene(scene, `you and ${name} both changed this`),
  /** Two or more other people. */
  severalChanged: (scene: string | null, names: readonly string[]): string =>
    inScene(scene, `you, ${joinNames(names)} changed this`),
  /** Nobody known. */
  unknownChanged: (scene: string | null): string =>
    inScene(scene, "changed here and elsewhere"),
  /** The row's heading; the recovered text itself follows it. */
  recoveredRow: (scene: string | null): string =>
    inScene(scene, "Recovered text from this device"),
  /** The accessible name of a margin bar. */
  marginBar: "To review",
} as const;

export const CLOSE_WORDS = {
  title: "Export a copy before closing?",
  body: (time: string): string =>
    `Manent can't save on this device, so changes since ${time} are only in this window.`,
  closeWithout: "Close without exporting",
  exportCopy: "Export a copy",
} as const;

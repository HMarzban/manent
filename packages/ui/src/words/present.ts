// The Present screen's words.
import { formatCount } from "./format.ts";

export const PRESENT_WORDS = Object.freeze({
  /** The room window's title, for the browser tab and the desktop window. */
  roomWindowTitle: (title: string): string => `Room window — ${title}`,
  backToScript: "Back to script",
  backToBook: "Back to book",
  outline: "Outline",
  minimapLabel: "Script outline",
  toggleOutline: "Show script outline",
  pinOutline: "Keep outline open",
  filterScenes: "Filter scenes",
  filterPlaceholder: "Go to scene…",
  noMatchingScenes: "No scenes match",
  sceneCount: (n: number): string =>
    n === 1 ? "1 scene" : `${formatCount(n)} scenes`,
  following: (name: string): string => `Following ${name}`,
  roomView: "Room window",
  jumpTo: (label: string): string => `Go to ${label}`,
  progressPercent: (pct: number): string => `${formatCount(pct)}%`,
  sceneProgress: (current: number, total: number): string =>
    `Scene ${formatCount(current)} of ${formatCount(total)}`,
  chapterProgress: (current: number, total: number): string =>
    `Chapter ${formatCount(current)} of ${formatCount(total)}`,
  previousScene: "Previous scene",
  nextScene: "Next scene",
  previousChapter: "Previous chapter",
  nextChapter: "Next chapter",
});
